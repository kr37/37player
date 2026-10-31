#!/usr/bin/env python3
"""Which files in a shared library's folder no version of the library uses.

For a copy of a shared library's folder on disk: a Google Drive library
synced to the computer ("37 Player – Name", with state/ audio/ artwork/
peaks/ inside, e.g. through odrive or Google Drive for desktop), or a
library folder on the droplet (/var/lib/37player/<library>).

Each file in audio/, artwork/ and peaks/ is named <track id>.<revision>. A
version of the library (state/000123.json.gz) lists every track with its
current revision. A file that the versions you keep don't name is either a
replaced revision (re-tagged, converted, Replace audio file) or a deleted
track's: nothing plays it, but History could bring it back from an older
version, so only versions older than you'll ever restore should be let go.

  scripts/shared_unused.py "/path/to/37 Player – Rinzin"            summary
  scripts/shared_unused.py FOLDER --list                            and each file
  scripts/shared_unused.py FOLDER --keep-days 7                     versions from the last 7 days count as kept (default 30)
  scripts/shared_unused.py FOLDER --move-to ~/37p-unused            move them out (not delete)

The newest version always counts as kept. Versions are dated by their file's
modification time. Moving out of a synced Drive folder deletes them from
Drive: they go to Drive's trash, which still counts against the space until
it's emptied.
"""
import argparse, gzip, json, os, re, shutil, sys, time

def load_state(path):
    with open(path, 'rb') as f:
        raw = f.read()
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    return json.loads(raw.decode('utf-8'))

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('folder')
    ap.add_argument('--keep-days', type=float, default=30)
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--move-to')
    a = ap.parse_args()
    st = os.path.join(a.folder, 'state')
    if not os.path.isdir(st):
        sys.exit('No state/ folder in ' + a.folder)
    versions = []
    for n in os.listdir(st):
        m = re.match(r'^(\d{6})\.json(\.gz)?$', n)
        if m:
            versions.append((int(m.group(1)), os.path.join(st, n)))
    if not versions:
        sys.exit('No versions in state/ (on odrive, are they still placeholders?)')
    versions.sort()
    cutoff = time.time() - a.keep_days * 86400
    kept = [v for v in versions if os.path.getmtime(v[1]) >= cutoff]
    if versions[-1] not in kept:
        kept.append(versions[-1])
    used = {'audio': set(), 'artwork': set(), 'peaks': set()}
    unreadable = 0
    for num, path in kept:
        try:
            doc = load_state(path)
        except Exception as e:
            unreadable += 1
            print('  could not read version %d: %s' % (num, e), file=sys.stderr)
            continue
        for t in doc.get('tracks') or []:
            name = '%s.%s' % (t['id'], t.get('audioRev') or '0')
            used['audio'].add(name); used['peaks'].add(name)
            if t.get('hasArtwork'):
                used['artwork'].add('%s.%s' % (t['id'], t.get('artRev') or '0'))
    if unreadable:
        sys.exit('Some kept versions could not be read: nothing is listed, to be safe.')
    print('Versions: %d in all, %d kept (newest %d; the last %g days)' % (len(versions), len(kept), versions[-1][0], a.keep_days))
    total = 0
    unused_files = []
    for kind in ('audio', 'artwork', 'peaks'):
        d = os.path.join(a.folder, kind)
        if not os.path.isdir(d):
            continue
        u_n = u_b = k_n = k_b = 0
        for n in sorted(os.listdir(d)):
            p = os.path.join(d, n)
            if not os.path.isfile(p) or n.startswith('.'):
                continue
            if n.endswith('.cloud') or n.endswith('.cloudf'):
                print('  %s is an odrive placeholder: download the folder first' % os.path.join(kind, n), file=sys.stderr)
                continue
            size = os.path.getsize(p)
            if n in used[kind]:
                k_n += 1; k_b += size
            else:
                u_n += 1; u_b += size; unused_files.append((kind, n, size, p))
        total += u_b
        print('%-8s used: %5d files, %8.1f MB   not used: %5d files, %8.1f MB' % (kind, k_n, k_b / 1e6, u_n, u_b / 1e6))
    print('Not used by the kept versions: %d files, %.1f MB' % (len(unused_files), total / 1e6))
    if a.list:
        for kind, n, size, p in unused_files:
            print('  %s/%s  %.1f MB' % (kind, n, size / 1e6))
    if a.move_to:
        for kind, n, size, p in unused_files:
            dest = os.path.join(os.path.expanduser(a.move_to), kind)
            os.makedirs(dest, exist_ok=True)
            shutil.move(p, os.path.join(dest, n))
        print('Moved %d files to %s' % (len(unused_files), a.move_to))

if __name__ == '__main__':
    main()
