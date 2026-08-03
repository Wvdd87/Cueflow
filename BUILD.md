# Building and distributing CueFlow (macOS)

No Apple Developer account, so the app is **not code-signed or notarized**. It runs
fine — but macOS will block it on any machine that didn't build it, unless the
quarantine flag is removed. Everything below is about managing that.

## Build

```bash
npm install          # first time only
npm run dist         # → dist/Cueflow-<version>.dmg  and  dist/Cueflow-<version>-mac.zip
```

Builds **universal** (Intel + Apple Silicon), so it runs natively on both without
Rosetta. That doubles the download size; it is the right trade for handing a file
to whatever Mac is in the room.

Bump `version` in `package.json` before a release — the filename and the in-app
version come from it.

## Installing on the machine that built it

Open the DMG, drag CueFlow to Applications. It opens normally: a locally built app
carries no quarantine flag.

## Installing on any OTHER Mac

macOS flags anything arriving from the internet (download, email, AirDrop, Slack)
and refuses to open an unsigned app with **"CueFlow is damaged and can't be
opened."** It is not damaged — that is Gatekeeper's message for unsigned.

### Best: hand it over on a USB stick or local file share

A Finder copy from a USB drive or an SMB/AFP share does **not** set the quarantine
flag, so the app just opens. For crew machines you set up in person, this is the
path of least friction — no Terminal, no warnings.

### Otherwise: strip the flag after copying

If it arrived by download/AirDrop/message, the recipient runs this once:

```bash
xattr -dr com.apple.quarantine /Applications/Cueflow.app
```

Then it opens normally, forever. Notes:

- On macOS 15+ the old **right-click → Open** workaround is gone. There is no
  GUI-only way around this for an unsigned app; Terminal is required.
- System Settings → Privacy & Security sometimes offers **"Open Anyway"** after a
  blocked attempt. When it appears it works, but it is not reliable across versions.
- The command is safe and specific: it removes the download flag from this app only.

### First launch will ask for permissions

- **Microphone** — required for LTC from an audio interface. Denying it disables LTC.
- **MIDI** — required for MTC.

Both prompts are normal and appear once. The entitlements that permit them live in
`build/entitlements.mac.plist`, which is tracked in git precisely so builds from a
clean clone keep them.

## If you ever do sign it ($99/year)

With a *Developer ID Application* certificate the quarantine problem disappears
entirely — recipients just double-click. In `package.json`:

```json
"mac": {
  "hardenedRuntime": true,
  "identity": "Developer ID Application: NAME (TEAMID)",
  "notarize": { "teamId": "TEAMID" }
}
```

and export `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` before
`npm run dist`. The existing entitlements are already the correct set for hardened
runtime. Nothing else changes.

## Known gaps

- **Electron 29 is past end-of-life** for security fixes. Fine internally; bump it
  before distributing widely.
- **`build.files` is an explicit allow-list.** Anything `main.js` requires must be
  added there or the packaged app throws "Cannot find module" at launch — this has
  already bitten once (`media-protocol.js`).
- **`.cueflow` files** carry the app icon, but double-clicking one launches CueFlow
  without importing it; there is no `open-file` handler yet.
