// Accela Chat — release preflight: IP and config backstop.
// Run from the repo root: `node scripts/preflight.mjs`
// Node ESM, no external dependencies (node:fs, node:path, node:child_process only).
//
// This is the last gate before a release is cut. It refuses to let a leaky or
// misconfigured build proceed: it asserts the draft-gated publish model, blocks
// the raw IP skills dir from being bundled (RISK-IP2), keeps salesforce-mcp out
// of any shipped skills pack (RISK-IP4), sanity-checks the version against the
// latest tag, and scans the public skills pack for proprietary terms.
//
// Exit code: 1 if any check FAILS, 0 otherwise. Warnings never fail the run.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// --- result recorder -------------------------------------------------------

const failures = [];
const warnings = [];

function pass(label, detail) {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, message) {
  failures.push(`${label}: ${message}`);
  console.log(`FAIL  ${label} — ${message}`);
}

function warn(label, message) {
  warnings.push(`${label}: ${message}`);
  console.log(`WARN  ${label} — ${message}`);
}

// --- helpers ---------------------------------------------------------------

// Read + parse a JSON file, tolerating a missing/unreadable/invalid file.
// Returns { ok, data, error }.
function readJson(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function dirExists(absPath) {
  try {
    return fs.statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

// Recursively list all files (absolute paths) under a directory. Safe on a
// missing directory (returns []).
function listFilesRecursive(absDir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// Run a git command, returning trimmed stdout on success or null on any error.
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Compare two dotted version strings numerically (e.g. "0.2.0" vs "0.1.0").
// Returns 1 if a>b, -1 if a<b, 0 if equal. Non-numeric segments compare as 0.
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, "").split(".");
  const pb = String(b).replace(/^v/i, "").split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i], 10) || 0;
    const nb = parseInt(pb[i], 10) || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// --- load package.json (shared by several checks) --------------------------

const pkgPath = path.join(REPO_ROOT, "package.json");
const pkgResult = readJson(pkgPath);
const pkg = pkgResult.ok ? pkgResult.data : null;
const build = pkg && typeof pkg.build === "object" ? pkg.build : null;

console.log("Accela Chat release preflight");
console.log(`Repo root: ${REPO_ROOT}`);
console.log("");

// --- Check 1: publish must be draft-gated ----------------------------------

(function checkDraftGated() {
  const label = "Check 1 (draft-gated publish)";
  if (!pkg) {
    fail(label, `could not read package.json (${pkgResult.error})`);
    return;
  }
  const publish = build && build.publish;
  const first = Array.isArray(publish) ? publish[0] : publish;
  if (!first || typeof first !== "object") {
    fail(label, "release must be draft-gated (build.publish[0] is missing)");
    return;
  }
  if (first.releaseType !== "draft") {
    fail(
      label,
      `release must be draft-gated (releaseType is "${first.releaseType ?? "unset"}", expected "draft")`
    );
    return;
  }
  pass(label, 'releaseType is "draft"');
})();

// --- Check 2: must not bundle the raw IP skills dir (RISK-IP2) --------------

(function checkExtraResources() {
  const label = "Check 2 (no raw IP skills in extraResources)";
  if (!pkg) {
    fail(label, `could not read package.json (${pkgResult.error})`);
    return;
  }
  let extra = build && build.extraResources;
  if (extra == null) {
    pass(label, "no extraResources defined (nothing bundled)");
    return;
  }
  if (!Array.isArray(extra)) extra = [extra];

  const froms = extra.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") return entry.from;
    return undefined;
  });

  const leaky = froms.filter((from) => from === "skills");
  console.log(
    `      extraResources "from" entries: ${JSON.stringify(froms)}`
  );
  if (leaky.length > 0) {
    fail(
      label,
      `extraResources bundles the raw IP skills dir (from:"skills") — repoint to "skills-public" before release [RISK-IP2]`
    );
    return;
  }
  pass(label, 'no entry bundles from:"skills"');
})();

// --- Check 3: salesforce-mcp must not ship (RISK-IP4) -----------------------

(function checkSalesforceMcp() {
  const label = "Check 3 (salesforce-mcp not shipped)";
  let failed = false;

  // 3a. skills-public on disk must not contain a salesforce-mcp subdir.
  const publicDir = path.join(REPO_ROOT, "skills-public");
  if (dirExists(publicDir)) {
    if (dirExists(path.join(publicDir, "salesforce-mcp"))) {
      fail(
        label,
        "skills-public contains a salesforce-mcp subdirectory [RISK-IP4]"
      );
      failed = true;
    }
  }

  // 3b. A git-tracked skills directory must not contain salesforce-mcp.
  const tracked = git(["ls-files", "skills", "skills-public"]);
  if (tracked) {
    const offenders = tracked
      .split("\n")
      .filter((p) => p && p.split("/").includes("salesforce-mcp"));
    if (offenders.length > 0) {
      fail(
        label,
        `tracked skills paths include salesforce-mcp [RISK-IP4]: ${offenders.join(", ")}`
      );
      failed = true;
    }
  }

  if (!failed) pass(label, "no salesforce-mcp in shipped/tracked skills");
})();

// --- Check 4: version sanity (WARN only) ------------------------------------

(function checkVersion() {
  const label = "Check 4 (version sanity)";
  if (!pkg) {
    warn(label, "could not read package.json version");
    return;
  }
  const version = pkg.version;
  if (!version) {
    warn(label, "package.json has no version field");
    return;
  }
  const latestTag = git(["describe", "--tags", "--abbrev=0"]);
  if (!latestTag) {
    pass(label, `version ${version} (no git tags yet — first release)`);
    return;
  }
  if (compareVersions(version, latestTag) > 0) {
    pass(label, `version ${version} > latest tag ${latestTag}`);
  } else {
    warn(
      label,
      `package version ${version} is not greater than latest tag ${latestTag} — bump before tagging`
    );
  }
})();

// --- Check 5: proprietary-term scan over skills-public ONLY -----------------

const PROPRIETARY_TERMS = [
  "accela",
  "civic platform",
  "opencounter",
  "epermithub",
  "novotx",
  "tyler",
  "digeplan",
  "emse",
  "construct api",
  "salesforce",
  "sales workspace",
  "pursuit",
  "onedrive",
  "sharepoint",
];
// NOTE: do NOT add any individual's name or email username here. This file is
// committed to the PUBLIC repo, so a personal identifier in this list is itself
// the leak we are trying to prevent. Rep emails are already caught generically:
// any "@accela.com" address substring-matches the "accela" term above.

(function checkProprietaryTerms() {
  const label = "Check 5 (proprietary-term scan of skills-public)";
  const publicDir = path.join(REPO_ROOT, "skills-public");
  if (!dirExists(publicDir)) {
    warn(
      label,
      "skills-public does not exist yet — public skills pack not created (P0 pending)"
    );
    return;
  }

  const lowerTerms = PROPRIETARY_TERMS.map((t) => t.toLowerCase());
  const files = listFilesRecursive(publicDir);
  const offenders = [];

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue; // unreadable/binary — skip
    }
    const haystack = content.toLowerCase();
    const hits = lowerTerms.filter((term) => haystack.includes(term));
    if (hits.length > 0) {
      offenders.push({
        file: path.relative(REPO_ROOT, file),
        terms: hits,
      });
    }
  }

  if (offenders.length > 0) {
    fail(
      label,
      `proprietary terms found in ${offenders.length} file(s) — public pack must be IP-clean`
    );
    for (const o of offenders) {
      console.log(`      ${o.file} -> ${o.terms.join(", ")}`);
    }
    return;
  }
  pass(label, `scanned ${files.length} file(s); no proprietary terms found`);
})();

// --- summary ----------------------------------------------------------------

console.log("");
console.log("Preflight summary");
console.log(`  Failures: ${failures.length}`);
console.log(`  Warnings: ${warnings.length}`);
if (warnings.length > 0) {
  console.log("  Warnings detail:");
  for (const w of warnings) console.log(`    - ${w}`);
}
if (failures.length > 0) {
  console.log("  Failures detail:");
  for (const f of failures) console.log(`    - ${f}`);
  console.log("");
  console.log("RESULT: FAIL — release is blocked.");
  process.exit(1);
}
console.log("");
console.log("RESULT: PASS — release checks clear.");
process.exit(0);
