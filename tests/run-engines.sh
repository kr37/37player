#!/bin/bash
# Runs tests in another engine, through Playwright (engines/adapter.js):
#   ./run-engines.sh webkit                 (every test, as run-all.sh lists them)
#   ./run-engines.sh firefox e2e conv       (just these)
# WebKit is Safari's engine (and the iPad's, and the Mac desktop app's);
# Firefox's is Gecko. Needs Playwright and its browsers:
#   npm i --no-save playwright && npx playwright install --with-deps webkit firefox
# On GitHub: .github/workflows/tests-engines.yml, before a merge to main or when asked.
cd "$(dirname "$0")"
engine="$1"; shift
[ "$engine" = webkit ] || [ "$engine" = firefox ] || [ "$engine" = chromium ] || { echo "usage: $0 webkit|firefox|chromium [tests…]"; exit 2; }
export ENGINE="$engine" NODE_OPTIONS="--require $PWD/engines/hook.js"
exec ./run-all.sh "$@"
