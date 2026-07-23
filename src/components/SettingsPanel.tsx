import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Settings, RepProfile } from "../lib/types";
import { MODELS } from "../lib/models";
import { ROLES } from "../lib/roles";

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
  // Territory/products edit as raw text so typing a comma/space to start a second
  // value isn't stripped mid-keystroke; committed to string[] on blur.
  const [regionsText, setRegionsText] = useState((settings.profile.regions || []).join(", "));
  const [productsText, setProductsText] = useState((settings.profile.products || []).join(", "));

  useEffect(() => {
    setLocal(settings);
    setRegionsText((settings.profile.regions || []).join(", "));
    setProductsText((settings.profile.products || []).join(", "));
  }, [settings]);

  const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  // Flush in-progress territory/products text on close, so a backdrop click made
  // before the input blurs never drops the edit.
  function handleClose() {
    onSave({ profile: { ...local.profile, regions: toList(regionsText), products: toList(productsText) } });
    onClose();
  }

  function update(patch: Partial<Settings>) {
    const next = { ...local, ...patch };
    setLocal(next);
    onSave(patch); // apply live
  }

  // Send the FULL merged profile (store merges it in) so a single field edit is
  // type-safe and never drops the rest of the profile.
  function updateProfile(patch: Partial<RepProfile>) {
    const profile = { ...local.profile, ...patch };
    setLocal({ ...local, profile });
    onSave({ profile });
  }

  const enabledMcp = (local.mcpServers || []).filter((s) => s.enabled !== false).length;

  return (
    <div className="overlay" onMouseDown={handleClose}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={handleClose}>
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

        <div className="section-label">Your profile</div>
        <p className="range-val" style={{ marginTop: -4, marginBottom: 12 }}>
          Personalizes every answer — territory, focus, and how you like things written. Edit anytime.
        </p>

        <div className="field">
          <label>Name</label>
          <input type="text" value={local.profile.name}
            onChange={(e) => updateProfile({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Title</label>
          <input type="text" value={local.profile.title}
            onChange={(e) => updateProfile({ title: e.target.value })} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={local.profile.email}
            onChange={(e) => updateProfile({ email: e.target.value })} />
        </div>
        <div className="field">
          <label>Territory <span className="hint-inline">comma-separated, e.g. NV, UT, CO</span></label>
          <input type="text" value={regionsText}
            onChange={(e) => setRegionsText(e.target.value)}
            onBlur={() => updateProfile({ regions: toList(regionsText) })} />
        </div>
        <div className="field">
          <label>Role <span className="hint-inline">sets your skill pack + the altitude Claude works at</span></label>
          <select
            className="settings-select"
            value={local.profile.role || ""}
            onChange={(e) => updateProfile({ role: e.target.value })}
          >
            <option value="">— Not set —</option>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Products <span className="hint-inline">comma-separated</span></label>
          <input type="text" value={productsText}
            onChange={(e) => setProductsText(e.target.value)}
            onBlur={() => updateProfile({ products: toList(productsText) })} />
        </div>
        <div className="field">
          <label>Focus / bio <span className="hint-inline">what you sell, the population you cover, how you work, anything to keep in mind</span></label>
          <textarea value={local.profile.customPrefs}
            onChange={(e) => updateProfile({ customPrefs: e.target.value })} />
        </div>
        <div className="field">
          <label>Preferred tone</label>
          <input type="text" value={local.profile.tone}
            onChange={(e) => updateProfile({ tone: e.target.value })} />
        </div>
        <div className="field">
          <label>Email signature</label>
          <textarea value={local.profile.signature}
            onChange={(e) => updateProfile({ signature: e.target.value })} />
        </div>
        <div className="field">
          <label>Personalization</label>
          <div className="seg">
            <button className={local.profile.usePersonalization ? "on" : ""} onClick={() => updateProfile({ usePersonalization: true })}>On</button>
            <button className={!local.profile.usePersonalization ? "on" : ""} onClick={() => updateProfile({ usePersonalization: false })}>Off</button>
          </div>
          <div className="range-val">When on, your profile is woven into every answer.</div>
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
