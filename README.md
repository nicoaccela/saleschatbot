# Accela Chat

A Chromium (Electron) desktop chat client that uses **Claude Code as the model**,
in the **Accela 2026 brand**. Built for sales engineers: a clean, Claude.ai-style
chat with conversation history, model selection, friendly fonts, file/folder
attach, side-by-side sessions, and one-click **sales skills** (MEDDPICC, deal
strategy, pricing, budget finder, product knowledge, and more).

> [!IMPORTANT]
> **Accela Chat is a front-end to your own Claude Code.** It does not include or
> replace Claude — it drives the `claude` CLI already installed on your machine
> and uses your existing login. You must install and sign in to Claude Code
> first (the app walks you through it on first launch).

---

## For users — install

Download the installer for your OS from the **[Releases page](../../releases)**:

| OS | File |
|----|------|
| macOS (Apple Silicon **or** Intel) | `Accela-Chat-<version>-universal.dmg` |
| Windows 10/11 (64-bit) | `Accela-Chat-Setup-<version>.exe` |

### Prerequisite: Claude Code (one time)
1. Install it:
   - **macOS:** `curl -fsSL https://claude.ai/install.sh | bash`
   - **Windows (PowerShell):** `irm https://claude.ai/install.ps1 | iex`
   - …or download from **https://claude.com/claude-code**
2. Open a terminal and run `claude` once, then complete the login.

That's it — Accela Chat reuses that login. The app's first-run screen checks
this for you and links out if anything's missing.

### macOS — first launch (unsigned app)
The build isn't code-signed yet, so macOS will warn the first time:
1. Drag **Accela Chat** to Applications, then **right-click it → Open**.
2. Click **Open** in the dialog. (Only needed once.)
   - If blocked: **System Settings → Privacy & Security → Open Anyway**.

### Windows — first launch (unsigned app)
SmartScreen will warn the first time:
1. Run the installer; if you see "Windows protected your PC", click
   **More info → Run anyway**. (Only needed once.)

---

## For developers

Requires [Bun](https://bun.sh) for local dev.

```bash
bun install
bun run dev        # Vite + Electron with hot reload
```

Local one-folder build (no installer): `bun run pack`
> Note: `electron-builder` is unreliable under bun. Full installers are produced
> by CI (see below), or run the `dist:*` scripts with Node installed.

### Architecture
```
electron/
  main.js      window, IPC, wiring
  preload.js   contextBridge → window.accela.*
  claude.js    spawns the claude CLI (cross-platform), parses stream-json, resumes sessions
  store.js     local JSON persistence (conversations + settings)
  commands.js  scans ~/.claude/skills for the slash/skill menu
src/
  App.tsx      app shell, pane manager, setup gate
  components/  Sidebar, ChatPane, MessageBubble, Composer, ModelPicker, SkillsPanel, SettingsPanel, SetupScreen
  lib/         types, models, presets
build/icon.*   app icon (navy squircle + ascending bars)
```

Conversations & settings live under Electron's `userData` dir
(`~/Library/Application Support/Accela Chat/` on macOS,
`%APPDATA%\Accela Chat\` on Windows).

---

## Releasing (maintainers)

Installers are built by **GitHub Actions** — macOS and Windows each build on their
own runner, so there's no cross-compiling.

```bash
# bump version in package.json, then:
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow builds the `.dmg` (universal) and `.exe` (NSIS) and
uploads them to a **draft GitHub Release** for that tag. Open the release, review,
and click **Publish** — the assets become the public download links you share.

No secrets are required for unsigned builds (`GITHUB_TOKEN` is provided
automatically). To add code-signing later, drop the certs in as repo secrets and
extend the `env:` of the build step — the pipeline is structured for it.
