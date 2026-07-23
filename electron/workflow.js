// workflow.js — the orchestrated turn-per-step workflow engine.
//
// A workflow "run" is a QUEUE of discrete, resume-linked `claude` turns. Each
// step is ONE runStep() call; the CLI session id is threaded from one step to
// the next so memory carries. Pausing at a gate is free (the step's child has
// already exited) and durable: cursor + session id + status are flushed to disk
// after every step, so a run survives an app restart. Electron-free — it only
// touches store/engine/mcp/commands + an injected emitter.

const store = require("./store");
const mcp = require("./mcp");
const { assembleSystemPrompt, runStep } = require("./engine");
const { listAvailableCommands } = require("./commands");

// id -> { cancel } for the in-flight step of a running workflow.
const running = new Map();

// The renderer emitter, injected by main.js (send over "workflow:event").
let emit = () => {};
function setEmitter(fn) { emit = typeof fn === "function" ? fn : () => {}; }

function nowISO() { return new Date().toISOString(); }
function registry() { try { return listAvailableCommands(); } catch { return []; } }

// Build the per-step turn options: the step's instructions ARE the prompt; the
// system prompt is the base prompt + a workflow framing + the step's skills.
function stepRunOpts(wf, step, settings, resumeId, onEvent, registerCanceller) {
  const framing =
    `You are running one step of an automated sales workflow called "${wf.name}". ` +
    `Do exactly what this step asks, using your tools/skills/connections as needed, then stop and report a short result. ` +
    `Earlier steps' work is in your memory — build on it.`;
  const systemPrompt = assembleSystemPrompt({
    baseSystem: `${settings.systemPrompt}\n\n${framing}`,
    preamble: store.profilePreamble(settings.profile),
    activeSkills: Array.isArray(step.skillNames) ? step.skillNames : [],
    registry: registry(),
  });
  const mcpRegistry = store.getMcpServers();
  const disabledTools = mcpRegistry
    .filter((s) => s && s.enabled !== false && Array.isArray(s.disabledTools))
    .flatMap((s) => s.disabledTools);
  return {
    prompt: step.instructions,
    model: wf.model || settings.model,
    resumeId,
    systemPrompt,
    toolMode: "agent",              // workflows run autonomously; agent mode so skills/MCP/tools run
    mcpServers: mcp.mcpConfigMap(mcpRegistry),
    strictMcp: !!settings.mcpStrict,
    disabledTools,
    onEvent,
    registerCanceller,
  };
}

// Run steps from the cursor until a gate, the end, an error, or a stop.
// `skipGate` skips the gate on the CURRENT step only (used when resuming a pause).
async function advanceRun(id, skipGate) {
  const settings = store.getSettings();
  let wf = store.getWorkflow(id);
  if (!wf || !wf.run) return;

  while (wf.run.cursor < wf.steps.length) {
    const idx = wf.run.cursor;
    const step = wf.steps[idx];

    // Gate: pause BEFORE a gated step, unless we were just resumed past it.
    if (step.gate && step.gate !== "none" && !skipGate) {
      wf.run.status = "paused";
      wf.run.pausedReason = step.gate === "wait"
        ? `Waiting before “${step.title}”. Resume when you're ready.`
        : `Review before “${step.title}”, then approve to continue.`;
      store.setWorkflowRun(id, wf.run);
      emit({ type: "paused", workflowId: id, stepIndex: idx, gate: step.gate, reason: wf.run.pausedReason });
      return;
    }
    skipGate = false; // only the resumed step's gate is skipped

    wf.run.status = "running";
    wf.run.pausedReason = undefined;
    store.setWorkflowRun(id, wf.run);
    emit({ type: "step-start", workflowId: id, stepIndex: idx, stepId: step.id, title: step.title });

    let text = "";
    let cancelled = false;
    const ctrl = { cancel: null };
    running.set(id, ctrl);
    const result = await runStep(stepRunOpts(
      wf, step, settings, wf.run.claudeSessionId,
      (evt) => {
        if (evt.type === "delta") {
          text += evt.text || "";
          emit({ type: "step-delta", workflowId: id, stepIndex: idx, text: evt.text });
        }
      },
      (fn) => { ctrl.cancel = () => { cancelled = true; fn(); }; },
    ));
    running.delete(id);

    // Re-read our run-state (the def may have changed; run-state is ours).
    wf = store.getWorkflow(id);
    if (!wf || !wf.run) return; // deleted mid-run

    if (cancelled) {
      wf.run.status = "paused";
      wf.run.pausedReason = "Stopped.";
      if (result.sessionId) wf.run.claudeSessionId = result.sessionId;
      store.setWorkflowRun(id, wf.run);
      emit({ type: "paused", workflowId: id, stepIndex: idx, reason: "Stopped." });
      return;
    }
    if (result.error) {
      wf.run.status = "error";
      wf.run.log.push({ stepId: step.id, title: step.title, status: "error", output: text || result.text, error: result.error, at: nowISO() });
      if (result.sessionId) wf.run.claudeSessionId = result.sessionId;
      store.setWorkflowRun(id, wf.run);
      emit({ type: "error", workflowId: id, stepIndex: idx, message: result.error });
      return;
    }

    // Success: record output, thread the session, advance the cursor.
    const output = result.text || text;
    wf.run.log.push({ stepId: step.id, title: step.title, status: "done", output, at: nowISO() });
    if (result.sessionId) wf.run.claudeSessionId = result.sessionId;
    wf.run.cursor = idx + 1;
    store.setWorkflowRun(id, wf.run);
    emit({ type: "step-done", workflowId: id, stepIndex: idx, output });
  }

  wf.run.status = "done";
  wf.run.pausedReason = undefined;
  store.setWorkflowRun(id, wf.run);
  emit({ type: "done", workflowId: id });
}

function startRun(id) {
  const wf = store.getWorkflow(id);
  if (!wf) return { ok: false, error: "Workflow not found." };
  if (!wf.steps.length) return { ok: false, error: "Add at least one step first." };
  store.setWorkflowRun(id, {
    cursor: 0, claudeSessionId: null, status: "running", startedAt: nowISO(), log: [],
  });
  emit({ type: "run-start", workflowId: id });
  advanceRun(id, false).catch((e) => emit({ type: "error", workflowId: id, message: (e && e.message) || "Run failed." }));
  return { ok: true };
}

function resumeRun(id) {
  const wf = store.getWorkflow(id);
  if (!wf || !wf.run) return { ok: false, error: "No run to resume." };
  if (wf.run.status !== "paused") return { ok: false, error: "That run isn't paused." };
  if (wf.run.cursor >= wf.steps.length) return { ok: false, error: "Nothing left to run." };
  wf.run.status = "running";
  store.setWorkflowRun(id, wf.run);
  emit({ type: "run-start", workflowId: id, resumed: true });
  advanceRun(id, true).catch((e) => emit({ type: "error", workflowId: id, message: (e && e.message) || "Resume failed." }));
  return { ok: true };
}

function cancelRun(id) {
  const ctrl = running.get(id);
  if (ctrl && ctrl.cancel) {
    ctrl.cancel(); // advanceRun handles the cancelled child -> paused
    return { ok: true };
  }
  // Not mid-step: just mark the paused/idle run stopped.
  const wf = store.getWorkflow(id);
  if (wf && wf.run && wf.run.status !== "done") {
    wf.run.status = "paused";
    wf.run.pausedReason = "Stopped.";
    store.setWorkflowRun(id, wf.run);
    emit({ type: "paused", workflowId: id, reason: "Stopped." });
  }
  return { ok: true };
}

// On boot, a run left "running" was interrupted by a quit/crash — mark it paused
// so the rep can resume it (we never auto-resume unattended).
function reloadOnBoot() {
  try {
    for (const meta of store.listWorkflows()) {
      if (meta.status !== "running") continue;
      const wf = store.getWorkflow(meta.id);
      if (wf && wf.run && wf.run.status === "running") {
        wf.run.status = "paused";
        wf.run.pausedReason = "Interrupted when the app closed. Resume to continue.";
        store.setWorkflowRun(wf.id, wf.run);
      }
    }
  } catch { /* best-effort */ }
}

// ---- Claude authors the sequence -----------------------------------------
// Parse a workflow object out of a model turn (tolerant of code fences / prose).
function parseWorkflow(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let obj;
  try { obj = JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  if (!obj || !Array.isArray(obj.steps) || !obj.steps.length) return null;
  const steps = obj.steps.slice(0, 12).map((st) => ({
    title: String((st && st.title) || "Step").slice(0, 120),
    instructions: String((st && st.instructions) || "").slice(0, 4000),
    skillNames: Array.isArray(st && st.skillNames) ? st.skillNames.filter((x) => typeof x === "string") : [],
    mcpNames: [],
    gate: st && ["none", "wait", "approve"].includes(st.gate) ? st.gate : "none",
  })).filter((st) => st.instructions);
  if (!steps.length) return null;
  return {
    name: String(obj.name || "New workflow").slice(0, 120),
    description: String(obj.description || "").slice(0, 500),
    steps,
  };
}

async function draft(description) {
  if (!description || !String(description).trim()) return { ok: false, error: "Describe what the workflow should do." };
  const settings = store.getSettings();
  const skillList = registry().map((c) => c.name).join(", ");
  const schema =
    `Return ONLY a JSON object (no prose, no markdown fences) of this exact shape:\n` +
    `{"name": string, "description": string, "steps": [{"title": string, "instructions": string, "skillNames": string[], "gate": "none"|"wait"|"approve"}]}\n` +
    `Rules: 3-8 steps. "instructions" is a specific, imperative description of what the assistant should DO in that step. ` +
    `"skillNames" must be chosen ONLY from this list (or []): ${skillList}. ` +
    `Use gate "wait" for a step that must pause for a real-world event (e.g. a call to finish before pulling its transcript), ` +
    `"approve" for a step that writes to a system or sends something outward (so a human approves first), otherwise "none".`;
  const sys = "You design concise, practical sales workflows and output ONLY valid JSON.";

  let result = await runStep({
    prompt: `Design a sales workflow for this request:\n\n${description}\n\n${schema}`,
    model: settings.model, systemPrompt: sys, toolMode: "readonly", onEvent: () => {},
  });
  let parsed = parseWorkflow(result.text);
  if (!parsed) {
    // One repair pass on the same session.
    result = await runStep({
      prompt: `That was not valid JSON. Output ONLY the JSON object now, nothing else.\n\n${schema}`,
      model: settings.model, resumeId: result.sessionId, systemPrompt: sys, toolMode: "readonly", onEvent: () => {},
    });
    parsed = parseWorkflow(result.text);
  }
  if (!parsed) return { ok: false, error: "Couldn't turn that into a workflow — try describing it a bit differently." };
  const wf = store.createWorkflow(parsed.name, parsed.description, parsed.steps);
  return { ok: true, workflow: wf };
}

module.exports = { setEmitter, startRun, resumeRun, cancelRun, reloadOnBoot, draft };
