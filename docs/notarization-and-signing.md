# macOS Notarization and Code Signing

This is the P4 signing fast-follow for Accela Chat. Version 1 (`0.1.0`) ships
**unsigned**. This document is the path to a signed and notarized build. Nothing
here changes how the app stores data: installers and `electron-updater` never
touch the `userData` directory, so turning signing on does not orphan a user's
conversations or settings.

## 1. Why sign and notarize

An **unsigned** build still installs and runs, but macOS Gatekeeper blocks it on
first launch. The user has to perform a one-time override: right-click the app and
choose **Open**, or approve it under **System Settings -> Privacy & Security ->
Open Anyway**. That is friction at the worst possible moment, the very first run.

**Code signing** stamps the app with a Developer ID identity so macOS can confirm
it has not been tampered with. **Notarization** sends the signed build to Apple,
which scans it and issues a ticket that gets stapled to the artifact. A signed and
notarized build launches with **no Gatekeeper override** and a clean trust prompt.

Signing is also the precondition for any future auto-update trust story: once the
identity is stable, every published release carries the same verified origin.

## 2. Apple prerequisites

You need an Apple account enrolled in the paid program. Gather these four things
before touching CI:

1. **Apple Developer Program membership** — 99 USD per year. Required to obtain a
   Developer ID certificate. Free Apple IDs cannot sign for distribution.
2. **A Developer ID Application certificate**, exported as a **`.p12`** file. Create
   the certificate in the Apple Developer portal (or via Xcode -> Settings ->
   Accounts -> Manage Certificates), then export it from Keychain Access with its
   private key, setting an export password. That password becomes
   `CSC_KEY_PASSWORD` below.
3. **An app-specific password** for the Apple ID used to notarize. Generate it at
   <https://appleid.apple.com> -> Sign-In and Security -> App-Specific Passwords.
   Do **not** use the account's primary password.
4. **The Team ID** — the 10-character identifier shown in the Apple Developer portal
   under Membership details. It scopes the notarization request to your team.

## 3. GitHub secrets to add

Add these in the `saleschatbot` repo under **Settings -> Secrets and variables ->
Actions -> New repository secret**. This repository is **public**, so never paste
the certificate, the passwords, or the Team ID into any tracked file, commit
message, or this document. Secrets are the only acceptable home for them.

| Secret name | What it holds |
|---|---|
| `CSC_LINK` | The Developer ID `.p12`, base64-encoded. Produce it with `base64 -i Certificates.p12 \| pbcopy` and paste the result. electron-builder decodes it back to the certificate at build time. |
| `CSC_KEY_PASSWORD` | The password set when the `.p12` was exported from Keychain Access. |
| `APPLE_ID` | The Apple ID email used for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from step 3 (not the account password). |
| `APPLE_TEAM_ID` | The 10-character Team ID. |

Names only are shown here. The real values live exclusively in GitHub Actions
secrets.

## 4. electron-builder configuration (staged package.json patch)

`build/entitlements.mac.plist` is already provided by this deploy. The change that
remains is to the `build.mac` block in `package.json`. That file is owned by the
other terminal, so this is presented as a **copy-paste staged patch**, not applied
here. When P4 lands, replace the current `build.mac` object with the block below.

Current `build.mac`:

```json
"mac": {
  "target": [
    { "target": "dmg", "arch": ["universal"] },
    { "target": "zip", "arch": ["universal"] }
  ],
  "category": "public.app-category.business",
  "icon": "build/icon.png"
}
```

Signed-and-notarized `build.mac`:

```json
"mac": {
  "target": [
    { "target": "dmg", "arch": ["universal"] },
    { "target": "zip", "arch": ["universal"] }
  ],
  "category": "public.app-category.business",
  "icon": "build/icon.png",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "notarize": {
    "teamId": "${env.APPLE_TEAM_ID}"
  }
}
```

What each addition does:

- **`hardenedRuntime: true`** — enables the Hardened Runtime, which Apple requires
  for notarization. The provided entitlements file grants the JIT, unsigned-memory,
  library-validation, and dyld-environment exceptions that an Electron app needs to
  run under it.
- **`gatekeeperAssess: false`** — skips the local `spctl` assessment during the
  build. The authoritative gate is Apple's notarization service, not the build host.
- **`entitlements` and `entitlementsInherit`** — both point at
  `build/entitlements.mac.plist`. The first applies to the main app, the second to
  nested helper binaries, so child processes inherit the same exceptions.
- **`notarize.teamId`** — set to `${env.APPLE_TEAM_ID}`, which electron-builder
  resolves from the `APPLE_TEAM_ID` secret at build time. Its presence switches
  notarization on.

electron-builder 25 reads **`APPLE_ID`** and **`APPLE_APP_SPECIFIC_PASSWORD`**
directly from the environment for the notarization credentials. They do **not**
appear in `package.json`; only `teamId` is referenced in config.

## 5. CI behavior

`.github/workflows/release.yml` has the gated signing environment wired by this
deploy. The result is a no-config switch:

- **Secrets present** — `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` flow into the build step's
  environment. electron-builder picks them up and signs plus notarizes the macOS
  artifacts automatically. No further workflow edit is required.
- **Secrets absent** — electron-builder finds no certificate, **skips signing**,
  and the **unsigned build still succeeds**. This is exactly the v1 state, so the
  pipeline is safe to run before the Apple account exists.

In short: signing activates the moment the secrets are added, and stays off (with
green builds) until then.

## 6. Windows signing (deferred)

Windows code signing is **out of scope for this fast-follow**. An Authenticode
certificate runs roughly **200 to 700 USD per year** depending on validation tier
(OV is cheaper; EV is dearer but suppresses SmartScreen warnings immediately). The
CI environment hook is reserved for it, so when a Windows certificate is acquired
the same secrets-present / secrets-absent pattern applies on the `win` leg without
a workflow rewrite. Until then the NSIS installer ships unsigned and triggers a
SmartScreen prompt on first run.
