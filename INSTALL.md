# Install Accela Chat

Accela Chat is a desktop app that turns your local Claude Code into a branded,
claude.ai-style chat with one-click sales skills built in (MEDDPICC, deal strategy,
pricing, discovery prep, budget finder, and more). It runs on your **existing Claude
Code login** — no separate account, no API key. You already have Claude Code, so this
takes about a minute.

## Easiest — paste this prompt into Claude Code

> Set up Accela Chat on my computer — it's a desktop app that uses my local Claude Code as
> its engine. Detect my OS and run the matching one-liner:
> - **macOS:** `curl -fsSL https://raw.githubusercontent.com/nicoaccela/saleschatbot/main/setup.sh | bash`
> - **Windows:** `irm https://raw.githubusercontent.com/nicoaccela/saleschatbot/main/setup.ps1 | iex`
>
> The installer is unsigned, so if my OS shows a security warning, tell me exactly what to
> click (macOS: right-click the app → Open → Open; Windows: More info → Run anyway). If it
> needs the file "Accela Chat Sales Kit.zip", tell me to download it from our Accela Chat
> folder into my Downloads, then finish installing the skills into my Claude skills folder.
> When you're done, confirm the app installed, list the sales skills now available, and
> remind me to make sure I'm signed in to Claude Code.

Claude Code will pick the right command for your machine and run the whole thing.

## Or run the one-liner yourself

- **macOS** (Terminal): `curl -fsSL https://raw.githubusercontent.com/nicoaccela/saleschatbot/main/setup.sh | bash`
- **Windows** (PowerShell): `irm https://raw.githubusercontent.com/nicoaccela/saleschatbot/main/setup.ps1 | iex`

Either way: it downloads the app, installs it, and loads your sales skills. A full
walkthrough lives in the **Accela Chat** shared folder (`Accela Chat - Install & Setup.html`).

## What happens after install

Open the app. The first-run screen checks that Claude Code is installed and signed in,
then walks you through the rest yourself — model, skills, any connections you want
(Salesforce, Gong). Nothing to configure by hand.

## Troubleshooting

| Symptom | Fix |
|---|---|
| macOS says the app "can't be opened" / from an unidentified developer | Right-click the app → Open → Open. One time only — the build isn't code-signed yet. If still blocked: System Settings → Privacy & Security → Open Anyway. |
| Windows SmartScreen warns ("Windows protected your PC") | Click **More info** → **Run anyway**. One time only, same reason. |
| First-run screen says Claude Code not found | Open a terminal (macOS) or PowerShell (Windows) and run `claude --version`. If that fails, reinstall it (below), then open a **new** terminal window before retrying — PATH only updates for new shells. |
| Chat errors with "not logged in" | Run `claude` in a terminal, complete login, relaunch Accela Chat. |
| Sales skills didn't load | The skills kit ships separately from Nico, not bundled in the public installer. Ping him. |
| Still stuck | Ask me (Claude) directly — I have this whole file. Or find Nico. |

### Reinstalling Claude Code, if the checks above fail

- **macOS:** `curl -fsSL https://claude.ai/install.sh | bash`
- **Windows (PowerShell):** `irm https://claude.ai/install.ps1 | iex`

Then run `claude` once and complete the login.
