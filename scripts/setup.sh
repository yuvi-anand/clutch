#!/usr/bin/env bash
# Clutch setup: installs what's missing, signs you in to Claude with your own
# subscription, connects Canvas, and builds the app. Safe to run again any time.
#
#   scripts/setup.sh             full setup
#   scripts/setup.sh --ai        only redo the Claude step
#   scripts/setup.sh --canvas    only redo the Canvas step
#   scripts/setup.sh --no-start  don't offer to open Clutch at the end

set -euo pipefail
cd "$(dirname "$0")/.."
SETUP="$PWD/scripts/setup.sh"

ONLY=""
START=1
for arg in "$@"; do
  case "$arg" in
    --ai) ONLY=ai ;;
    --canvas) ONLY=canvas ;;
    --no-start) START=0 ;;
    -h|--help) sed -n '2,9p' "$SETUP" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

# ---------- output helpers ----------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  B=$(tput bold); DIM=$(tput dim); G=$(tput setaf 2); Y=$(tput setaf 3); R=$(tput setaf 1); C=$(tput setaf 6); N=$(tput sgr0)
else
  B=""; DIM=""; G=""; Y=""; R=""; C=""; N=""
fi
step() { printf "\n%s%s%s\n" "$B$C" "$1" "$N"; }
ok()   { printf "  %s✓%s %s\n" "$G" "$N" "$1"; }
warn() { printf "  %s!%s %s\n" "$Y" "$N" "$1"; }
fail() { printf "  %s✗%s %s\n" "$R" "$N" "$1"; }
info() { printf "  %s\n" "$1"; }
die()  { fail "$1"; exit 1; }

# Read from the keyboard even when this script was piped in (curl … | bash).
ask() { # ask "Question" default(Y|N) -> 0 for yes
  local q="$1" def="${2:-Y}" hint reply
  [ "$def" = Y ] && hint="[Y/n]" || hint="[y/N]"
  printf "  %s %s " "$q" "$hint"
  read -r reply </dev/tty || reply=""
  reply="${reply:-$def}"
  [[ "$reply" =~ ^[Yy] ]]
}
prompt() { # prompt "Label" -> echoes the answer
  local reply
  printf "  %s " "$1" >/dev/tty
  read -r reply </dev/tty || reply=""
  printf "%s" "$reply"
}
open_url() {
  if command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  fi
}
helper() { node scripts/config-helper.mjs "$@"; }

OS="$(uname -s)"
case "$OS" in
  Darwin|Linux) ;;
  *) die "Clutch runs on macOS and Linux. On Windows, install WSL (Ubuntu) and run this inside it." ;;
esac

printf "\n%sClutch setup%s\n" "$B" "$N"
printf "%sCatch up on every class, from your own course materials.%s\n" "$DIM" "$N"

# ---------- 1. Node.js ----------
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)'
}

if [ -z "$ONLY" ]; then
  step "1/4  Node.js"
  if node_ok; then
    ok "Node.js $(node -v)"
  else
    command -v node >/dev/null 2>&1 && warn "Node.js $(node -v) is too old. Clutch needs 20.9 or newer." || warn "Node.js isn't installed."
    if [ "$OS" = Darwin ] && command -v brew >/dev/null 2>&1 && ask "Install it with Homebrew now?" Y; then
      brew install node || die "Homebrew couldn't install Node.js."
    else
      info "Download the LTS installer from ${B}https://nodejs.org${N}, run it, then run this in Terminal:"
      info "  ${B}$SETUP${N}"
      open_url "https://nodejs.org/en/download"
      exit 1
    fi
    node_ok || die "Node.js still isn't available. Open a new Terminal window and run $SETUP"
    ok "Node.js $(node -v)"
  fi

  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    info "Installing Clutch's packages (about a minute the first time)…"
    npm ci --no-audit --no-fund --loglevel=error >/dev/null || die "npm couldn't install the packages. Run 'npm ci' to see why."
  fi
  ok "Packages installed"
else
  node_ok || die "Node.js 20.9+ is missing. Run $SETUP first."
fi

# ---------- 2. Claude (your subscription) ----------
find_claude() {
  local p
  for p in "$(command -v claude 2>/dev/null || true)" "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
    if [ -n "$p" ] && [ -x "$p" ]; then printf "%s" "$p"; return 0; fi
  done
  return 1
}

auth_field() { # auth_field <json> <key>
  printf "%s" "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{s=s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b[78]/g,"");const v=JSON.parse(s.slice(s.indexOf("{")))[process.argv[1]];process.stdout.write(v==null?"":String(v))}catch{}})' "$2"
}

setup_ai() {
  step "2/4  Claude (uses your subscription, no API key)"
  info "${DIM}Northeastern gives every student Claude. Clutch runs on that through the official Claude Code app.${N}"

  local bin
  if ! bin="$(find_claude)"; then
    warn "Claude Code isn't installed yet."
    ask "Install it now? (official installer from claude.ai)" Y || { warn "Skipped. Run $SETUP --ai later."; return 0; }
    curl -fsSL https://claude.ai/install.sh | bash || {
      warn "The installer didn't finish. Trying npm instead…"
      npm install -g @anthropic-ai/claude-code --no-audit --no-fund --loglevel=error || true
    }
    bin="$(find_claude)" || die "Couldn't find Claude Code after installing. Open a new terminal and run $SETUP --ai"
  fi
  ok "Claude Code found ($("$bin" --version </dev/null 2>/dev/null | head -1))"

  local status logged method
  status="$("$bin" auth status </dev/null 2>/dev/null || true)"
  logged="$(auth_field "$status" loggedIn)"
  method="$(auth_field "$status" authMethod)"
  if [ "$logged" = true ] && [ "$method" != "claude.ai" ]; then
    warn "Claude Code is signed in with an API key, which bills per use instead of using your subscription."
    if ask "Sign in with your Claude subscription instead?" Y; then logged=false; fi
  fi
  if [ "$logged" != true ]; then
    info "A browser window will open. Sign in with your ${B}@northeastern.edu${N} account"
    info "(choose ${B}Continue with SSO${N} if it asks), then come back here."
    ask "Ready?" Y || { warn "Skipped. Run $SETUP --ai later."; return 0; }
    "$bin" auth login --claudeai </dev/tty || warn "Sign-in didn't finish."
    status="$("$bin" auth status </dev/null 2>/dev/null || true)"
    logged="$(auth_field "$status" loggedIn)"
    [ "$logged" = true ] || die "Still not signed in. Run $SETUP --ai to try again."
  fi
  local who plan
  who="$(auth_field "$status" email)"; plan="$(auth_field "$status" subscriptionType)"
  ok "Signed in${who:+ as $who}${plan:+ ($plan plan)}"

  # The command Clutch runs for every generation. Tools, settings, plugins and
  # history are all off: it only answers the prompt it's given.
  local cmd
  cmd="'$bin'"' -p --output-format stream-json --verbose --include-partial-messages --tools "" --setting-sources "" --no-session-persistence --disable-slash-commands --strict-mcp-config --system-prompt "$CLUTCH_SYSTEM" --effort "$CLUTCH_EFFORT" ${CLUTCH_SCHEMA:+--json-schema "$CLUTCH_SCHEMA"}'

  info "Testing it with a one-word question…"
  local out
  out="$(cd "${TMPDIR:-/tmp}" && printf 'Reply with exactly the word OK.' | CLUTCH_SYSTEM="You are a connection test. Reply with exactly the word OK." CLUTCH_EFFORT=low CLUTCH_SCHEMA="" /bin/sh -c "$cmd" 2>&1 || true)"
  if printf "%s" "$out" | grep -q '"type":"result"' && printf "%s" "$out" | grep '"type":"result"' | grep -qv '"is_error":true'; then
    printf "%s" "$cmd" | helper set aiCommand
    ok "Claude works. Clutch will use your subscription."
  else
    fail "Claude didn't answer the test."
    printf "%s\n" "$out" | grep '"type":"result"' | sed 's/^/    /' | head -3
    info "Usage limits or a sign-in problem are the usual causes. See docs/troubleshooting.md, then run $SETUP --ai"
    return 1
  fi
}

# ---------- 3. Canvas ----------
setup_canvas() {
  step "3/4  Canvas"
  local name
  if name="$(helper check-canvas-saved 2>/dev/null)"; then
    ok "Already connected as $name"
    ask "Keep this connection?" Y && return 0
  fi

  info "Canvas doesn't let apps sign in for you, so you'll make a personal access token."
  info "It's read by Clutch on this computer only."
  local base
  base="$(prompt "Canvas address [Enter for northeastern.instructure.com]:")"
  base="${base:-https://northeastern.instructure.com}"
  [[ "$base" =~ ^https?:// ]] || base="https://$base"
  base="${base%%/}"

  printf "\n"
  info "${B}In the Canvas page that's opening:${N}"
  info "  1. Scroll to ${B}Approved Integrations${N} and click ${B}+ New Access Token${N}"
  info "  2. Purpose: ${B}Clutch${N}. Expiry: end of the semester, or leave blank"
  info "  3. Click ${B}Generate Token${N} and copy it (Canvas shows it only once)"
  open_url "$base/profile/settings"
  printf "\n"

  local token tries=0 err
  err="$(mktemp)"
  while [ $tries -lt 3 ]; do
    tries=$((tries + 1))
    printf "  Paste the token and press Enter %s(it stays hidden; Enter alone skips)%s: " "$DIM" "$N"
    read -rs token </dev/tty || token=""
    printf "\n"
    token="$(printf "%s" "$token" | tr -d '[:space:]')"
    if [ -z "$token" ]; then rm -f "$err"; warn "Skipped. You can connect Canvas later on the Connect page, or run $SETUP --canvas"; return 0; fi
    if name="$(printf "%s\n%s\n" "$base" "$token" | helper check-canvas 2>"$err")"; then
      rm -f "$err"
      ok "Connected to Canvas as $name"
      return 0
    fi
    fail "$(cat "$err")"
  done
  rm -f "$err"
  warn "Couldn't connect. Run $SETUP --canvas to try again."
}

case "$ONLY" in
  ai) setup_ai; exit $? ;;
  canvas) setup_canvas; exit 0 ;;
esac

setup_ai || true
setup_canvas

# ---------- 4. Build and launcher ----------
step "4/4  Getting Clutch ready"
info "Building the app (a minute or two)…"
mkdir -p data
if npm run build >data/build.log 2>&1; then
  ok "Built"
else
  fail "The build failed. The details are in data/build.log."
  exit 1
fi

LAUNCHER=""
if [ "$OS" = Darwin ] && [ -d "$HOME/Desktop" ]; then
  if [ -e "$HOME/Desktop/Clutch.command" ]; then
    LAUNCHER=1
  elif ask "Put a Clutch icon on your Desktop to open it with a double-click?" Y; then
    printf '#!/bin/sh\nexec "%s/scripts/start.sh"\n' "$PWD" >"$HOME/Desktop/Clutch.command"
    chmod +x "$HOME/Desktop/Clutch.command"
    LAUNCHER=1
    ok "Added Clutch.command to your Desktop"
  fi
fi

printf "\n%s%sAll set.%s\n" "$B" "$G" "$N"
info "Open Clutch any time with ${LAUNCHER:+the ${B}Clutch${N} icon on your Desktop, or }${B}$PWD/scripts/start.sh${N}"
info "Update later with ${B}$PWD/scripts/update.sh${N}"

if [ "$START" = 1 ] && ask "Open Clutch now?" Y; then
  exec scripts/start.sh
fi
