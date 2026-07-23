import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X, Plus, Trash2, Play, Square, ChevronUp, ChevronDown, ArrowLeft,
  Sparkles, Loader2, CheckCircle2, Circle, AlertTriangle, Clock, ShieldCheck, RotateCcw, Pencil,
} from "lucide-react";
import type { SlashCommand, Workflow, WorkflowMeta, WorkflowStep, WorkflowGate } from "../lib/types";
import { WORKFLOW_TEMPLATES } from "../lib/workflowTemplates";
import { skillLabel } from "../lib/presets";

const GATE_LABEL: Record<WorkflowGate, string> = {
  none: "Run automatically",
  wait: "Pause & wait (real-world event)",
  approve: "Pause for my approval",
};

function newId(): string {
  try { return crypto.randomUUID(); } catch { return "s-" + Math.random().toString(36).slice(2); }
}

export default function WorkflowsPanel({ commands, onClose }: { commands: SlashCommand[]; onClose: () => void }) {
  const [list, setList] = useState<WorkflowMeta[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [draftText, setDraftText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [live, setLive] = useState<{ index: number; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false); // reviewing a finished run vs editing it
  const selIdRef = useRef<string | null>(null);
  selIdRef.current = selected?.id || null;

  const skills = commands.filter((c) => c.kind === "skill");

  async function refreshList() { setList(await window.accela.listWorkflows()); }
  async function openWorkflow(id: string) {
    const wf = await window.accela.getWorkflow(id);
    setSelected(wf); setLive(null); setEditing(false);
    // Resurface a persisted failure so a failed run's reason is visible on reopen.
    setErr(wf && wf.run && wf.run.status === "error"
      ? (wf.run.log[wf.run.cursor]?.error || "This run hit an error.")
      : null);
  }
  async function refreshSelected() {
    const id = selIdRef.current;
    if (!id) return;
    const wf = await window.accela.getWorkflow(id);
    if (wf && selIdRef.current === id) setSelected(wf);
  }

  useEffect(() => { refreshList(); }, []);
  useEffect(() => {
    const off = window.accela.onWorkflowEvent((e) => {
      if (e.workflowId !== selIdRef.current) { refreshList(); return; }
      if (e.type === "step-start") { setLive({ index: e.stepIndex ?? 0, text: "" }); refreshSelected(); }
      else if (e.type === "step-delta") {
        setLive((p) => ({ index: e.stepIndex ?? (p ? p.index : 0), text: (p ? p.text : "") + (e.text || "") }));
      } else {
        // step-done / paused / done / error / run-start
        setLive(null); refreshSelected(); refreshList();
        if (e.type === "error" && e.message) setErr(e.message);
      }
    });
    return off;
  }, []);

  const run = selected?.run || null;
  const active = !!run && (run.status === "running" || run.status === "paused");
  // Show the read-only RUN view while active OR when reviewing a finished/failed
  // run; only drop to the editable step cards with no run, or via an Edit toggle.
  const showRun = !!run && (active || !editing);
  const canEdit = !showRun;

  async function persist(next: Workflow) {
    setSelected(next);
    await window.accela.saveWorkflow(next.id, { name: next.name, description: next.description, steps: next.steps });
  }
  function updateStep(i: number, patch: Partial<WorkflowStep>) {
    if (!selected) return;
    persist({ ...selected, steps: selected.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }
  function toggleSkill(i: number, name: string) {
    if (!selected) return;
    const step = selected.steps[i];
    const has = step.skillNames.includes(name);
    updateStep(i, { skillNames: has ? step.skillNames.filter((n) => n !== name) : [...step.skillNames, name] });
  }
  function addStep() {
    if (!selected) return;
    persist({ ...selected, steps: [...selected.steps, { id: newId(), title: "New step", instructions: "", skillNames: [], mcpNames: [], gate: "none" }] });
  }
  function removeStep(i: number) {
    if (!selected) return;
    persist({ ...selected, steps: selected.steps.filter((_, j) => j !== i) });
  }
  function moveStep(i: number, dir: -1 | 1) {
    if (!selected) return;
    const j = i + dir;
    if (j < 0 || j >= selected.steps.length) return;
    const steps = [...selected.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    persist({ ...selected, steps });
  }

  async function newWorkflow() {
    const wf = await window.accela.createWorkflow("New workflow", "", []);
    await refreshList(); openWorkflow(wf.id);
  }
  async function useTemplate(tid: string) {
    const t = WORKFLOW_TEMPLATES.find((x) => x.id === tid);
    if (!t) return;
    const wf = await window.accela.createWorkflow(t.name, t.description, t.steps.map((s) => ({ ...s, id: newId() })));
    await refreshList(); openWorkflow(wf.id);
  }
  async function buildWithClaude() {
    if (!draftText.trim() || drafting) return;
    setDrafting(true); setErr(null);
    const r = await window.accela.draftWorkflow(draftText.trim());
    setDrafting(false);
    if (r.ok && r.workflow) { setDraftText(""); await refreshList(); openWorkflow(r.workflow.id); }
    else setErr(r.error || "Couldn't build that — try describing it differently.");
  }
  async function startRun() {
    if (!selected) return;
    setErr(null); setEditing(false);
    const r = await window.accela.startWorkflow(selected.id);
    if (!r.ok) setErr(r.error || "Couldn't start."); else refreshSelected();
  }
  async function resumeRun() {
    if (!selected) return;
    const r = await window.accela.resumeWorkflow(selected.id);
    if (!r.ok) setErr(r.error || null); else refreshSelected();
  }
  async function stopRun() {
    if (!selected) return;
    await window.accela.cancelWorkflow(selected.id);
    refreshSelected();
  }
  async function deleteWorkflow(id: string) {
    await window.accela.deleteWorkflow(id);
    if (selIdRef.current === id) setSelected(null);
    refreshList();
  }

  // Per-step run display.
  function stepState(i: number): "done" | "error" | "running" | "paused" | "pending" | "idle" {
    if (!run) return "idle";
    if (i < run.cursor) return run.log[i]?.status === "error" ? "error" : "done";
    if (i === run.cursor) {
      if (run.status === "running") return "running";
      if (run.status === "paused") return "paused";
      if (run.status === "error") return "error";
    }
    return "pending";
  }
  function stepOutput(i: number): string {
    if (live && live.index === i) return live.text;
    return run?.log[i]?.output || "";
  }
  function stepError(i: number): string { return run?.log[i]?.error || ""; }

  return (
    <div className="overlay wf-overlay" onMouseDown={onClose}>
      <div className="wf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wf-head">
          <h2>{selected ? (
            <button className="wf-back" onClick={() => { setSelected(null); refreshList(); }}><ArrowLeft size={18} /> Workflows</button>
          ) : "Workflows"}</h2>
          <button className="close-x" style={{ position: "static" }} onClick={onClose}><X size={20} /></button>
        </div>

        {err && <div className="mcp-warn"><AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />{err}</div>}

        {!selected && (
          <div className="wf-list">
            <p className="sub">
              Build a sequence of steps the assistant runs for you — each step can lean on your skills and connections,
              and pause at a gate for your ok. Describe one and Claude drafts it, or start from a template.
            </p>

            <div className="wf-build">
              <textarea
                placeholder="Describe a workflow… e.g. “after each customer call, pull MEDDPICC from the transcript, update the CRM after I approve, and draft a follow-up in my voice”"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              <button className="setup-btn" disabled={!draftText.trim() || drafting} onClick={buildWithClaude}>
                {drafting ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {drafting ? "Building…" : "Build with Claude"}
              </button>
            </div>

            <div className="wf-templates">
              {WORKFLOW_TEMPLATES.map((t) => (
                <div className="skill-card" key={t.id} style={{ cursor: "default" }}>
                  <span className="skill-text">
                    <span className="skill-name">{t.name}</span>
                    <span className="skill-desc">{t.description}</span>
                  </span>
                  <button className="btn-sm" style={{ alignSelf: "center", flex: "0 0 auto" }} onClick={() => useTemplate(t.id)}>Use template</button>
                </div>
              ))}
            </div>

            <div className="mcp-add-row">
              <button className="btn-sm" onClick={newWorkflow}><Plus size={15} /> Blank workflow</button>
            </div>

            <div className="section-label">Saved {list.length > 0 && `(${list.length})`}</div>
            {list.length === 0 && <p className="range-val">No workflows yet.</p>}
            {list.map((w) => (
              <div className="mcp-row" key={w.id}>
                <div className="mcp-main" style={{ cursor: "pointer" }} onClick={() => openWorkflow(w.id)}>
                  <div className="mcp-name">{w.name} <span className={"wf-status " + w.status}>{w.status}</span></div>
                  <div className="mcp-meta">{w.stepCount} step{w.stepCount === 1 ? "" : "s"}{w.description ? ` · ${w.description}` : ""}</div>
                </div>
                <div className="mcp-actions">
                  <button className="icon-btn" title="Open" onClick={() => openWorkflow(w.id)}><Play size={15} /></button>
                  <button className="icon-btn" title="Delete" onClick={() => deleteWorkflow(w.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="wf-detail">
            <div className="wf-detail-head">
              <input
                className="wf-name"
                value={selected.name}
                disabled={!canEdit}
                onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                onBlur={() => persist(selected)}
              />
              {run && (
                <span className={"wf-status " + run.status}>{run.status}{run.pausedReason ? "" : ""}</span>
              )}
            </div>

            {run && run.pausedReason && (
              <div className="wf-pause">
                <Clock size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                {run.pausedReason}
              </div>
            )}

            <div className="wf-steps">
              {selected.steps.map((step, i) => {
                const st = stepState(i);
                const out = stepOutput(i);
                return (
                  <div className={"wf-step " + st} key={step.id}>
                    <div className="wf-step-rail">
                      <span className={"wf-step-dot " + st}>
                        {st === "done" && <CheckCircle2 size={18} />}
                        {st === "error" && <AlertTriangle size={18} />}
                        {st === "running" && <Loader2 size={18} className="spin" />}
                        {st === "paused" && (step.gate === "approve" ? <ShieldCheck size={18} /> : <Clock size={18} />)}
                        {(st === "pending" || st === "idle") && <Circle size={18} />}
                      </span>
                      {i < selected.steps.length - 1 && <span className="wf-step-line" />}
                    </div>

                    <div className="wf-step-body">
                      {canEdit ? (
                        <>
                          <div className="wf-step-toprow">
                            <input className="wf-step-title" value={step.title}
                              onChange={(e) => setSelected({ ...selected, steps: selected.steps.map((s, j) => j === i ? { ...s, title: e.target.value } : s) })}
                              onBlur={() => persist(selected)} />
                            <div className="wf-step-controls">
                              <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}><ChevronUp size={14} /></button>
                              <button className="icon-btn" title="Move down" disabled={i === selected.steps.length - 1} onClick={() => moveStep(i, 1)}><ChevronDown size={14} /></button>
                              <button className="icon-btn" title="Remove" onClick={() => removeStep(i)}><Trash2 size={14} /></button>
                            </div>
                          </div>
                          <textarea className="wf-step-instr" placeholder="What should the assistant do in this step?"
                            value={step.instructions}
                            onChange={(e) => setSelected({ ...selected, steps: selected.steps.map((s, j) => j === i ? { ...s, instructions: e.target.value } : s) })}
                            onBlur={() => persist(selected)} />
                          <div className="wf-step-meta">
                            <label className="wf-mini-label">Gate</label>
                            <select value={step.gate} onChange={(e) => updateStep(i, { gate: e.target.value as WorkflowGate })}>
                              {(["none", "wait", "approve"] as WorkflowGate[]).map((g) => <option key={g} value={g}>{GATE_LABEL[g]}</option>)}
                            </select>
                          </div>
                          <div className="wf-step-meta">
                            <label className="wf-mini-label">Skills</label>
                            <div className="wf-chips">
                              {step.skillNames.map((n) => (
                                <button className="wf-chip on" key={n} onClick={() => toggleSkill(i, n)}>{skillLabel(n)} <X size={11} /></button>
                              ))}
                              <select value="" onChange={(e) => { if (e.target.value) toggleSkill(i, e.target.value); }}>
                                <option value="">+ add skill</option>
                                {skills.filter((c) => !step.skillNames.includes(c.name)).map((c) => (
                                  <option key={c.name} value={c.name}>{skillLabel(c.name)}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="wf-step-toprow">
                            <span className="wf-step-title-ro">{step.title}</span>
                            {step.gate !== "none" && <span className="mcp-badge soon">{step.gate === "wait" ? "gate: wait" : "gate: approve"}</span>}
                          </div>
                          {st === "error" && stepError(i) && <div className="wf-step-errline">{stepError(i)}</div>}
                          {out && <div className="wf-step-out md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{out}</ReactMarkdown></div>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {canEdit && (
                <button className="btn-sm" style={{ marginTop: 4 }} onClick={addStep}><Plus size={15} /> Add step</button>
              )}
            </div>

            <div className="wf-footer">
              {active && run.status === "paused" && run.cursor < selected.steps.length && (
                <button className="setup-btn" onClick={resumeRun}>
                  {selected.steps[run.cursor]?.gate === "approve" ? <><ShieldCheck size={15} /> Approve & continue</> : <><Play size={15} /> Resume</>}
                </button>
              )}
              {active && (
                <button className="btn-sm" onClick={stopRun}><Square size={14} /> Stop</button>
              )}
              {!active && showRun && (
                <>
                  <button className="setup-btn" onClick={startRun}><RotateCcw size={15} /> Run again</button>
                  <button className="btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
                </>
              )}
              {!active && canEdit && selected.steps.length > 0 && (
                <button className="setup-btn" onClick={startRun}>
                  {run ? <><RotateCcw size={15} /> Run again</> : <><Play size={15} /> Run</>}
                </button>
              )}
              {!active && canEdit && run && (
                <button className="btn-sm" onClick={() => setEditing(false)}><ArrowLeft size={14} /> Back to results</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
