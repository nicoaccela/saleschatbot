import { Palette, FolderTree, FolderInput, FolderSearch, MessageCircleQuestion, X } from "lucide-react";

// Always-available recovery. If a rep skipped a setup step (brand kit, workspace)
// they can pick it up here anytime — each action seeds a fresh chat with the
// prompt that runs the matching setup skill, so they just hit send.
const ACTIONS = [
  {
    icon: Palette,
    label: "Set up Brand Guidelines",
    desc: "Download & install the Accela brand kit — logos, templates, guidelines.",
    prompt: "Help me set up the Accela brand guidelines — run the brand-setup skill to download and install the brand kit.",
  },
  {
    icon: FolderTree,
    label: "Set up my Workspace",
    desc: "Build the standard Accela sales folder structure on my machine.",
    prompt: "Set up my Sales Workspace — run the workspace-setup skill to build the standard folder structure.",
  },
  {
    icon: FolderInput,
    label: "Organize my files",
    desc: "Scan my machine and file sales docs into the right folders.",
    prompt: "Organize my sales files — run the workspace-organize skill to scan my machine and sort things into the workspace (ask me move vs copy first).",
  },
  {
    icon: FolderSearch,
    label: "Use my own folders",
    desc: "Keep the system you already have — Claude learns and adapts to it.",
    prompt: "I already have my own folder system — run the workspace-learn skill to learn my structure and adapt to it.",
  },
];

export default function HelpPanel({
  onAction,
  onClose,
}: {
  onAction: (prompt: string) => void;
  onClose: () => void;
}) {
  function run(prompt: string) {
    onClose();
    onAction(prompt);
  }
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="sheet help-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose}>
          <X size={20} />
        </button>
        <h2>Help &amp; setup</h2>
        <p className="sub">Skipped something during setup? Pick it up here anytime — Claude walks you through it.</p>
        <div className="help-actions">
          {ACTIONS.map((a) => (
            <button key={a.label} className="help-action" onClick={() => run(a.prompt)}>
              <a.icon size={18} />
              <span>
                <strong>{a.label}</strong>
                <em>{a.desc}</em>
              </span>
            </button>
          ))}
          <button
            className="help-action"
            onClick={() =>
              run(
                "I'm getting started with Accela Chat and may have skipped parts of setup. Ask me a couple quick questions about what I'm trying to do, then walk me through it and flag anything I should still set up.",
              )
            }
          >
            <MessageCircleQuestion size={18} />
            <span>
              <strong>Ask for help</strong>
              <em>Tell Claude what you're stuck on and get guided, step by step.</em>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
