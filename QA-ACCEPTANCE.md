# Accela Chat — QA Acceptance Checklist

Runnable acceptance matrix for **Accela Chat** (`com.accela.chat`), the Electron desktop
app that drives a locally installed Claude Code CLI as its model. Work the groups in order
A1 through A9 on both target platforms before any release is published.

## How to use this checklist

- Mark each row **Pass / Fail / N/A** per platform. A row is not done until both the macOS
  and Windows columns are resolved (or explicitly N/A with a reason).
- **Release-blocking** rows MUST pass on every supported platform before the GitHub draft
  release is published. A failing release-blocking check stops the rollout — do not click
  Publish.
- Installers and `electron-updater` never touch `userData`. The user-data directory is
  `~/Library/Application Support/Accela Chat/` on macOS and the `%APPDATA%\Accela Chat\`
  folder on Windows. Any check about preserved customization is verified against that path.
- The human **Publish** click on the GitHub draft release is the rollout gate. There is no
  downgrade path in `electron-updater`; bad-release recovery is unpublish, then
  republish-forward to a known-safe version.

## Automated vs manual

- The **only automated harness today** is `scripts/test-driver.mjs`. It is a local smoke of
  the Claude driver, requires a logged-in `claude` CLI, and proves multi-turn resume — it
  covers **AT-23** only. It cannot run in CI because there is no `claude` login in CI.
- **Everything else in this matrix is manual.** Plan operator time accordingly.
- CI (`.github/workflows/release.yml`) runs **typecheck and renderer build only**
  (`npm run build:renderer`, plus `tsc` available as a dev dependency) and then builds and
  publishes the installers. CI does not exercise any runtime acceptance check below.

---

## A1 — Fresh install

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-01 | Native install completes; app launches; shortcut created and the app is searchable | ☐ | ☐ | No | On macOS install the `.dmg` and drag to Applications; confirm it appears in Launchpad/Spotlight. On Windows run the NSIS `.exe`; confirm Start Menu shortcut and that Start search finds "Accela Chat". |
| AT-02 | Claude-missing screen shown when the CLI is absent | ☐ | ☐ | No | Launch on a machine with no `claude` binary on PATH; confirm the app shows the Claude-missing guidance screen instead of a broken chat. |
| AT-03 | Claude installed but logged out must NOT green-light readiness | ☐ | ☐ | **YES** | Install `claude` but do not log in. Launch the app; confirm it does NOT report ready and does NOT allow a normal chat turn — it must surface the logged-out state. |
| AT-04 | Onboarding appears exactly once on first run | ☐ | ☐ | No | First launch shows onboarding; complete it, quit, relaunch; confirm onboarding does not reappear. |
| AT-05 | Public skills pack provisions; the rep's own personal skills are skipped | ☐ | ☐ | No | On a clean profile confirm the bundled public pack installs and that no personal/private skills are pulled in. (Note: the `extraResources` repoint to `skills-public` is owned by the IP-safety phase and is still pending; verify against whatever pack the build currently bundles.) |

## A2 — Onboarding and profile

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-06 | Onboarding shows pre-filled context | ☐ | ☐ | No | Start onboarding; confirm any detectable context is pre-populated rather than blank. |
| AT-07 | Full profile saves successfully | ☐ | ☐ | No | Fill every profile field and save; confirm a success state and no error. |
| AT-08 | Validation requires Name plus Email | ☐ | ☐ | No | Attempt to save with Name and/or Email empty; confirm save is blocked with a clear validation message; confirm save succeeds once both are present. |
| AT-09 | Profile persists to `settings.json` | ☐ | ☐ | No | After save, open `settings.json` in the `userData` dir; confirm the profile fields are written. |
| AT-10 | Profile reaches the effective system prompt | ☐ | ☐ | No | In a chat turn ask the app "who am I?"; confirm the reply reflects the saved profile (name/role), proving the profile reaches the effective system prompt. |
| AT-11 | Run-once guard plus resume-on-force-quit | ☐ | ☐ | No | Confirm onboarding is gated by the single `setup.completedAt` latch. Force-quit mid-onboarding before completion; relaunch; confirm onboarding resumes rather than being skipped or duplicated. |
| AT-12 | Edit-later does not re-trigger onboarding | ☐ | ☐ | No | Open profile/settings and edit a field after setup is complete; confirm the onboarding flow does not re-launch. |
| AT-12b | Reset / re-run onboarding works | ☐ | ☐ | No | Use the reset path to clear `setup.completedAt`; relaunch; confirm onboarding runs again cleanly. |

## A3 — Setup skills

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-13 | "Brand Set Up" connects | ☐ | ☐ | No | Run the Brand Set Up flow; confirm it connects and completes without error. |
| AT-14 | OneDrive deny-path for a non-org user (safety property) | ☐ | ☐ | **YES** | As a non-org user, exercise the OneDrive path and confirm access is denied as designed. Verify this safety property BEFORE any link is embedded in the build. |
| AT-15 | Setup skill is idempotent | ☐ | ☐ | No | Run the setup skill twice; confirm the second run does not duplicate, corrupt, or error — end state matches a single run. |
| AT-16 | Setup-skill failure is recoverable | ☐ | ☐ | No | Force a failure mid-setup (e.g. interrupt it); re-run; confirm it recovers to a good state. |
| AT-16b | Skills land in `~/.claude/skills`; assets land in `~/Accela Sales Kit/` | ☐ | ☐ | No | After setup, confirm installed skills are present under `~/.claude/skills` and that asset files land under `~/Accela Sales Kit/`. |

## A4 — Update preserves customization (HIGHEST STAKES)

> **CALLOUT — re-run ALL of A4 on EVERY release.** This is the highest-stakes regression
> surface in the product. `electron-updater` serves only published GitHub releases and has
> no downgrade path, so a bad update that wipes customization cannot be rolled back in place
> — recovery is republish-forward only. Every one of AT-17 through AT-22 must be re-verified
> before each Publish, regardless of how small the release looks.

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-17 | Auto-update hop succeeds | ☐ | ☐ | No | Install the prior published version, publish/point to the new release, and confirm the app auto-updates to the new version. |
| AT-18 | Profile survives the update via deep-merge | ☐ | ☐ | No | Set a full profile on the old version; update; confirm the profile is intact afterward (targeted deep-merge protects `profile`). |
| AT-19 | The rep's own skill is untouched by the update | ☐ | ☐ | No | Add a personal skill under `~/.claude/skills`; update; confirm that skill is unchanged. |
| AT-20 | Managed pack refreshes AND a pinned fork survives | ☐ | ☐ | No | Pin/fork a managed skill, then update; confirm the managed pack refreshes (pack-id-scoped install) while the pinned fork is preserved. |
| AT-21 | Conversations and connected content survive | ☐ | ☐ | No | Have existing conversations and connected content before update; after update confirm they are all present and openable. |
| AT-22 | Custom `systemPrompt` and settings survive | ☐ | ☐ | No | Set a custom `systemPrompt` and non-default settings; update; confirm both are preserved (deep-merge protects `setup` and custom settings). |

## A5 — Persistence

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-23 | Multi-turn resume (AUTOMATED) | ☐ | ☐ | No | Run `node scripts/test-driver.mjs` against a logged-in `claude` CLI; confirm `checkClaude` passes, a first turn returns text and a `sessionId`, and the resume turn (using `resumeId`) correctly recalls the prior turn. This is the only automated check. |
| AT-24 | Settings round-trip | ☐ | ☐ | No | Change a setting, restart the app; confirm the value reloads from `settings.json` unchanged. |
| AT-25 | Corrupt-file resilience | ☐ | ☐ | No | Hand-corrupt `settings.json` (or the store file) and launch; confirm the app starts gracefully (safe defaults / backup) rather than crashing. |

## A6 — Offline and degraded

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-26 | Launches offline | ☐ | ☐ | No | Disable networking; launch the app; confirm it opens to a usable UI. |
| AT-27 | Offline chat turn shows a friendly error | ☐ | ☐ | No | While offline, send a chat turn; confirm a clear, friendly error instead of a hang or crash. |
| AT-28 | Update check fails silently when offline | ☐ | ☐ | No | While offline, trigger/await an update check; confirm it fails quietly with no disruptive error dialog. |
| AT-29 | Setup skill offline is recoverable | ☐ | ☐ | No | Run a setup skill while offline; confirm it fails cleanly and recovers once connectivity returns. |
| AT-30 | Logged-out chat turn shows an actionable message | ☐ | ☐ | No | With `claude` installed but logged out, send a turn; confirm an actionable message telling the user to log in. |

## A7 — Installer specifics

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-31 | Windows SmartScreen path | N/A | ☐ | No | Download and run the NSIS installer on a clean Windows machine; document the SmartScreen prompt and the click-through path (Windows signing is deferred, so expect the unsigned-publisher warning). |
| AT-32 | macOS Gatekeeper path | ☐ | N/A | No | Download and open the `.dmg` on a clean Mac; document the Gatekeeper prompt and approval path (notarization is the signing fast-follow, so expect the unidentified-developer flow until then). |
| AT-33 | Claude binary discovery plus `ACCELA_CLAUDE_BIN` override | ☐ | ☐ | No | Confirm the app discovers `claude` on PATH; then set `ACCELA_CLAUDE_BIN` to an explicit binary path and confirm the app uses the override. |

## A8 — Security

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-34 | Default tool mode is readonly | ☐ | ☐ | No | On a fresh profile confirm `toolMode` defaults to `readonly` (the default flipped from `agent` to `readonly`). |
| AT-35 | Agent opt-in shows a warning | ☐ | ☐ | No | Switch tool mode to `agent`; confirm a clear warning is presented before it takes effect. |
| AT-36 | `help:open` rejects paths outside `userData/help` | ☐ | ☐ | No | Attempt to open a path outside the `userData/help` directory via the help open channel; confirm it is rejected. |

## A9 — Migration

| ID | Check | macOS | Windows | Release-blocking | How to verify |
|----|-------|-------|---------|------------------|---------------|
| AT-37 | Store hop with a populated profile/prompts; a backup is written | ☐ | ☐ | No | Start from an old store schema with a populated profile and prompts; launch the new version; confirm the store migrates correctly AND that a backup of the pre-migration store is written. |
| AT-38 | From-source to packaged import | ☐ | ☐ | No | Run with a from-source `userData` path that differs from the packaged `Accela Chat` userData dir; confirm the import brings the from-source conversations and settings into the packaged app so they are not orphaned. |

---

## Release-blocking summary

| ID | Group | Why it blocks |
|----|-------|---------------|
| **AT-03** | A1 Fresh install | A logged-out Claude CLI must never green-light readiness; shipping this broken means users hit dead-ended chats. |
| **AT-14** | A3 Setup skills | The OneDrive deny-path for non-org users is a safety property and must hold before any link is embedded. |

Both release-blocking checks must pass on every supported platform before the GitHub draft
release is published.
