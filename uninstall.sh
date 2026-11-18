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

# The plugin's own commands still running (a refresh, a name lookup), found
# by the plugin's bin/omathor among their arguments, through a link or not,
# and every process they started (curl, jq): everything that can still write.
writer_pids() {
  local own f arg pid p pp changed=1
  local -A found=()
  own="$(readlink -f "$PROJECT_DIR/bin/omathor")"
  for f in /proc/[0-9]*/cmdline; do
    pid="${f#/proc/}"
    pid="${pid%/cmdline}"
    [[ "$pid" == "$$" ]] && continue
    while IFS= read -r -d '' arg; do
      [[ "$arg" == */bin/omathor ]] || continue
      [[ "$(readlink -f "$arg" 2>/dev/null)" == "$own" ]] && { found[$pid]=1; break; }
    done < "$f" 2>/dev/null
  done
  (( ${#found[@]} )) || return 0
  local table
  table="$(ps -e -o pid=,ppid=)"
  while (( changed )); do
    changed=0
    while read -r p pp; do
      [[ -n "${found[$pp]:-}" && -z "${found[$p]:-}" ]] && { found[$p]=1; changed=1; }
    done <<<"$table"
  done
  printf '%s\n' "${!found[@]}"
}

# Stops them: TERM, then KILL what is left. Fails only if something survives.
stop_writers() {
  local -a pids
  local i
  mapfile -t pids < <(writer_pids)
  (( ${#pids[@]} )) || return 0
  log "stopping the plugin's running commands"
  kill -TERM "${pids[@]}" 2>/dev/null || true
  for ((i = 0; i < 50; i++)); do
    [[ -z "$(writer_pids)" ]] && return 0
    sleep 0.1
  done
  mapfile -t pids < <(writer_pids)
  (( ${#pids[@]} )) && kill -KILL "${pids[@]}" 2>/dev/null
  for ((i = 0; i < 20; i++)); do
    [[ -z "$(writer_pids)" ]] && return 0
    sleep 0.1
  done
  return 1
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

# Disabling stops the background service, but a command it already started
# (a refresh, a name lookup) would write after the folder is gone, and its
# error handler creates the folder again. So those are stopped first, and the
# uninstaller fails, rather than report success, if anything is still writing.
if ! stop_writers; then
  log "a running omathor command could not be stopped; $STATE_DIR was left. Run this again."
  exit 1
fi

if [[ -d "$STATE_DIR" ]]; then
  rm -rf "$STATE_DIR"
  log "removed $STATE_DIR"
fi
sleep 1
if [[ -e "$STATE_DIR" || -n "$(writer_pids)" ]]; then
  log "something wrote to $STATE_DIR again while it was removed. Run this again."
  exit 1
fi

if command -v omarchy-shell >/dev/null 2>&1; then
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
fi

log "uninstalled $PLUGIN_ID"
