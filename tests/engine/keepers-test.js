// Who backs up the shared library (doc.keepers): merged per device.
const E = require('./engine.js');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const M = E.syncMergeKeepers, eq = (a,b)=> JSON.stringify(a)===JSON.stringify(b);
ok(M(undefined, undefined, undefined) === undefined, 'none anywhere: none');
ok(eq(M(undefined, {laptop: 5}, undefined), {laptop: 5}), 'a first keeper here goes up');
ok(eq(M(undefined, undefined, {laptop: 5}), {laptop: 5}), 'a keeper from elsewhere comes down');
ok(eq(M({laptop: 5}, {laptop: 9}, {laptop: 5}), {laptop: 9}), 'a newer backup here wins');
ok(eq(M({laptop: 5}, {laptop: 5}, {laptop: 7, mac: 3}), {laptop: 7, mac: 3}), 'newer and new ones from elsewhere arrive');
ok(eq(M({laptop: 5}, {laptop: 9}, {laptop: 7}), {laptop: 9}), 'both changed: the later time');
ok(M({laptop: 5}, {}, {laptop: 5}) === undefined, 'a keeper that stopped here is removed');
ok(eq(M({laptop: 5}, {}, {laptop: 8}), {laptop: 8}), 'stopped here but backed up again elsewhere: kept');
ok(eq(M({laptop: 5, mac: 2}, {laptop: 5, mac: 2}, {laptop: 5}), {laptop: 5}), 'removed elsewhere: removed here');
console.log(fails? fails+' FAILED':'ALL OK');
