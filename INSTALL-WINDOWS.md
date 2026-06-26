# Accela Chat — Windows install runbook (for Claude Code)

> **Who this is for:** paste this whole file into **Claude Code** on the Windows
> machine and tell it: *"Follow this runbook to install and launch Accela Chat,
> running each command and reporting results."* Claude can execute every step.
>
> **What this app is:** a desktop chat client (Electron) that uses your **local
> Claude Code CLI as the model**. It does **not** bundle Claude — it drives the
> `claude` you already have and reuses your existing login. So Claude Code must
> be installed and signed in first (it already is, since you're reading this in it).

---

## 0. Prerequisites (check, install only what's missing)

Run these checks first and report which are present:

```powershell
git --version
bun --version
claude --version
```

Install whatever is missing:

- **Git** — https://git-scm.com/download/win  (or `winget install --id Git.Git -e`)
- **Bun** (JS toolchain the app builds with):
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
  Then **open a new terminal** so `bun` is on PATH.
- **Claude Code** (the model backend — required):
  ```powershell
  irm https://claude.ai/install.ps1 | iex
  ```
  Then run `claude` once and complete the login. Confirm `claude --version` works.

> Do **not** proceed until `git`, `bun`, and a **logged-in** `claude` all work.

---

## 1. Get the code

```powershell
cd $HOME
git clone https://github.com/nicoaccela/saleschatbot.git
cd accela-chat
bun install
```

`bun install` pulls Electron + the renderer deps (a few hundred MB; one time).

---

## 2. Launch it — pick ONE path

### Path A — Run from source (fastest; best for a quick test)

```powershell
bun run dev
```

This starts Vite, waits for it, then opens the Electron window. **Leave the
terminal open** — closing it quits the app.

> **If `bun run dev` errors with something like `spawn bunx ENOENT`**, the dev
> launcher couldn't spawn `bunx`. Use this two-terminal fallback instead:
> ```powershell
> # Terminal 1 — dev server (leave running):
> bunx vite
> # Terminal 2 — the app, pointed at the dev server:
> $env:VITE_DEV_SERVER_URL="http://localhost:5173"; bunx electron .
> ```

### Path B — Build a real installer (closest to what reps will get)

```powershell
bun run build:renderer   # builds the UI into dist\  (REQUIRED before packaging)
bun run dist:win         # packages the Windows installer
```

The installer lands in **`release\Accela-Chat-Setup-<version>.exe`**. Run it to
install (it creates a Start-menu + desktop shortcut). Because the build is **not
code-signed yet**, Windows SmartScreen will warn on first run — click
**More info → Run anyway** (one time).

---

## 3. Verify it works

1. The app window opens with the Accela-branded chat UI.
2. The **first-run screen** checks for Claude Code — it should show it as found
   and logged in. (If not, see Troubleshooting.)
3. Start a new chat and send: **`Reply with exactly: Windows test OK`** — you
   should get a streamed reply.
4. Send a **second message in the same chat** (e.g. *"what did I just ask you to
   reply?"*) — it should remember, confirming multi-turn memory (`--resume`).
5. **Drag a file onto the chat pane** — a full-pane "Drop to attach" overlay
   should appear and the file should attach.

Report the result of each check.

---

## 4. Troubleshooting

| Symptom | Fix |
|---|---|
| First-run says **Claude not found** | Make sure `claude --version` works in the same shell. If `claude` lives somewhere non-standard, set an env var pointing at the binary before launching: `setx ACCELA_CLAUDE_BIN "C:\full\path\to\claude.exe"` then open a new terminal and relaunch. The app also looks in `%USERPROFILE%\.local\bin`, `%APPDATA%\npm`, and `%LOCALAPPDATA%\Programs\claude`. |
| Chats error with **not logged in** | Run `claude` in a terminal and complete login, then retry. |
| `bun` not recognized after install | Open a **new** terminal (PATH only updates for new shells). |
| `bun run dev` fails to spawn | Use the two-terminal fallback in **Path A**. |
| Port **5173 in use** | Close whatever's using it, or it's a leftover Vite — kill stray `node`/`bun` processes and retry. |
| `dist:win` fails on first run | It downloads packaging tools once; re-run `bun run dist:win`. Ensure `bun run build:renderer` ran first (it creates `dist\`). |
| Window opens **blank** | In Path A, confirm Vite is serving at http://localhost:5173; in Path B, confirm `build:renderer` ran before `dist:win`. |

---

## 5. Notes for the tester

- **Everything is local & per-user.** Conversations are stored on this machine
  (`%APPDATA%\accela-chat\conversations\`), and chats run on **this user's** Claude
  Code login — nothing routes through anyone else's account.
- **Memory:** within one chat thread it remembers (via Claude Code `--resume`);
  separate chats are independent by design.
- To update later: `cd $HOME\accela-chat; git pull; bun install` then relaunch.
