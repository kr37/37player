#!/bin/bash
# Runs every test, each against a fresh shared library, and prints a summary.
#   CHROME=/usr/bin/google-chrome ./run-all.sh          (all of them; about 15 minutes)
#   ./run-all.sh miss play stoplock                      (just these)
cd "$(dirname "$0")"
[ -f www/ten.mp3 ] || ./make-fixtures.sh || exit 1
mkdir -p shots syncdata
python3 make-debug-copy.py || exit 1
rm -f www/libraries/starter.mp3 # only starter.js serves the starter track; other tests' new libraries start without it
SYNC37_DATA_DIR="$PWD/syncdata" php -S 127.0.0.1:8870 -t .. > php.log 2>&1 &
PHP=$!
(cd www && exec python3 -m http.server 8861 > ../http.log 2>&1) &
HTTP=$!
trap "kill $PHP $HTTP 2>/dev/null" EXIT
sleep 1.5
(cd engine && python3 extract-engine.py > /dev/null && for t in rev-test part-test part2 keepers-test hist-test; do printf "%-10s " "$t"; node $t.js | tail -1; done)
TESTS=${@:-e2e convresume checkwave m4apieces morepieces convpieces fold rev part dup ipad miss miss2 play bridge3 stoplock ph pausesync awk2 pk2 crash retry2 wav long stop af big413 twowin conv conv2 conv3 conv4 conv5 conv6 libs welcome share choose drive moved emptyshared webkitstore damaged starter openwith exportfile allsettings table folderpl plmiss stopimport quota full notloaded dlcrash pieces libdel place phonecols manualbk logs bkcheck split splitter dbl hist undo switchsend swfallback p37 restore}
for t in $TESTS; do
  printf "%-10s " "$t"
  timeout 600 node $t.js "$(./new-library.sh)" "$(./new-library.sh)" > "shots/$t.out" 2>&1
  grep -E "ALL OK|FAILED" "shots/$t.out" | tail -1 || echo "no result (see tests/shots/$t.out)"
done
