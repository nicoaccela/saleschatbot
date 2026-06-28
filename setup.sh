#!/usr/bin/env bash
# Accela Chat — one-command setup (macOS).
# Paste into Claude Code (or Terminal). Installs the app + the sales skills.
#   curl -fsSL https://raw.githubusercontent.com/nicoaccela/saleschatbot/main/setup.sh | bash
set -euo pipefail
repo="nicoaccela/saleschatbot"
echo ""
echo "=== Accela Chat setup ==="
echo ""

# 1) App — download the latest published macOS build (zip) and install to /Applications.
arch="$(uname -m)"   # arm64 (Apple Silicon) or x86_64 (Intel)
case "$arch" in
  arm64) want="arm64" ;;
  x86_64) want="x64" ;;
  *) want="arm64" ;;
esac
echo "Finding the latest Accela Chat release (arch: $want)..."
api="https://api.github.com/repos/$repo/releases/latest"
url="$(curl -fsSL "$api" | grep -oE '"browser_download_url": *"[^"]+"' | sed 's/.*"browser_download_url": *"//; s/"$//' | grep -iE "darwin|mac|${want}" | grep -iE '\.zip$' | head -1)"
[ -z "$url" ] && url="$(curl -fsSL "$api" | grep -oE '"browser_download_url": *"[^"]+"' | sed 's/.*"browser_download_url": *"//; s/"$//' | grep -iE '\.zip$' | head -1)"
if [ -z "$url" ]; then echo "No macOS (.zip) build in the latest release yet."; exit 1; fi
tmp="$(mktemp -d)"
echo "Downloading $(basename "$url")..."
curl -fsSL "$url" -o "$tmp/AccelaChat.zip"
echo "Installing to /Applications..."
ditto -x -k "$tmp/AccelaChat.zip" "$tmp/app"
app="$(/usr/bin/find "$tmp/app" -maxdepth 2 -name "*.app" | head -1)"
if [ -n "$app" ]; then
  rm -rf "/Applications/$(basename "$app")" 2>/dev/null || true
  cp -R "$app" /Applications/
  echo "Installed $(basename "$app"). First launch: right-click it -> Open -> Open (one-time Gatekeeper)."
fi

# 2) Skills — prefer the kit attached to the release (zero-step); else a Downloads fallback.
skills="$HOME/.claude/skills"
zip="$HOME/Downloads/Accela Chat Sales Kit.zip"
kit_url="$(curl -fsSL "$api" | grep -oE '"browser_download_url": *"[^"]+"' | sed 's/.*"browser_download_url": *"//; s/"$//' | grep -iE 'kit' | grep -iE '\.zip$' | head -1)"
if [ -n "$kit_url" ]; then
  echo ""; echo "Installing sales skills..."
  mkdir -p "$skills"
  curl -fsSL "$kit_url" -o "$tmp/kit.zip"
  ditto -x -k "$tmp/kit.zip" "$skills"
  echo "Sales skills installed to $skills"
elif [ -f "$zip" ]; then
  echo ""; echo "Installing sales skills from your Downloads..."
  mkdir -p "$skills"
  ditto -x -k "$zip" "$skills"
  echo "Sales skills installed to $skills"
else
  echo ""
  echo "ONE MORE STEP for your skills:"
  echo "  Download 'Accela Chat Sales Kit.zip' from the Accela Chat OneDrive folder to Downloads, then run:"
  echo "    ditto -x -k \"$zip\" \"$skills\""
fi

echo ""
echo "Done. Open Accela Chat. (Claude Code must be signed in.)"
echo ""
