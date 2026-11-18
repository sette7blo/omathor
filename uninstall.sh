#!/usr/bin/env bash
# Reverses install.sh: removes the symlinks and the saved snapshot and
# summary. The settings in shell.json go with the bar entry.

set -euo pipefail

PLUGIN_ID="io.github.sette7blo.omathor"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
PLUGIN_LINK="$CONFIG_HOME/omarchy/plugins/$PLUGIN_ID"
CLI_LINK="$HOME/.local/bin/omathor"
DESKTOP_LINK="$DATA_HOME/applications/omathor.desktop"
STATE_DIR="$STATE_HOME/omarchy/omathor"

log() { printf '[omathor] %s\n' "$*"; }

remove_link() {
  local path="$1"
  if [[ -L "$path" ]]; then
    unlink "$path"
    log "removed $path"
  fi
}

if command -v omarchy >/dev/null 2>&1; then
  omarchy plugin disable "$PLUGIN_ID" >/dev/null 2>&1 || true
fi

# A plugin added with omarchy plugin add is a folder, not a link; omarchy
# plugin remove takes that away.
remove_link "$PLUGIN_LINK"
remove_link "$CLI_LINK"
remove_link "$DESKTOP_LINK"

if [[ -d "$STATE_DIR" ]]; then
  rm -rf "$STATE_DIR"
  log "removed $STATE_DIR"
fi

if command -v omarchy-shell >/dev/null 2>&1; then
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
fi

log "uninstalled $PLUGIN_ID"
