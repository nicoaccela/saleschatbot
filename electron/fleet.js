// fleet.js — spawn N parallel read-only agents (one per item) and stream tiles.
//
// The packaged-app version of "watch the fleet work": reuses the shared runStep
// so each worker is a real agent turn (agent mode for MCP reads; write tools
// removed). A small concurrency pool keeps it from stampeding the CLI. Ephemeral
// — the renderer holds tile state from the streamed events.

const store = require("./store");
const mcp = require("./mcp");
const { assembleSystemPrompt, runStep } = require("./engine");
const { listAvailableCommands } = require("./commands");

let emit = () => {};
function setEmitter(fn) { emit = typeof fn === "function" ? fn : () => {}; }

const CONCURRENCY = 4;
const WORKER_DISABLED = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "KillShell"];
const runs = new Map(); // fleetId -> { cancels: Map<idx,fn>, cancelled: bool }

async function run(fleetId, task, items) {
  const settings = store.getSettings();
  let registry = [];
  try { registry = listAvailableCommands(); } catch { /* ignore */ }
  const mcpRegistry = store.getMcpServers();
  const disabled = [
    ...WORKER_DISABLED,
    ...mcpRegistry.filter((s) => s && s.enabled !== false && Array.isArray(s.disabledTools)).flatMap((s) => s.disabledTools),
  ];
  const sys = assembleSystemPrompt({ baseSystem: settings.systemPrompt, preamble: store.profilePreamble(settings.profile), activeSkills: [], registry });
  const mcpMap = mcp.mcpConfigMap(mcpRegistry);
  const state = { cancels: new Map(), cancelled: false };
  runs.set(fleetId, state);

  const worker = async (item, idx) => {
    if (state.cancelled) { emit({ type: "worker", fleetId, idx, item, status: "error", error: "Stopped." }); return; }
    emit({ type: "worker", fleetId, idx, item, status: "running", text: "" });
    let text = "";
    let cancelled = false;
    const result = await runStep({
      prompt: `${task}\n\n--- Focus only on: ${item} ---`,
      model: settings.model, systemPrompt: sys, toolMode: "agent",
      mcpServers: mcpMap, strictMcp: !!settings.mcpStrict, disabledTools: disabled,
      onEvent: (evt) => { if (evt.type === "delta") { text += evt.text || ""; emit({ type: "worker", fleetId, idx, item, status: "running", text }); } },
      registerCanceller: (fn) => { state.cancels.set(idx, () => { cancelled = true; fn(); }); },
    });
    state.cancels.delete(idx);
    if (cancelled || state.cancelled) emit({ type: "worker", fleetId, idx, item, status: "error", error: "Stopped.", output: text });
    else if (result.error) emit({ type: "worker", fleetId, idx, item, status: "error", error: result.error, output: text || result.text });
    else emit({ type: "worker", fleetId, idx, item, status: "done", output: result.text || text });
  };

  let cursor = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length && !state.cancelled) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  runs.delete(fleetId);
  emit({ type: "fleet-done", fleetId });
}

function start(fleetId, task, items) {
  const clean = (Array.isArray(items) ? items : []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 24);
  if (!task || !String(task).trim()) return { ok: false, error: "Give the fleet a task." };
  if (!clean.length) return { ok: false, error: "Add at least one item (one per line)." };
  emit({ type: "fleet-start", fleetId, count: clean.length });
  run(fleetId, String(task).trim(), clean).catch((e) => emit({ type: "fleet-done", fleetId, error: (e && e.message) || "Fleet failed." }));
  return { ok: true, count: clean.length };
}

function cancel(fleetId) {
  const st = runs.get(fleetId);
  if (st) { st.cancelled = true; for (const fn of st.cancels.values()) { try { fn(); } catch { /* ignore */ } } }
  return { ok: true };
}

module.exports = { setEmitter, start, cancel };
