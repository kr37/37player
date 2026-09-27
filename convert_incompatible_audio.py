#!/usr/bin/env python3
"""
convert_incompatible_audio.py

Finds audio files under a folder that use a codec browsers (and therefore
37 Player) cannot decode -- ALAC, WMA, and similar -- and converts each one
to AAC, which every current browser handles natively.

SAFETY: before touching anything, every original file is moved into a
backup folder (default: <root>/_originals_before_aac_conversion/),
preserving the same relative folder structure, and the converted AAC file
takes its place at the original path. Nothing is ever deleted. If a
conversion fails partway through, the original is still safely sitting in
the backup folder, untouched.

A file whose container itself is damaged (e.g. ffprobe reports "moov atom
not found") is a different, unrelated problem -- conversion cannot repair
a corrupted file, so these are skipped and listed separately at the end
rather than silently attempted.

Usage:
    python3 convert_incompatible_audio.py /path/to/your/library
    python3 convert_incompatible_audio.py /path/to/your/library --dry-run

Requires ffmpeg/ffprobe to be installed and on PATH.
"""
import subprocess
import sys
import os
import json
import shutil
import argparse
from collections import Counter

AUDIO_EXTENSIONS = {
    '.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.oga', '.opus',
    '.wma', '.ape', '.wv', '.tta', '.aiff', '.aif', '.caf', '.mp2',
    '.amr', '.3gp', '.mp4', '.mov', '.webm', '.mka'
}

BROWSER_SAFE_CODECS = {
    'aac', 'mp3', 'flac', 'vorbis', 'opus',
    'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_u8', 'pcm_f32le', 'pcm_f64le',
}



def probe_streams(filepath):
    """Returns (audio_codec, has_video_stream, error)."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'stream=index,codec_name,codec_type',
             '-of', 'json', filepath],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return None, False, (result.stderr.strip() or "ffprobe failed")
        data = json.loads(result.stdout)
        streams = data.get('streams', [])
        audio_streams = [s for s in streams if s.get('codec_type') == 'audio']
        video_streams = [s for s in streams if s.get('codec_type') == 'video']
        if not audio_streams:
            return None, False, "no audio stream found"
        return audio_streams[0].get('codec_name'), bool(video_streams), None
    except subprocess.TimeoutExpired:
        return None, False, "ffprobe timed out"
    except Exception as e:
        return None, False, str(e)


def convert_file(src_path, dst_path, has_video, target_channels, target_rate, target_bitrate):
    """Converts src_path to AAC at dst_path, normalized to the given channel
    count, sample rate, and bitrate (matches 37 Player's own standardization
    target — see STANDARDIZE_TARGET_CHANNELS/_RATE/_BITRATE in the app
    itself). Safe to apply even when a file already matches: ffmpeg treats
    an already-correct channel count or rate as a no-op rather than
    altering anything. Returns (success, error)."""
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', src_path,
           '-c:a', 'aac', '-b:a', target_bitrate, '-ac', str(target_channels), '-ar', str(target_rate)]
    if has_video:
        cmd += ['-c:v', 'copy']
    else:
        cmd += ['-vn']
    cmd.append(dst_path)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            return False, (result.stderr.strip() or "ffmpeg failed")
        return True, None
    except subprocess.TimeoutExpired:
        return False, "ffmpeg timed out"
    except Exception as e:
        return False, str(e)


def main():
    parser = argparse.ArgumentParser(description="Convert ALAC/WMA/etc. audio files to browser-compatible AAC.")
    parser.add_argument('root', help="Folder to scan recursively")
    parser.add_argument('--dry-run', action='store_true', help="Show what would be converted without changing anything")
    parser.add_argument('--backup-dir', default=None,
                         help="Where to move originals (default: <root>/_originals_before_aac_conversion)")
    parser.add_argument('--channels', type=int, default=2,
                         help="Target channel count, matching 37 Player's standardization target (default: 2)")
    parser.add_argument('--rate', type=int, default=44100,
                         help="Target sample rate in Hz, matching your locked target shown in "
                              "37 Player's Display settings (default: 44100)")
    parser.add_argument('--bitrate', default="192k",
                         help="Target AAC bitrate, matching 37 Player's own STANDARDIZE_TARGET_BITRATE (default: 192k)")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print(f"Not a directory: {root}")
        sys.exit(1)

    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        subprocess.run(['ffprobe', '-version'], capture_output=True, timeout=5)
    except FileNotFoundError:
        print("ffmpeg/ffprobe not found. Install ffmpeg first (e.g. 'sudo apt install ffmpeg').")
        sys.exit(1)

    backup_root = args.backup_dir or os.path.join(root, "_originals_before_aac_conversion")

    all_files = []
    for dirpath, _, filenames in os.walk(root):
        if os.path.abspath(dirpath).startswith(os.path.abspath(backup_root)):
            continue  # never re-scan our own backup folder on a second run
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in AUDIO_EXTENSIONS:
                all_files.append(os.path.join(dirpath, fn))
    all_files.sort()

    to_convert = []     # (path, codec, has_video)
    unreadable = []      # (path, error) -- damaged containers, not a codec problem
    for path in all_files:
        codec, has_video, err = probe_streams(path)
        if err:
            unreadable.append((path, err))
        elif codec not in BROWSER_SAFE_CODECS:
            to_convert.append((path, codec, has_video))

    print(f"Scanned {len(all_files)} audio file(s) under {root}")
    print(f"{len(to_convert)} file(s) need conversion (target: AAC {args.bitrate}, {args.channels}ch, {args.rate}Hz).")
    if unreadable:
        print(f"{len(unreadable)} file(s) have a damaged/unreadable container and will be skipped "
              f"(conversion cannot repair these -- the source needs to be re-obtained):")
        for path, err in unreadable:
            print(f"  {path}\n      -> {err}")
    print()

    if not to_convert:
        print("Nothing to convert.")
        return

    if args.dry_run:
        print("Dry run -- no files will be changed. Would convert:")
        for path, codec, _ in to_convert:
            print(f"  [{codec}]  {path}")
        return

    converted, failed = [], []
    for i, (path, codec, has_video) in enumerate(to_convert, 1):
        rel = os.path.relpath(path, root)
        print(f"[{i}/{len(to_convert)}] {rel} ({codec}) ...", end=' ', flush=True)

        # WMA (and anything else not already in an m4a/mp4 container) gets a
        # .m4a extension for its converted output -- an .m4a filename is
        # what 37 Player (and everything else) expects an AAC file to have.
        base, ext = os.path.splitext(path)
        final_path = base + ".m4a" if ext.lower() != ".m4a" else path

        backup_path = os.path.join(backup_root, rel)
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)

        # Convert from the ORIGINAL location first, writing to a temp file
        # right beside it -- the original is only moved to backup after a
        # successful conversion, so a failure partway through never leaves
        # you without either a working file or the original.
        temp_out = final_path + ".converting.m4a"
        ok, err = convert_file(path, temp_out, has_video, args.channels, args.rate, args.bitrate)
        if not ok:
            if os.path.exists(temp_out): os.remove(temp_out)
            print(f"FAILED: {err}")
            failed.append((path, err))
            continue

        shutil.move(path, backup_path)
        shutil.move(temp_out, final_path)
        print("done")
        converted.append((path, final_path))

    print(f"\nConverted {len(converted)} file(s). Originals backed up under:\n  {backup_root}")
    if failed:
        print(f"\n{len(failed)} file(s) failed to convert and were left untouched:")
        for path, err in failed:
            print(f"  {path}\n      -> {err}")


if __name__ == "__main__":
    main()
