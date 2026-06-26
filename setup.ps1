# Accela Chat — one-command setup (Windows).
# Paste into Claude Code (or PowerShell). Installs the app + the sales skills.
#   irm https://raw.githubusercontent.com/nicoaccela/saleschatbot/main/setup.ps1 | iex

$ErrorActionPreference = "Stop"
$repo = "nicoaccela/saleschatbot"
Write-Host "`n=== Accela Chat setup ===`n"

# 1) App — download the latest published installer from GitHub Releases and run it.
Write-Host "Finding the latest Accela Chat release..."
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "accela-chat-setup" }
$asset = $rel.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
if (-not $asset) { throw "No Windows (.exe) installer in the latest release yet." }
$exe = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size/1MB)) MB)..."
Invoke-WebRequest $asset.browser_download_url -OutFile $exe
Write-Host "Launching the installer."
Write-Host "  -> If Windows SmartScreen warns, click 'More info' then 'Run anyway' (one time)."
Start-Process $exe

# 2) Skills — unzip the Accela sales kit into the Claude Code skills folder.
$skillsDir = Join-Path $HOME ".claude\skills"
$zip = Join-Path $HOME "Downloads\Accela Chat Sales Kit.zip"
if (Test-Path $zip) {
  Write-Host "`nInstalling sales skills..."
  New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
  Expand-Archive -Force $zip $skillsDir
  Write-Host "Sales skills installed to $skillsDir"
} else {
  Write-Host "`nONE MORE STEP for your skills:"
  Write-Host "  1. From your Accela Chat folder, download 'Accela Chat Sales Kit.zip' to your Downloads."
  Write-Host "  2. Re-run this command (or run the line below) to finish:"
  Write-Host "       Expand-Archive -Force `"$zip`" `"$skillsDir`""
}

Write-Host "`nDone. Open 'Accela Chat' from the Start menu. (Claude Code must be signed in.)`n"
