#!/bin/sh
# Copies mods/pomodoro into Herdr and keeps the copy in step while you edit, so
# Herdr hot-reloads it. Not a symlink: Herdr loads code through one but doesn't
# see edits behind it, and won't load icons from outside its home folder.
# HERDR_APP_HOME picks another Herdr home (default ~/.config/herdr-app).
set -eu

SRC="$(cd "$(dirname "$0")/../mods/pomodoro" && pwd)"
DEST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/pomodoro"

# An earlier version of this script linked the folder.
[ -L "$DEST" ] && rm "$DEST"

# Leaves alone what Herdr writes into the folder itself.
sync() {
  rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' --exclude '.*' "$SRC/" "$DEST/"
}

errors() {
  sleep 1
  herdr-app status 2>/dev/null | python3 -c 'import json, sys
for e in json.load(sys.stdin).get("errors", []): print("  " + e.strip())' || true
}

stamp="$(mktemp)"
trap 'rm -f "$stamp"' EXIT
sync
echo "copied $SRC -> $DEST"
echo "watching for changes (ctrl-c to stop)"
while sleep 1; do
  changed="$(find "$SRC" -newer "$stamp" ! -name jsconfig.json ! -name '*.d.ts' ! -name '.*' -print -quit)"
  [ -z "$changed" ] && continue
  touch "$stamp"
  sync
  echo "$(date +%H:%M:%S) reloaded ($(basename "$changed"))"
  errors
done
