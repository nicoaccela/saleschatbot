import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X, Plus, Trash2, Play, Loader2, ToggleLeft, ToggleRight, Pencil, CalendarClock, AlertTriangle, Clock,
} from "lucide-react";
import type { Schedule, ScheduleCadence, ScheduleTarget, WorkflowMeta } from "../lib/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtTime(t: string): string {
  const [h, m] = (t || "08:00").split(":").map((n) => parseInt(n, 10) || 0);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
function cadenceSummary(s: Schedule): string {
  const at = ` at ${fmtTime(s.time)}`;
  if (s.cadence === "weekdays") return `Weekdays${at}`;
  if (s.cadence === "weekly") return `Every ${WEEKDAYS[s.weekday] || "Monday"}${at}`;
  return `Every day${at}`;
}
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
// Future-facing counterpart for nextRunAt (timeAgo only handles past times).
function until(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.round(diff / 60000);
  if (m < 1) return "in <1m";
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}
function targetLabel(t: ScheduleTarget, workflows: WorkflowMeta[]): string {
  if (t.type === "weekly-meetings") return "This week's meetings";
  if (t.type === "workflow") return workflows.find((w) => w.id === t.workflowId)?.name || "Linked workflow";
  return "Today's prep";
}

interface Draft {
  id?: string;
  name: string;
  cadence: ScheduleCadence;
  time: string;
  weekday: number;
  targetType: string; // "daily-prep" | "weekly-meetings" | "wf:<id>"
}
function draftFromSchedule(s: Schedule): Draft {
  return { id: s.id, name: s.name, cadence: s.cadence, time: s.time, weekday: s.weekday, targetType: s.target.type === "workflow" ? `wf:${s.target.workflowId}` : s.target.type };
}
function blankDraft(): Draft {
  return { name: "Daily meeting prep", cadence: "weekdays", time: "08:00", weekday: 1, targetType: "daily-prep" };
}
function draftTarget(d: Draft): ScheduleTarget {
  if (d.targetType.startsWith("wf:")) return { type: "workflow", workflowId: d.targetType.slice(3) };
  return { type: d.targetType === "weekly-meetings" ? "weekly-meetings" : "daily-prep" };
}

export default function SchedulesPanel({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Schedule[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mounted = useRef(true);

  async function refresh() {
    const s = await window.accela.listSchedules();
    if (mounted.current) setList(s);
  }
  useEffect(() => {
    mounted.current = true;
    refresh();
    window.accela.listWorkflows().then((w) => { if (mounted.current) setWorkflows(w); });
    const off = window.accela.onScheduleEvent((e) => {
      if (e.type === "schedule-start") setRunningId(e.scheduleId);
      if (e.type === "schedule-done") setRunningId((r) => (r === e.scheduleId ? null : r));
      refresh();
    });
    return () => { mounted.current = false; off(); };
  }, []);

  async function persistNew() {
    if (!draft) return;
    const target = draftTarget(draft);
    if (draft.id) await window.accela.saveSchedule(draft.id, { name: draft.name, cadence: draft.cadence, time: draft.time, weekday: draft.weekday, target, nextRunAt: null });
    else await window.accela.createSchedule({ name: draft.name, cadence: draft.cadence, time: draft.time, weekday: draft.weekday, target });
    setDraft(null); refresh();
  }
  async function toggle(s: Schedule) { await window.accela.saveSchedule(s.id, { enabled: !s.enabled, nextRunAt: null }); refresh(); }
  async function del(id: string) { await window.accela.deleteSchedule(id); refresh(); }
  async function runNow(id: string) { setErr(null); const r = await window.accela.runSchedule(id); if (!r.ok) setErr(r.error || "Couldn't run."); }

  const feed = list.filter((s) => s.lastResult).sort((a, b) => ((a.lastRunAt || "") < (b.lastRunAt || "") ? 1 : -1));

  return (
    <div className="overlay wf-overlay" onMouseDown={onClose}>
      <div className="wf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wf-head">
          <h2><CalendarClock size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />Today &amp; schedules</h2>
          <button className="close-x" style={{ position: "static" }} onClick={onClose}><X size={20} /></button>
        </div>

        <div className="wf-list">
          {err && <div className="mcp-warn"><AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />{err}</div>}

          <p className="sub" style={{ marginTop: 0 }}>
            Sweeps prep your day for you — pull your meetings and draft a brief for each call. They run while the app is open;
            <span className="soon-inline"> background runs while it's closed are coming soon.</span>
          </p>

          {/* Today feed */}
          <div className="section-label">Latest results</div>
          {feed.length === 0 && <p className="range-val" style={{ marginBottom: 14 }}>Nothing yet. Add a schedule and hit Run now to see a prep drop here.</p>}
          {feed.map((s) => (
            <div className="today-card" key={s.id}>
              <div className="today-card-head">
                <span className="today-card-title">{s.name}</span>
                <span className="today-card-meta">{timeAgo(s.lastRunAt)}<span className={"wf-status " + (s.lastStatus === "error" ? "error" : "done")} style={{ marginLeft: 8 }}>{s.lastStatus === "error" ? "error" : "ready"}</span></span>
              </div>
              <div className="today-card-body md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{s.lastResult}</ReactMarkdown></div>
            </div>
          ))}

          {/* Schedules */}
          <div className="section-label">Schedules {list.length > 0 && `(${list.length})`}</div>
          {list.map((s) => (
            <div className="mcp-row" key={s.id}>
              <button className="mcp-toggle" title={s.enabled ? "On" : "Off"} onClick={() => toggle(s)}>
                {s.enabled ? <ToggleRight size={22} color="var(--blue)" /> : <ToggleLeft size={22} color="var(--muted)" />}
              </button>
              <div className="mcp-main">
                <div className="mcp-name">{s.name}</div>
                <div className="mcp-meta">{cadenceSummary(s)} · {targetLabel(s.target, workflows)}{s.enabled && s.nextRunAt ? ` · next ${until(s.nextRunAt)}` : ""}</div>
              </div>
              <div className="mcp-actions">
                <button className="icon-btn" title="Run now" disabled={runningId === s.id} onClick={() => runNow(s.id)}>
                  {runningId === s.id ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
                </button>
                <button className="icon-btn" title="Edit" onClick={() => setDraft(draftFromSchedule(s))}><Pencil size={15} /></button>
                <button className="icon-btn" title="Delete" onClick={() => del(s.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}

          {draft ? (
            <div className="mcp-form">
              <div className="field"><label>Name</label>
                <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="field"><label>What it does</label>
                <select value={draft.targetType} onChange={(e) => setDraft({ ...draft, targetType: e.target.value })}>
                  <option value="daily-prep">Prep today's calls</option>
                  <option value="weekly-meetings">List this week's meetings</option>
                  {workflows.map((w) => <option key={w.id} value={`wf:${w.id}`}>Run workflow: {w.name}</option>)}
                </select>
              </div>
              <div className="field"><label>How often</label>
                <div className="seg">
                  {(["daily", "weekdays", "weekly"] as ScheduleCadence[]).map((c) => (
                    <button key={c} className={draft.cadence === c ? "on" : ""} onClick={() => setDraft({ ...draft, cadence: c })}>{c}</button>
                  ))}
                </div>
              </div>
              {draft.cadence === "weekly" && (
                <div className="field"><label>Day</label>
                  <select value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: parseInt(e.target.value, 10) })}>
                    {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              <div className="field"><label>Time</label>
                <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></div>
              <div className="mcp-form-actions">
                <button className="setup-btn" disabled={!draft.name.trim()} onClick={persistNew}>Save schedule</button>
                <button className="link-btn" onClick={() => setDraft(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mcp-add-row"><button className="btn-sm" onClick={() => setDraft(blankDraft())}><Plus size={15} /> New schedule</button></div>
          )}

          <div className="soon-card">
            <Clock size={14} /> Background runs (while the app is closed) — <strong>coming soon</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
