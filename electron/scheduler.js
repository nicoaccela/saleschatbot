// scheduler.js — in-app scheduled sweeps (a workflow/sweep with a time trigger).
//
// Fires while the app is open (a 60s tick) and catches up anything missed since
// last open on start(). Sweeps run READ-ONLY-safe: agent mode so calendar/CRM
// MCP read tools work, but write/side-effect tools are removed from the set.
// Background firing while the app is fully CLOSED (launchd) is a fast-follow.

const store = require("./store");
const mcp = require("./mcp");
const { assembleSystemPrompt, runStep } = require("./engine");
const { listAvailableCommands } = require("./commands");

let emit = () => {};
function setEmitter(fn) { emit = typeof fn === "function" ? fn : () => {}; }

let timer = null;
const runningNow = new Set();

const SWEEP_DISABLED = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "KillShell"];

function nowISO() { return new Date().toISOString(); }

function builtinPrompt(type) {
  if (type === "weekly-meetings") {
    return "List every customer-facing meeting on my calendar for the next 7 days, grouped by day, each with its time, account, and attendees. This is read-only — do not write, send, or change anything.";
  }
  return "List today's customer meetings from my calendar. For each, write a short prep brief: account status, the likely goal of the call, and 2 sharp discovery questions. This is read-only — do not write, send, or change anything.";
}

// Next run strictly AFTER `from`, honoring cadence + time (+ weekday for weekly).
function computeNextRun(sched, from) {
  const parts = String(sched.time || "08:00").split(":");
  const hh = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  const d = new Date(from.getTime());
  d.setHours(hh, mm, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  const matches = (date) => {
    const dow = date.getDay();
    if (sched.cadence === "weekdays") return dow >= 1 && dow <= 5;
    if (sched.cadence === "weekly") return dow === (typeof sched.weekday === "number" ? sched.weekday : 1);
    return true; // daily
  };
  let guard = 0;
  while (!matches(d) && guard++ < 400) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function fire(sched, opts) {
  const manual = !!(opts && opts.manual);
  if (runningNow.has(sched.id)) return { ok: false, error: "Already running." };
  runningNow.add(sched.id);
  emit({ type: "schedule-start", scheduleId: sched.id });
  try {
    if (sched.target && sched.target.type === "workflow") {
      const workflow = require("./workflow");
      const r = workflow.startRun(sched.target.workflowId);
      store.saveSchedule(sched.id, {
        lastRunAt: nowISO(),
        lastStatus: r.ok ? "ok" : "error",
        lastResult: r.ok ? "Started the linked workflow — see Workflows for its live run." : (r.error || "Couldn't start the workflow."),
        nextRunAt: manual ? sched.nextRunAt : computeNextRun(sched, new Date()),
      });
      return { ok: r.ok, error: r.error };
    }

    const settings = store.getSettings();
    let registry = [];
    try { registry = listAvailableCommands(); } catch { /* ignore */ }
    const mcpRegistry = store.getMcpServers();
    const disabled = [
      ...SWEEP_DISABLED,
      ...mcpRegistry.filter((s) => s && s.enabled !== false && Array.isArray(s.disabledTools)).flatMap((s) => s.disabledTools),
    ];
    const result = await runStep({
      prompt: builtinPrompt(sched.target && sched.target.type),
      model: settings.model,
      systemPrompt: assembleSystemPrompt({ baseSystem: settings.systemPrompt, preamble: store.profilePreamble(settings.profile), activeSkills: [], registry }),
      toolMode: "agent",
      mcpServers: mcp.mcpConfigMap(mcpRegistry),
      strictMcp: !!settings.mcpStrict,
      disabledTools: disabled,
      onEvent: () => {},
    });
    store.saveSchedule(sched.id, {
      lastRunAt: nowISO(),
      lastStatus: result.error ? "error" : "ok",
      lastResult: result.error ? result.error : (result.text || "(no output)"),
      nextRunAt: manual ? sched.nextRunAt : computeNextRun(sched, new Date()),
    });
    return { ok: !result.error, error: result.error };
  } catch (e) {
    store.saveSchedule(sched.id, {
      lastRunAt: nowISO(),
      lastStatus: "error",
      lastResult: (e && e.message) || "Sweep failed.",
      // Advance to the next slot even on a thrown error so a failing sweep can't hot-loop every tick.
      nextRunAt: manual ? sched.nextRunAt : computeNextRun(sched, new Date()),
    });
    return { ok: false, error: (e && e.message) || "Sweep failed." };
  } finally {
    runningNow.delete(sched.id);
    emit({ type: "schedule-done", scheduleId: sched.id });
  }
}

function runNow(id) {
  const s = store.getSchedule(id);
  if (!s) return Promise.resolve({ ok: false, error: "Schedule not found." });
  return fire(s, { manual: true });
}

function tick() {
  const now = new Date();
  for (const s of store.listSchedules()) {
    if (!s.enabled) continue;
    if (!s.nextRunAt) { store.saveSchedule(s.id, { nextRunAt: computeNextRun(s, now) }); continue; }
    if (new Date(s.nextRunAt) <= now && !runningNow.has(s.id)) fire(s, { manual: false });
  }
}

function start() {
  try { tick(); } catch { /* ignore */ } // catch-up anything missed while closed
  if (!timer) timer = setInterval(() => { try { tick(); } catch { /* ignore */ } }, 60 * 1000);
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { setEmitter, start, stop, runNow, computeNextRun };
