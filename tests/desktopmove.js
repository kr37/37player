// The desktop app's first start of 2.0 (step 4) and Gen Rinzin's wipe test
// (step 5). A 1.4 page (browser storage) makes two libraries; the page then
// starts as the desktop app with bridge 2 (the stand-in shell, fake-shell.js):
//  - it asks where the libraries should live (Music/37 Player Libraries
//    only suggested; Choose another place… offered), then copies both into
//    folders of their own there, checks them, and uses them from there; the
//    browser-storage copies stay, and go after 30 days;
//  - the webview's storage emptied (CCleaner): everything is still there,
//    a library's own small values too (its folder's local.json);
//  - the app's own data folder emptied too: the libraries are found again in
//    their place by their "37 Player library.json";
//  - a library whose folder can't be found is asked about (Find a library
//    folder…), never made again empty;
//  - Settings → Libraries → Find a library folder… adds one from anywhere.
//   node desktopmove.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.textContent).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return await modalText(p).catch(()=> ''); };
const toastText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.toast')].map(t=> t.textContent).join(' | '));
const waitToast = async (p, re)=>{ let tx = ''; for(let i = 0; i < 40; i++){ tx = await toastText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return tx; };
const waitLoaded = async (p)=>{ for(let i = 0; i < 150; i++){ if(await p.evaluate(()=> !!(window.__dbg && window.__dbg.getRoot && document.getElementById('btnLibrary'))).catch(()=> false)) break; await sleep(200); } await sleep(1500); };
// The stand-in shell's folders, as paths (OPFS under fake-shell/).
const shellFiles = (p)=> p.evaluate(async()=>{
  const out = []; let top; try{ top = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell'); }catch(e){ return out; }
  const walk = async (d, at)=>{ for await (const [n, h] of d.entries()){ if(h.kind === 'directory') await walk(h, at + n + '/'); else out.push(at + n); } };
  await walk(top, ''); return out;
});
const roots = (p)=> p.evaluate(async()=>{ try{ return JSON.parse(await (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell')).getFileHandle('roots.json')).getFile()).text()); }catch(e){ return {}; } });
// As CCleaner: the webview's storage (localStorage, IndexedDB, the browser's
// own folders other than the stand-in shell's), not the app's data folder.
const wipeWebview = (p)=> p.evaluate(async()=>{
  for(const k of Object.keys(localStorage)) if(!k.startsWith('__')) localStorage.removeItem(k);
  sessionStorage.clear();
  for(const d of await indexedDB.databases()) await new Promise(r=>{ const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = ()=> r(); });
});
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=>{ console.log('ALERT:', d.message()); await d.accept(); });
  // The desktop app from the moment localStorage says so (the 1.4 page first).
  await p.evaluateOnNewDocument((shell)=>{
    window.__noAutoConverter = true;
    if(localStorage.getItem('__asDesktop')){ window.__diskBlobMin = 1048576; if(localStorage.getItem('__noPlace')) window.__fakeShellNoPlace = true; (0, eval)(shell); }
  }, SHELL);

  // ---- 1.4: two libraries in browser storage.
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; r.settings.libraryName = 'Prayers'; await window.__dbg.saveState(); });
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type: 'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1000); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const before = await p.evaluate(async()=>{
    const D = window.__disk;
    const reg = D.readLibraryList(); const main = reg.list.find(l=> l.id === 'main'); main.name = 'Prayers';
    // A second library, "Teachings", with a 3 MB recording (read where it lies, later).
    reg.list.push({id: 'teach1', name: 'Teachings'}); D.writeLibraryList(reg);
    const N = 3 * 1048576, u = new Uint8Array(N); for(let i = 0; i < N; i++) u[i] = (i * 31 + (i >>> 11)) & 255;
    const st = D.storageOpen('teach1');
    await st.put('state', {key: 'libraryInfo', id: 'teach1', name: 'Teachings'});
    await st.put('state', {key: 'root', value: {library: [{id: 'tt1', name: 'Heart Jewel', artist: 'Geshe-la', album: 'Teachings', trackNo: 3, filename: 'hj.wav', fileSize: N, duration: 10}], tree: [], settings: {libraryName: 'Teachings'}, session: {}}});
    await st.put('audio', {id: 'tt1', blob: new File([u], 'hj.wav', {type: 'audio/wav'})});
    st.close();
    const tr = window.__dbg.getRoot().library[0];
    return {mainTracks: window.__dbg.getRoot().library.length, mainSize: tr && tr.fileSize, kind: D.kind()};
  });
  ok(before.kind === 'idb' && before.mainTracks === 1, '1.4: two libraries in browser storage (' + JSON.stringify(before) + ')');

  // ---- The first start of 2.0.
  await p.evaluate(()=>{ localStorage.setItem('__asDesktop', '1'); localStorage.setItem('__noPlace', '1'); });
  await p.reload({waitUntil: 'domcontentloaded'});
  const q = await waitModal(p, /Where should your libraries live/);
  ok(/Where should your libraries live/.test(q) && /Music\/37 Player Libraries/.test(q) && /\(2\)/.test(q), 'the first start asks where the libraries should live, suggesting Music/37 Player Libraries, for both');
  ok(/Choose another place/.test(q) && /30 days/.test(q), 'with Choose another place…, and the browser copy kept 30 days');
  await clickText(p, '.modal button', '^Use this place$');
  await waitLoaded(p);
  const r1 = await roots(p), files1 = await shellFiles(p);
  ok(r1.place === 'Music/37 Player Libraries' && r1['lib-main'] === 'Music/37 Player Libraries/Prayers' && r1['lib-teach1'] === 'Music/37 Player Libraries/Teachings', 'each library has a folder of its own in that place (' + JSON.stringify(r1) + ')');
  ok(files1.includes('Music/37 Player Libraries/Teachings/music/Geshe-la/Teachings/03 Heart Jewel.wav') && files1.some(f=> /^Music\/37 Player Libraries\/Prayers\/music\/.+\.mp3$/.test(f)), 'the recordings are in them under readable names');
  ok(files1.includes('Music/37 Player Libraries/Prayers/37 Player library.json') && files1.includes('Music/37 Player Libraries/Teachings/README.txt'), 'with the marker and the README');
  const after = await p.evaluate(async()=>{
    const D = window.__disk, reg = D.readLibraryList();
    const st = D.storageOpen('teach1'); const a = await st.get('audio', 'tt1'); st.close();
    const dbs = (await indexedDB.databases()).map(d=> d.name);
    return {kind: D.kind(), id: D.id(), tracks: window.__dbg.getRoot().library.length, entries: reg.list.map(l=> [l.id, !!l.desktop, !!l.desktopMade, !!l.fromBrowser]),
      teachDisk: a && a.blob instanceof D.DiskBlob, teachSize: a && a.blob.size, dbs, toast: [...document.querySelectorAll('.toast')].map(t=> t.textContent).join(' | ')};
  });
  ok(after.kind === 'desktop' && after.id === 'main' && after.tracks === 1, 'the app runs the library from its folder, its track there (' + [after.kind, after.id, after.tracks] + ')');
  ok(JSON.stringify(after.entries) === JSON.stringify([['main', true, true, true], ['teach1', true, true, true]]), 'both libraries are marked as moved, browser copies kept (' + JSON.stringify(after.entries) + ')');
  ok(after.teachDisk && after.teachSize === 3 * 1048576, 'the other library\'s 3 MB recording reads back whole, from where it lies (' + after.teachSize + ')');
  ok(after.dbs.includes('temple-sound-library') && after.dbs.includes('temple-sound-library~teach1'), 'the browser-storage copies are still there');
  after.toast = after.toast + ' | ' + await waitToast(p, /Your libraries are now/);
  ok(/Your libraries are now in Music\/37 Player Libraries/.test(after.toast), 'a notice says where they went (' + after.toast + ')');

  // ---- 30 days on: the browser copies go.
  await p.evaluate(()=>{ const D = window.__disk, reg = D.readLibraryList(); reg.list.forEach(l=>{ if(l.fromBrowser) l.fromBrowser -= 31 * 86400000; }); D.writeLibraryList(reg); });
  await p.reload({waitUntil: 'domcontentloaded'}); await waitLoaded(p);
  const later = await p.evaluate(async()=> ({dbs: (await indexedDB.databases()).map(d=> d.name), from: window.__disk.readLibraryList().list.map(l=> !!l.fromBrowser), tracks: window.__dbg.getRoot().library.length}));
  ok(!later.dbs.includes('temple-sound-library') && !later.dbs.includes('temple-sound-library~teach1') && later.from.every(x=> !x) && later.tracks === 1, 'after 30 days the browser-storage copies are removed, the libraries unchanged (' + JSON.stringify(later) + ')');

  // ---- The wipe test: the webview's storage emptied (CCleaner).
  // A library's own small values first (kept in its folder too).
  await p.evaluate(()=>{ localStorage.setItem('37player.dailyAsk.main', '2026-11-06'); localStorage.setItem('37player.sharedLog', JSON.stringify([{at: 1, text: 'a line of the sync log'}])); });
  await sleep(3500);
  const localFile = (await shellFiles(p)).includes("Music/37 Player Libraries/Prayers/37 Player's own files/local.json");
  await wipeWebview(p);
  await p.reload({waitUntil: 'domcontentloaded'}); await waitLoaded(p);
  const w1 = await p.evaluate(()=> ({modal: [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent).map(m=> m.textContent).join(' | '), tracks: window.__dbg.getRoot().library.length, names: window.__disk.readLibraryList().list.map(l=> l.name), lang: document.documentElement.lang}));
  const w1b = await p.evaluate(()=> ({ask: localStorage.getItem('37player.dailyAsk.main'), log: localStorage.getItem('37player.sharedLog')}));
  ok(localFile && w1b.ask === '2026-11-06' && /a line of the sync log/.test(w1b.log || ''), 'and the library\'s own values (its sync log, its reminders) came back from its folder (' + [localFile, w1b.ask] + ')');
  ok(w1.tracks === 1 && JSON.stringify(w1.names) === JSON.stringify(['Prayers', 'Teachings']) && !/didn't load|Welcome/i.test(w1.modal), 'the webview\'s storage emptied: both libraries and the track are there, no welcome (' + JSON.stringify(w1) + ')');

  // ---- And the app's own data folder emptied too (roots.json, device.json).
  await wipeWebview(p);
  await p.evaluate(async()=>{ localStorage.removeItem('__fakeDevice'); await (await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell')).removeEntry('roots.json'); });
  await p.reload({waitUntil: 'domcontentloaded'}); await sleep(2500);
  for(const x of ['^English$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await waitLoaded(p);
  const w2 = await p.evaluate(()=> ({tracks: window.__dbg.getRoot().library.length, list: window.__disk.readLibraryList().list.map(l=> [l.id, l.name]), toast: [...document.querySelectorAll('.toast')].map(t=> t.textContent).join(' | ')}));
  const r2 = await roots(p);
  w2.toast = w2.toast + ' | ' + await waitToast(p, /Found/);
  ok(w2.list.length === 2 && JSON.stringify(w2.list) === JSON.stringify([['main', 'Prayers'], ['teach1', 'Teachings']]) && w2.tracks === 1, 'the app\'s data folder emptied too: both libraries found again in their place (' + JSON.stringify(w2.list) + ', ' + w2.tracks + ' track)');
  ok(r2['lib-main'] === 'Music/37 Player Libraries/Prayers' && /Found 2 libraries/.test(w2.toast), 'by their markers, and a notice says so (' + w2.toast + ')');

  // ---- A folder that's gone (moved): asked about, found, never made again.
  await p.evaluate(async()=>{
    const top = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell');
    // Teachings moved to another drive: copied there, then removed here.
    const copy = async (from, to)=>{ for await (const [n, h] of from.entries()){ if(h.kind === 'directory') await copy(h, await to.getDirectoryHandle(n, {create: true})); else { const w = await (await to.getFileHandle(n, {create: true})).createWritable(); await w.write(await h.getFile()); await w.close(); } } };
    const lib = await (await (await top.getDirectoryHandle('Music')).getDirectoryHandle('37 Player Libraries')).getDirectoryHandle('Teachings');
    const there = await (await top.getDirectoryHandle('USB', {create: true})).getDirectoryHandle('Teachings', {create: true});
    await copy(lib, there);
    await (await (await top.getDirectoryHandle('Music')).getDirectoryHandle('37 Player Libraries')).removeEntry('Teachings', {recursive: true});
    sessionStorage.setItem('37player.library', 'teach1');
  });
  await p.reload({waitUntil: 'domcontentloaded'});
  const m3 = await waitModal(p, /Where is this library's folder/);
  ok(/Where is this library's folder/.test(m3) && /Teachings/.test(m3) && /Find a library folder/.test(m3), 'a library whose folder is gone is asked about, with Find a library folder… (' + m3.slice(0, 160) + ')');
  const madeAgain = (await shellFiles(p)).some(f=> f.startsWith('Music/37 Player Libraries/Teachings'));
  ok(!madeAgain, 'and its folder isn\'t made again, empty');
  await p.evaluate(()=>{ window.__fakeShellPick = 'USB/Teachings'; });
  await clickText(p, '.modal button', '^Find a library folder');
  await waitLoaded(p);
  const w3 = await p.evaluate(async()=>{ const D = window.__disk; const st = D.storageOpen('teach1'); const a = await st.get('audio', 'tt1'); st.close(); return {id: D.id(), size: a && a.blob.size, tracks: window.__dbg.getRoot().library.length}; });
  ok(w3.id === 'teach1' && w3.size === 3 * 1048576 && (await roots(p))['lib-teach1'] === 'USB/Teachings', 'found where it was moved, it opens from there (' + JSON.stringify(w3) + ')');

  // ---- Settings → Libraries → Find a library folder… (one made elsewhere).
  await p.evaluate(async()=>{
    const top = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell');
    const d = await (await top.getDirectoryHandle('Elsewhere', {create: true})).getDirectoryHandle('Chants', {create: true});
    const w = await (await d.getFileHandle('37 Player library.json', {create: true})).createWritable(); await w.write(JSON.stringify({format: '37player-library', id: 'chant9', name: 'Chants'})); await w.close();
    window.__fakeShellPick = 'Elsewhere/Chants';
  });
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(300);
  await p.evaluate(()=> document.getElementById('btnLibrary').click()); await sleep(300);
  await clickText(p, '.library-pop-item', 'Manage|Libraries'); await sleep(1200);
  const hasBtn = await p.evaluate(()=> !!document.getElementById('libFindFolder'));
  ok(hasBtn, 'Settings → Libraries has Find a library folder…');
  await p.evaluate(()=> document.getElementById('libFindFolder')?.click()); await sleep(1200);
  const w4 = await p.evaluate(()=> ({list: window.__disk.readLibraryList().list.map(l=> l.name), toast: [...document.querySelectorAll('.toast')].map(t=> t.textContent).join(' | ')}));
  ok(JSON.stringify(w4.list) === JSON.stringify(['Prayers', 'Teachings', 'Chants']) && /“Chants” is on your list of libraries/.test(w4.toast), 'which adds a library folder from anywhere (' + JSON.stringify(w4) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
