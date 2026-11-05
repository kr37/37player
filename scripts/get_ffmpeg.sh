#!/bin/bash
# Puts 37 Player's converter, ffmpeg.wasm (ffmpeg compiled for browsers), in
# the site's ffmpeg/ folder, next to 37-player.html. Devices download it from
# there the first time something needs converting, and keep it.
# Run on the server, from the site's folder (the git working copy):
#   scripts/get_ffmpeg.sh
# Needs curl and sha256sum. The files (about 26 MB) aren't kept in git.
#
# Since 1.4.166 it's our own build of ffmpeg.wasm 0.12.10 without WebAssembly
# SIMD (.github/workflows/ffmpeg-nosimd.yml, on the ffmpeg-nosimd branch),
# published as a pre-release of this repository. The standard build needs
# SIMD, and webviews without it (the desktop app on macOS 12, Safari before
# 16.4) refuse the whole file. Same ffmpeg, same output byte for byte, a few
# percent slower (AAC a quarter); see NOTES.md. The checksums are the
# release's SHA256SUMS. To move to another build, change TAG and the sums.
set -e
cd "$(dirname "$0")/.."
TAG=ffmpeg-core-0.12.10-nosimd
VERSION=0.12.10-nosimd
JS_SHA256=c7306ec4ff9a929cf28695d3ffdf52bfd79f2bb4cc19673335ea297d425ce081
WASM_SHA256=153b85030fc924a0a767ca2a59cdccdaf8d29e0a2c1c72bbae837bb74d11ed06
BASE="https://github.com/kr37/37player/releases/download/$TAG"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$BASE/ffmpeg-core.js" -o "$tmp/ffmpeg-core.js"
curl -fsSL "$BASE/ffmpeg-core.wasm" -o "$tmp/ffmpeg-core.wasm"
printf '%s  %s\n' "$JS_SHA256" ffmpeg-core.js "$WASM_SHA256" ffmpeg-core.wasm > "$tmp/SHA256SUMS"
(cd "$tmp" && sha256sum -c --quiet SHA256SUMS)
mkdir -p ffmpeg
cp "$tmp/ffmpeg-core.js" "$tmp/ffmpeg-core.wasm" ffmpeg/
echo "$VERSION" > ffmpeg/VERSION
# Copies of 37 Player opened from a file fetch these from the site, so they
# need CORS, like libraries/. Used when the vhost allows .htaccess files;
# otherwise put the same lines in the vhost (see SYNC-SETUP.md).
cat > ffmpeg/.htaccess <<'HT'
<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "*"
</IfModule>
AddType application/wasm .wasm
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE application/wasm text/javascript application/javascript
</IfModule>
HT
ls -la ffmpeg
echo "ffmpeg.wasm $VERSION is in $(pwd)/ffmpeg"
