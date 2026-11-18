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

# True while a command of this plugin runs (a refresh, a name lookup), by the
# plugin's own bin/omathor in its arguments, through a link or not.
cli_running() {
  local own f arg
  own="$(readlink -f "$PROJECT_DIR/bin/omathor")"
  for f in /proc/[0-9]*/cmdline; do
    [[ "${f#/proc/}" == "$$/cmdline" ]] && continue
    while IFS= read -r -d '' arg; do
      [[ "$arg" == */bin/omathor ]] || continue
      [[ "$(readlink -f "$arg" 2>/dev/null)" == "$own" ]] && return 0
    done < "$f" 2>/dev/null
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

# Disabling stops the background service, but a refresh it already started
# would write its result after the folder is gone. Each request is capped at
# 25 seconds; after 90 the folder is removed regardless.
for ((i = 0; i < 90; i++)); do
  cli_running || break
  (( i == 0 )) && log "waiting for a running refresh to finish"
  sleep 1
done

if [[ -d "$STATE_DIR" ]]; then
  rm -rf "$STATE_DIR"
  log "removed $STATE_DIR"
fi

if command -v omarchy-shell >/dev/null 2>&1; then
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
fi

log "uninstalled $PLUGIN_ID"
