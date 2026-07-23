import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Play, Square, Loader2, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import type { FleetEvent } from "../lib/types";

interface Tile { idx: number; item: string; status: "running" | "done" | "error"; text?: string; output?: string; error?: string }

function newId(): string { try { return crypto.randomUUID(); } catch { return "f-" + Math.random().toString(36).slice(2); } }

export default function FleetPanel({ onClose }: { onClose: () => void }) {
  const [task, setTask] = useState(
    "Research this municipal account and give me: current permitting/licensing systems, the likely pain, and 2 ways Accela could help.",
  );
  const [itemsText, setItemsText] = useState("");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fleetRef = useRef<string | null>(null);

  useEffect(() => {
    const off = window.accela.onFleetEvent((e: FleetEvent) => {
      if (e.fleetId !== fleetRef.current) return;
      if (e.type === "fleet-start") { setRunning(true); return; }
      if (e.type === "fleet-done") {
        // Any tile still "running" was stopped/never reached — settle it so nothing spins forever.
        setTiles((prev) => prev.map((t) => (t.status === "running" ? { ...t, status: "error", error: "Stopped." } : t)));
        setRunning(false);
        return;
      }
      if (e.type === "worker" && typeof e.idx === "number") {
        setTiles((prev) => prev.map((t) => t.idx === e.idx
          ? { ...t, item: e.item ?? t.item, status: (e.status as Tile["status"]) || t.status, text: e.text, output: e.output ?? t.output, error: e.error ?? t.error }
          : t));
      }
    });
    return off;
  }, []);

  async function run() {
    const all = itemsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!task.trim()) { setErr("Give the fleet a task."); return; }
    if (!all.length) { setErr("Add at least one item, one per line."); return; }
    // Cap in lockstep with the backend (fleet.js also slices to 24) so tile count
    // always equals worker count — no orphan tiles left spinning.
    const items = all.slice(0, 24);
    setErr(all.length > 24 ? `Fleet runs up to 24 at once — running the first 24 of ${all.length}.` : null);
    const id = newId();
    fleetRef.current = id;
    setTiles(items.map((item, idx) => ({ idx, item, status: "running", text: "" })));
    setRunning(true);
    const r = await window.accela.startFleet(id, task.trim(), items);
    if (!r.ok) { setErr(r.error || "Couldn't start the fleet."); setRunning(false); }
  }
  async function stop() { if (fleetRef.current) await window.accela.cancelFleet(fleetRef.current); }

  const done = tiles.filter((t) => t.status === "done").length;

  return (
    <div className="overlay wf-overlay" onMouseDown={onClose}>
      <div className="wf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wf-head">
          <h2><Users size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />Fleet</h2>
          <button className="close-x" style={{ position: "static" }} onClick={onClose}><X size={20} /></button>
        </div>
        <div className="wf-list">
          {err && <div className="mcp-warn"><AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />{err}</div>}
          <p className="sub" style={{ marginTop: 0 }}>
            Fan one task out across many agents — one per item — running in parallel. Prep a whole week or research a target list at once.
          </p>

          <div className="field">
            <label>Task <span className="hint-inline">what each agent should do</span></label>
            <textarea className="fleet-task" value={task} onChange={(e) => setTask(e.target.value)} disabled={running} />
          </div>
          <div className="field">
            <label>Items <span className="hint-inline">one per line — an agent runs for each</span></label>
            <textarea className="fleet-items" placeholder={"City of Reno, NV\nWashoe County, NV\nCarson City, NV"} value={itemsText} onChange={(e) => setItemsText(e.target.value)} disabled={running} />
          </div>

          <div className="mcp-add-row">
            {!running
              ? <button className="setup-btn" onClick={run}><Play size={15} /> Run fleet</button>
              : <button className="btn-sm" onClick={stop}><Square size={14} /> Stop</button>}
            {tiles.length > 0 && <span className="range-val" style={{ margin: 0, alignSelf: "center" }}>{done}/{tiles.length} done</span>}
          </div>
          {tiles.length > 0 && (
            <div className="fleet-progress"><div className="fleet-progress-fill" style={{ width: `${Math.round((done / tiles.length) * 100)}%` }} /></div>
          )}

          {tiles.length > 0 && (
            <div className="fleet-grid">
              {tiles.map((t) => (
                <div className={"fleet-tile " + t.status} key={t.idx}>
                  <div className="fleet-tile-head">
                    <span className="fleet-tile-dot">
                      {t.status === "running" && <Loader2 size={15} className="spin" />}
                      {t.status === "done" && <CheckCircle2 size={15} />}
                      {t.status === "error" && <AlertTriangle size={15} />}
                    </span>
                    <span className="fleet-tile-title">{t.item}</span>
                  </div>
                  {t.status === "error"
                    ? <div className="fleet-tile-err">{t.error || "Failed."}</div>
                    : <div className="fleet-tile-body md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{t.status === "done" ? (t.output || "") : (t.text || "")}</ReactMarkdown></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
