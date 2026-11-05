#!/bin/bash
# Puts 37 Player's converter, ffmpeg.wasm, beside the converter test page, in
# ./ffmpeg/: the same build the app uses (scripts/get_ffmpeg.sh: our 0.12.10
# without SIMD). Run once on the server, in this folder:
#   ./get-ffmpeg.sh
# Needs curl and sha256sum. The files aren't kept in git (about 26 MB).
set -e
cd "$(dirname "$0")"
here=$(pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" && cp ../../scripts/get_ffmpeg.sh "$tmp/scripts/"
"$tmp/scripts/get_ffmpeg.sh" > /dev/null
mkdir -p ffmpeg
cp "$tmp/ffmpeg/ffmpeg-core.js" "$tmp/ffmpeg/ffmpeg-core.wasm" "$tmp/ffmpeg/VERSION" ffmpeg/
ls -la ffmpeg
echo "ffmpeg.wasm $(cat ffmpeg/VERSION) is in $here/ffmpeg"
