#!/usr/bin/env python3
"""
scan_incompatible_audio.py

Recursively scans a folder for audio files and reports which ones use a
codec that browsers (and therefore 37 Player) cannot decode at all -- the
same failure mode as the ALAC .m4a files found this session -- so they can
all be found and converted at once, rather than discovered one at a time
mid-event.

This checks the actual audio codec inside each file (via ffprobe), not
just the file extension -- a .m4a can contain AAC (fine) or ALAC (not
fine), and this tells them apart.

Usage:
    python3 scan_incompatible_audio.py /path/to/your/library [report.txt]

Requires ffprobe (part of ffmpeg) to be installed and on PATH.
"""
import subprocess
import sys
import os
import json
from collections import Counter

AUDIO_EXTENSIONS = {
    '.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.oga', '.opus',
    '.wma', '.ape', '.wv', '.tta', '.aiff', '.aif', '.caf', '.mp2',
    '.amr', '.3gp', '.mp4', '.mov', '.webm', '.mka'
}

# Codecs known to decode reliably in Chrome/Firefox's <audio> element --
# everything else gets flagged. Deliberately an allowlist, not a denylist:
# a false "you should check this one" costs a moment of your time; a false
# "this one's fine" costs you finding out mid-event.
BROWSER_SAFE_CODECS = {
    'aac', 'mp3', 'flac', 'vorbis', 'opus',
    'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_u8', 'pcm_f32le', 'pcm_f64le',
}


def get_audio_codec(filepath):
    """Returns (codec_name, error) for the first audio stream in the file."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
             '-show_entries', 'stream=codec_name',
             '-of', 'json', filepath],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return None, (result.stderr.strip() or "ffprobe failed")
        data = json.loads(result.stdout)
        streams = data.get('streams', [])
        if not streams:
            return None, "no audio stream found"
        return streams[0].get('codec_name'), None
    except subprocess.TimeoutExpired:
        return None, "ffprobe timed out"
    except Exception as e:
        return None, str(e)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scan_incompatible_audio.py /path/to/library [report.txt]")
        sys.exit(1)
    root = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "incompatible_audio_report.txt"

    if not os.path.isdir(root):
        print(f"Not a directory: {root}")
        sys.exit(1)

    try:
        subprocess.run(['ffprobe', '-version'], capture_output=True, timeout=5)
    except FileNotFoundError:
        print("ffprobe not found. Install ffmpeg first (e.g. 'sudo apt install ffmpeg').")
        sys.exit(1)

    all_files = []
    for dirpath, _, filenames in os.walk(root):
        if "_originals_before_aac_conversion" in dirpath.split(os.sep):
            continue  # the conversion script's backup folder (and anything nested inside it) -- deliberately-kept originals, not a fresh problem to report
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in AUDIO_EXTENSIONS:
                all_files.append(os.path.join(dirpath, fn))
    all_files.sort()

    total = len(all_files)
    print(f"Found {total} audio file(s) under {root}\n")

    flagged = []       # (path, codec)
    errors = []        # (path, error message)
    codec_counts = Counter()

    for i, path in enumerate(all_files, 1):
        codec, err = get_audio_codec(path)
        if err:
            errors.append((path, err))
        else:
            codec_counts[codec] += 1
            if codec not in BROWSER_SAFE_CODECS:
                flagged.append((path, codec))
        if i % 25 == 0 or i == total:
            print(f"  scanned {i}/{total}...", end='\r')
    print()

    flagged_codec_counts = Counter(codec for _, codec in flagged)

    with open(out_path, 'w') as f:
        f.write(f"Scanned {total} audio file(s) under {root}\n")
        f.write(f"{len(flagged)} file(s) use a codec 37 Player (and browsers generally) cannot play.\n\n")

        if flagged_codec_counts:
            f.write("By codec:\n")
            for codec, count in flagged_codec_counts.most_common():
                f.write(f"  {codec}: {count} file(s)\n")
            f.write("\n")

        f.write("Files:\n\n")
        for path, codec in flagged:
            f.write(f"  [{codec}]  {path}\n")

        if errors:
            f.write(f"\n{len(errors)} file(s) could not be checked "
                     f"(corrupt, unusual container, or ffprobe error):\n\n")
            for path, err in errors:
                f.write(f"  {path}\n      -> {err}\n")

    print(f"\nDone.")
    print(f"  {len(flagged)} incompatible file(s) across {len(flagged_codec_counts)} codec(s)")
    print(f"  {len(errors)} file(s) could not be checked")
    print(f"Full report written to: {out_path}")


if __name__ == "__main__":
    main()
