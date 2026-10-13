#!/bin/bash
# Double-click this file in Finder to install Clutch.
# It copies Clutch into ~/Clutch (so the download can be deleted) and runs the guided setup.

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${CLUTCH_DIR:-$HOME/Clutch}"

# Remember which branch this download came from, for updates: a release zip
# says so in .install-ref, and GitHub's own zips are named clutch-<branch>.
REF=""
if [ -f "$SRC/.install-ref" ]; then REF="$(cat "$SRC/.install-ref")"
else case "$(basename "$SRC")" in clutch-*) REF="${SRC##*/clutch-}" ;; esac
fi

if [ "$SRC" != "$DEST" ]; then
  echo "Copying Clutch into $DEST…"
  mkdir -p "$DEST"
  rsync -a --delete --exclude data --exclude node_modules --exclude .next "$SRC"/ "$DEST"/ || { echo "Couldn't copy Clutch into $DEST."; exit 1; }
  if [ -n "$REF" ]; then mkdir -p "$DEST/data" && printf "%s" "$REF" >"$DEST/data/install-ref"; fi
fi

cd "$DEST" || exit 1
chmod +x scripts/*.sh
scripts/setup.sh
status=$?
if [ "$SRC" != "$DEST" ] && [ $status -eq 0 ]; then
  printf "\nClutch is installed in %s. You can delete the folder you downloaded.\n" "$DEST"
fi
printf "\nYou can close this window.\n"
