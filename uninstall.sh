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

# 1. The plugin is turned off, and that is checked with the running shell:
# while it is on, its service starts commands and writes its summary. The
# service runs while the shell's configuration lists the plugin anywhere: in
# the bar layout or in the top-level plugins list (the bar status that
# listPlugins reports covers only the first). One disable removes one such
# entry, so it is repeated until none is left, checked in the shell's live
# configuration. If that cannot be confirmed, nothing is changed.
known_to_shell() {
  local n
  n="$(omarchy-shell shell listPlugins 2>/dev/null | jq -r --arg id "$PLUGIN_ID" '[.[]? | select(.id == $id)] | length' 2>/dev/null)" || return 2
  [[ "$n" =~ ^[0-9]+$ ]] || return 2
  (( n > 0 ))
}
entries_in_config() {
  omarchy-shell shell listShellConfig 2>/dev/null | jq -r --arg id "$PLUGIN_ID" '
    def ids: if type == "object" then (.id // "" | tostring) elif type == "string" then . else "" end;
    ([.bar.layout // {} | objects | .[] | arrays | .[] | ids]
     + [.plugins // [] | arrays | .[] | ids]
     + [.bar.id // "" | tostring])
    | map(select(. == $id)) | length' 2>/dev/null
}
service_off() {
  local known=0 n
  known_to_shell || known=$?
  (( known == 2 )) && return 1
  # A plugin the shell does not know has no service running.
  (( known == 1 )) && return 0
  n="$(entries_in_config)" || return 1
  [[ "$n" =~ ^[0-9]+$ ]] && (( n == 0 ))
}
if ! command -v omarchy >/dev/null 2>&1 || ! command -v omarchy-shell >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  log "omarchy, omarchy-shell or jq not found, so $PLUGIN_ID cannot be turned off; nothing was removed"
  exit 1
fi
# The exit status of disable is not what counts (it also fails for a plugin
# the shell does not know); the shell's configuration is.
for ((i = 0; i < 5; i++)); do
  service_off && break
  omarchy plugin disable "$PLUGIN_ID" >/dev/null 2>&1 || true
done
if ! service_off; then
  log "could not turn $PLUGIN_ID off (is the Omarchy shell running?); nothing was removed. Run this again from your desktop session."
  exit 1
fi

# 2. A command already started (a refresh, a name lookup) is waited for: the
# rest happens while this holds the lock exclusively, and the time it
# finished is recorded, so a command that started before then and was
# waiting for the lock exits without writing. If running commands do not
# finish in time, nothing is removed and this fails, asking to be run again.
WAIT="${OMATHOR_UNINSTALL_WAIT:-90}"
[[ "$WAIT" =~ ^[0-9]{1,4}$ ]] || WAIT=90
lock=""
if command -v flock >/dev/null 2>&1; then
  LOCK_DIR="$(lock_dir)"
  mkdir -p -m 700 "$LOCK_DIR"
  exec {lock}>>"$LOCK_DIR/lock"
  if ! flock -n -x "$lock"; then
    log "waiting for a running omathor command to finish"
    if ! flock -w "$WAIT" -x "$lock"; then
      log "an omathor command is still running; nothing was removed (the plugin stays turned off). Run this again when it has finished."
      exit 1
    fi
  fi
else
  log "flock not found, so running omathor commands cannot be waited for"
fi

# 3. Only now is anything removed. A plugin added with omarchy plugin add is
# a folder, not a link; omarchy plugin remove takes that away.
remove_link "$PLUGIN_LINK"
remove_link "$CLI_LINK"
remove_link "$DESKTOP_LINK"
if [[ -d "$STATE_DIR" ]]; then
  rm -rf "$STATE_DIR"
  log "removed $STATE_DIR"
fi
if [[ -n "$lock" ]]; then
  # The boot and the time since it, as bin/omathor's boot_mark records them.
  read -r up _ < /proc/uptime
  printf '%s %s\n' "$(cat /proc/sys/kernel/random/boot_id)" "${up//./}" > "$LOCK_DIR/removed.tmp"
  mv -f "$LOCK_DIR/removed.tmp" "$LOCK_DIR/removed"
  exec {lock}>&-
fi

# 4. Success is reported only if nothing wrote the folder again (a summary
# the shell was writing as the plugin went off, say).
sleep 1
if [[ -e "$STATE_DIR" ]]; then
  log "$STATE_DIR was written again while it was removed. Run this again."
  exit 1
fi

if command -v omarchy-shell >/dev/null 2>&1; then
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
fi

log "uninstalled $PLUGIN_ID"
