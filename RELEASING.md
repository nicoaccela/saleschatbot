# Releasing Accela Chat

The canonical runbook for cutting a release of Accela Chat. Read this end to end
before your first cut. Every release follows the same path: bump, tag, let CI build
a **draft** GitHub Release, smoke the draft artifacts on clean machines, then click
**Publish**. The Publish click is the rollout gate. Nothing reaches users until then.

This document lives in a **public** repository. It contains GitHub secret *names*
only, never values, and no internal references of any kind.

---

## 1. Versioning model: two independent SemVers

Accela Chat carries **two** version numbers that move on their own cadence. Do not
assume one implies the other.

| Version | Lives in | Drives | Bump when |
| --- | --- | --- | --- |
| **App version** | `package.json` -> `version` | `electron-updater`. The installed app compares this against the latest published release and self-updates. | Any change to app code, Electron/runtime, packaging, or bundled behavior. |
| **Skill-pack version** | `skills-public/_pack.json` -> `version` | The in-app skill refresh. The app compares the bundled pack version against what it has installed and refreshes pack-scoped skills (install is pinned and scoped to the pack id). | Any change to the skills shipped inside the app. |

Rules:

- **App version is the release.** A tag (`vX.Y.Z`) always corresponds to the
  `package.json` version. CI builds and `electron-updater` only ever reason about
  this number.
- **Bump the skill-pack version only when skills changed.** A pure skill edit still
  needs an app release to ship (skills are bundled as `extraResources`), so you bump
  *both*: the pack version because skills changed, and the app version because you are
  cutting a build. A code-only release bumps the app version and leaves the pack
  version alone.
- **A schema migration must NEVER ride a patch release.** If a release changes the
  shape of persisted data (profile, setup, conversation, or settings schema) it is a
  **minor or major** bump, never a patch. Patches are reserved for changes that any
  installed version can take blindly. `electron-updater` has no downgrade path, so a
  schema change shipped as a patch is unrecoverable for anyone who auto-updated. The
  in-app deep-merge protects `profile` and `setup` across upgrades, but the merge is a
  safety net, not a license to skip the version discipline.

SemVer for the app version:
- **patch** (`X.Y.Z+1`) — bug fixes, copy, styling, no schema or behavior contract change.
- **minor** (`X.Y+1.0`) — new features, additive schema changes, new defaults.
- **major** (`X+1.0.0`) — breaking changes to persisted schema or user-facing contracts.

---

## 2. Pre-cut checklist

Run the preflight backstop first. It is the release-invariant gate and the cheapest
place to catch an IP or configuration mistake.

```
node scripts/preflight.mjs
```

`preflight.mjs` must exit clean. It **fails** the cut on invariants 1–3 and 5 below, and **warns** (without failing) on 4:

1. **`extraResources` points at the public skills directory**, not the raw IP skills
   directory. The bundled pack must be sourced from `skills-public/`, never the
   internal `skills/` tree. (Note: the repoint of `build.extraResources` from the raw
   skills dir to the public dir is owned by the IP-safety phase and may still be
   pending; preflight is the backstop that fails the cut until it lands.)
2. **No `salesforce-mcp` in any bundled pack.** That skill must never ship inside the
   app. Preflight scans the bundled pack and fails if it appears.
3. **`releaseType` is `draft`.** The draft-then-publish model is the rollout gate.
   Preflight fails if `build.publish` is set to anything that would auto-publish.
4. **Version bumped vs. the latest tag** *(warning — non-blocking)*. Preflight **warns**
   if the `package.json` version is not greater than the most recent `vX.Y.Z` tag, but does
   **not** fail the run on it. Bumping the version is your responsibility at the cut
   (Section 3); preflight will not stop a re-tag of an existing version, so don't do one.
5. **No proprietary terms in `skills-public/`.** Preflight scans the public skills
   tree for internal names, customer or account names, internal links, or secret-shaped
   strings, and fails on a hit. This repo is world-visible; the public pack must be clean.

Then confirm by hand:

- [ ] **QA acceptance matrix is green.** See `QA-ACCEPTANCE.md`. The release-blocking
      acceptance subset must pass; nothing in the blocking set is red or untested.
- [ ] **`CHANGELOG.md` is updated** with the new version, the date, and a human-readable
      summary of what changed (and explicitly note any schema migration).
- [ ] If skills changed, **`skills-public/_pack.json` version is bumped** and the change
      is reflected in the changelog.

Do not proceed past a failing preflight or a red blocking-acceptance test.

---

## 3. The cut (exact commands)

Bump the version(s), commit, tag, and push the tag. Pushing the tag is what triggers CI.

```
# 1. Bump the app version in package.json (edit "version": "X.Y.Z").
#    If skills changed, also bump "version" in skills-public/_pack.json.

# 2. Commit the bump (and changelog / pack bump) on the release branch.
git add package.json skills-public/_pack.json CHANGELOG.md
git commit -m "Release vX.Y.Z"

# 3. Tag the commit. The tag MUST match the package.json version, prefixed with v.
git tag vX.Y.Z

# 4. Push the tag. This is the CI trigger.
git push origin vX.Y.Z
```

What CI does on the `v*` tag push (`.github/workflows/release.yml`):

- Runs on a **macOS** runner and a **Windows** runner in parallel (matrix; `fail-fast`
  is off so one platform failing does not abort the other).
- `npm install`.
- **Typecheck:** `npx --no-install tsc --noEmit` — gates the release on a clean TypeScript build.
- **Preflight:** runs `node scripts/preflight.mjs` if present (the IP/config backstop above),
  failing the build on a violation.
- `npm run build:renderer` (Vite build of the renderer).
- `npx --no-install electron-builder --<platform> --publish always`.
- The **macOS** runner produces the **universal `.dmg`** and the **universal `.zip`**,
  plus **`latest-mac.yml`**.
- The **Windows** runner produces the **NSIS `.exe`** installer, plus **`latest.yml`**.
- All artifacts upload to a **DRAFT** GitHub Release (because `releaseType` is `draft`).
  For an **unsigned** build the only credential needed is `GH_TOKEN` (the built-in
  `GITHUB_TOKEN` secret). The mac signing/notarization secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`,
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are **already wired** into the
  build step's env; they resolve empty when unset, so the unsigned build still succeeds.
  Signing activates automatically once those secrets exist (see `docs/notarization-and-signing.md`).

The `latest.yml` / `latest-mac.yml` feed `electron-updater`. They only take effect for
clients once the release is **published** (Section 4).

Installers and `electron-updater` never touch the app's userData directory, so a new
install or auto-update preserves existing conversations and settings in place.

---

## 4. Smoke and Publish gate

The draft is the staging environment. Verify it before exposing it to the fleet.

1. **Download the draft artifacts** from the draft GitHub Release: the macOS `.dmg`
   (or `.zip`) and the Windows `.exe`.
2. **Install on a clean macOS machine and a clean Windows machine.** Clean means no
   prior Accela Chat install, so you exercise the true first-run path. Because the build
   is unsigned, expect and follow the one-time Gatekeeper / SmartScreen prompt (Section 6).
3. **Run the release-blocking acceptance subset** from `QA-ACCEPTANCE.md` on each
   platform: first-run onboarding completes, the run-once setup latch holds, the default
   tool mode is the read-only default, the bundled skills load, and a multi-turn
   conversation works end to end against the local CLI.
4. **Only if both platforms pass, click Publish** on the GitHub Release.

`electron-updater` serves **only published** releases. A draft reaches no one. The
**Publish click is the rollout** to every installed client. **Never enable
auto-publish** and never publish a release you have not smoked on clean machines of both
platforms.

---

## 5. Bad-release rollback runbook (keep permanently)

`electron-updater` has **no downgrade path.** Clients move forward only. You cannot fix
a bad release by republishing an older version number; clients already on the bad
version will not step down to it. The recovery is **forward-to-safe.**

If a broken `vX` has been published:

1. **Stop the bleed.** Immediately **delete or un-publish that GitHub Release.** Removing
   it from the published set stops `electron-updater` from serving it to clients that
   have not yet pulled it. (Clients already updated to `vX` are not rolled back by this;
   step 2 fixes them.)
2. **Roll the fleet forward to safe.** Take the **last known-good code** and **re-cut it
   as a higher version, `vX+1`**, through the normal cut (Section 3) and smoke/publish
   gate (Section 4). Because the version is higher, every client — including those stuck
   on the broken `vX` — auto-updates onto the safe build. This is the only way to recover
   clients already on the bad version.
3. **Notify.** Post a single-line notice to users: a bad build went out, the fix is
   shipping as `vX+1`, and it will auto-update on next launch. Keep it short and factual.

Do not attempt a downgrade, a tag move, or a force re-tag of an existing version. Always
go up.

---

## 6. Signing and notarization status

**v1 ships UNSIGNED on both platforms.** This is intentional for the initial rollout and
is documented to users.

- **macOS:** the unsigned `.dmg` / `.zip` triggers a one-time **Gatekeeper** prompt on
  first launch (open via right-click -> Open, or allow it in System Settings -> Privacy
  & Security). After the first allow, subsequent launches and auto-updates run without
  re-prompting.
- **Windows:** the unsigned NSIS installer triggers a one-time **SmartScreen** prompt
  (More info -> Run anyway). After the first install it does not re-prompt.

Roadmap:

- **macOS notarization is the signing fast-follow.** It removes the Gatekeeper prompt and
  is the next signing milestone. Procedure and prerequisites live in
  `docs/notarization-and-signing.md`. (Notarization requires an Apple Developer Program
  membership.)
- **Windows code signing is deferred** to a later milestone; until then the one-time
  SmartScreen click stands.

When signing/notarization lands, CI will gain the corresponding signing secrets; until
then the build uses only the built-in `GITHUB_TOKEN` and no signing identity is required.
