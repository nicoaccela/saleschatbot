import { useEffect, useState } from "react";
import { X, Save, Loader2 } from "lucide-react";

// View + edit the raw SKILL.md for a skill. Opens over the Skills panel.
export default function SkillEditor({ name, onClose }: { name: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    window.accela.readSkill(name).then((r) => {
      if (!live) return;
      if (r.ok) setContent(r.content);
      else setError(r.error || "Could not open this skill.");
    });
    return () => { live = false; };
  }, [name]);

  async function save() {
    if (content == null) return;
    setSaving(true);
    setSaved(false);
    const r = await window.accela.writeSkill(name, content);
    setSaving(false);
    if (r.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 1800); }
    else setError(r.error || "Could not save this skill.");
  }

  // Guard against silently dropping unsaved edits.
  const requestClose = () => {
    if (!dirty || window.confirm("Discard unsaved changes to this skill?")) onClose();
  };

  return (
    <div className="overlay skill-editor-overlay" onMouseDown={requestClose}>
      <div className="sheet skill-editor" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={requestClose}><X size={20} /></button>
        <h2>Edit skill</h2>
        <p className="sub"><code>{name}</code> · SKILL.md</p>

        {error && <div className="mcp-warn">{error}</div>}

        {content == null && !error && (
          <div className="working"><Loader2 size={16} className="spin" /> Loading…</div>
        )}

        {content != null && (
          <>
            <textarea
              className="skill-editor-area"
              value={content}
              spellCheck={false}
              onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            />
            <div className="mcp-form-actions">
              <button className="setup-btn" disabled={saving || !dirty} onClick={save}>
                {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                {saved ? " Saved" : " Save"}
              </button>
              <button className="link-btn" onClick={requestClose}>Close</button>
              {dirty && !saving && <span className="hint-inline">Unsaved changes</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
