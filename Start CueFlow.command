#!/bin/bash
# Double-click me in Finder to launch CueFlow.
#
# Runs `npm start` (Electron) from this folder and leaves the window open, so the
# LAN server URL — and any errors — stay visible while the show runs.

cd "$(dirname "$0")" || exit 1

# Finder launches this with a login shell, but GUI sessions can still miss the PATH
# that node was installed into (nvm, Homebrew). Fill in the usual suspects if npm
# isn't already on it.
if ! command -v npm >/dev/null 2>&1; then
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Couldn't find npm. Install Node.js (https://nodejs.org) and try again."
  echo
  read -r -p "Press Return to close…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 First run — installing dependencies…"
  npm install || { echo "❌ npm install failed."; read -r -p "Press Return to close…"; exit 1; }
fi

echo "🎬 Starting CueFlow…"
echo "   (Quitting the app also stops the LAN server. Close this window when done.)"
echo
npm start

echo
echo "CueFlow has quit."
read -r -p "Press Return to close…"
