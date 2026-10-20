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
print('tests/www/37-player.html written')
