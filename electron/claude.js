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
      systemPromptFile = null;
      args.push("--append-system-prompt", systemPrompt.trim());
    }
  }

  // Tool policy.
  if (toolMode === "chat") {
    // Pure conversation — disallow all tools so it behaves like claude.ai chat.
    args.push("--disallowed-tools", ...MUTATING_TOOLS, "Read", "Grep", "Glob", "WebSearch", "WebFetch");
  } else if (toolMode === "readonly") {
    // Can read files / search the web, but never mutate. Read-only tools don't
    // trigger interactive permission prompts, so the GUI won't hang.
    args.push("--disallowed-tools", ...MUTATING_TOOLS);
  } else if (toolMode === "agent" || toolMode === "full") {
    // Sales cockpit: skills, slash-commands and the agent fleet (Task) can all
    // run. bypassPermissions so their file/bash steps don't stall in the GUI's
    // non-interactive print mode.
    args.push("--permission-mode", "bypassPermissions");
  }

  const cleanup = () => {
    if (systemPromptFile) {
      try { fs.unlinkSync(systemPromptFile); } catch { /* ignore */ }
      systemPromptFile = null;
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
      // A non-zero exit is a failure even if some partial text was flushed —
      // surface it rather than returning incomplete output as success.
      if (code !== 0) {
        const msg = stderrBuf.trim() || `Claude exited with code ${code}`;
        onEvent({ type: "error", message: msg });
        return resolve({ sessionId, text: finalText, usage, cost, error: msg });
      }
      onEvent({ type: "done", sessionId, text: finalText, usage, cost });
      resolve({ sessionId, text: finalText, usage, cost });
    });

    // Allow cancellation from the caller.
    opts.registerCanceller && opts.registerCanceller(() => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    });
  });
}

module.exports = { runTurn, checkClaude, CLAUDE_BIN };
