import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Settings } from "../lib/types";
import { MODELS } from "../lib/models";

const FONTS: { id: Settings["fontFamily"]; label: string }[] = [
  { id: "Plus Jakarta Sans", label: "Plus Jakarta Sans" },
  { id: "Inter", label: "Inter" },
  { id: "System", label: "System" },
];

const TOOL_MODES: { id: Settings["toolMode"]; label: string; hint: string }[] = [
  { id: "chat", label: "Pure chat", hint: "Conversation only — no tools." },
  { id: "readonly", label: "Read + web", hint: "Can read files & search the web. Never edits." },
  {
    id: "agent",
    label: "Sales cockpit",
    hint: "Full access: skills (/account-brief, /accela-deck…), the agent fleet, and the Sales Workspace. Can read, write, and run on your machine.",
  },
];

export default function SettingsPanel({
  settings,
  onSave,
  onClose,
  claudeStatus,
}: {
  settings: Settings;
  onSave: (patch: Partial<Settings>) => void;
  onClose: () => void;
  claudeStatus: { ok: boolean; version: string | null } | null;
}) {
  const [local, setLocal] = useState<Settings>(settings);

  useEffect(() => setLocal(settings), [settings]);

  function update(patch: Partial<Settings>) {
    const next = { ...local, ...patch };
    setLocal(next);
    onSave(patch); // apply live
  }

  const enabledMcp = (local.mcpServers || []).filter((s) => s.enabled !== false).length;

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose}>
          <X size={20} />
        </button>
        <h2>Settings</h2>
        <p className="sub">Changes apply instantly.</p>

        <div className="field">
          <label>Default model</label>
          <div className="seg">
            {MODELS.map((m) => (
              <button
                key={m.id}
                className={local.model === m.id ? "on" : ""}
                onClick={() => update({ model: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Reading font</label>
          <div className="seg">
            {FONTS.map((f) => (
              <button
                key={f.id}
                className={local.fontFamily === f.id ? "on" : ""}
                onClick={() => update({ fontFamily: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Text size — {Math.round(local.fontScale * 100)}%</label>
          <input
            type="range"
            min={0.9}
            max={1.3}
            step={0.05}
            value={local.fontScale}
            onChange={(e) => update({ fontScale: parseFloat(e.target.value) })}
          />
          <div className="range-val">Larger text is easier to read in a live demo.</div>
        </div>

        <div className="field">
          <label>Assistant capabilities</label>
          <div className="seg">
            {TOOL_MODES.map((t) => (
              <button
                key={t.id}
                className={local.toolMode === t.id ? "on" : ""}
                onClick={() => update({ toolMode: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="range-val">
            {TOOL_MODES.find((t) => t.id === local.toolMode)?.hint}
          </div>
          {enabledMcp > 0 && local.toolMode !== "agent" && (
            <div className="range-val warn-text">
              You have {enabledMcp} MCP connection{enabledMcp === 1 ? "" : "s"} — they only run in Sales cockpit mode.
            </div>
          )}
        </div>

        <div className="field">
          <label>System prompt</label>
          <textarea
            value={local.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Claude Code</label>
          {claudeStatus ? (
            <div className="status-pill">
              <span className={"dot " + (claudeStatus.ok ? "ok" : "bad")} />
              {claudeStatus.ok
                ? `Connected · ${claudeStatus.version ?? "ready"}`
                : "Not found — install Claude Code and run `claude` once to log in."}
            </div>
          ) : (
            <div className="status-pill">
              <span className="dot" />
              Checking…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
