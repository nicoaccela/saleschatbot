import { useState } from "react";
import { RefreshCw, ExternalLink, Terminal } from "lucide-react";
import logoDark from "../assets/accela-logo-dark.svg";

// Shown when the local Claude Code CLI isn't found or isn't logged in. Accela
// Chat is a front-end to the user's own Claude Code, so we guide setup here
// rather than dropping them into a broken chat.
export default function SetupScreen({
  detectedPath,
  onRecheck,
}: {
  detectedPath: string | null;
  onRecheck: () => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const platform = window.accela.platform;
  const isWin = platform === "win32";

  const installCmd = isWin
    ? "irm https://claude.ai/install.ps1 | iex"
    : "curl -fsSL https://claude.ai/install.sh | bash";

  async function recheck() {
    setChecking(true);
    await onRecheck();
    setChecking(false);
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <img className="welcome-logo" src={logoDark} alt="Accela" />
        <h1>Connect Claude Code</h1>
        <p className="setup-lead">
          Accela Chat runs on <strong>Claude Code</strong> — your own local
          install and login. It looks like it isn’t set up yet. Two quick steps:
        </p>

        <ol className="setup-steps">
          <li>
            <div className="step-head">
              <span className="step-num">1</span> Install Claude Code
            </div>
            <p>
              Run this in {isWin ? "PowerShell" : "your terminal"} (or download
              from the website):
            </p>
            <code className="setup-code">{installCmd}</code>
            <a className="setup-link" href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
              claude.com/claude-code <ExternalLink size={13} />
            </a>
          </li>
          <li>
            <div className="step-head">
              <span className="step-num">2</span> Sign in once
            </div>
            <p>
              Open a terminal, run <code>claude</code>, and complete the login.
              That authenticates this app too — no API key needed.
            </p>
          </li>
        </ol>

        <button className="setup-btn" onClick={recheck} disabled={checking}>
          <RefreshCw size={16} className={checking ? "spin" : ""} />
          {checking ? "Checking…" : "I’ve done this — re-check"}
        </button>

        <div className="setup-foot">
          <Terminal size={12} />
          {detectedPath ? <>Looked for: <code>{detectedPath}</code></> : "Claude Code not detected on PATH"}
        </div>
      </div>
    </div>
  );
}
