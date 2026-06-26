# Install Accela Chat

Accela Chat is a desktop app that runs on your **local Claude Code** (your existing
`claude` login — no separate account, no API key). You already have Claude Code, so this
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
