#!/bin/bash
# Makes a fresh shared library for one test run and prints its join code:
#   node miss.js "$(./new-library.sh)"
cd "$(dirname "$0")"
name="t$(date +%s%N | tail -c 7)"
SYNC37_DATA_DIR="$PWD/syncdata" php ../sync.php create "$name" "Test" "test passphrase number $name" > /dev/null || exit 1
echo "$name test passphrase number $name"
