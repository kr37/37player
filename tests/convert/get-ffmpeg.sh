#!/bin/bash
# Puts ffmpeg.wasm (the community build of ffmpeg for browsers) beside the
# converter test page, in ./ffmpeg/. Run once on the server, in this folder:
#   ./get-ffmpeg.sh
# Needs only curl and tar. The files aren't kept in git (about 32 MB).
set -e
cd "$(dirname "$0")"
VERSION=0.12.10
tmp=$(mktemp -d)
curl -fsSL "https://registry.npmjs.org/@ffmpeg/core/-/core-$VERSION.tgz" -o "$tmp/core.tgz"
tar xzf "$tmp/core.tgz" -C "$tmp"
mkdir -p ffmpeg
cp "$tmp/package/dist/umd/ffmpeg-core.js" "$tmp/package/dist/umd/ffmpeg-core.wasm" ffmpeg/
cp "$tmp/package/LICENSE" ffmpeg/LICENSE 2>/dev/null || true
echo "$VERSION" > ffmpeg/VERSION
rm -rf "$tmp"
ls -la ffmpeg
echo "ffmpeg.wasm $VERSION is in $(pwd)/ffmpeg"
