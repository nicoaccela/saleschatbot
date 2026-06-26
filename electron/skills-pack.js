// skills-pack.js — installs the bundled Accela skill pack into the rep's
// ~/.claude/skills so the app's Skills menu (and Claude Code itself) can use
// them. The pack is shipped with the app via electron-builder extraResources.
//
// Non-destructive by design:
//   - a skill the rep created themselves (no marker) is NEVER touched
//   - a skill WE installed (marker present) is refreshed to the bundled version
//   - a skill that doesn't exist yet is installed
// So a rep can keep their own skills and still get Accela's, and app updates
// keep the Accela-managed ones current.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const MARKER = ".accela-pack"; // written into each skill we manage

function bundleDir(app) {
  // packaged: <resources>/skills (electron-builder extraResources)
  // dev:      <repo>/skills
  return app && app.isPackaged
    ? path.join(process.resourcesPath, "skills")
    : path.join(__dirname, "..", "skills");
}

function userSkillsDir() {
  // ACCELA_SKILLS_DIR override exists for testing; default is the real dir.
  return process.env.ACCELA_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills");
}

function readPack(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "_pack.json"), "utf8")); }
  catch { return null; }
}

// { available, version, dir, skills:[{name, exists, managed}] }
function status(app) {
  const bdir = bundleDir(app);
  const pack = readPack(bdir);
  if (!pack) return { available: false, skills: [] };
  const udir = userSkillsDir();
  const skills = (pack.skills || []).map((name) => {
    const dest = path.join(udir, name);
    const exists = fs.existsSync(dest);
    return { name, exists, managed: exists && fs.existsSync(path.join(dest, MARKER)) };
  });
  return { available: true, version: pack.version, dir: bdir, skills };
}

// Install / refresh. Returns { ok, version, installed:[], refreshed:[], skipped:[] }.
function install(app) {
  const bdir = bundleDir(app);
  const pack = readPack(bdir);
  if (!pack) return { ok: false, error: "No bundled skill pack found." };
  const udir = userSkillsDir();
  fs.mkdirSync(udir, { recursive: true });

  const installed = [], refreshed = [], skipped = [];
  for (const name of pack.skills || []) {
    const src = path.join(bdir, name);
    const dest = path.join(udir, name);
    if (!fs.existsSync(src)) continue;
    const exists = fs.existsSync(dest);
    const ours = exists && fs.existsSync(path.join(dest, MARKER));
    if (exists && !ours) { skipped.push(name); continue; } // rep's own — leave it
    if (exists) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    fs.writeFileSync(path.join(dest, MARKER), JSON.stringify({ pack: pack.pack, version: pack.version }) + "\n");
    (exists ? refreshed : installed).push(name);
  }
  return { ok: true, version: pack.version, installed, refreshed, skipped };
}

module.exports = { status, install, bundleDir, userSkillsDir };
