import { useEffect, useState } from "react";
import { Plug, Mail, Workflow, UserCog, Sparkles, ArrowRight, X, Download, Loader2, Check, FolderOpen, RotateCcw } from "lucide-react";
import logoDark from "../assets/accela-logo-dark.svg";
import { roleLabel } from "../lib/roles";

// A brief, dismissible "get more out of it" explainer shown on first launch (and
// re-openable from Help). Each step is a real shortcut into the setup it names.
// The first thing it does is AUTO-IMPORT the rep's role skill pack from the shared
// OneDrive folder — so a fresh install lands with the right skills, hands-free.
export default function GettingStarted({
  isMac,
  roleId,
  onConnect,
  onMail,
  onWorkflow,
  onProfile,
  onImportViaClaude,
  onDismiss,
}: {
  isMac: boolean;
  roleId?: string;
  onConnect: () => void;
  onMail: () => void;
  onWorkflow: () => void;
  onProfile: () => void;
  onImportViaClaude: (prompt: string) => void;
  onDismiss: () => void;
}) {
  type ImpState = "checking" | "importing" | "done" | "nofolder" | "error";
  const [imp, setImp] = useState<ImpState>("checking");
  const [installed, setInstalled] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [url, setUrl] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const label = roleLabel(roleId) || "your role";

  function claudePrompt(shareUrl: string): string {
    return (
      `Install my Accela skill pack. The packs live in a shared OneDrive folder: ${shareUrl} . ` +
      `My role is ${roleLabel(roleId) || "not set, so use the complete set"}. ` +
      `If that folder is synced on this machine, find Accela-Skills-<my role>.zip (or Accela-Skills-All.zip), unpack it, ` +
      `and copy its skills/* into ~/.claude/skills without overwriting any skill I created myself. ` +
      `If it is not synced, open that link so I can add it to my OneDrive (Add shortcut to My files), then do the install. ` +
      `Confirm what you installed.`
    );
  }

  async function runImport() {
    setImp("importing");
    const r = await window.accela.importSkillPack(roleId);
    if (r && r.url) setUrl(r.url);
    if (r && r.ok) {
      setInstalled((r.installed || []).length);
      setSkipped((r.skipped || []).length);
      setImp("done");
    } else if (r && r.foundLocal === false) {
      setImp("nofolder");
    } else {
      setErrMsg((r && r.error) || "Couldn't import your skills.");
      setImp("error");
    }
  }

  // On open: locate the shared folder. If it's synced, import automatically.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await window.accela.skillPackSource();
      if (cancelled) return;
      if (s && s.url) setUrl(s.url);
      if (s && s.foundLocal) runImport();
      else setImp("nofolder");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mailStep = isMac
    ? { icon: Mail, title: "Connect Apple Mail", desc: "Let the assistant read and search the mail already on this Mac — no account or password, it uses Mail locally.", cta: "Connect Apple Mail", on: onMail }
    : { icon: Mail, title: "Connect Outlook / Microsoft 365", desc: "Bring in your Outlook mail and calendar so the assistant can work from real threads. (Apple Mail is macOS-only.)", cta: "Connect Outlook", on: onMail };

  const steps = [
    { icon: Plug, title: "Connect your tools", desc: "Salesforce, your calendar, Slack — one click each and the assistant sets them up for you. Or pull in what's already in Claude Code.", cta: "Open Connections", on: onConnect },
    mailStep,
    { icon: Workflow, title: "Build your first workflow", desc: "Start from the Pre/Post-Call MEDDPICC template — it preps the call, pulls MEDDPICC after, and drafts your follow-up, pausing for your ok.", cta: "Open Workflows", on: onWorkflow },
    { icon: UserCog, title: "Make it yours", desc: "Add your territory, focus and signature in Settings so every answer fits how you sell.", cta: "Edit profile", on: onProfile },
  ];

  return (
    <div className="overlay gs-overlay" onMouseDown={onDismiss}>
      <div className="gs-card" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onDismiss}><X size={20} /></button>
        <img className="gs-logo" src={logoDark} alt="Accela" />
        <h2 className="gs-title">
          <Sparkles size={18} style={{ verticalAlign: "-3px", marginRight: 7, color: "var(--bright)" }} />
          Get more out of Accela Chat
        </h2>
        <p className="gs-sub">
          You're set up and ready to chat. A few quick steps make it dramatically more useful — so the assistant
          can act on your real accounts, calendar and mail, and run work for you.
        </p>

        {/* Auto-import hero: the rep's role skill pack from the shared folder. */}
        <div className={"gs-import " + imp}>
          <span className="gs-import-icon">
            {imp === "done" ? <Check size={18} /> : (imp === "checking" || imp === "importing") ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
          </span>
          <div className="gs-import-body">
            {imp === "checking" && <><div className="gs-import-title">Getting your skills ready…</div><div className="gs-import-desc">Looking for your shared Accela skill pack.</div></>}
            {imp === "importing" && <><div className="gs-import-title">Installing your {label} skills…</div><div className="gs-import-desc">One moment — importing from the shared folder.</div></>}
            {imp === "done" && (
              <>
                <div className="gs-import-title">{installed > 0 ? `Installed ${installed} ${label} skill${installed === 1 ? "" : "s"}` : "Your skills are up to date"}</div>
                <div className="gs-import-desc">
                  {installed > 0 ? "Type / in any chat to use them." : "Nothing new to add."}
                  {skipped > 0 ? ` Kept ${skipped} of your own untouched.` : ""}
                </div>
              </>
            )}
            {imp === "nofolder" && (
              <>
                <div className="gs-import-title">Add your Accela skill pack</div>
                <div className="gs-import-desc">The shared skills folder isn't synced here yet. Open it once (Add shortcut to My files), or let Claude set it up.</div>
                <div className="gs-import-actions">
                  <button className="btn-sm" onClick={() => url && window.accela.openExternal(url)}><FolderOpen size={14} /> Open the shared folder</button>
                  <button className="btn-sm" onClick={() => onImportViaClaude(claudePrompt(url))}><Sparkles size={14} /> Let Claude set it up</button>
                </div>
              </>
            )}
            {imp === "error" && (
              <>
                <div className="gs-import-title">Couldn't import your skills</div>
                <div className="gs-import-desc">{errMsg}</div>
                <div className="gs-import-actions">
                  <button className="btn-sm" onClick={runImport}><RotateCcw size={14} /> Try again</button>
                  <button className="btn-sm" onClick={() => onImportViaClaude(claudePrompt(url))}><Sparkles size={14} /> Let Claude set it up</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="gs-steps">
          {steps.map((s, i) => (
            <button className="gs-step" key={i} onClick={s.on}>
              <span className="gs-step-icon"><s.icon size={18} /></span>
              <span className="gs-step-text">
                <span className="gs-step-title">{s.title}</span>
                <span className="gs-step-desc">{s.desc}</span>
              </span>
              <span className="gs-step-cta">{s.cta} <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
        <button className="setup-btn gs-go" onClick={onDismiss}>Got it — let's go</button>
      </div>
    </div>
  );
}
