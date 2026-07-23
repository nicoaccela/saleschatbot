import { Plug, Mail, Workflow, UserCog, Sparkles, ArrowRight, X } from "lucide-react";
import logoDark from "../assets/accela-logo-dark.svg";

// A brief, dismissible "get more out of it" explainer shown on first launch (and
// re-openable from Help). Each step is a real shortcut into the setup it names.
export default function GettingStarted({
  isMac,
  onConnect,
  onMail,
  onWorkflow,
  onProfile,
  onDismiss,
}: {
  isMac: boolean;
  onConnect: () => void;
  onMail: () => void;
  onWorkflow: () => void;
  onProfile: () => void;
  onDismiss: () => void;
}) {
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
