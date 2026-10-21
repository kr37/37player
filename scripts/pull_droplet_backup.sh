#!/bin/bash
# Pulls a dated copy of the droplet's shared libraries (/var/lib/37player)
# to this computer. Meant for a daily timer on the T470 (see SYNC-SETUP.md,
# section 6); safe to run by hand any time.
#
# Each day is a folder of its own (~/backups/37player/2026-10-21), made with
# hard links to the day before, so an unchanged file takes no extra space.
# The newest 30 days are kept. Nothing is ever deleted because the droplet
# deleted it, and a copy that comes back suspiciously small (the droplet's
# data gone, say) stops the pruning, so the good copies before it stay.
#
#   SRC   where to pull from (default kr37:/var/lib/37player/)
#   DEST  where the dated folders go (default ~/backups/37player)
#   KEEP  how many days to keep (default 30)
set -euo pipefail
SRC="${SRC:-kr37:/var/lib/37player/}"
DEST="${DEST:-$HOME/backups/37player}"
KEEP="${KEEP:-30}"
mkdir -p "$DEST"
today="$(date +%F)"
prev="$(ls -1d "$DEST"/20??-??-?? 2>/dev/null | grep -v "/$today\$" | tail -1 || true)"
work="$DEST/$today.partial"
rm -rf "$work"
if [ -d "$DEST/$today" ]; then mv "$DEST/$today" "$work"; fi
rsync -a ${prev:+--link-dest="$prev"} "$SRC" "$work/"
mv "$work" "$DEST/$today"
count() { find "$1" -type f | wc -l; }
now_n=$(count "$DEST/$today")
if [ -n "$prev" ]; then
  prev_n=$(count "$prev")
  if [ "$now_n" -lt $(( prev_n / 2 )) ]; then
    echo "37 Player backup: $today has $now_n files, $prev has $prev_n. Not pruning old copies; check the droplet." >&2
    exit 2
  fi
fi
ls -1d "$DEST"/20??-??-?? | head -n -"$KEEP" | xargs -r rm -rf
echo "37 Player backup: $DEST/$today ($now_n files)"
