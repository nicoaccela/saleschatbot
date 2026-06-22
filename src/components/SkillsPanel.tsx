import { useMemo } from "react";
import { X, Check } from "lucide-react";
import type { SlashCommand } from "../lib/types";
import { PRESET_GROUPS, RECOMMENDED_MAX, skillLabel } from "../lib/presets";

export default function SkillsPanel({
  commands,
  selected,
  onToggle,
  onClear,
  onClose,
  convTitle,
}: {
  commands: SlashCommand[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  onClose: () => void;
  convTitle: string;
}) {
  const byName = useMemo(
    () => new Map(commands.map((c) => [c.name, c])),
    [commands],
  );

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

  return (
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

        {grouped.map((g) => (
          <div className="skill-group" key={g.group}>
            <div className="skill-group-label">{g.group}</div>
            {g.items.map((name) => {
              const cmd = byName.get(name);
              const on = selected.includes(name);
              return (
                <button
                  key={name}
                  className={"skill-card" + (on ? " on" : "")}
                  onClick={() => onToggle(name)}
                >
                  <span className={"skill-check" + (on ? " on" : "")}>
                    {on && <Check size={12} />}
                  </span>
                  <span className="skill-text">
                    <span className="skill-name">{skillLabel(name)}</span>
                    <span className="skill-desc">{cmd?.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
