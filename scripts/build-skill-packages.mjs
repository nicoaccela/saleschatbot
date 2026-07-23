// build-skill-packages.mjs — generate downloadable per-persona skill bundles.
//
//   Run:  bun scripts/build-skill-packages.mjs
//
// Reads the persona registry (src/lib/roles.ts) + skill labels (presets.ts) and
// the skill source (skills/), and writes one .zip per persona (plus an "All"
// bundle and an on-brand index.html) to ~/accela-skill-packages/.
//
// These are PRIVATE distribution artifacts (share via OneDrive / a zip), NOT the
// public repo — same IP rule as the app installer. Each bundle carries only the
// skills that persona needs, a README, and a non-destructive installer for both
// macOS and Windows that drops the skills into ~/.claude/skills.

import { ROLES, ROLE_GROUPS } from "../src/lib/roles.ts";
import { skillLabel } from "../src/lib/presets.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const HOME = os.homedir();
const REPO = path.join(HOME, "accela-chat");
const SKILLS_SRC = path.join(REPO, "skills");
// Ship to a shareable OneDrive folder by default (override with SKILL_PKG_OUT).
// Falls back to a home-dir folder if OneDrive isn't present on this machine.
const ONEDRIVE = path.join(HOME, "OneDrive - Accela, Inc", "Accela Chat", "Skill Packages");
const OUT = process.env.SKILL_PKG_OUT
  || (fs.existsSync(path.join(HOME, "OneDrive - Accela, Inc")) ? ONEDRIVE : path.join(HOME, "accela-skill-packages"));
// Stage in a local temp dir so OneDrive doesn't try to sync half-built folders.
const STAGING = path.join(os.tmpdir(), "accela-skill-pkg-staging");

const pack = JSON.parse(fs.readFileSync(path.join(SKILLS_SRC, "_pack.json"), "utf8"));
const VERSION = pack.version;
const ALL_SKILLS = pack.skills;

// A skill is shippable only if its dir + SKILL.md exist on disk.
const exists = (slug) => fs.existsSync(path.join(SKILLS_SRC, slug, "SKILL.md"));

function reset() {
  // Don't nuke the OneDrive folder (it may be shared / synced) — just clear the
  // artifacts we own, then rebuild them.
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    if (/^Accela-Skills-.*\.zip$/.test(f) || f === "index.html") {
      fs.rmSync(path.join(OUT, f), { force: true });
    }
  }
  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });
}

function pkgName(role) {
  return "Accela-Skills-" + role.short.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readmeFor(role, skills) {
  const lines = skills.map((s) => `- ${skillLabel(s)}  (/${s})`).join("\n");
  return `# Accela Skills — ${role.label}

Skills tuned for ${role.label}. ${role.blurb}

Drop them into Claude Code (or Accela Chat) and they show up when you type \`/\`.

## What's inside
${lines}

## Install (macOS / Linux)
1. Unzip this folder.
2. In Terminal, from inside the unzipped folder:
   \`\`\`
   bash install.sh
   \`\`\`

## Install (Windows)
1. Unzip this folder.
2. In PowerShell, from inside the unzipped folder:
   \`\`\`
   powershell -ExecutionPolicy Bypass -File install.ps1
   \`\`\`

The installer is non-destructive. It never overwrites a skill you wrote yourself,
and it refreshes the Accela-managed ones. Skills land in \`~/.claude/skills\`.

## Requirement
Claude Code installed and signed in once (the same login Accela Chat uses). Nothing else.

Pack version ${VERSION}. Questions: Nico Lameijer, Sales Engineering.
`;
}

const INSTALL_SH = (persona) => `#!/usr/bin/env bash
# Accela Skills installer (${persona}). Non-destructive: your own skills are never touched.
set -euo pipefail
DEST="\${ACCELA_SKILLS_DIR:-$HOME/.claude/skills}"
SRC="$(cd "$(dirname "\${BASH_SOURCE[0]}")/skills" && pwd)"
mkdir -p "$DEST"
installed=0; skipped=0
for d in "$SRC"/*/; do
  name="$(basename "$d")"
  target="$DEST/$name"
  if [ -e "$target" ] && [ ! -e "$target/.accela-pack" ]; then
    echo "skip  $name (you have your own version)"; skipped=$((skipped+1)); continue
  fi
  rm -rf "$target"; cp -R "$d" "$target"
  printf '{"pack":"accela-skill-pack","persona":"${persona}","version":"${VERSION}"}\\n' > "$target/.accela-pack"
  echo "ok    $name"; installed=$((installed+1))
done
echo ""; echo "Installed $installed, skipped $skipped. Open Accela Chat or Claude Code and type / to use them."
`;

const INSTALL_PS1 = (persona) => `# Accela Skills installer (${persona}). Non-destructive: your own skills are never touched.
$ErrorActionPreference = "Stop"
$dest = if ($env:ACCELA_SKILLS_DIR) { $env:ACCELA_SKILLS_DIR } else { Join-Path $HOME ".claude/skills" }
$src  = Join-Path $PSScriptRoot "skills"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$installed = 0; $skipped = 0
Get-ChildItem -Path $src -Directory | ForEach-Object {
  $name = $_.Name; $target = Join-Path $dest $name
  if ((Test-Path $target) -and -not (Test-Path (Join-Path $target ".accela-pack"))) {
    Write-Host "skip  $name (you have your own version)"; $skipped++; return
  }
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Copy-Item -Recurse -Force $_.FullName $target
  '{"pack":"accela-skill-pack","persona":"${persona}","version":"${VERSION}"}' | Out-File -Encoding utf8 (Join-Path $target ".accela-pack")
  Write-Host "ok    $name"; $installed++
}
Write-Host ""; Write-Host "Installed $installed, skipped $skipped. Open Accela Chat or Claude Code and type / to use them."
`;

function buildBundle(name, persona, skills, blurbForReadme) {
  const present = skills.filter(exists);
  const missing = skills.filter((s) => !exists(s));
  if (missing.length) console.warn(`  ! ${name}: skipping missing skills: ${missing.join(", ")}`);
  const dir = path.join(STAGING, name);
  const skillsDir = path.join(dir, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const s of present) fs.cpSync(path.join(SKILLS_SRC, s), path.join(skillsDir, s), { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), blurbForReadme);
  fs.writeFileSync(path.join(dir, "install.sh"), INSTALL_SH(persona));
  fs.chmodSync(path.join(dir, "install.sh"), 0o755);
  fs.writeFileSync(path.join(dir, "install.ps1"), INSTALL_PS1(persona));
  // zip from staging so the archive root is the folder name
  execFileSync("zip", ["-r", "-q", path.join(OUT, `${name}.zip`), name], { cwd: STAGING });
  return { name, count: present.length, skills: present };
}

function indexHtml(cards) {
  const groupBlocks = ROLE_GROUPS.map((grp) => {
    const items = cards.filter((c) => c.group === grp).map((c) => `
      <article class="card">
        <div class="card-h"><h3>${c.label}</h3><span class="count">${c.count} skills</span></div>
        <p class="blurb">${c.blurb}</p>
        <div class="chips">${c.skills.map((s) => `<span class="chip">${skillLabel(s)}</span>`).join("")}</div>
        <a class="dl" href="${c.zip}" download>Download ${c.zip}</a>
        <div class="cmd">unzip, then <code>bash install.sh</code> (macOS) or <code>powershell -ExecutionPolicy Bypass -File install.ps1</code> (Windows)</div>
      </article>`).join("");
    return `<section><h2>${grp}</h2><div class="grid">${items}</div></section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accela Chat — Skill Packages</title>
<style>
  :root{--blue:#0068be;--bright:#00aff1;--navy:#0d263a;--ink:#0d263a;--muted:#5b6b78;--line:#e2e7ea;--panel:#f2f5f7}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:#fff;line-height:1.5}
  header{background:linear-gradient(135deg,var(--navy),var(--blue));color:#fff;padding:44px 32px}
  header h1{margin:0 0 8px;font-size:30px;letter-spacing:-.01em}
  header p{margin:0;opacity:.9;max-width:760px}
  main{max-width:1080px;margin:0 auto;padding:28px 32px 64px}
  .how{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin:24px 0}
  .how h2{margin:0 0 8px;font-size:15px}
  .how ol{margin:0;padding-left:20px}
  section h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:30px 0 12px;border-bottom:1px solid var(--line);padding-bottom:6px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .card{border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
  .card-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .card h3{margin:0;font-size:17px}
  .count{font-size:11px;color:var(--muted);white-space:nowrap}
  .blurb{margin:0;color:var(--muted);font-size:13px}
  .chips{display:flex;flex-wrap:wrap;gap:5px}
  .chip{font-size:11px;background:rgba(0,104,190,.07);border:1px solid rgba(0,104,190,.2);color:var(--blue);border-radius:999px;padding:3px 9px}
  .dl{margin-top:2px;display:inline-block;background:var(--blue);color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:9px 14px;border-radius:10px;text-align:center}
  .dl:hover{background:#0058a3}
  .cmd{font-size:11.5px;color:var(--muted)}
  code{font-family:ui-monospace,Menlo,monospace;background:var(--panel);padding:1px 5px;border-radius:5px}
  .allrow{margin:18px 0 4px}
  .allrow .dl{background:var(--navy)}
</style></head><body>
<header>
  <h1>Accela Chat — Skill Packages</h1>
  <p>Curated skill bundles for every GTM role. Download yours, run one install command, and Claude Code + Accela Chat pick them up. Pack v${VERSION}.</p>
</header>
<main>
  <div class="how">
    <h2>How it works</h2>
    <ol>
      <li>Download the package for your role below (or the full set).</li>
      <li>Unzip it, then run <code>bash install.sh</code> (macOS) or <code>powershell -ExecutionPolicy Bypass -File install.ps1</code> (Windows).</li>
      <li>Open Accela Chat or Claude Code and type <code>/</code>. Your skills are there.</li>
    </ol>
    <p style="margin:10px 0 0"><strong>Requirement:</strong> Claude Code installed and signed in once. The installer never overwrites a skill you wrote yourself.</p>
  </div>
  <div class="allrow"><a class="dl" href="Accela-Skills-All.zip" download>Download the full set — Accela-Skills-All.zip (${ALL_SKILLS.length} skills)</a></div>
  ${groupBlocks}
</main></body></html>`;
}

// ---- run ------------------------------------------------------------------
console.log(`Building skill packages -> ${OUT}  (pack v${VERSION})`);
reset();
const cards = [];
for (const role of ROLES) {
  const name = pkgName(role);
  const res = buildBundle(name, role.id, role.library, readmeFor(role, role.library.filter(exists)));
  cards.push({ ...role, zip: `${name}.zip`, count: res.count, skills: res.skills });
  console.log(`  ✓ ${name}.zip  (${res.count} skills)`);
}
// "All" bundle
const allReadme = `# Accela Skills — Complete Set

Every Accela sales + GTM skill (${ALL_SKILLS.filter(exists).length} of them). Install what the whole team uses.

See any role package's README for install steps, or just run the installer here.

## Install
macOS/Linux: \`bash install.sh\`   ·   Windows: \`powershell -ExecutionPolicy Bypass -File install.ps1\`

Pack version ${VERSION}.
`;
const allRes = buildBundle("Accela-Skills-All", "all", ALL_SKILLS, allReadme);
console.log(`  ✓ Accela-Skills-All.zip  (${allRes.count} skills)`);

fs.writeFileSync(path.join(OUT, "index.html"), indexHtml(cards));
fs.rmSync(STAGING, { recursive: true, force: true });
console.log(`  ✓ index.html`);
console.log(`Done. ${cards.length} role packages + full set + catalog in ${OUT}`);
