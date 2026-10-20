#!/bin/bash
# Puts 37 Player's converter, ffmpeg.wasm (ffmpeg compiled for browsers), in
# the site's ffmpeg/ folder, next to 37-player.html. Devices download it from
# there the first time something needs converting, and keep it.
# Run on the server, from the site's folder (the git working copy):
#   scripts/get_ffmpeg.sh
# Needs curl and tar. The files (about 32 MB) aren't kept in git. Run it
# again after changing VERSION below to move to another ffmpeg.wasm.
set -e
cd "$(dirname "$0")/.."
VERSION=0.12.10
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://registry.npmjs.org/@ffmpeg/core/-/core-$VERSION.tgz" -o "$tmp/core.tgz"
tar xzf "$tmp/core.tgz" -C "$tmp"
mkdir -p ffmpeg
cp "$tmp/package/dist/umd/ffmpeg-core.js" "$tmp/package/dist/umd/ffmpeg-core.wasm" ffmpeg/
[ -f "$tmp/package/LICENSE" ] && cp "$tmp/package/LICENSE" ffmpeg/LICENSE
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
