// commands.js — discover the slash-commands available to the user: Claude Code
// skills (each invocable as /<skill-name>) plus any ~/.claude/commands/*.md.
// Read at startup so the composer can show a "/" picker for sales folks.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function parseFrontmatter(text) {
  const out = {};
  if (!text.startsWith("---")) return out;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return out;
  const lines = text.slice(3, end).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    // YAML block scalar (`>`/`|`, with optional chomp indicator `-`/`+`):
    // gather the indented lines below.
    if (/^[>|][-+]?$/.test(val)) {
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        parts.push(lines[++i].trim());
      }
      val = parts.join(" ");
    }
    out[m[1]] = val;
  }
  return out;
}

function shorten(s, n = 120) {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

function listSkills(dir, source) {
  const items = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return items; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillFile = path.join(dir, e.name, "SKILL.md");
    try {
      const fm = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
      items.push({
        name: fm.name || e.name,
        description: shorten(fm.description),
        kind: "skill",
        source,
      });
    } catch { /* not a skill dir */ }
  }
  return items;
}

function listCommands(dir, source) {
  const items = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")); } catch { return items; }
  for (const f of files) {
    try {
      const fm = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
      items.push({
        name: f.replace(/\.md$/, ""),
        description: shorten(fm.description),
        kind: "command",
        source,
      });
    } catch { /* skip */ }
  }
  return items;
}

// Returns a de-duplicated, sorted list of {name, description, kind}.
function listAvailableCommands() {
  const home = os.homedir();
  const all = [
    ...listSkills(path.join(home, ".claude", "skills"), "user"),
    ...listCommands(path.join(home, ".claude", "commands"), "user"),
  ];
  const seen = new Set();
  const deduped = [];
  for (const item of all) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    deduped.push(item);
  }
  deduped.sort((a, b) => a.name.localeCompare(b.name));
  return deduped;
}

// Map a skill's DISPLAY name (which may come from frontmatter `name:`) back to
// its on-disk directory slug, so the editor reads/writes the right SKILL.md even
// when frontmatter name != directory name. Falls back to the literal name.
function resolveSkillDir(name) {
  const base = path.join(os.homedir(), ".claude", "skills");
  // Exact directory match wins (the common case — no scan needed).
  try { if (fs.statSync(path.join(base, name, "SKILL.md")).isFile()) return name; } catch { /* fall through */ }
  let entries = [];
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return name; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const fm = parseFrontmatter(fs.readFileSync(path.join(base, e.name, "SKILL.md"), "utf8"));
      if ((fm.name || e.name) === name) return e.name;
    } catch { /* not a skill dir */ }
  }
  return name;
}

module.exports = { listAvailableCommands, resolveSkillDir };
