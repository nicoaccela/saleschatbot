// mcp.js — the app-managed MCP server registry helpers.
//
// The registry (an array of server configs) lives in settings.json under the
// Electron userData dir — never bundled into the public shell, never written
// back to the rep's ~/.claude.json (we don't mutate their terminal Claude). Each
// turn, main.js serializes the ENABLED servers into a temp --mcp-config file for
// the spawned `claude` (see claude.js). This module owns that serialization plus
// a connectivity probe and a one-click import of servers the rep already has.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runTurn } = require("./claude");

// Turn the stored array of server configs into the CLI's --mcp-config object,
// including ONLY enabled, well-formed entries. Returns {} if none apply.
//   stdio  -> { command, args?, env? }
//   http|sse -> { type, url, headers? }
function mcpConfigMap(servers) {
  const map = {};
  for (const s of Array.isArray(servers) ? servers : []) {
    if (!s || s.enabled === false || !s.name) continue;
    const transport = s.transport || (s.url ? "http" : "stdio");
    if (transport === "stdio") {
      if (!s.command) continue;
      const def = { command: s.command };
      if (Array.isArray(s.args)) {
        const args = s.args.filter((a) => a != null && a !== "");
        if (args.length) def.args = args;
      }
      if (s.env && typeof s.env === "object" && Object.keys(s.env).length) def.env = s.env;
      map[s.name] = def;
    } else if (transport === "sse" || transport === "http") {
      if (!s.url) continue;
      const def = { type: transport, url: s.url };
      if (s.headers && typeof s.headers === "object" && Object.keys(s.headers).length) def.headers = s.headers;
      map[s.name] = def;
    }
  }
  return map;
}

// Probe ONE server end-to-end by spawning a fast, tool-listing turn scoped to
// just that server (agent mode so the MCP tools are actually available and the
// print-mode turn doesn't hang on an approval prompt). The prompt asks the model
// only to ENUMERATE its tool names — it never calls one. Doubles as tool
// discovery for the workflow builder later. Returns { ok, tools, error }.
async function testServer(server) {
  const single = mcpConfigMap([{ ...server, enabled: true }]);
  const name = Object.keys(single)[0];
  if (!name) {
    return { ok: false, tools: [], error: "Incomplete config — set a command (stdio) or a URL (http/sse)." };
  }
  let result;
  try {
    result = await runTurn({
      prompt:
        "List every tool you can call as their exact tool names, one per line, and nothing else. " +
        "Do NOT call any tool. If you have no tools available, reply with the single word NONE.",
      model: "haiku",
      systemPrompt: "",
      toolMode: "agent",   // MCP tools are only injected + non-hanging under agent mode
      mcpServers: single,
      strictMcp: true,     // isolate the probe to just this one server
      onEvent: () => {},
    });
  } catch (err) {
    return { ok: false, tools: [], error: (err && err.message) || "Probe failed to start." };
  }
  if (result.error) return { ok: false, tools: [], error: result.error };
  const text = result.text || "";
  const all = text.match(/mcp__[A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+/g) || [];
  const mine = Array.from(new Set(all)).filter((t) => t.startsWith(`mcp__${name}__`));
  if (mine.length) return { ok: true, tools: mine, error: null };
  return {
    ok: false,
    tools: [],
    error: "Reached the CLI, but this server exposed no tools — check the command/URL and any required token.",
  };
}

// Read the rep's existing ~/.claude.json and surface its MCP servers so they can
// be imported into the app registry with one click. READ-ONLY — never writes.
// Covers the top-level mcpServers block and any per-project blocks (dedup by
// name; first wins).
function importFromClaude() {
  const out = [];
  const seen = new Set();
  const push = (name, def) => {
    if (!name || seen.has(name) || !def || typeof def !== "object") return;
    seen.add(name);
    const entry = { name };
    if (def.type === "sse" || def.type === "http") {
      entry.transport = def.type;
      entry.url = def.url || "";
      if (def.headers) entry.headers = def.headers;
    } else if (def.url && !def.command) {
      entry.transport = "http";
      entry.url = def.url;
      if (def.headers) entry.headers = def.headers;
    } else {
      entry.transport = "stdio";
      entry.command = def.command || "";
      if (Array.isArray(def.args)) entry.args = def.args;
      if (def.env) entry.env = def.env;
    }
    out.push(entry);
  };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
  } catch {
    return out;
  }
  if (raw && raw.mcpServers && typeof raw.mcpServers === "object") {
    for (const [name, def] of Object.entries(raw.mcpServers)) push(name, def);
  }
  if (raw && raw.projects && typeof raw.projects === "object") {
    for (const proj of Object.values(raw.projects)) {
      if (proj && proj.mcpServers && typeof proj.mcpServers === "object") {
        for (const [name, def] of Object.entries(proj.mcpServers)) push(name, def);
      }
    }
  }
  return out;
}

module.exports = { mcpConfigMap, testServer, importFromClaude };
