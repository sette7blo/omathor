#!/usr/bin/env bash
# Reverses install.sh: removes the symlinks and everything saved in
# ~/.local/state/omarchy/omathor (snapshot, bond summary, THORNames, votes).
# The settings in shell.json go with the bar entry when the plugin is disabled.
# omarchy plugin remove does not run this, so run it first.

set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PLUGIN_ID="io.github.sette7blo.omathor"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
PLUGIN_LINK="$CONFIG_HOME/omarchy/plugins/$PLUGIN_ID"
CLI_LINK="$HOME/.local/bin/omathor"
DESKTOP_LINK="$DATA_HOME/applications/omathor.desktop"
STATE_DIR="$STATE_HOME/omarchy/omathor"

log() { printf '[omathor] %s\n' "$*"; }

# Running omathor commands hold a shared lock for as long as they run (see
# coordinate in bin/omathor). Taking it exclusively waits for them; no process
# is signalled. Same folder as bin/omathor's lock_dir.
lock_dir() {
  local run="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if [[ -d "$run" && -O "$run" ]]; then
    printf '%s/omathor' "$run"
  else
    printf '%s/omarchy/.omathor-run' "$STATE_HOME"
  fi
}

# Removes only links that point into this plugin; a command or launcher of the
# same name from somewhere else stays.
remove_link() {
  local path="$1" target
  [[ -L "$path" ]] || return 0
  target="$(readlink -m "$path")"
  [[ "$target" == "$PROJECT_DIR" || "$target" == "$PROJECT_DIR/"* ]] || return 0
  unlink "$path"
  log "removed $path"
}

if command -v omarchy >/dev/null 2>&1; then
  omarchy plugin disable "$PLUGIN_ID" >/dev/null 2>&1 || true
fi

# A plugin added with omarchy plugin add is a folder, not a link; omarchy
# plugin remove takes that away.
remove_link "$PLUGIN_LINK"
remove_link "$CLI_LINK"
remove_link "$DESKTOP_LINK"

# Disabling stops the background service. A command it already started (a
# refresh, a name lookup) is waited for: the data is deleted while this holds
# the lock exclusively, and the time it finished is recorded, so a command
# that started before then and was waiting for the lock exits without writing.
# If running commands do not finish in time, nothing is deleted and this
# fails, asking to be run again.
WAIT="${OMATHOR_UNINSTALL_WAIT:-90}"
[[ "$WAIT" =~ ^[0-9]{1,4}$ ]] || WAIT=90
if command -v flock >/dev/null 2>&1; then
  LOCK_DIR="$(lock_dir)"
  mkdir -p -m 700 "$LOCK_DIR"
  exec {lock}>>"$LOCK_DIR/lock"
  if ! flock -n -x "$lock"; then
    log "waiting for a running omathor command to finish"
    if ! flock -w "$WAIT" -x "$lock"; then
      log "an omathor command is still running; $STATE_DIR was left. Run this again when it has finished."
      exit 1
    fi
  fi
  if [[ -d "$STATE_DIR" ]]; then
    rm -rf "$STATE_DIR"
    log "removed $STATE_DIR"
  fi
  # The boot and the time since it, as bin/omathor's boot_mark records them.
  read -r up _ < /proc/uptime
  printf '%s %s\n' "$(cat /proc/sys/kernel/random/boot_id)" "${up//./}" > "$LOCK_DIR/removed.tmp"
  mv -f "$LOCK_DIR/removed.tmp" "$LOCK_DIR/removed"
  exec {lock}>&-
else
  log "flock not found, so running omathor commands cannot be waited for"
  if [[ -d "$STATE_DIR" ]]; then
    rm -rf "$STATE_DIR"
    log "removed $STATE_DIR"
  fi
fi

if command -v omarchy-shell >/dev/null 2>&1; then
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
fi

log "uninstalled $PLUGIN_ID"
