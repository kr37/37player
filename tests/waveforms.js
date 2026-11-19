// The waveforms in their own record (2.5.044; kr37, 18 Nov 2026: the list
// of tracks held every track's waveform, most of its size, so every start
// parsed it all and every save wrote it all). Checked here, in the browser's
// library and in a folder library: the list ("root") is stored without
// waveforms and they go in "waveforms"; a read puts them back, so the rest
// of the app sees the same tracks; a save writes the waveforms only when one
// changed; a library an older version saved (waveforms inside "root") reads
// as before and moves them on its first save; a damaged waveforms record
// leaves its tracks without waveforms and the list still opens.
//   node waveforms.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.accept());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(1500);

  // The browser's library: a few tracks with waveforms, saved.
  const idb = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot();
    for(let i = 0; i < 300; i++) root.library.push({id: 'w' + i, name: 'Wave ' + i, artist: 'A', album: 'B', trackNo: i, duration: 100 + i, peaks: Array.from({length: 720}, (_, j)=> (i + j) % 7 / 7), hasArtwork: false, filename: 'w' + i + '.mp3', fileSize: 1, fileModified: 1});
    await window.__dbg.saveState();
    await new Promise(r=> setTimeout(r, 1500));
    const st = window.__disk.libStore();
    const raw = await new Promise(res=>{ const q = indexedDB.open(window.__disk.libraryDbName ? window.__disk.libraryDbName(window.__disk.id()) : 'temple-sound-library'); q.onsuccess = ()=>{ const tx = q.result.transaction('state', 'readonly'), os = tx.objectStore('state'); const a = os.get('root'), w = os.get('waveforms'); tx.oncomplete = ()=>{ q.result.close(); res({root: a.result, waves: w.result}); }; }; });
    const keys = await st.keys('state');
    const back = await st.get('state', 'root');
    return {
      rootStubbed: raw.root.value.library.filter(t=> /^w/.test(t.id)).every(t=> Array.isArray(t.peaks) && t.peaks.length === 1 && t.peaks[0] === 0),
      wavesCount: raw.waves ? Object.keys(raw.waves.value).length : -1,
      keysHideWaves: !keys.includes('waveforms'),
      backHasPeaks: back.value.library.filter(t=> t.peaks && t.peaks.length === 720).length,
      tracks: back.value.library.length
    };
  });
  ok(idb.rootStubbed && idb.wavesCount >= 300 && idb.keysHideWaves && idb.backHasPeaks >= 300, 'browser library: the list holds the placeholder [0], the waveforms are in their own record (' + JSON.stringify(idb) + ')');

  // A save that changes no waveform doesn't write them; an edit doesn't either.
  const quiet = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot();
    let writes = 0; const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(v, k){ if(v && v.key === 'waveforms') writes++; return put.apply(this, arguments); };
    try{
      await window.__dbg.saveState();
      root.library.find(t=> t.id === 'w3').name = 'Renamed';
      await window.__dbg.saveState();
    } finally { IDBObjectStore.prototype.put = put; }
    return {writes};
  });
  ok(quiet.writes === 0, 'saves that change no waveform write none (' + quiet.writes + ' writes)');

  // A new waveform is written, and comes back.
  const changed = await p.evaluate(async()=>{
    const root = window.__dbg.getRoot(), st = window.__disk.libStore();
    root.library.find(t=> t.id === 'w5').peaks = Array.from({length: 720}, ()=> 0.5);
    await window.__dbg.saveState();
    const back = await st.get('state', 'root');
    return back.value.library.find(t=> t.id === 'w5').peaks[3];
  });
  ok(changed === 0.5, 'a new waveform is saved and read back (' + changed + ')');

  // A library saved by an older version: waveforms inside "root". Read as
  // before; the first save moves them out.
  const legacy = await p.evaluate(async()=>{
    const st = window.__disk.libStore();
    const dbName = window.__disk.libraryDbName ? window.__disk.libraryDbName(window.__disk.id()) : 'temple-sound-library';
    const cur = await st.get('state', 'root'); // waveforms merged in, as the app sees them
    const withPeaks = JSON.parse(JSON.stringify(cur.value)); // peaks inline, as an old version wrote them
    await new Promise(res=>{ const q = indexedDB.open(dbName); q.onsuccess = ()=>{ const tx = q.result.transaction('state', 'readwrite'); tx.objectStore('state').put({key: 'root', value: withPeaks, rev: cur.rev}); tx.objectStore('state').delete('waveforms'); tx.oncomplete = ()=>{ q.result.close(); res(); }; }; });
    const readBack = await st.get('state', 'root');
    const hadPeaks = readBack.value.library.filter(t=> t.peaks).length;
    return {hadPeaks, rev: readBack.rev};
  }).catch(err=> ({err: String(err)}));
  ok(legacy.hadPeaks >= 300, 'a library with waveforms inside "root" reads as before (' + JSON.stringify(legacy) + ')');
  // (The app saves only when the library changed, so the first real edit moves them.)
  await p.evaluate(async()=>{ window.__dbg.getRoot().library.find(t=> t.id === 'w6').name = 'Edited after the old version'; await window.__dbg.saveState(); });
  const moved = await p.evaluate(async()=>{
    const dbName = window.__disk.libraryDbName ? window.__disk.libraryDbName(window.__disk.id()) : 'temple-sound-library';
    return await new Promise(res=>{ const q = indexedDB.open(dbName); q.onsuccess = ()=>{ const tx = q.result.transaction('state', 'readonly'), os = tx.objectStore('state'); const a = os.get('root'), w = os.get('waveforms'); tx.oncomplete = ()=>{ q.result.close(); res({rootStubbed: a.result.value.library.filter(t=> /^w/.test(t.id)).every(t=> Array.isArray(t.peaks) && t.peaks.length === 1 && t.peaks[0] === 0), waves: w.result ? Object.keys(w.result.value).length : -1}); }; }; });
  });
  ok(moved.rootStubbed && moved.waves >= 300, 'its first save moves the waveforms out of "root" (' + JSON.stringify(moved) + ')');

  // A folder library: root.json without waveforms, waveforms.json beside it.
  const folder = await p.evaluate(async()=>{
    const fs = window.__fs.make('waveforms-' + Date.now()), out = {};
    const value = {library: [{id: 'x', name: 'One', peaks: [0.1, 0.2]}, {id: 'y', name: 'Two', peaks: [0.3, 0.4]}, {id: 'z', name: 'Flat', peaks: new Array(720).fill(0.15)}], tree: []};
    out.w1 = (await fs.writeRootIfCurrent(value, 0)).rev;
    const dir = await fs.sub('state');
    const rootRaw = JSON.parse(await (await (await dir.getFileHandle('root.json')).getFile()).text());
    const wavesRaw = JSON.parse(await (await (await dir.getFileHandle('waveforms.json')).getFile()).text());
    out.rootStubbed = rootRaw.value.library.filter(t=> t.id !== 'z').every(t=> Array.isArray(t.peaks) && t.peaks.length === 1 && t.peaks[0] === 0);
    out.standInInline = rootRaw.value.library.find(t=> t.id === 'z').peaks.length === 720;
    out.wavesKeys = Object.keys(wavesRaw.value).sort().join(',');
    out.quick = await fs.rootRevQuick();
    const back = await fs.get('state', 'root');
    out.backPeaks = back.value.library.map(t=> t.peaks.length).join(',');
    out.keysHide = !(await fs.keys('state')).includes('waveforms');
    // Unchanged: no waveforms write. Counted on the store's own write.
    let wrote = 0; const orig = fs.writeRecordFile.bind(fs);
    fs.writeRecordFile = (s, r, plain)=>{ if(r && r.key === 'waveforms') wrote++; return orig(s, r, plain); };
    out.w2 = (await fs.writeRootIfCurrent(back.value, out.w1)).rev;
    out.unchangedWrites = wrote;
    // An older version wrote root.json: x's new waveform inline, y still the placeholder.
    const rootNow = JSON.parse(await (await (await dir.getFileHandle('root.json')).getFile()).text());
    rootNow.value.library.find(t=> t.id === 'x').peaks = [0.9, 0.8, 0.7];
    { const w = await (await dir.getFileHandle('root.json')).createWritable(); await w.write(JSON.stringify(rootNow)); await w.close(); }
    const older = await fs.get('state', 'root');
    out.olderRead = older.value.library.map(t=> t.peaks.length).join(',');
    await fs.writeRootIfCurrent(older.value, rootNow.rev);
    const wavesAfter = JSON.parse(await (await (await dir.getFileHandle('waveforms.json')).getFile()).text());
    const rootAfter = JSON.parse(await (await (await dir.getFileHandle('root.json')).getFile()).text());
    out.olderMoved = wavesAfter.value.x.length === 3 && rootAfter.value.library.find(t=> t.id === 'x').peaks.length === 1;
    // A damaged waveforms record: the list still opens, its tracks have no waveforms.
    const h = await dir.getFileHandle('waveforms.json');
    const w = await h.createWritable(); await w.write('{"key":"wav'); await w.close();
    fs.close();
    const damaged = await fs.get('state', 'root').catch(e=> 'threw: ' + e);
    out.damagedOk = !!damaged && typeof damaged === 'object' && damaged.value.library.length === 3 && damaged.value.library.filter(t=> t.id !== 'z').every(t=> t.peaks === undefined) && damaged.value.library.find(t=> t.id === 'z').peaks.length === 720;
    return out;
  });
  ok(folder.w1 === 1 && folder.rootStubbed && folder.standInInline && folder.wavesKeys === 'x,y' && folder.quick === 1, 'folder library: root.json with placeholders (a stand-in stays as it is), waveforms.json beside it (' + JSON.stringify(folder) + ')');
  ok(folder.backPeaks === '2,2,720' && folder.keysHide, 'folder library: a read puts the waveforms back, and keys hide them');
  ok(folder.unchangedWrites === 0 && folder.w2 === 2, 'folder library: an unchanged save writes no waveforms');
  ok(folder.olderRead === '3,2,720' && folder.olderMoved, 'an older version\'s waveform in root.json wins, and the next save moves it out (' + folder.olderRead + ')');
  ok(folder.damagedOk, 'folder library: a damaged waveforms file leaves the list open, its tracks without waveforms');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
