#!/usr/bin/env bash
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/yuvi-anand/clutch/main/scripts/install.sh | bash
#
# Downloads Clutch into ~/Clutch (or $CLUTCH_DIR) and runs the guided setup.

set -euo pipefail
REPO="yuvi-anand/clutch"
REF="${CLUTCH_REF:-main}"
DIR="${CLUTCH_DIR:-$HOME/Clutch}"

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) echo "Clutch runs on macOS and Linux. On Windows, install WSL (Ubuntu) and run this inside it."; exit 1 ;;
esac

if [ -x "$DIR/scripts/setup.sh" ]; then
  echo "Clutch is already in $DIR. Updating it, then rerunning setup."
  "$DIR/scripts/update.sh"
else
  echo "Downloading Clutch into $DIR…"
  # git isn't always there on a fresh Mac (it prompts for developer tools), so fall back to a tarball.
  have_git=0
  if command -v git >/dev/null 2>&1; then
    if [ "$(uname -s)" != Darwin ] || xcode-select -p >/dev/null 2>&1; then have_git=1; fi
  fi
  if [ "$have_git" = 1 ]; then
    git clone --quiet --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$DIR"
  else
    mkdir -p "$DIR"
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" | tar -xz -C "$DIR" --strip-components 1
    mkdir -p "$DIR/data" && printf "%s" "$REF" >"$DIR/data/install-ref"
  fi
fi

chmod +x "$DIR"/scripts/*.sh
exec "$DIR/scripts/setup.sh" </dev/tty
