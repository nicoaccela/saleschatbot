// claude.js — drives the local Claude Code CLI as the model backend.
//
// Each user turn spawns:  claude -p --output-format stream-json --include-partial-messages
//                                --verbose --model <m> [--resume <sessionId>] ...
// We write the prompt to stdin, parse the newline-delimited JSON event stream,
// emit text deltas live, and resolve with the final text + the Claude Code
// session id (used to --resume the next turn → real multi-turn memory).
//
// Safety: by default we disallow mutating/agentic tools so this behaves like a
// conversational assistant (claude.ai-style) and never edits the machine or
// hangs waiting on an interactive permission prompt. Configurable per tool mode.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const IS_WIN = process.platform === "win32";

// Tools we never allow in the GUI (would prompt for permission / mutate state).
const MUTATING_TOOLS = [
  "Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Task", "KillShell",
];

function findClaudeBinary() {
  if (process.env.ACCELA_CLAUDE_BIN && fs.existsSync(process.env.ACCELA_CLAUDE_BIN)) {
    return process.env.ACCELA_CLAUDE_BIN;
  }
  const home = os.homedir();
  let candidates;
  if (IS_WIN) {
    const appdata = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    candidates = [
      path.join(home, ".local", "bin", "claude.exe"),
      path.join(home, ".local", "bin", "claude.cmd"),
      path.join(appdata, "npm", "claude.cmd"),
      path.join(appdata, "npm", "claude.exe"),
      path.join(local, "Programs", "claude", "claude.exe"),
    ];
  } else {
    candidates = [
      path.join(home, ".local/bin/claude"),
      path.join(home, ".bun/bin/claude"),
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      "/usr/bin/claude",
    ];
  }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return IS_WIN ? "claude.cmd" : "claude"; // fall back to PATH resolution
}

const CLAUDE_BIN = findClaudeBinary();

// Node can't exec a .cmd/.bat shim (or a bare PATH name on Windows) without a
// shell. A real .exe is spawned directly so args pass through unmangled.
const NEEDS_SHELL = IS_WIN && !/\.exe$/i.test(CLAUDE_BIN);

// Returns { ok, version, path } — used by the UI to show a setup hint if the
// CLI isn't found or isn't logged in.
function checkClaude() {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(CLAUDE_BIN, ["--version"], { env: process.env, shell: NEEDS_SHELL });
    } catch {
      return resolve({ ok: false, version: null, path: CLAUDE_BIN });
    }
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve({ ok: false, version: null, path: CLAUDE_BIN }));
    child.on("close", (code) =>
      resolve({ ok: code === 0, version: out.trim() || null, path: CLAUDE_BIN }),
    );
  });
}

// Does the installed CLI support MCP config injection? Older builds reject
// --mcp-config / --strict-mcp-config and would fail the spawn, so the UI gates
// the MCP feature on this. Probed once from `claude --help` and cached.
let _mcpSupport = null;
function checkMcpSupport() {
  if (_mcpSupport) return Promise.resolve(_mcpSupport);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(CLAUDE_BIN, ["--help"], { env: process.env, shell: NEEDS_SHELL });
    } catch {
      _mcpSupport = { mcpConfig: false, strict: false };
      return resolve(_mcpSupport);
    }
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", () => { _mcpSupport = { mcpConfig: false, strict: false }; resolve(_mcpSupport); });
    child.on("close", () => {
      _mcpSupport = {
        mcpConfig: /--mcp-config/.test(out),
        strict: /--strict-mcp-config/.test(out),
      };
      resolve(_mcpSupport);
    });
  });
}

// Map raw CLI stderr to a calm, plain-English message + a kind the UI can act on.
// `sessionNotFound` lets the caller transparently retry without --resume.
function classifyError(raw) {
  const s = (raw || "").toLowerCase();
  if (/no conversation found|session (id )?not found|no such session|could not find.*session|resume.*not found|invalid session/.test(s)) {
    return { kind: "session", sessionNotFound: true, friendly: "Your previous session expired — retrying fresh." };
  }
  if (/not logged in|unauthorized|authentication|please run.*login|invalid api key|\b401\b|no api key|run `claude`/.test(s)) {
    return { kind: "auth", friendly: "You're not signed in to Claude Code. Open a terminal, run `claude`, sign in, then try again." };
  }
  if (/rate.?limit|\b429\b|overloaded|\b529\b|too many requests/.test(s)) {
    return { kind: "rate", friendly: "Claude is busy or rate-limited right now. Give it a moment, then try again." };
  }
  if (/network|enotfound|etimedout|econnrefused|fetch failed|getaddrinfo|offline|dns/.test(s)) {
    return { kind: "network", friendly: "Couldn't reach Claude — check your internet connection and try again." };
  }
  return { kind: "generic", friendly: "That didn't go through. Try again, and if it keeps happening, restart the app." };
}

/**
 * Run one conversational turn.
 * @param {object} opts
 * @param {string} opts.prompt        user message text
 * @param {string} opts.model         model alias/id (opus|sonnet|haiku|<full-id>)
 * @param {string} [opts.resumeId]    Claude Code session id to resume
 * @param {string} [opts.systemPrompt] appended system prompt
 * @param {string} [opts.toolMode]    "chat" (no tools) | "readonly" (read/search) | "full"
 * @param {function} opts.onEvent     called with {type:"delta"|"init"|"done"|"error", ...}
 * @returns {Promise<{sessionId:string|null, text:string, usage:object|null, cost:number|null}>}
 */
function runTurn(opts) {
  const {
    prompt,
    model = "opus",
    resumeId = null,
    systemPrompt = "",
    toolMode = "readonly",
    mcpServers = null,   // { <name>: {command,args,env} | {type,url,headers} } — enabled servers only
    strictMcp = false,   // also pass --strict-mcp-config (ignore the rep's ambient config)
    disabledTools = [],  // per-connection tool names the rep switched off (→ --disallowed-tools)
    onEvent = () => {},
  } = opts;

  const args = [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose", // required by Claude Code when streaming json in print mode
    "--model", model,
  ];

  if (resumeId) args.push("--resume", resumeId);

  // Write the system prompt to a temp file rather than passing it as an arg.
  // It can be long and multi-line (skill priming), and a file sidesteps all
  // shell-quoting problems on Windows. Cleaned up when the turn ends.
  let systemPromptFile = null;
  if (systemPrompt && systemPrompt.trim()) {
    try {
      systemPromptFile = path.join(os.tmpdir(), `accela-sp-${crypto.randomUUID()}.txt`);
      fs.writeFileSync(systemPromptFile, systemPrompt.trim());
      args.push("--append-system-prompt-file", systemPromptFile);
    } catch {
      // writeFileSync opens with O_CREAT, so a mid-write failure may have already
      // created the file — unlink it before falling back so it isn't orphaned.
      try { if (systemPromptFile) fs.unlinkSync(systemPromptFile); } catch { /* ignore */ }
      systemPromptFile = null;
      args.push("--append-system-prompt", systemPrompt.trim());
    }
  }

  // MCP servers: write the app-managed set to a temp --mcp-config file for this
  // turn (cleaned up when it ends). We only inject MCP under agent/full mode:
  // MCP tools would otherwise hang forever on the interactive approval prompt in
  // -p mode (no bypass, no timeout). Non-strict by default so the rep's ambient
  // ~/.claude.json servers still work; --strict-mcp-config locks the turn to
  // ONLY the app-managed set.
  let mcpConfigFile = null;
  const mcpMap = mcpServers && typeof mcpServers === "object" ? mcpServers : null;
  const mcpAllowed = toolMode === "agent" || toolMode === "full";
  if (mcpMap && Object.keys(mcpMap).length && mcpAllowed) {
    try {
      mcpConfigFile = path.join(os.tmpdir(), `accela-mcp-${crypto.randomUUID()}.json`);
      fs.writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: mcpMap }));
      args.push("--mcp-config", mcpConfigFile);
      if (strictMcp) args.push("--strict-mcp-config");
    } catch {
      // Reclaim a partially-created temp file (O_CREAT) on a write failure so it
      // isn't orphaned in tmpdir; cleanup() only unlinks a still-referenced path.
      try { if (mcpConfigFile) fs.unlinkSync(mcpConfigFile); } catch { /* ignore */ }
      mcpConfigFile = null;
    }
  }

  // Tool policy.
  const extraDisabled = (Array.isArray(disabledTools) ? disabledTools : []).filter(Boolean);
  if (toolMode === "chat") {
    // Pure conversation — disallow all tools so it behaves like claude.ai chat.
    args.push("--disallowed-tools", ...MUTATING_TOOLS, "Read", "Grep", "Glob", "WebSearch", "WebFetch", ...extraDisabled);
  } else if (toolMode === "readonly") {
    // Can read files / search the web, but never mutate. Read-only tools don't
    // trigger interactive permission prompts, so the GUI won't hang.
    args.push("--disallowed-tools", ...MUTATING_TOOLS, ...extraDisabled);
  } else if (toolMode === "agent" || toolMode === "full") {
    // Sales cockpit: skills, slash-commands and the agent fleet (Task) can all
    // run. bypassPermissions so their file/bash steps don't stall in the GUI's
    // non-interactive print mode.
    args.push("--permission-mode", "bypassPermissions");
    // Honor per-connection permission toggles even under bypass: --disallowed-tools
    // removes tools from the available set (upstream of permission evaluation).
    if (extraDisabled.length) args.push("--disallowed-tools", ...extraDisabled);
  }

  const cleanup = () => {
    if (systemPromptFile) {
      try { fs.unlinkSync(systemPromptFile); } catch { /* ignore */ }
      systemPromptFile = null;
    }
    if (mcpConfigFile) {
      try { fs.unlinkSync(mcpConfigFile); } catch { /* ignore */ }
      mcpConfigFile = null;
    }
  };

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(CLAUDE_BIN, args, {
        env: process.env,
        cwd: os.homedir(),
        shell: NEEDS_SHELL,
      });
    } catch (err) {
      cleanup();
      onEvent({ type: "error", message: `Failed to start Claude: ${err.message}` });
      return resolve({ sessionId: null, text: "", usage: null, cost: null, error: err.message });
    }

    let sessionId = resumeId || null;
    let assembled = "";   // text from partial deltas
    let resultText = "";  // text from the final result event (fallback)
    let usage = null;
    let cost = null;
    let stderrBuf = "";
    let stdoutRemainder = "";
    let cancelled = false; // set when the user Stops — a clean exit, not an error

    // Write the prompt to stdin and close it.
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch { /* stream may already be closed on error */ }

    child.stdout.on("data", (chunk) => {
      const text = stdoutRemainder + chunk.toString();
      const lines = text.split("\n");
      stdoutRemainder = lines.pop() ?? ""; // keep partial line for next chunk
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let evt;
        try { evt = JSON.parse(trimmed); } catch { continue; }
        handleEvent(evt);
      }
    });

    function handleEvent(evt) {
      // Capture session id as early as possible.
      if (evt.session_id) sessionId = evt.session_id;

      if (evt.type === "system" && evt.subtype === "init") {
        onEvent({ type: "init", sessionId });
        return;
      }

      // Partial streaming deltas (from --include-partial-messages).
      if (evt.type === "stream_event" && evt.event) {
        const e = evt.event;
        if (e.type === "content_block_delta" && e.delta && e.delta.type === "text_delta") {
          assembled += e.delta.text;
          onEvent({ type: "delta", text: e.delta.text });
        }
        return;
      }

      // Full assistant message (non-partial path / fallback).
      if (evt.type === "assistant" && evt.message && Array.isArray(evt.message.content)) {
        if (!assembled) {
          const text = evt.message.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("");
          if (text) {
            resultText = text;
            onEvent({ type: "delta", text }); // emit once if no deltas streamed
          }
        }
        return;
      }

      // Terminal result.
      if (evt.type === "result") {
        if (typeof evt.result === "string") resultText = evt.result;
        usage = evt.usage || null;
        cost = typeof evt.total_cost_usd === "number" ? evt.total_cost_usd : null;
      }
    }

    child.stderr.on("data", (d) => (stderrBuf += d.toString()));

    child.on("error", (err) => {
      cleanup();
      onEvent({ type: "error", message: err.message });
      resolve({ sessionId, text: assembled || resultText, usage, cost, error: err.message });
    });

    child.on("close", (code) => {
      cleanup();
      // Parse any final buffered event that arrived without a trailing newline
      // (Claude often omits the EOF newline) — this is where the result event's
      // session_id / usage / cost can live. Dropping it loses --resume + telemetry.
      const rem = stdoutRemainder.trim();
      if (rem) {
        stdoutRemainder = "";
        try { handleEvent(JSON.parse(rem)); } catch { /* trailing partial — ignore */ }
      }

      const finalText = assembled || resultText;
      // A user Stop kills the child with SIGTERM (non-zero exit). That is NOT an
      // error — resolve cleanly and keep whatever streamed so far.
      if (cancelled) {
        onEvent({ type: "done", sessionId, text: finalText, usage, cost, cancelled: true });
        return resolve({ sessionId, text: finalText, usage, cost, cancelled: true });
      }
      // A non-zero exit is a failure even if some partial text was flushed —
      // surface it (classified into a calm, plain-English message) rather than
      // returning incomplete output as success.
      if (code !== 0) {
        const raw = stderrBuf.trim() || `Claude exited with code ${code}`;
        const { kind, friendly, sessionNotFound } = classifyError(raw);
        onEvent({ type: "error", message: friendly });
        return resolve({ sessionId, text: finalText, usage, cost, error: friendly, rawError: raw, errorKind: kind, sessionNotFound: !!sessionNotFound });
      }
      onEvent({ type: "done", sessionId, text: finalText, usage, cost });
      resolve({ sessionId, text: finalText, usage, cost });
    });

    // Allow cancellation from the caller.
    opts.registerCanceller && opts.registerCanceller(() => {
      cancelled = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    });
  });
}

module.exports = { runTurn, checkClaude, checkMcpSupport, CLAUDE_BIN };
