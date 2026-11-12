#!/usr/bin/env python3
"""Surveys 37 Player library folders: for each one, its name and ID (from
"37 Player library.json"), how big it is, what's waiting to be deleted
(orphans.json, the waiting list), and audio files that look like copies of
each other (the same size and the same file name in different folders).
Reads only; changes nothing.

    python3 survey-libraries.py ~/Music/"37 Player Libraries"

(12 Nov 2026: Gen Rinzin saw an album's recordings copied with each rename
on the T470, in Chrome, while one of them was playing.)
"""
import json, os, sys, time
from collections import defaultdict

MARKER = "37 Player library.json"
OWN = "37 Player's own files"

def size_text(n):
    for unit in ("bytes", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1024

def when(ms):
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(ms / 1000))

def walk_files(top):
    for dirpath, _, files in os.walk(top):
        for f in files:
            p = os.path.join(dirpath, f)
            try:
                yield p, os.path.getsize(p)
            except OSError:
                pass

def survey(lib):
    try:
        with open(os.path.join(lib, MARKER), encoding="utf-8") as f:
            marker = json.load(f)
    except (OSError, ValueError):
        marker = {}
    print("=" * 72)
    print(os.path.basename(lib.rstrip("/")))
    print(f"  library: {marker.get('name', '?')}  (id {marker.get('id', '?')}"
          + (f", made {when(marker['createdAt'])}" if marker.get("createdAt") else "") + ")")
    total = sum(s for _, s in walk_files(lib))
    music = os.path.join(lib, "music")
    music_files = list(walk_files(music)) if os.path.isdir(music) else []
    print(f"  size: {size_text(total)}; music/: {len(music_files)} files, {size_text(sum(s for _, s in music_files))}")
    old_audio = os.path.join(lib, "audio")
    if os.path.isdir(old_audio):
        files = list(walk_files(old_audio))
        print(f"  audio/ (older layout): {len(files)} files, {size_text(sum(s for _, s in files))}")

    # The waiting list: in "37 Player's own files", or at the top in an older library.
    own = os.path.join(lib, OWN) if os.path.isdir(os.path.join(lib, OWN)) else lib
    try:
        with open(os.path.join(own, "orphans.json"), encoding="utf-8") as f:
            ledger = json.load(f) or {}
    except (OSError, ValueError):
        ledger = {}
    if ledger:
        present, gone, size_waiting = 0, 0, 0
        for path in ledger:
            full = os.path.join(lib, path[1:]) if path.startswith("/") else os.path.join(own, path)
            if os.path.exists(full):
                present += 1
                size_waiting += os.path.getsize(full) if os.path.isfile(full) else 0
            else:
                gone += 1
        times = sorted(ledger.values())
        print(f"  waiting to be deleted: {len(ledger)} ({present} still there, {size_text(size_waiting)}; {gone} already gone),"
              f" listed from {when(times[0])} to {when(times[-1])}")
        music_waiting = [p for p in ledger if p.startswith("/music/")]
        for p in sorted(music_waiting, key=lambda p: ledger[p])[-8:]:
            print(f"    since {when(ledger[p])}: {p[1:]}")
        if len(music_waiting) > 8:
            print(f"    … and {len(music_waiting) - 8} more under music/")
    else:
        print("  waiting to be deleted: nothing")

    # Likely copies: the same file name (" (2)" set aside) and size in two or more album folders.
    groups = defaultdict(list)
    for p, s in music_files:
        name = os.path.basename(p)
        stem, ext = os.path.splitext(name)
        if stem.endswith(")") and " (" in stem:
            stem = stem[:stem.rfind(" (")]
        groups[(stem.lower() + ext.lower(), s)].append(os.path.relpath(p, lib))
    copies = {k: v for k, v in groups.items() if len(v) > 1}
    if copies:
        extra = sum(k[1] * (len(v) - 1) for k, v in copies.items())
        print(f"  likely copies: {len(copies)} recordings found more than once, {size_text(extra)} extra")
        for k, v in sorted(copies.items(), key=lambda kv: -kv[0][1] * (len(kv[1]) - 1))[:6]:
            print(f"    {size_text(k[1])} ×{len(v)}:")
            for p in v:
                print(f"      {p}")
        if len(copies) > 6:
            print(f"    … and {len(copies) - 6} more")
    else:
        print("  likely copies: none")

def main():
    top = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Music/37 Player Libraries")
    libs = [top] if os.path.exists(os.path.join(top, MARKER)) else sorted(
        os.path.join(top, d) for d in os.listdir(top) if os.path.exists(os.path.join(top, d, MARKER)))
    if not libs:
        print("No library folders (with a \"37 Player library.json\") in " + top)
    for lib in libs:
        survey(lib)

if __name__ == "__main__":
    main()
