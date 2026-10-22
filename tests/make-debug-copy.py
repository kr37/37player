#!/usr/bin/env python3
"""Builds tests/www/37-player.html: a copy of ../37-player.html with the test
hooks (debug-hooks.js) added just before the app starts, and one switch tests
need (window.__fakeOut overrides "is there anything to sync?").
The real 37-player.html is never changed."""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, '..', '37-player.html'), encoding='utf-8').read()
hooks = open(os.path.join(here, 'debug-hooks.js'), encoding='utf-8').read()
mark = '(async function init(){'
if mark not in src: sys.exit('Start of the app not found: has init() been renamed?')
src = src.replace(mark, hooks + '\n' + mark, 1)
f = 'function sharedTransfersOutstanding(){'
if f in src: src = src.replace(f, f + '\n  if(window.__fakeOut != null) return window.__fakeOut;', 1)
os.makedirs(os.path.join(here, 'www'), exist_ok=True)
open(os.path.join(here, 'www', '37-player.html'), 'w', encoding='utf-8').write(src)
# old.html: the same, claiming to be an old version (for twowin.js)
import re
old = re.sub(r'<meta name="app-version" content="[^"]+"', '<meta name="app-version" content="1.0.000"', src, count=1)
open(os.path.join(here, 'www', 'old.html'), 'w', encoding='utf-8').write(old)
# the manifest, so the test copy links a real one (openwith.js); not sw.js,
# whose caching would change what the other tests see
import shutil
shutil.copyfile(os.path.join(here, '..', 'manifest.webmanifest'), os.path.join(here, 'www', 'manifest.webmanifest'))
print('tests/www/37-player.html and old.html written')
