# Accela Chat — working notes for AI agents

Electron desktop chat app that uses the user's **local Claude Code CLI** as the model
(spawns `claude`, reuses their login — no API key, no bundled model). React + Vite
renderer in `src/`, Electron main in `electron/`. Dev toolchain is **bun**.

## Build / run / verify
```
bun install
bun run dev            # Vite + Electron, hot reload (run from source)
bun run build:renderer # vite build (CI does this)
bun run pack           # local app bundle (electron-builder --dir)
bun x tsc --noEmit     # typecheck — CI gate; needs src/vite-env.d.ts for *.svg imports
bun scripts/preflight.mjs   # release IP/config backstop — run before any release tag
```
electron-builder is unreliable under bun for full installers; CI (Node) builds those.

## Architecture (quick map)
- `electron/main.js` — window, IPC, `chat:send` (spawns a turn, persists it, forwards
  stream events, stores the session id for `--resume`, auto-heals a stale session).
- `electron/claude.js` — spawns the CLI (`-p --output-format stream-json
  --include-partial-messages --verbose --model [--resume]`), parses the event stream,
  emits delta/init/done/error, classifies errors, treats a Stop (SIGTERM) as a clean exit.
- `electron/store.js` — JSON persistence (conversations, settings, profile); deep-merges
  profile/setup so updates never drop fields.
- `electron/commands.js` — scans `~/.claude/skills` to build the slash/skill menu. **Skills
  are discovered from there, NOT bundled in the installer.**
- `src/App.tsx` — pane manager + gates (Claude-check → onboarding → app).
- `src/components/ChatPane.tsx` — turn lifecycle, message queueing, working indicator,
  recoverable error card. `MessageBubble.tsx` is **memoized** (don't pass it unstable props,
  or the whole transcript re-parses markdown every stream token).
- `src/lib/presets.ts` — skill groups/labels; must match the skills in `skills/_pack.json`.

## Releasing (read before touching CI or cutting a version)
Push a `vX.Y.Z` tag → GitHub Actions builds mac (`arm64`+`x64` dmg/zip) + win `.exe` →
**draft** release → a human Publishes it. `electron-updater` serves only published releases.

**Hard-won gotchas:**
1. **Do NOT pass empty signing env to CI.** `CSC_LINK: ${{ secrets.CSC_LINK }}` (or `APPLE_*`)
   when the secret is absent becomes `""`; electron-builder reads `""` as a cert path and
   crashes the mac build with `⨯ <repo-dir> not a file`. The build is **unsigned** — env is
   just `GH_TOKEN` + `CSC_IDENTITY_AUTO_DISCOVERY: "false"`. Add signing vars back only with
   real cert values. (See `docs/notarization-and-signing.md`.)
2. Use `macos-latest`. Older pinned mac images can sit queued for hours.
3. **An AI agent cannot push tags or publish releases** — the safety system blocks those as
   production deploys. Give the human the exact command; don't work around it.
4. **Verify, don't assume.** `gh run watch | tail` masks the exit code. Check
   `gh run view <id> --json conclusion` + per-job, and `curl` the published asset for HTTP 200.

## IP discipline (non-negotiable)
- `skills/` is **gitignored** and must never be committed — this is a public repo and the
  installer is app-shell-only. Proprietary skills/assets are distributed privately, not here.
- `scripts/preflight.mjs` fails a release on proprietary terms / a leaky `extraResources` /
  `salesforce-mcp`. Run it before any cut; never weaken it.

## Conventions
- Commit straight to `main` (single-threaded). Match the existing code style + comment density.
- Verify changes build + typecheck before committing. Adversarially re-check lifecycle code
  (claude.js turn/error/session, IPC contracts) — a subtle race can brick a chat.
- Default tool mode is `agent` (intentional), not `readonly`.
