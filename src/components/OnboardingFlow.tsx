import { useState } from "react";
import { ArrowRight, ArrowLeft, Check, ShieldCheck, Sparkles, X } from "lucide-react";
import logoDark from "../assets/accela-logo-dark.svg";
import type { RepProfile, Settings } from "../lib/types";

// Run-once setup. Captures the rep's stable profile + working preferences (used
// to personalize every turn) and their capability mode, then latches
// setup.completedAt so it never shows again. Content packs (brand kit, the
// workspace) connect afterward via the setup skills.

const SEGMENTS = [
  { id: "0-100K", label: "0–100K population", role: "Account Executive" },
  { id: "100K+", label: "100K+ population", role: "Account Director" },
];
const PRODUCTS = ["Accela", "OpenCounter", "ePermitHub", "Novotx"];
const TONES = ["Professional", "Friendly & warm", "Direct & punchy", "Consultative", "Confident", "Casual"];
const LENGTHS = ["Extremely short", "Very short", "Short", "Shortish", "Longish", "Long", "Very long", "Extremely long"];
const WORK_TYPES = ["Email Writing", "Document Creation", "Deal Strategy", "Prospecting Plays", "MEDDPICC Notes", "Market Analysis", "Meeting Prep", "Research"];
const TOOL_MODES: { id: Settings["toolMode"]; label: string; hint: string }[] = [
  {
    id: "agent",
    label: "Sales cockpit · Recommended",
    hint: "Claude reads, writes, runs your skills, and uses the agent fleet without stopping to ask permission at every step — so it actually finishes the job (drafting reports, building decks, organizing files).",
  },
  {
    id: "readonly",
    label: "Safe (read + web)",
    hint: "Claude can read files and search the web, but never edits or runs anything. Safer — but it will stall on any task that needs to write or run.",
  },
];

function composeSignature(p: RepProfile): string {
  return [p.name, p.title, "Accela", p.email, p.phone].filter(Boolean).join("\n");
}

export default function OnboardingFlow({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (patch: Partial<Settings>) => Promise<void> | void;
}) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<RepProfile>({
    ...settings.profile,
    responseLength: settings.profile.responseLength || "Shortish",
    timezone: settings.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  });
  const [toolMode, setToolMode] = useState<Settings["toolMode"]>(settings.toolMode === "readonly" ? "readonly" : "agent");
  const [regionInput, setRegionInput] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<RepProfile>) => setP((c) => ({ ...c, ...patch }));
  const toggle = (key: "products" | "workTypes", v: string) =>
    setP((c) => {
      const a = c[key] || [];
      return { ...c, [key]: a.includes(v) ? a.filter((x) => x !== v) : [...a, v] };
    });

  function mergeRegions(cur: string[], raw: string): string[] {
    const next = [...cur];
    for (const x of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!next.some((r) => r.toLowerCase() === x.toLowerCase())) next.push(x);
    }
    return next;
  }
  function addRegions(raw: string) {
    if (!raw.trim()) return;
    setP((c) => ({ ...c, regions: mergeRegions(c.regions || [], raw) }));
    setRegionInput("");
  }
  function onRegionKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addRegions(regionInput);
    } else if (e.key === "Backspace" && !regionInput && (p.regions || []).length) {
      setP((c) => ({ ...c, regions: c.regions.slice(0, -1) }));
    }
  }
  const removeRegion = (r: string) => setP((c) => ({ ...c, regions: c.regions.filter((x) => x !== r) }));

  const lenIdx = Math.max(0, LENGTHS.indexOf(p.responseLength || "Shortish"));

  async function finish() {
    if (saving) return;
    setSaving(true);
    // Fold in any text still in the region box, then persist + latch completion.
    const regions = mergeRegions(p.regions || [], regionInput);
    const merged: RepProfile = { ...p, regions };
    const profile: RepProfile = { ...merged, signature: (merged.signature || "").trim() || composeSignature(merged) };
    await onSave({ profile, toolMode, setup: { completedAt: new Date().toISOString() } });
  }

  return (
    <div className="setup">
      <div className="setup-card onb-card">
        <img className="welcome-logo" src={logoDark} alt="Accela" />
        {step > 0 && (
          <div className="onb-progress">{["", "Step 1 of 3 · Personalize", "Step 2 of 3 · Optimize", "Step 3 of 3 · Actualize"][step]}</div>
        )}

        {step === 0 && (
          <>
            <h1>Welcome to Accela Chat</h1>
            <p className="onb-mission">
              Your Claude Code cockpit for selling Accela — it runs on your own Claude Code login, knows the
              Accela portfolio + 2026 brand, and comes loaded with sales skills. Quick one-time setup:
            </p>
            <div className="onb-steps-preview">
              <div className="step-preview"><span className="step-n">1</span><div><strong>Personalize</strong><em>Who you are and your territory.</em></div></div>
              <div className="step-preview"><span className="step-n">2</span><div><strong>Optimize</strong><em>Your tone, reply length, and how it works.</em></div></div>
              <div className="step-preview"><span className="step-n">3</span><div><strong>Actualize</strong><em>Connect your brand kit &amp; workspace, then go.</em></div></div>
            </div>
            <p className="onb-note">
              It's all optional, and the <strong>Help &amp; setup</strong> button (bottom of the sidebar) lets you
              do any of it later. One requirement: Claude Code installed and <strong>signed in once via terminal</strong> —
              the app checks for you and walks you through it if it's missing.
            </p>
            <div className="onb-actions">
              <span className="spacer" />
              <button className="setup-btn" onClick={() => setStep(1)}>Get started <ArrowRight size={16} /></button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Your profile</h1>
            <p className="sub">All optional — fill in what helps; skip the rest. Change anything later in Settings.</p>
            <div className="onb-grid">
              <div className="field">
                <label>Name</label>
                <input type="text" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jane Rivera" />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} placeholder="jrivera@accela.com" />
              </div>
              <div className="field">
                <label>Title</label>
                <input type="text" value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="Account Executive" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input type="text" value={p.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(555) 123-4567" />
              </div>
              <div className="field full">
                <label>States / region <span className="hint-inline">— type a state and press Enter or comma</span></label>
                {(p.regions || []).length > 0 && (
                  <div className="chips" style={{ marginBottom: 8 }}>
                    {p.regions.map((r) => (
                      <span key={r} className="chip on">
                        {r}
                        <button type="button" className="chip-x" onClick={() => removeRegion(r)} aria-label={`Remove ${r}`}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={regionInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.includes(",")) addRegions(v);
                    else setRegionInput(v);
                  }}
                  onKeyDown={onRegionKey}
                  onBlur={() => addRegions(regionInput)}
                  placeholder="CO, NV, UT…"
                />
              </div>
              <div className="field full">
                <label>Your segment</label>
                <div className="seg">
                  {SEGMENTS.map((s) => (
                    <button key={s.id} type="button" className={p.segment === s.id ? "on" : ""} onClick={() => set({ segment: p.segment === s.id ? "" : s.id })}>
                      {s.label} · {s.role}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field full">
                <label>Products you sell</label>
                <div className="chips">
                  {PRODUCTS.map((pr) => (
                    <button key={pr} type="button" className={"chip" + ((p.products || []).includes(pr) ? " on" : "")} onClick={() => toggle("products", pr)}>{pr}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="onb-actions">
              <button className="onb-back" onClick={() => setStep(0)}><ArrowLeft size={16} /> Back</button>
              <span className="spacer" />
              <button className="setup-btn" onClick={() => setStep(2)}>Continue <ArrowRight size={16} /></button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>How you like Claude to work</h1>
            <p className="sub">These shape every reply and are saved to Claude's memory. All optional.</p>
            <div className="onb-grid">
              <div className="field full">
                <label>Tone</label>
                <div className="chips">
                  {TONES.map((t) => (
                    <button key={t} type="button" className={"chip" + (p.tone === t ? " on" : "")} onClick={() => set({ tone: p.tone === t ? "" : t })}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="field full">
                <label>Response length — <strong>{LENGTHS[lenIdx]}</strong></label>
                <input type="range" min={0} max={LENGTHS.length - 1} step={1} value={lenIdx} onChange={(e) => set({ responseLength: LENGTHS[parseInt(e.target.value, 10)] })} />
                <div className="scale-ends"><span>Extremely short</span><span>Extremely long</span></div>
              </div>
              <div className="field full">
                <label>What you do with AI</label>
                <div className="chips">
                  {WORK_TYPES.map((w) => (
                    <button key={w} type="button" className={"chip" + ((p.workTypes || []).includes(w) ? " on" : "")} onClick={() => toggle("workTypes", w)}>{w}</button>
                  ))}
                </div>
              </div>
              <div className="field full">
                <label>Anything else? <span className="hint-inline">— preferences in your own words</span></label>
                <textarea value={p.customPrefs} onChange={(e) => set({ customPrefs: e.target.value })} placeholder="e.g. Always lead with the bottom line. Use my reps' first names. Default to bullet points over paragraphs." />
              </div>
              <div className="field full">
                <label>Assistant capabilities</label>
                <div className="seg">
                  {TOOL_MODES.map((t) => (
                    <button key={t.id} type="button" className={toolMode === t.id ? "on" : ""} onClick={() => setToolMode(t.id)}>
                      {t.id === "agent" ? <Sparkles size={14} /> : <ShieldCheck size={14} />} {t.label}
                    </button>
                  ))}
                </div>
                <div className="range-val">{TOOL_MODES.find((t) => t.id === toolMode)?.hint}</div>
              </div>
            </div>
            <div className="onb-actions">
              <button className="onb-back" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
              <span className="spacer" />
              <button className="setup-btn" onClick={() => setStep(3)}>Continue <ArrowRight size={16} /></button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>You're set, {p.preferredName || p.name.split(" ")[0] || "there"} 👋</h1>
            <p className="onb-mission">
              Your cockpit is personalized and ready. From here it's yours to use and customize.
            </p>
            <div className="onb-next">
              <div className="onb-next-item"><Check size={15} /><span>Your sales skills are ready — open the <strong>Skills</strong> menu to use them.</span></div>
              <div className="onb-next-item"><Check size={15} /><span>Set up your brand kit and folders anytime from <strong>Help &amp; setup</strong>, at the bottom of the sidebar.</span></div>
              <div className="onb-next-item"><Check size={15} /><span>Adjust your profile, model, and capabilities in <strong>Settings</strong> whenever.</span></div>
            </div>
            <div className="onb-actions">
              <button className="onb-back" onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</button>
              <span className="spacer" />
              <button className="setup-btn" disabled={saving} onClick={finish}>{saving ? "Setting up…" : <>Launch Accela Chat <ArrowRight size={16} /></>}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
