#!/usr/bin/env python3
"""Pulls the sync merge engine (between SYNC-MERGE:BEGIN and END in
37-player.html) into engine.js, so its tests run in plain Node:
   python3 extract-engine.py && node rev-test.js && node part-test.js && node part2.js"""
import os
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, '..', '..', '37-player.html'), encoding='utf-8').read()
a = s.index('/* SYNC-MERGE:BEGIN */'); b = s.index('/* SYNC-MERGE:END */') + len('/* SYNC-MERGE:END */')
out = s[a:b] + '\nmodule.exports={syncReviewRows,syncApplyReview,syncDefaultChoice,syncApplyDependencies,syncMerge,syncEq,syncMergePartial,syncClassifyPartial};\n'
open(os.path.join(here, 'engine.js'), 'w', encoding='utf-8').write(out)
print('engine/engine.js written')
