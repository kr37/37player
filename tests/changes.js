// What each version changed (2.5.015), on sync.php: worked out by the server
// at each save and kept in the version's info file; op=changes hands them to
// a device after a given version; the device keeps an index and answers "in
// which versions did this playlist (or track) change?" without opening a
// version. Versions saved before this existed are built once by opening each
// one ("build"). Then timings on a library of 2000 tracks.
//   node changes.js "$(./new-library.sh)"     (needs serve.sh's two servers)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), {execSync} = require('child_process'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', LIB = CODE.split(' ')[0];
const DATA = path.join(__dirname, 'syncdata', LIB);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } };
const waitIdle = async (p)=>{ for(let k=0;k<600;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const sync = async p=>{ await p.evaluate(()=> window.__dbg3.sync()); await sleep(500); await waitIdle(p); };
const edit = (p, src)=> p.evaluate(async (src)=>{ const r = window.__dbg.getRoot(); (new Function('r', src))(r); await window.__dbg.saveState(); }, src);
const get = q=> JSON.parse(execSync(`curl -s -H "X-Library: ${encodeURIComponent(CODE)}" "${URL_SYNC}?${q}"`).toString());
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 300000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  // A library of tracks with no audio to send (the audio itself plays no part here).
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(); delete r.settings.starterPlaylistId;
    r.library = Array.from({length: 40}, (_, i)=> ({id: 'tr' + i, name: 'Track ' + i, artist: 'Artist ' + (i % 4), album: 'Album ' + (i % 8), trackNo: i, duration: 60, filename: 'x.mp3', fileSize: 1, audioRev: 1}));
    r.tree = [{id: 'fA', kind: 'folder', name: 'Daily', children: [{id: 'plM', kind: 'playlist', name: 'Morning', items: [{id: 'e1', kind: 'track', refId: 'tr1'}]}]}, {id: 'plE', kind: 'playlist', name: 'Evening', items: []}];
    await window.__dbg.saveState();
  });
  await p.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(p); await sleep(1200); await waitIdle(p);
  // Changes, one per version
  await edit(p, "r.tree[0].children[0].name = 'Morning prayers';"); await sync(p);          // plM
  await edit(p, "r.library.find(t=> t.id==='tr5').name = 'Track five';"); await sync(p);     // tr5
  await edit(p, "r.tree[0].children[0].items.push({id:'e2', kind:'track', refId:'tr7'});"); await sync(p); // plM
  await edit(p, "r.tree[1].name = 'Evening puja';"); await sync(p);                         // plE
  await edit(p, "r.library = r.library.filter(t=> t.id!=='tr9');"); await sync(p);           // tr9
  const hist = get('op=history');
  ok(hist.every(h=> h.c === undefined), 'History\'s list stays small: no changed ids in it');
  const ch = get('op=changes&since=0');
  console.log('changes:', JSON.stringify(ch));
  const vs = Object.keys(ch.versions).map(Number).sort((a, b)=> a - b), last = vs[vs.length - 1];
  const at = k=> ch.versions[String(last - k)];
  ok(ch.kept.length === vs.length && vs.length >= 6, 'every kept version has its changes recorded (' + vs.length + ')');
  ok(JSON.stringify(at(4)) === JSON.stringify({t: [], n: ['plM']}), 'a playlist renamed: just that playlist');
  ok(JSON.stringify(at(3)) === JSON.stringify({t: ['tr5'], n: []}), 'a track renamed: just that track');
  ok(JSON.stringify(at(2)) === JSON.stringify({t: [], n: ['plM']}), 'an entry added to a playlist: that playlist');
  ok(JSON.stringify(at(0)) === JSON.stringify({t: ['tr9'], n: []}), 'a track deleted: that track');
  ok(JSON.stringify(get('op=changes&since=' + (last - 1)).versions) === JSON.stringify({[last]: at(0)}), 'since=N: only the versions after N');
  // The device's index agrees with the server's (same rules on both sides)
  const agree = await p.evaluate(async (last)=>{
    const idx = (await window.__hist.index({})).index;
    const docs = []; for(const v of [last - 4, last - 3, last - 2, last - 1, last]) docs.push(await (await fetch('http://127.0.0.1:8870/sync.php?op=state&version=' + v, {headers: {'X-Library': encodeURIComponent(window.__dbg.getRoot().settings.sharedLibrary.code)}})).json());
    const prev = await (await fetch('http://127.0.0.1:8870/sync.php?op=state&version=' + (last - 5), {headers: {'X-Library': encodeURIComponent(window.__dbg.getRoot().settings.sharedLibrary.code)}})).json();
    const mine = [window.__hist.changed(prev, docs[0])].concat(docs.slice(1).map((d, i)=> window.__hist.changed(docs[i], d)));
    return {same: mine.every((m, i)=> JSON.stringify(m) === JSON.stringify(idx.versions[last - 4 + i])), of: window.__hist.versionsOf(idx, 'n', 'plM'), t5: window.__hist.versionsOf(idx, 'n', 'plE')};
  }, last);
  ok(agree.same, 'the device works out the same ids as the server, for the same two versions');
  ok(agree.of.join() === [last - 2, last - 4].concat(agree.of.slice(2)).join() && agree.of[0] === last - 2, 'the versions in which Morning changed, newest first: ' + agree.of.join(', '));
  // Versions saved before this existed: their info lacks the ids
  for(const v of [last - 3, last - 2]){ const f = path.join(DATA, 'state', String(v).padStart(6, '0') + '.json'); const j = JSON.parse(fs.readFileSync(f)); delete j.c; fs.writeFileSync(f, JSON.stringify(j)); }
  const lacking = await p.evaluate(async()=>{ const key = Object.keys(window.__hist).length; const r = await window.__hist.index({}); return r.missing; });
  console.log('missing before building:', JSON.stringify(lacking));
  // (the index had them already, from before; start it afresh to see the gap)
  await p.evaluate(async()=>{ await window.__undo.delRec('state', (await window.__hist.index({})).index.key); });
  const gap = await p.evaluate(async()=> (await window.__hist.index({})).missing);
  ok(gap.join() === [last - 3, last - 2].join(), 'versions without a record are named as missing: ' + gap.join(', '));
  const built = await p.evaluate(async()=>{ const steps = []; const r = await window.__hist.index({build: true, onStep: (i, n)=> steps.push(i + '/' + n)}); return {missing: r.missing, steps, of: window.__hist.versionsOf(r.index, 'n', 'plM'), tr5: window.__hist.versionsOf(r.index, 't', 'tr5')}; });
  ok(built.missing.length === 0 && built.steps.length === 2 && built.of[0] === last - 2 && built.tr5[0] === last - 3, 'Build list from history fills them in by opening the versions (' + JSON.stringify(built) + ')');
  // ---- Timings: 2000 tracks, 120 playlists
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot();
    r.library = Array.from({length: 2000}, (_, i)=> ({id: 'big' + i, name: 'A long recording name number ' + i, artist: 'Artist ' + (i % 60), album: 'Album ' + (i % 200), trackNo: i % 20, duration: 600, filename: 'x.mp3', fileSize: 1, audioRev: 1, loudness: {i: -18, p: -1}}));
    r.tree = Array.from({length: 12}, (_, f)=> ({id: 'bf' + f, kind: 'folder', name: 'Folder ' + f, children: Array.from({length: 10}, (_, k)=> ({id: 'bp' + f + '_' + k, kind: 'playlist', name: 'Playlist ' + f + '.' + k, items: Array.from({length: 25}, (_, e)=> ({id: 'be' + f + '_' + k + '_' + e, kind: 'track', refId: 'big' + ((f * 250 + k * 25 + e) % 2000)}))}))}));
    await window.__dbg.saveState();
  });
  await sync(p);
  const saves = [];
  for(let i = 0; i < 30; i++){
    await edit(p, `r.tree[${i % 12}].children[${i % 10}].name += '!'; r.library[${i * 7}].name += '.';`);
    const t0 = Date.now(); await sync(p); saves.push(Date.now() - t0);
  }
  const big = get('op=changes&since=0'), lastBig = Math.max(...Object.keys(big.versions).map(Number));
  ok(big.versions[lastBig].t.length === 1 && big.versions[lastBig].n.length === 1, 'big library, one change: one track and one playlist (' + JSON.stringify(big.versions[lastBig]) + ')');
  const infoBytes = fs.readdirSync(path.join(DATA, 'state')).filter(n=> /^\d{6}\.json$/.test(n)).map(n=> fs.statSync(path.join(DATA, 'state', n)).size);
  const t1 = Date.now(); const resBytes = execSync(`curl -s -H "X-Library: ${encodeURIComponent(CODE)}" "${URL_SYNC}?op=changes&since=0" | wc -c`).toString().trim(); const tChanges = Date.now() - t1;
  const tim = await p.evaluate(async()=>{
    await window.__undo.delRec('state', (await window.__hist.index({})).index.key);
    let t = performance.now(); const fresh = await window.__hist.index({}); const tFresh = performance.now() - t;
    t = performance.now(); await window.__hist.index({}); const tAgain = performance.now() - t;
    t = performance.now(); const of = window.__hist.versionsOf(fresh.index, 'n', 'bp5_9'); const tQuery = performance.now() - t;
    return {tFresh, tAgain, tQuery, versions: Object.keys(fresh.index.versions).length, of: of.length};
  }).catch(err=> ({err: String(err)}));
  // Building from history: as if no version had its record (saved before
  // this existed), so every one is opened.
  for(const n of fs.readdirSync(path.join(DATA, 'state')).filter(n=> /^\d{6}\.json$/.test(n))){ const f = path.join(DATA, 'state', n); const j = JSON.parse(fs.readFileSync(f)); delete j.c; fs.writeFileSync(f, JSON.stringify(j)); }
  const bld = await p.evaluate(async()=>{
    await window.__undo.delRec('state', (await window.__hist.index({})).index.key);
    const t = performance.now(); const b = await window.__hist.index({build: true}); 
    return {tBuild: performance.now() - t, versions: Object.keys(b.index.versions).length, of: window.__hist.versionsOf(b.index, 'n', Object.keys(b.index.versions).length ? b.index.versions[Math.max(...Object.keys(b.index.versions).map(Number))].n[0] : '').length};
  }).catch(err=> ({err: String(err)}));
  console.log('building from history (ms):', JSON.stringify(bld));
  console.log('saves (ms, 2000 tracks, sync including the server working out the ids):', saves.slice(0, 10).join(' '), '…');
  console.log('info files: largest', Math.max(...infoBytes), 'bytes; op=changes for every version:', resBytes, 'bytes in', tChanges, 'ms');
  console.log('device timings (ms):', JSON.stringify(tim));
  ok(!tim.err && tim.tQuery < 50 && tim.tAgain < 1000, 'answering "every version of this playlist" from the index is quick');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
