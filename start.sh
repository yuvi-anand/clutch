#!/usr/bin/env bash
# Opens Clutch: starts it on this computer (if it isn't running) and opens your browser.
# Keep the window open while you study; close it, or press Ctrl+C, to stop Clutch.
#
#   CLUTCH_PORT=3200 ./start.sh     use a different port (default 3100)
#   CLUTCH_NO_BROWSER=1 ./start.sh  don't open the browser

set -euo pipefail
cd "$(dirname "$0")"
PORT="${CLUTCH_PORT:-3100}"
URL="http://127.0.0.1:$PORT"

open_url() {
  if [ -n "${CLUTCH_NO_BROWSER:-}" ]; then echo "Open $1 in your browser."
  elif command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  else echo "Open $1 in your browser."
  fi
}

# Double-clicked launchers get a bare PATH; add the usual places Node lives.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin"
command -v node >/dev/null 2>&1 || { echo "Node.js isn't installed. Run ./setup.sh first."; exit 1; }
[ -d node_modules ] || { echo "Clutch isn't set up yet. Run ./setup.sh first."; exit 1; }

# Already running? Just open it.
if curl -fs --max-time 2 "$URL/api/status" 2>/dev/null | grep -q '"engine"'; then
  echo "Clutch is already running at $URL"
  open_url "$URL"
  exit 0
fi
if curl -s --max-time 2 -o /dev/null "$URL" 2>/dev/null; then
  echo "Something else is using port $PORT. Run: CLUTCH_PORT=3101 ./start.sh"
  exit 1
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "Building Clutch (first run only, a minute or two)…"
  mkdir -p data
  npm run build >data/build.log 2>&1 || { echo "Build failed. See data/build.log."; exit 1; }
fi

# Open the browser once the server answers.
( for _ in $(seq 1 60); do
    curl -fs --max-time 1 -o /dev/null "$URL/api/status" 2>/dev/null && { open_url "$URL"; exit 0; }
    sleep 0.5
  done ) &

echo ""
echo "  Clutch is running at $URL"
echo "  Keep this window open while you use it. Close it or press Ctrl+C to stop."
echo ""
exec node_modules/.bin/next start -H 127.0.0.1 -p "$PORT"
