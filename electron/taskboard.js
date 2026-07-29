"use strict";
/**
 * taskboard.js — run the rep's personal Command Center inside Accela Chat.
 *
 * The board is a small local HTTP server plus a self-contained HTML app. Two
 * places it can live, in this order:
 *
 *   1. the rep's REAL board in the Sales Workspace on OneDrive, if they already
 *      have one (this is the same board the `cc` command opens in a terminal)
 *   2. a private scaffold in this app's userData dir, for a rep who has no
 *      workspace board yet
 *
 * Preferring the workspace board is the whole point: the rep should not keep a
 * second, divergent task list just because they opened the app instead of a
 * terminal. When we adopt it we pin the canonical port 7878 and reuse any server
 * already listening there, so `cc` and Accela Chat drive ONE server. Two servers
 * writing the same tasks.json would race and lose completions.
 *
 * Either way the board files stay outside this repo and outside the installer,
 * so one rep's tasks can never reach another rep's install.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

// The board's own default. `cc` uses it, so matching it is what lets us share.
const CANONICAL_PORT = 7878;
const WORKSPACE_TAIL = path.join("Claude Code Sales Workspace", "Command Center");

let proc = null;
let port = null;
let baseDir = null;
let scaffoldDir = null;
let templateDir = null;
let usingWorkspace = false;

function init(userDataDir, skillsDir) {
  scaffoldDir = path.join(userDataDir, "command-center");
  templateDir = path.join(skillsDir, "command-center", "template");
  resolve();
}

function looksLikeBoard(dir) {
  return (
    !!dir &&
    fs.existsSync(path.join(dir, "server.py")) &&
    fs.existsSync(path.join(dir, "tasks.json"))
  );
}

/**
 * Every place a real workspace board might sit. OneDrive's folder name carries
 * the tenant ("OneDrive-Accela,Inc" on macOS, "OneDrive - Accela, Inc" on
 * Windows), so we scan rather than hardcode.
 */
function workspaceCandidates() {
  const out = [];
  const home = os.homedir();
  const roots = [path.join(home, "Library", "CloudStorage"), home];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue; // no CloudStorage dir on this machine
    }
    for (const e of entries) {
      // skip the temp shared-library mount OneDrive leaves behind
      if (!e.startsWith("OneDrive") || e.includes("CloudTemp")) continue;
      out.push(path.join(root, e, WORKSPACE_TAIL));
    }
  }
  return out;
}

/** Decide which board this app drives. Sets baseDir + usingWorkspace. */
function resolve() {
  const override = process.env.ACCELA_COMMAND_CENTER_DIR;
  if (looksLikeBoard(override)) {
    baseDir = override;
    usingWorkspace = true;
    return baseDir;
  }
  for (const c of workspaceCandidates()) {
    if (looksLikeBoard(c)) {
      baseDir = c;
      usingWorkspace = true;
      return baseDir;
    }
  }
  baseDir = scaffoldDir;
  usingWorkspace = false;
  return baseDir;
}

function isScaffolded() {
  return !!baseDir && fs.existsSync(path.join(baseDir, "build.py"));
}

function scaffold() {
  if (!templateDir || !fs.existsSync(templateDir)) {
    throw new Error(
      "Command Center template missing. Import the skill pack first (Help & setup)."
    );
  }
  fs.mkdirSync(baseDir, { recursive: true });
  fs.cpSync(templateDir, baseDir, { recursive: true });
  for (const f of ["cc", "build.py", "server.py"]) {
    const p = path.join(baseDir, f);
    if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
  }
  const libDir = path.join(baseDir, "lib");
  if (fs.existsSync(libDir)) {
    for (const f of fs.readdirSync(libDir)) {
      if (f.endsWith(".py") || f.endsWith(".sh")) {
        fs.chmodSync(path.join(libDir, f), 0o755);
      }
    }
  }
  return baseDir;
}

function get(p, route, timeoutMs = 900) {
  return new Promise((resolve_) => {
    const req = http.get(
      { host: "127.0.0.1", port: p, path: route, timeout: timeoutMs },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve_(null);
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { body += c; });
        res.on("end", () => resolve_(body));
      }
    );
    req.on("error", () => resolve_(null));
    req.on("timeout", () => { req.destroy(); resolve_(null); });
  });
}

async function ping(p, timeoutMs = 900) {
  return (await get(p, "/api/state", timeoutMs)) !== null;
}

function readTasks() {
  const f = baseDir && path.join(baseDir, "tasks.json");
  if (!f || !fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null; // a half-written file during a sync is not worth crashing over
  }
}

/**
 * A cheap identity check on a board server: does it serve OUR tasks.json?
 * Port 7878 could belong to something else entirely, and adopting a stranger's
 * server would show the rep someone else's work.
 */
function fingerprint(doc) {
  const tasks = (doc && doc.tasks) || [];
  return `${tasks.length}:${tasks.map((t) => t.id).sort().join(",")}`;
}

async function servesOurBoard(p) {
  const body = await get(p, "/api/state");
  if (!body) return false;
  const mine = readTasks();
  if (!mine) return false;
  try {
    return fingerprint(JSON.parse(body)) === fingerprint(mine);
  } catch {
    return false;
  }
}

async function freePort(from = 7910) {
  for (let p = from; p < from + 20; p++) {
    if (!(await ping(p, 300))) return p;
  }
  return from;
}

function python() {
  for (const c of ["/usr/bin/python3", "/opt/homebrew/bin/python3", "python3"]) {
    if (c.startsWith("/") ? fs.existsSync(c) : true) return c;
  }
  return "python3";
}

function url() {
  return port ? `http://127.0.0.1:${port}/` : null;
}

/** Start (or reuse) the board. Resolves to { url, dir, scaffolded, workspace }. */
async function open_() {
  resolve(); // OneDrive may have finished syncing since boot
  let scaffolded = false;
  if (!isScaffolded()) {
    scaffold();
    scaffolded = true;
  }

  const result = () => ({
    url: url(), dir: baseDir, scaffolded, workspace: usingWorkspace,
  });

  // Already ours and healthy — whether we spawned it or `cc` did.
  if (port && (await servesOurBoard(port))) return result();

  if (usingWorkspace && (await servesOurBoard(CANONICAL_PORT))) {
    port = CANONICAL_PORT;
    return result();
  }

  // Pin the canonical port for the workspace board so a later `cc` finds this
  // server instead of standing up a rival one.
  port = usingWorkspace ? CANONICAL_PORT : await freePort();
  proc = spawn(python(), [path.join(baseDir, "server.py"),
                          "--port", String(port), "--no-open"],
               { cwd: baseDir, stdio: "ignore", detached: false });
  proc.on("exit", () => { proc = null; });

  // cold start off a network-synced folder can take a few seconds
  for (let i = 0; i < 40; i++) {
    if (await ping(port)) return result();
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("The task board server did not start. Check that python3 is available.");
}

async function status() {
  const up = !!(port && (await ping(port)));
  let counts = null;
  const doc = readTasks();
  if (doc) {
    const openTasks = (doc.tasks || []).filter((t) => t.status === "open");
    counts = {
      owed: openTasks.filter((t) => t.lane === "owed").length,
      waiting: openTasks.filter((t) => t.lane === "waiting").length,
      total: openTasks.length,
    };
  }
  return {
    scaffolded: isScaffolded(),
    running: up,
    url: up ? url() : null,
    dir: baseDir,
    workspace: usingWorkspace,
    counts,
  };
}

/**
 * Open tasks for the in-app focus rail. Only the fields the renderer draws or
 * hands to Claude — the board's iframe already renders everything else, and the
 * full records carry contacts we have no reason to copy into the renderer.
 */
function tasks() {
  const doc = readTasks();
  if (!doc) return [];
  return (doc.tasks || [])
    .filter((t) => t.status === "open")
    .map((t) => ({
      id: t.id,
      title: t.title,
      why: t.why,
      firstAction: t.firstAction,
      account: t.account,
      effortMin: t.effortMin,
      load: t.load,
      lane: t.lane,
      priority: t.priority,
      due: t.due,
      received: t.received,
      claudePrompt: t.claudePrompt,
      skills: t.skills || [],
    }));
}

function stop() {
  // Only kill a server we started. If we adopted the one `cc` is running,
  // closing the app must not take the rep's terminal board down with it.
  if (proc) {
    try { proc.kill(); } catch { /* already gone */ }
    proc = null;
  }
}

module.exports = { init, open: open_, status, tasks, stop };
