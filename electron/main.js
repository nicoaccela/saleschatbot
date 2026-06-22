// main.js — Electron main process. Owns the window, IPC, and wires the renderer
// to the Claude Code driver + local history store.

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const store = require("./store");
const { runTurn, checkClaude } = require("./claude");
const { listAvailableCommands } = require("./commands");

let mainWindow = null;

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
}

app.whenReady().then(() => {
  store.init(app.getPath("userData"));
  registerIpc();
  createWindow();

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

    // Prime the system prompt with any skills the rep activated for this chat.
    let effectiveSystem = settings.systemPrompt;
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

    const result = await runTurn({
      prompt: effectivePrompt,
      model: useModel,
      resumeId: conv.claudeSessionId,
      systemPrompt: effectiveSystem,
      toolMode: settings.toolMode,
      registerCanceller: (fn) => cancellers.set(requestId, fn),
      onEvent: (evt) => send("chat:event", { ...evt, requestId, conversationId: conv.id }),
    });

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
      title: fresh ? fresh.title : conv.title,
    };
    } catch (err) {
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
