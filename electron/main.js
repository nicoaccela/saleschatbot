// main.js — Electron main process. Owns the window, IPC, and wires the renderer
// to the Claude Code driver + local history store.

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const store = require("./store");
const { runTurn, checkClaude } = require("./claude");
const { listAvailableCommands } = require("./commands");
const skillsPack = require("./skills-pack");

let mainWindow = null;

// Background auto-update from the public GitHub Releases feed (configured in
// package.json -> build.publish). Only the packaged/installed build can replace
// itself; in dev there's nothing to update, so this is a no-op.
function initAutoUpdates() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    // Log to %APPDATA%/accela-chat/logs so a broken update chain is diagnosable
    // on a remote machine — otherwise every failure mode is silent in a
    // packaged app with no devtools.
    try {
      const log = require("electron-log");
      log.transports.file.level = "info";
      autoUpdater.logger = log;
    } catch { /* logging is best-effort */ }
    autoUpdater.autoDownload = true;
    autoUpdater.on("error", (e) => { try { autoUpdater.logger.error("auto-update error", e); } catch { /* ignore */ } });
    autoUpdater.on("update-downloaded", (info) => {
      try { autoUpdater.logger.info("update downloaded:", info && info.version); } catch { /* ignore */ }
    });
    // Downloads a newer version in the background and installs it on the next
    // app restart; surfaces a native "ready to install" notification.
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    // Re-check periodically for long-lived sessions (the app may stay open for days).
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch (err) {
    // Never let an update hiccup block startup.
    console.error("auto-update init failed:", err);
  }
}

// Track in-flight turns so the UI can cancel them.
const cancellers = new Map(); // requestId -> fn

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#F2F5F7",
    // Mac: overlay our chrome under the traffic lights. Other platforms keep a
    // standard frame.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // the in-app link viewer renders pages in a <webview>
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Open external links in the system browser, not in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // A link must never replace the app itself. If anything tries to navigate the
  // main window to an external page, cancel it and hand it to the system browser.
  // (The in-app link viewer uses a <webview> with its own webContents, so it is
  // unaffected by this guard.)
  mainWindow.webContents.on("will-navigate", (e, url) => {
    const isAppUrl = (devUrl && url.startsWith(devUrl)) || url.startsWith("file://");
    if (!isAppUrl) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  store.init(app.getPath("userData"));
  registerIpc();
  createWindow();
  initAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function registerIpc() {
  // --- Setup / health ---
  ipcMain.handle("claude:check", () => checkClaude());

  // --- Available slash-commands / skills ---
  ipcMain.handle("commands:list", () => {
    try { return listAvailableCommands(); } catch { return []; }
  });

  // --- Bundled Accela skill pack (install / status) ---
  ipcMain.handle("skills:status", () => skillsPack.status(app));

  // Open a URL in the system browser (right-click a link, or "Open in browser").
  ipcMain.handle("open:external", (_e, url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  ipcMain.handle("skills:install", () => {
    const res = skillsPack.install(app);
    if (res && res.ok) store.setSettings({ skillsPackVersion: res.version });
    return res;
  });

  // --- Settings ---
  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:set", (_e, patch) => store.setSettings(patch || {}));

  // --- Conversations ---
  ipcMain.handle("conv:list", () => store.listConversations());
  ipcMain.handle("conv:get", (_e, id) => store.getConversation(id));
  ipcMain.handle("conv:create", (_e, model) => store.createConversation(model));
  ipcMain.handle("conv:delete", (_e, id) => store.deleteConversation(id));
  ipcMain.handle("conv:rename", (_e, { id, title }) =>
    store.renameConversation(id, title),
  );
  ipcMain.handle("conv:setSkills", (_e, { id, skills }) =>
    store.setConversationSkills(id, skills),
  );

  // --- File / folder picker ---
  ipcMain.handle("paths:pick", async (_e, opts) => {
    const directory = opts && opts.directory;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: directory ? "Attach a folder" : "Attach files",
      properties: [
        directory ? "openDirectory" : "openFile",
        "multiSelections",
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // --- Chat turn ---
  // Returns the final assistant message; streams deltas over "chat:event".
  ipcMain.handle("chat:send", async (_e, payload) => {
    const { conversationId, text, model, attachments } = payload || {};
    // Consistent response shape so the renderer never gets a sparse object.
    const errShape = (error) => ({
      requestId: null,
      conversationId: conversationId ?? null,
      text: "",
      sessionId: null,
      usage: null,
      cost: null,
      error,
      title: "",
    });

    let requestId = null;
    let flushTimer = null;
    try {
    const settings = store.getSettings();
    let conv = store.getConversation(conversationId);
    if (!conv) return errShape("Conversation not found.");

    const useModel = model || conv.model || settings.model;
    const attachList = Array.isArray(attachments) ? attachments.filter(Boolean) : [];

    // Record the user message (with any attachments) + auto-title on first msg.
    store.appendMessage(conv.id, { role: "user", content: text, attachments: attachList });
    conv = store.getConversation(conv.id);
    if (!conv.titled && conv.messages.filter((m) => m.role === "user").length === 1) {
      conv.title = store.titleFrom(text);
      conv.titled = true;
    }
    conv.model = useModel;
    store.saveConversation(conv);

    // Augment the prompt with attached paths for Claude to read.
    let effectivePrompt = text;
    if (attachList.length) {
      const lines = attachList.map((p) => `- ${p}`).join("\n");
      effectivePrompt =
        `The user attached these local files/folders. Use your Read/Glob/Grep tools to inspect them as needed:\n${lines}\n\n${text}`;
    }

    // Personalize with the rep profile, then prime with activated skills.
    let effectiveSystem = settings.systemPrompt;
    const preamble = store.profilePreamble(settings.profile);
    if (preamble) effectiveSystem = `${preamble}\n\n${effectiveSystem}`;
    const activeSkills = Array.isArray(conv.selectedSkills) ? conv.selectedSkills : [];
    if (activeSkills.length) {
      let registry = [];
      try { registry = listAvailableCommands(); } catch { /* ignore */ }
      const byName = new Map(registry.map((c) => [c.name, c]));
      const lines = activeSkills
        .map((n) => { const c = byName.get(n); return c ? `- /${c.name}: ${c.description}` : `- /${n}`; })
        .join("\n");
      effectiveSystem +=
        `\n\nThe rep has activated these skills for this conversation — prioritize them and invoke directly when relevant:\n${lines}`;
    }

    requestId = store.uid();
    send("chat:event", { type: "start", requestId, conversationId: conv.id });

    // Coalesce high-frequency text deltas (one per token) into ~40fps IPC
    // batches. Forwarding each delta individually floods the main→renderer
    // channel with structured-clone serializations and wakes the renderer for
    // every token — costly with two panes streaming on a low-end machine. We
    // accumulate text and flush on a short timer, force-flushing before any
    // non-delta event (and at turn end) so delta ordering is preserved.
    let deltaBuf = "";
    let cancelled = false; // set by the canceller when the user stops this turn
    const flushDeltas = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (deltaBuf) {
        send("chat:event", { type: "delta", text: deltaBuf, requestId, conversationId: conv.id });
        deltaBuf = "";
      }
    };

    const runOpts = {
      prompt: effectivePrompt,
      model: useModel,
      resumeId: conv.claudeSessionId,
      systemPrompt: effectiveSystem,
      toolMode: settings.toolMode,
      registerCanceller: (fn) => cancellers.set(requestId, () => { cancelled = true; fn(); }),
      onEvent: (evt) => {
        // Once stopped, drop the dying child's trailing output instead of
        // buffering/serializing it across IPC for a turn the user abandoned.
        if (cancelled) return;
        if (evt.type === "delta") {
          deltaBuf += evt.text || "";
          if (!flushTimer) flushTimer = setTimeout(flushDeltas, 24);
        } else {
          flushDeltas();
          send("chat:event", { ...evt, requestId, conversationId: conv.id });
        }
      },
    };

    let result = await runTurn(runOpts);

    // Self-heal a pruned/expired Claude session: drop the dead id and retry once
    // fresh (no --resume) so the rep sees their answer, not a hard error. The
    // renderer ignores the interim error event and just keeps streaming.
    if (result.sessionNotFound && conv.claudeSessionId && !cancelled) {
      const f0 = store.getConversation(conv.id);
      if (f0) { f0.claudeSessionId = null; store.saveConversation(f0); }
      result = await runTurn({ ...runOpts, resumeId: null });
    }

    flushDeltas(); // emit any buffered tail before persisting + returning
    cancellers.delete(requestId);

    // Persist assistant reply + Claude Code session id for the next --resume.
    if (result.text) {
      store.appendMessage(conv.id, {
        role: "assistant",
        content: result.text,
        model: useModel,
      });
    }
    const fresh = store.getConversation(conv.id);
    if (fresh && result.sessionId) {
      fresh.claudeSessionId = result.sessionId;
      store.saveConversation(fresh);
    }

    return {
      requestId,
      conversationId: conv.id,
      text: result.text,
      sessionId: result.sessionId,
      usage: result.usage,
      cost: result.cost,
      error: result.error || null,
      rawError: result.rawError || null,
      errorKind: result.errorKind || null,
      title: fresh ? fresh.title : conv.title,
    };
    } catch (err) {
      if (flushTimer) clearTimeout(flushTimer);
      if (requestId) cancellers.delete(requestId);
      return errShape(err && err.message ? err.message : String(err));
    }
  });

  // --- Cancel an in-flight turn ---
  ipcMain.handle("chat:stop", (_e, requestId) => {
    const fn = cancellers.get(requestId);
    if (fn) { fn(); cancellers.delete(requestId); return true; }
    return false;
  });
}
