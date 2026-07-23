import { useMemo, useState } from "react";
import { X, Check, Pencil, Sparkles, Star } from "lucide-react";
import type { SlashCommand } from "../lib/types";
import { PRESET_GROUPS, RECOMMENDED_MAX, skillLabel } from "../lib/presets";
import { rolePackage, roleStarter, roleLabel, ROLE_BY_ID } from "../lib/roles";
import SkillEditor from "./SkillEditor";

export default function SkillsPanel({
  commands,
  selected,
  onToggle,
  onClear,
  onApplyPack,
  onClose,
  convTitle,
  roleId,
}: {
  commands: SlashCommand[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  onApplyPack: (names: string[]) => void;
  onClose: () => void;
  convTitle: string;
  roleId?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const byName = useMemo(
    () => new Map(commands.map((c) => [c.name, c])),
    [commands],
  );

  // Role recommendation overlay: the role's library + starter, filtered to what
  // actually scanned on disk (so a not-yet-installed skill never shows).
  const pkg = useMemo(() => rolePackage(roleId).filter((n) => byName.has(n)), [roleId, byName]);
  const starter = useMemo(() => roleStarter(roleId).filter((n) => byName.has(n)), [roleId, byName]);
  const rLabel = roleLabel(roleId);
  const roleShort = (roleId && ROLE_BY_ID[roleId]?.short) || rLabel;

  // Build display groups: only skills that actually exist on disk; anything
  // scanned but ungrouped lands in "More".
  const grouped = PRESET_GROUPS.map((g) => ({
    group: g.group,
    items: g.skills.filter((n) => byName.has(n)),
  })).filter((g) => g.items.length > 0);

  const knownNames = new Set(PRESET_GROUPS.flatMap((g) => g.skills));
  const extras = commands.filter((c) => !knownNames.has(c.name)).map((c) => c.name);
  if (extras.length) grouped.push({ group: "More", items: extras });

  const overMax = selected.length > RECOMMENDED_MAX;

  function renderCard(name: string, opts?: { star?: boolean }) {
    const cmd = byName.get(name);
    const on = selected.includes(name);
    return (
      <div key={name} className={"skill-card" + (on ? " on" : "")}>
        <button className="skill-card-main" onClick={() => onToggle(name)}>
          <span className={"skill-check" + (on ? " on" : "")}>
            {on && <Check size={12} />}
          </span>
          <span className="skill-text">
            <span className="skill-name">
              {skillLabel(name)}
              {opts?.star && <Star size={11} className="skill-starter" fill="currentColor" />}
            </span>
            <span className="skill-desc">{cmd?.description}</span>
          </span>
        </button>
        {cmd?.kind === "skill" && (
          <button
            className="icon-btn skill-edit"
            title="View / edit skill file"
            onClick={() => setEditing(name)}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="overlay" onMouseDown={onClose}>
        <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
          <button className="close-x" onClick={onClose}>
            <X size={20} />
          </button>
          <h2>Skills</h2>
          <p className="sub">
            Activate skills for <strong>{convTitle}</strong>. They prime the
            assistant — no slash needed. {selected.length} selected
            {overMax && (
              <span className="warn-text"> · we recommend ≤ {RECOMMENDED_MAX}</span>
            )}
            {selected.length > 0 && (
              <button className="link-btn" onClick={onClear}>
                Clear
              </button>
            )}
          </p>

          {pkg.length > 0 && (
            <div className="skill-group skill-group-role">
              <div className="skill-group-label role-rec-head">
                <span><Sparkles size={13} /> Recommended for {rLabel || "your role"}</span>
                {starter.length > 0 && (
                  <button className="link-btn" onClick={() => onApplyPack(starter)}>
                    Activate my {roleShort} pack
                  </button>
                )}
              </div>
              {pkg.map((name) => renderCard(name, { star: starter.includes(name) }))}
            </div>
          )}

          {grouped.map((g) => (
            <div className="skill-group" key={g.group}>
              <div className="skill-group-label">{g.group}</div>
              {g.items.map((name) => renderCard(name))}
            </div>
          ))}
        </div>
      </div>

      {editing && <SkillEditor name={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
