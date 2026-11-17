// No top-level name declared twice in 37-player.html (2.5.038). The page is
// one file and one name space: a second "function x" quietly replaces the
// first everywhere (2.5.037's new async sameBytes for import replaced the
// tag writers' byte-array sameBytes, so changed artwork stopped being
// written into M4A and FLAC files; caught before release). CLAUDE.md asks
// for a grep before adding one; this makes it a test.
//   node names.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '37-player.html'), 'utf8');
const seen = new Map(), dup = [];
html.split('\n').forEach((line, i)=>{
  const m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)|^(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/.exec(line);
  if(!m) return;
  const name = m[1] || m[2];
  if(seen.has(name)) dup.push(name + ' (lines ' + seen.get(name) + ' and ' + (i + 1) + ')'); else seen.set(name, i + 1);
});
console.log((dup.length ? 'FAIL ' : 'ok   ') + 'no top-level name declared twice' + (dup.length ? ': ' + dup.join(', ') : ' (' + seen.size + ' names)'));
console.log(dup.length ? '1 FAILED' : 'ALL OK');
