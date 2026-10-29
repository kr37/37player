#!/bin/bash
# Pulls a dated copy of the droplet's shared libraries (/var/lib/37player)
# to this computer. Meant for a daily timer on the T470 (see SYNC-SETUP.md,
# section 6); safe to run by hand any time.
#
# Each day is a folder of its own (.../backups/2026-10-21), made with hard
# links to the day before, so an unchanged file takes no extra space. The
# newest 30 days are kept. Nothing is ever deleted because the droplet
# deleted it, and a copy that comes back suspiciously small (the droplet's
# data gone, say) stops the pruning, so the good copies before it stay.
#
# It pulls over SSH with rsync (not through the sshfs mount at /mnt/kr37.net,
# which is far slower), using SSH keys: run from a timer, nobody is there to
# type a password, so it fails rather than waiting for one.
#
#   SRC   where to pull from (default rinzin@kr37.net:/var/lib/37player/)
#   DEST  where the dated folders go (default the Personal-USB folder below)
#   KEEP  how many days to keep (default 30; 3 if the drive can't hard-link)
set -euo pipefail
SRC="${SRC:-rinzin@kr37.net:/var/lib/37player/}"
DEST="${DEST:-/mnt/Docs1/home/rinzin/Documents/Personal-USB/MyOther/37-Player/backups}"
# The folder above DEST must already be there: if the drive isn't mounted,
# stop, rather than quietly making the whole path on the laptop's own disk.
parent="$(dirname "$DEST")"
if [ ! -d "$parent" ]; then
  echo "37 Player backup: $parent isn't there (is the drive mounted?). Nothing done." >&2
  exit 3
fi
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)" # absolute: rsync reads --link-dest relative to the copy it's making
# Hard links keep each day small. A drive that can't make them (exFAT, FAT)
# would get a full copy every day, so fewer days are kept there.
probe="$DEST/.linktest.$$"
links=yes
touch "$probe" && { ln "$probe" "$probe.2" 2>/dev/null || links=no; }
rm -f "$probe" "$probe.2"
if [ "$links" = no ]; then
  KEEP="${KEEP:-3}"
  echo "37 Player backup: this drive can't make hard links, so each day is a full copy; keeping $KEEP." >&2
else
  KEEP="${KEEP:-30}"
fi
today="$(date +%F)"
prev="$(ls -1d "$DEST"/20??-??-?? 2>/dev/null | grep -v "/$today\$" | tail -1 || true)"
work="$DEST/$today.partial"
rm -rf "$work"
if [ -d "$DEST/$today" ]; then mv "$DEST/$today" "$work"; fi
linkdest=()
if [ "$links" = yes ] && [ -n "$prev" ]; then linkdest=(--link-dest="$prev"); fi
# restore.key (Automatic restore's secret, restore.php) stays on the droplet:
# only the web server can read it, and losing it just means devices register
# their details again.
rsync -a -e "ssh -o BatchMode=yes -o ConnectTimeout=20" --exclude=/restore.key "${linkdest[@]}" "$SRC" "$work/"
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
