#!/usr/bin/env python3
"""
generate_library_manifest.py

Scans a folder of .zip library exports and builds/updates manifest.json for
37 Player's "Browse server libraries" feature (Settings icon bar -> the
cloud icon). Safe to re-run at any time: existing entries (label, date,
requiresPurchaseConfirmation) are preserved for files that are still
present, so hand-edits you've already made never get clobbered. A brand
new .zip gets a placeholder entry, ready for you to rename and flag by hand.

Usage:
    python3 generate_library_manifest.py /path/to/a/libraries

Typical workflow:
    1. Export a library or folder from 37 Player as a .zip, drop it into
       your libraries folder on the server.
    2. Run this script against that folder.
    3. Open the manifest.json it wrote, rename the new entry's "label" to
       something a person would recognize, and add
       "requiresPurchaseConfirmation": true to any entry that should show
       the "I have bought these from tharpa.com" checkbox before import.
    4. Re-running later (after adding more .zips) never touches what
       you've already edited -- only new or removed files change.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser(
        description="Generate/update manifest.json for 37 Player's server-library browsing feature."
    )
    parser.add_argument("folder", help="Folder containing .zip library exports (manifest.json is written here too)")
    args = parser.parse_args()

    folder = os.path.abspath(args.folder)
    if not os.path.isdir(folder):
        print(f"Not a directory: {folder}")
        sys.exit(1)

    manifest_path = os.path.join(folder, "manifest.json")
    existing = {}
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                for entry in json.load(f):
                    if "file" in entry:
                        existing[entry["file"]] = entry
        except Exception as e:
            print(f"Warning: couldn't read existing manifest.json ({e}) -- starting fresh")

    zip_files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".zip"))
    if not zip_files:
        print(f"No .zip files found in {folder}")
        sys.exit(0)

    new_manifest = []
    added, kept = [], []
    for fname in zip_files:
        full_path = os.path.join(folder, fname)
        size = os.path.getsize(full_path)
        mtime = datetime.fromtimestamp(os.path.getmtime(full_path), tz=timezone.utc).strftime("%Y-%m-%d")
        if fname in existing:
            entry = dict(existing[fname])  # preserves label, requiresPurchaseConfirmation, and any other hand-added field
            entry["size"] = size  # kept fresh in case the file was regenerated
            entry.setdefault("date", mtime)
            new_manifest.append(entry)
            kept.append(fname)
        else:
            new_manifest.append({
                "file": fname,
                "label": os.path.splitext(fname)[0],  # placeholder -- rename this to something a person would recognize
                "size": size,
                "date": mtime,
            })
            added.append(fname)

    removed = [f for f in existing if f not in zip_files]

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(new_manifest, f, indent=2, ensure_ascii=False)

    print(f"Wrote {manifest_path}")
    print(f"  {len(kept)} existing entr{'y' if len(kept)==1 else 'ies'} kept (label/flags preserved)")
    if added:
        print(f"  {len(added)} new entr{'y' if len(added)==1 else 'ies'} added with a placeholder label -- edit manifest.json to rename:")
        for fn in added:
            print(f"    - {fn}")
    if removed:
        print(f"  {len(removed)} entr{'y' if len(removed)==1 else 'ies'} no longer present as a file, dropped from the manifest:")
        for fn in removed:
            print(f"    - {fn}")


if __name__ == "__main__":
    main()
