#!/bin/sh
# Double-click this file in Finder to set up Clutch.
cd "$(dirname "$0")" || exit 1
chmod +x scripts/*.sh
scripts/setup.sh
printf "\nYou can close this window.\n"
