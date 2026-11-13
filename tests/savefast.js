// Saving a big library quickly (2.2.035; Gen Rinzin: Save in the Edit dialog
// took seconds, and typing in Table lagged, while imports and syncing ran).
// A save turned every waveform into text to see whether anything changed,
// and read the whole stored library back to check its revision. Now a
// waveform counts by a fingerprint made once per array, the browser's store
// keeps the revision in a small record of its own ("rootRev"), and a folder
// library's root.json starts with its revision. Checked here: the checks
// still do their jobs (a new waveform is a change, a stale window is
// refused, a library an older version saved is read as before), and a save
// that changes nothing is quick.
//   node savefast.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage();
  const alerts = [];
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ alerts.push(d.message()); d.accept(); });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(1500);

  // A big library: 2,000 tracks with waveforms.
  const big = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot();
    for(let i = 0; i < 2000; i++) root.library.push({id: 'b' + i, name: 'Track ' + i, artist: 'Artist ' + (i % 40), album: 'Album ' + (i % 150), trackNo: i % 12, duration: 300 + i, peaks: Array.from({length: 720}, ()=> Math.random()), hasArtwork: false, filename: 't' + i + '.mp3', fileSize: 5e6});
    await window.__dbg.saveState();
    await new Promise(r=> setTimeout(r, 4000)); // the first save's follow-ups (the spare copy and the like) done
    const st = window.__disk.libStore();
    const root1 = await st.get('state', 'root'), rr1 = await st.get('state', 'rootRev');
    let t = performance.now(); await window.__dbg.saveState(); const unchanged = performance.now() - t;
    const root2 = await st.get('state', 'root');
    return {rev1: root1.rev, rr1: rr1 && rr1.rev, unchanged: Math.round(unchanged), rev2: root2.rev, n: root2.value.library.length};
  });
  ok(big.n >= 2000 && big.rr1 === big.rev1, 'a save keeps the revision in its own record too (root ' + big.rev1 + ', rootRev ' + big.rr1 + ')');
  ok(big.rev2 === big.rev1 && big.unchanged < 150, 'a save that changes nothing writes nothing, quickly (' + big.unchanged + ' ms)');

  // A track's waveform replaced (as a new analysis does): that's a change.
  const wave = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot(), st = window.__disk.libStore();
    const before = (await st.get('state', 'root')).rev;
    root.library.find(t=> t.id === 'b5').peaks = Array.from({length: 720}, ()=> 0.5);
    let t = performance.now(); await window.__dbg.saveState(); const ms = performance.now() - t;
    const after = await st.get('state', 'root');
    return {before, after: after.rev, stored: after.value.library.find(t=> t.id === 'b5').peaks[3], rr: (await st.get('state', 'rootRev')).rev, ms: Math.round(ms)};
  });
  ok(wave.after === wave.before + 1 && wave.stored === 0.5 && wave.rr === wave.after, 'a new waveform is saved (rev ' + wave.before + ' → ' + wave.after + ', rootRev ' + wave.rr + ', ' + wave.ms + ' ms)');

  // An edit: saved, the revision record moves with it.
  const edit = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot(), st = window.__disk.libStore();
    const before = (await st.get('state', 'root')).rev;
    root.library.find(t=> t.id === 'b7').name = 'Edited';
    await window.__dbg.saveState();
    const after = await st.get('state', 'root');
    return {before, after: after.rev, name: after.value.library.find(t=> t.id === 'b7').name, rr: (await st.get('state', 'rootRev')).rev};
  });
  ok(edit.after === edit.before + 1 && edit.name === 'Edited' && edit.rr === edit.after, 'an edit is saved (rev ' + edit.before + ' → ' + edit.after + ')');

  // A library saved by an older version: no revision record. Read as before.
  const old = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot(), st = window.__disk.libStore();
    const req = indexedDB.open(window.__disk.libraryDbName ? window.__disk.libraryDbName(window.__disk.id()) : 'temple-sound-library');
    await new Promise(r=>{ req.onsuccess = r; });
    await new Promise(r=>{ const tx = req.result.transaction('state', 'readwrite'); tx.objectStore('state').delete('rootRev'); tx.oncomplete = r; });
    req.result.close();
    const before = (await st.get('state', 'root')).rev;
    root.library.find(t=> t.id === 'b8').name = 'Edited without rootRev';
    await window.__dbg.saveState();
    const after = await st.get('state', 'root');
    return {gone: true, before, after: after.rev, name: after.value.library.find(t=> t.id === 'b8').name, rr: ((await st.get('state', 'rootRev')) || {}).rev};
  });
  ok(old.after === old.before + 1 && old.name === 'Edited without rootRev' && old.rr === old.after, 'with no revision record (an older version\'s save) it reads the library and saves, and writes the record (' + JSON.stringify(old) + ')');

  // Another window saved meanwhile: this one is refused, and the other's save is kept.
  const stale = await p.evaluate(async()=>{
    const st = window.__disk.libStore(), cur = await st.get('state', 'root');
    const theirs = JSON.parse(JSON.stringify(cur.value));
    theirs.library.find(t=> t.id === 'b9').name = 'From the other window';
    await st.put('state', {key: 'root', value: theirs, rev: cur.rev + 1});
    const root = window.__dbg.getRoot();
    root.library.find(t=> t.id === 'b10').name = 'From this window';
    await window.__dbg.saveState();
    const after = await st.get('state', 'root');
    return {rev: after.rev, theirs: after.value.library.find(t=> t.id === 'b9').name, mine: after.value.library.find(t=> t.id === 'b10').name, rr: (await st.get('state', 'rootRev')).rev};
  });
  await sleep(500);
  ok(stale.theirs === 'From the other window' && stale.mine !== 'From this window' && stale.rr === stale.rev && alerts.some(a=> /another window|changed in another/i.test(a)), 'a window behind another\'s save is refused, and says so (' + JSON.stringify(stale) + '; ' + alerts.join(' | ').slice(0, 120) + ')');

  // A folder library: root.json starts with its revision, read from the first bytes.
  const folder = await p.evaluate(async()=>{
    const fs = window.__fs.make('savefast-' + Date.now()), out = {};
    const value = {library: [{id: 'x', name: 'One', peaks: [0.1, 0.2]}], tree: []};
    out.w1 = (await fs.writeRootIfCurrent(value, 0)).rev;
    out.quick1 = await fs.rootRevQuick();
    out.w2 = (await fs.writeRootIfCurrent(value, out.w1)).rev;
    out.staleRefused = !(await fs.writeRootIfCurrent(value, out.w1)).ok;
    // root.json as an older version wrote it: the revision last.
    const dir = await fs.sub('state');
    const h = await dir.getFileHandle(window.__fs.keyOf('root') + '.json', {create: true});
    const w = await h.createWritable(); await w.write(JSON.stringify({key: 'root', value, rev: 9})); await w.close();
    out.quickOld = await fs.rootRevQuick();
    out.oldWrongRefused = !(await fs.writeRootIfCurrent(value, out.w2)).ok;
    const r = await fs.writeRootIfCurrent(value, 9);
    out.oldRightOk = r.ok && r.rev === 10;
    out.head = (await (await h.getFile()).slice(0, 30).text());
    return out;
  });
  ok(folder.w1 === 1 && folder.quick1 === 1 && folder.w2 === 2 && folder.staleRefused, 'a folder library: its revision read from root.json\'s first bytes, and a stale save refused (' + JSON.stringify(folder) + ')');
  ok(folder.quickOld === null && folder.oldWrongRefused && folder.oldRightOk && folder.head.startsWith('{"key":"root","rev":10,'), 'root.json as an older version wrote it: read whole, as before, then written revision first');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
