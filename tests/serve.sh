#!/bin/bash
# Starts the two local servers the tests use (leave this running in its own
# terminal; Ctrl-C stops both):
#   http://localhost:8861/        tests/www (the debug copy and test audio)
#   http://127.0.0.1:8870/sync.php  ../sync.php, keeping its data in tests/syncdata
cd "$(dirname "$0")"
python3 make-debug-copy.py || exit 1
mkdir -p syncdata
SYNC37_DATA_DIR="$PWD/syncdata" php -S 127.0.0.1:8870 -t .. > php.log 2>&1 &
PHP=$!
(cd www && python3 -m http.server 8861 > ../http.log 2>&1) &
HTTP=$!
trap "kill $PHP $HTTP" EXIT
echo "Serving. Ctrl-C to stop."
wait
