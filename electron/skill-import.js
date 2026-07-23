// skill-import.js — auto-import the Accela skill packs from the shared OneDrive
// folder into ~/.claude/skills. The setup layer calls this so a rep gets THEIR
// role's skills with zero manual steps when the folder is synced on their machine.
//
// The packs live in a folder shared org-wide (SharePoint link below). When a rep
// has that folder synced through OneDrive we read it straight off disk, pick the
// zip for their role from manifest.json, unpack it, and copy the skills in
// non-destructively (a skill the rep wrote themselves is never touched). When the
// folder isn't synced we hand back the share URL so the UI can open it / fall back
// to a Claude-assisted install.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

// Org-wide share (requires Accela sign-in). Also written into manifest.json.
const SHARE_URL = "https://accela-my.sharepoint.com/:f:/p/nlameijer/IgCJl6-B7jxZRrzGPRfHPLylASfMROkCOke8L1Gy8V5TVWA?e=vTmUYz";
const MARKER = ".accela-pack";
const FOLDER = path.join("Accela Chat", "Skill Packages");

function userSkillsDir() {
  return process.env.ACCELA_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills");
}

// Where OneDrive can mount the shared folder, newest-macOS + legacy + Windows.
function candidateDirs() {
  const home = os.homedir();
  const list = [];
  if (process.env.ACCELA_SKILL_PKG_DIR) list.push(process.env.ACCELA_SKILL_PKG_DIR);
  if (process.env.OneDriveCommercial) list.push(path.join(process.env.OneDriveCommercial, FOLDER));
  if (process.env.OneDrive) list.push(path.join(process.env.OneDrive, FOLDER));
  list.push(
    path.join(home, "Library", "CloudStorage", "OneDrive-Accela,Inc", FOLDER),
    path.join(home, "OneDrive - Accela, Inc", FOLDER),
    path.join(home, "OneDrive - Accela Inc", FOLDER),
    path.join(home, "OneDrive", FOLDER),
  );
  return list;
}

function looksLikePackages(dir) {
  try {
    if (fs.existsSync(path.join(dir, "manifest.json"))) return true;
    return fs.readdirSync(dir).some((f) => /^Accela-Skills-.*\.zip$/.test(f));
  } catch { return false; }
}

function findPackagesDir() {
  for (const d of candidateDirs()) if (looksLikePackages(d)) return d;
  return null;
}

function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")); }
  catch { return null; }
}

// { foundLocal, dir, url, version, packs:[{roleId,label,zip,count}] }
function packSource() {
  const dir = findPackagesDir();
  const manifest = dir ? readManifest(dir) : null;
  return {
    foundLocal: !!dir,
    dir: dir || null,
    url: SHARE_URL,
    version: manifest ? manifest.version : null,
    packs: manifest
      ? (manifest.packs || []).map((p) => ({ roleId: p.roleId, label: p.label, zip: p.zip, count: (p.skills || []).length }))
      : [],
  };
}

// Unpack a .zip with the platform's bundled bsdtar (macOS + Win10+), falling back
// to unzip. Returns the extraction dir or throws.
function unpack(zipPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "accela-skills-"));
  try {
    execFileSync("tar", ["-xf", zipPath, "-C", tmp], { stdio: "ignore" });
  } catch {
    execFileSync("unzip", ["-oq", zipPath, "-d", tmp], { stdio: "ignore" });
  }
  return tmp;
}

// Install the pack for a role (or the "all" bundle when role is unset/unknown).
// { ok, foundLocal, dir, zip, url, installed:[], skipped:[], error? }
function importForRole(roleId) {
  const dir = findPackagesDir();
  if (!dir) return { ok: false, foundLocal: false, url: SHARE_URL, error: "The shared Skill Packages folder isn't synced on this machine yet." };

  const manifest = readManifest(dir);
  let zip = null;
  if (manifest && Array.isArray(manifest.packs)) {
    const pick = manifest.packs.find((p) => p.roleId === roleId) || manifest.packs.find((p) => p.roleId === "all");
    if (pick) zip = pick.zip;
  }
  if (!zip) {
    const zips = fs.readdirSync(dir).filter((f) => /^Accela-Skills-.*\.zip$/.test(f));
    zip = zips.find((f) => f === "Accela-Skills-All.zip") || zips[0] || null;
  }
  if (!zip) return { ok: false, foundLocal: true, dir, url: SHARE_URL, error: "No skill packages found in the shared folder." };

  const zipPath = path.join(dir, zip);
  const version = manifest ? manifest.version : "";
  let tmp;
  try { tmp = unpack(zipPath); }
  catch { return { ok: false, foundLocal: true, dir, url: SHARE_URL, error: "Couldn't unpack the skill package on this machine." }; }

  try {
    // zip root is <PkgName>/skills/<slug>/…
    const root = fs.readdirSync(tmp).find((n) => {
      try { return fs.existsSync(path.join(tmp, n, "skills")); } catch { return false; }
    });
    const src = root ? path.join(tmp, root, "skills") : null;
    if (!src || !fs.existsSync(src)) return { ok: false, foundLocal: true, dir, zip, url: SHARE_URL, error: "The skill package had an unexpected layout." };

    const udir = userSkillsDir();
    fs.mkdirSync(udir, { recursive: true });
    const installed = [], skipped = [];
    for (const name of fs.readdirSync(src)) {
      const s = path.join(src, name);
      try { if (!fs.statSync(s).isDirectory()) continue; } catch { continue; }
      const dst = path.join(udir, name);
      const exists = fs.existsSync(dst);
      const ours = exists && fs.existsSync(path.join(dst, MARKER));
      if (exists && !ours) { skipped.push(name); continue; } // rep's own — leave it
      if (exists) fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(s, dst, { recursive: true });
      fs.writeFileSync(path.join(dst, MARKER), JSON.stringify({ pack: "accela-skill-pack", version, roleId: roleId || "all" }) + "\n");
      installed.push(name);
    }
    return { ok: true, foundLocal: true, dir, zip, url: SHARE_URL, installed, skipped };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

module.exports = { packSource, importForRole, SHARE_URL };
