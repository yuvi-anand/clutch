#!/usr/bin/env bash
# Updates Clutch to the newest version. Your guides, notes and connections in data/ are kept.

set -euo pipefail
cd "$(dirname "$0")/.."
REPO="yuvi-anand/clutch"
# A download (not a git clone) remembers which branch it came from.
REF="${CLUTCH_REF:-$(cat data/install-ref 2>/dev/null || echo main)}"

if [ -d .git ]; then
  echo "Downloading the newest version…"
  git pull --ff-only || { echo "Couldn't update automatically (you may have edited files). Run 'git status' to see."; exit 1; }
else
  echo "Downloading the newest version…"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" | tar -xz -C "$tmp" --strip-components 1
  rsync -a --delete --exclude data --exclude node_modules --exclude .next "$tmp"/ ./
fi

echo "Installing packages…"
npm ci --no-audit --no-fund --loglevel=error >/dev/null
echo "Rebuilding…"
mkdir -p data
npm run build >data/build.log 2>&1 || { echo "Build failed. See data/build.log."; exit 1; }
echo "Updated. If Clutch is open, close its window and start it again."
