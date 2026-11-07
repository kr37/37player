// Use in place (2.0, the desktop app; desktop/FILES-DESIGN.md, "Use in
// place"), through the stand-in shell (fake-shell.js):
//  - Import → Choose a folder… asks how to take the recordings: Use in
//    place, Copy into the library, Move into the library;
//  - used in place: the library points at the files (nothing copied into its
//    folder), they play, an edit leaves the file as it was, deleting a track
//    leaves its file (and the confirmation says so); playlist files reach
//    them with ../;
//  - Look for new files finds a recording added to the folder;
//  - the folder gone (a drive unplugged): "on a drive that isn't connected",
//    not counted as missing; Find this folder… brings it back;
//  - Copy into the library (Settings → Library) makes them the library's own;
//    Move at the import deletes the originals once copied;
//  - a folder on another drive suggests Copy; a library's own folder is refused.
//   node inplace.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const TONE = fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.textContent).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return await modalText(p).catch(()=> ''); };
const toastText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.toast')].map(t=> t.textContent).join(' | '));
const waitFor = async (p, fn, arg, ms)=>{ for(let i = 0; i < (ms || 30000) / 250; i++){ if(await p.evaluate(fn, arg).catch(()=> false)) return true; await sleep(250); } return false; };
// Files in the stand-in shell's "disk" (OPFS under fake-shell/).
const putFile = (p, at, b64, extra)=> p.evaluate(async (at, b64, extra)=>{
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell', {create: true});
  const parts = at.split('/'), name = parts.pop();
  for(const x of parts) d = await d.getDirectoryHandle(x, {create: true});
  const bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0));
  const w = await (await d.getFileHandle(name, {create: true})).createWritable(); await w.write(bytes); if(extra) await w.write(new Uint8Array(extra)); await w.close();
}, at, b64, extra || 0);
const fileSize = (p, at)=> p.evaluate(async (at)=>{
  try{ let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell'); const parts = at.split('/'), name = parts.pop(); for(const x of parts) d = await d.getDirectoryHandle(x); return (await (await d.getFileHandle(name)).getFile()).size; }catch(e){ return -1; }
}, at);
const shellFiles = (p)=> p.evaluate(async()=>{
  const out = []; let top; try{ top = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell'); }catch(e){ return out; }
  const walk = async (d, at)=>{ for await (const [n, h] of d.entries()){ if(h.kind === 'directory') await walk(h, at + n + '/'); else out.push(at + n); } };
  await walk(top, ''); return out;
});
const roots = (p)=> p.evaluate(async()=>{ try{ return JSON.parse(await (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell')).getFileHandle('roots.json')).getFile()).text()); }catch(e){ return {}; } });
// Import → Choose a folder… → the mode → the review → Go.
const importFolder = async (p, pick, mode)=>{
  await p.evaluate((pick)=>{ window.__fakeShellPick = pick; window.__disk.openImportChoice(); }, pick);
  await sleep(400);
  await clickText(p, '.modal button', '^Choose a folder');
  const q = await waitModal(p, /How should 37 Player take these recordings/);
  if(!mode) return q;
  await clickText(p, '.modal button', '^' + mode + '$');
  for(let i = 0; i < 60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  return q;
};
const closeModals = (p)=> p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); if(process.env.LOGC) p.on('console', m=> console.log('CONSOLE:', m.text().slice(0, 200)));
  const alerts = []; p.on('dialog', async d=>{ alerts.push(d.message()); console.log('ALERT:', d.message()); await d.accept(); });
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await closeModals(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  const T = 'Users/Me/Music/Talks';
  await putFile(p, T + '/Geshe-la/Heart Jewel/01 Starter.mp3', STARTER);
  await putFile(p, T + '/Geshe-la/Heart Jewel/02 Tone.mp3', TONE);
  const startSize = await fileSize(p, T + '/Geshe-la/Heart Jewel/01 Starter.mp3');

  // ---- Use in place.
  const q = await importFolder(p, T, 'Use in place');
  ok(/Use in place/.test(q) && /Copy into the library/.test(q) && /Move into the library/.test(q) && /never changes, moves or deletes them/.test(q), 'Import → Choose a folder… asks: Use in place, Copy or Move, and says what each does');
  await waitFor(p, ()=> window.__dbg.getRoot().library.length === 2, null, 30000); await sleep(1500); await closeModals(p);
  const r1 = await roots(p), files1 = await shellFiles(p);
  const rid = Object.keys(r1).find(k=> k.startsWith('in-main-'));
  const st1 = await p.evaluate(async()=>{
    const D = window.__disk, lib = window.__dbg.getRoot().library, out = {n: lib.length, places: (await D.placeFolders()).map(f=> f.label)};
    const refs = await D.libStore().placeRefs(); out.refs = refs.size;
    const rec = await D.idbGet('audio', lib.find(t=> /Starter/.test(t.filename)).id);
    out.inPlace = !!(rec && rec.blob && rec.blob.inPlace); out.size = rec && rec.blob.size;
    const url = await D.audioObjectUrl(rec.blob); out.played = (await (await fetch(url)).blob()).size;
    return out;
  });
  ok(st1.n === 2 && rid && r1[rid] === T && JSON.stringify(st1.places) === JSON.stringify([T]), 'both recordings are in the library, the folder on the list (' + JSON.stringify([st1.n, rid, st1.places]) + ')');
  ok(st1.refs === 2 && st1.inPlace && !files1.some(f=> /^Music\/37 Player Libraries\/.*\.mp3$/.test(f)), 'the library points at them: no copy in its folder (' + st1.refs + ' references)');
  ok(st1.size === startSize && st1.played === startSize, 'a recording used in place plays from where it is (' + st1.played + ' bytes)');

  // An edit stays in the library; the file stays as it was.
  const edit = await p.evaluate(async()=>{
    const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Starter/.test(t.filename));
    tr.name = 'Renamed here'; tr.artist = 'Someone else'; await window.__dbg.saveState();
    return {rewrote: await D.rewriteFileTagsIfPossible(tr.id), name: window.__dbg.getRoot().library.find(t=> t.id === tr.id).name};
  });
  await sleep(2500);
  ok(!edit.rewrote && edit.name === 'Renamed here' && await fileSize(p, T + '/Geshe-la/Heart Jewel/01 Starter.mp3') === startSize, 'an edit is kept in the library, the file left as it was');
  ok(!(await shellFiles(p)).some(f=> /^Music\/37 Player Libraries\/.*\.mp3$/.test(f)), 'and nothing is copied for it');

  // Playlist files reach them with ../ (or the full path, another Windows drive).
  const pp = await p.evaluate(()=>{ const f = window.__disk.placePathFrom; return [f('Music/37 Player Libraries/My library', 'Users/Me/Music/Talks', 'A/x.mp3'), f('C:\\Users\\Me\\Music\\37 Player Libraries\\L', 'C:\\Users\\Me\\Music\\Talks', 'A/x.mp3'), f('C:\\Users\\Me\\Music\\37 Player Libraries\\L', 'E:\\Talks', 'A/x.mp3')]; });
  ok(JSON.stringify(pp[0]) === JSON.stringify(['..', '..', '..', 'Users', 'Me', 'Music', 'Talks', 'A', 'x.mp3']) && JSON.stringify(pp[1]) === JSON.stringify(['..', '..', 'Talks', 'A', 'x.mp3']) && pp[2] === 'E:\\Talks\\A\\x.mp3', 'playlist files: ../ to a recording used in place, the full path on another drive (' + JSON.stringify(pp) + ')');
  const m3u = await p.evaluate(async()=>{
    const r = window.__dbg.getRoot();
    r.tree.push({kind: 'playlist', id: 'plIn', name: 'In place', items: r.library.map((t, i)=> ({id: 'it' + i, kind: 'track', refId: t.id, order: i}))});
    await window.__dbg.saveState(); await window.__disk.syncPlaylistFiles();
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell');
    for(const x of ['Music', '37 Player Libraries']) d = await d.getDirectoryHandle(x);
    for await (const [n, h] of d.entries()) if(h.kind === 'directory'){ try{ return await (await (await (await h.getDirectoryHandle('playlists')).getFileHandle('In place.m3u8')).getFile()).text(); }catch(e){} }
    return '';
  });
  ok(/\.\.\/\.\.\/\.\.\/\.\.\/Users\/Me\/Music\/Talks\/Geshe-la\/Heart Jewel\/0[12] /.test(m3u), 'the library\'s playlists/ file points to them where they are (' + m3u.split('\n').filter(l=> l && !l.startsWith('#'))[0] + ')');

  // ---- Look for new files.
  await putFile(p, T + '/Geshe-la/Heart Jewel/03 Tone again.mp3', TONE, 2048);
  await p.evaluate((rid)=> window.__disk.placeLookForNew(rid), rid);
  for(let i = 0; i < 60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  await waitFor(p, ()=> window.__dbg.getRoot().library.length === 3, null, 30000); await sleep(1500); await closeModals(p);
  const n3 = await p.evaluate(async()=> ({n: window.__dbg.getRoot().library.length, refs: (await window.__disk.libStore().placeRefs()).size}));
  ok(n3.n === 3 && n3.refs === 3, 'Look for new files brings in a recording added to the folder, used in place too (' + JSON.stringify(n3) + ')');

  // A track that's the library's own now (as after converting a .wma and
  // letting its original go): its file isn't new to Look for new files.
  alerts.length = 0;
  await p.evaluate(async()=>{
    const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /02 Tone/.test(t.filename));
    const rec = await D.idbGet('audio', tr.id); const own = rec.blob.slice(0, rec.blob.size, rec.blob.type); own.inPlace = false; own.name = rec.blob.name;
    await D.libStore().put('audio', Object.assign({}, rec, {blob: own}));
  });
  await p.evaluate((rid)=> window.__disk.placeLookForNew(rid), rid); await sleep(1500);
  ok(alerts.some(a=> /No new recordings/.test(a)) && !(await p.$('#folderImportGo')), 'a track whose recording is the library\'s own now (converted) isn\'t new to Look for new files (' + alerts.join(' / ') + ')');
  await closeModals(p);

  // ---- Deleting a track used in place: its file stays.
  const del = await p.evaluate(async()=>{
    const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Tone again/.test(t.filename));
    D.confirmDeleteTracksFromLibrary([tr.id], ()=>{});
    await new Promise(r=> setTimeout(r, 300));
    const text = [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent).map(m=> m.textContent).join(' ');
    document.querySelectorAll('.modal [data-close]').forEach(x=> x.click());
    await D.libStore().del('audio', tr.id);
    const r = window.__dbg.getRoot(); r.library = r.library.filter(t=> t.id !== tr.id); r.tree = []; await window.__dbg.saveState();
    return text;
  });
  ok(/stay in their folder/.test(del) && await fileSize(p, T + '/Geshe-la/Heart Jewel/03 Tone again.mp3') > 0, 'deleting a track used in place leaves its file, and the confirmation says so');

  // ---- The drive unplugged. Playing one of its tracks first (Playing).
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(), tr = r.library.find(t=> /Starter/.test(t.filename));
    r.tree.push({id: 'plU', kind: 'playlist', name: 'Unplug', items: [{id: 'u1', kind: 'track', refId: tr.id, order: 0}]}); await window.__dbg.saveState();
    window.__dbg.setMode('playing'); window.__play('u1');
  });
  for(let i = 0; i < 40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__aud().paused && window.__aud().t > 0.3)) break; }
  ok(await p.evaluate(()=> !window.__aud().paused), 'a track used in place plays in Playing');
  await p.evaluate(async(T)=>{
    const top = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell');
    const copy = async (from, to)=>{ for await (const [n, h] of from.entries()){ if(h.kind === 'directory') await copy(h, await to.getDirectoryHandle(n, {create: true})); else { const w = await (await to.getFileHandle(n, {create: true})).createWritable(); await w.write(await h.getFile()); await w.close(); } } };
    let music = top; for(const x of ['Users', 'Me', 'Music']) music = await music.getDirectoryHandle(x);
    await copy(await music.getDirectoryHandle('Talks'), await (await top.getDirectoryHandle('Backup', {create: true})).getDirectoryHandle('Talks', {create: true}));
    await music.removeEntry('Talks', {recursive: true});
  }, T);
  // What the player sees when the file goes from under it: an error.
  const lost = await p.evaluate(async()=>{
    const el = [...document.querySelectorAll('audio')].find(a=> !a.paused) || document.querySelector('audio');
    el.dispatchEvent(new Event('error'));
    await new Promise(r=> setTimeout(r, 800));
    const text = [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent).map(m=> m.textContent).join(' ');
    document.querySelectorAll('.modal [data-close]').forEach(x=> x.click());
    await new Promise(r=> setTimeout(r, 200));
    window.__disk.togglePlay(); // Play, while it's still gone
    await new Promise(r=> setTimeout(r, 800));
    const again = [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent).map(m=> m.textContent).join(' ');
    document.querySelectorAll('.modal [data-close]').forEach(x=> x.click());
    return {paused: window.__aud().paused, text, again};
  });
  ok(lost.paused && /On a drive that isn't connected/.test(lost.text) && /Copy into the library makes these recordings the library's own/.test(lost.text), 'the file gone while playing: the player pauses and says the drive isn\'t connected, with the way to avoid it');
  ok(/On a drive that isn't connected/.test(lost.again) && await p.evaluate(()=> window.__aud().paused), 'Play while it\'s still gone says so again, and doesn\'t pretend to play');
  const off = await p.evaluate(async()=>{
    const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Starter/.test(t.filename));
    const rec = await D.idbGet('audio', tr.id);
    const missing = await D.tracksWithMissingAudio();
    D.showAudioMissing(tr.id);
    await new Promise(r=> setTimeout(r, 400));
    const text = [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent).map(m=> m.textContent).join(' ');
    document.querySelectorAll('.modal [data-close]').forEach(x=> x.click());
    return {blob: rec && rec.blob, missing: missing.length, text};
  });
  ok(off.blob === null && off.missing === 0, 'its folder gone, a track used in place can\'t be read, and isn\'t counted as missing (' + off.missing + ')');
  ok(/On a drive that isn't connected/.test(off.text) && /Users\/Me\/Music\/Talks/.test(off.text), 'playing it says it\'s on a drive that isn\'t connected, and where (' + off.text.slice(0, 120) + ')');
  // Settings → Library: not connected; Find this folder…
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(300);
  await p.evaluate(()=> document.getElementById('btnLibrary').click()); await sleep(300);
  await clickText(p, '.library-pop-item', 'Manage|Libraries'); await sleep(1200);
  await p.evaluate(()=>{ const s = document.getElementById('libsMore'); if(s) s.open = false; });
  await waitFor(p, ()=> !!document.querySelector('#placeFolders table'), null, 8000);
  const set1 = await p.evaluate(()=> (document.getElementById('placeFolders') || {}).textContent || '');
  ok(/Folders used in place/.test(set1) && /not connected/.test(set1) && /Find this folder/.test(set1), 'Settings → Library lists the folder as not connected, with Find this folder… (' + set1.slice(0, 140) + ')');
  const where = await p.evaluate(()=> document.getElementById('settingsBody').innerText);
  const libPath0 = (await roots(p))['lib-main'];
  ok(where.includes('the desktop app, version') && where.includes('Library folder') && where.includes(libPath0) && /1 in the library's folder, 1 used in place/.test(where) && /None needed from 37 Player/.test(where), 'Settings → Library says the desktop app, the library\'s folder, where its recordings are, and that it needs no backups of 37 Player\'s');
  ok(!/IndexedDB|own storage|available|persistent/.test(where) && /In the library's folder: .*Used in place, in their own folders/.test(where), 'and nothing of the browser\'s storage (' + (where.match(/In the library's folder[^\n]*/) || [''])[0] + ')');
  await p.evaluate(()=> document.getElementById('infoShowFolder').click()); await sleep(300);
  ok(await p.evaluate(()=> window.__fakeShellShown) === libPath0, 'Show opens the library\'s folder');
  await p.evaluate(()=>{ window.__fakeShellPick = 'Backup/Talks'; });
  await clickText(p, '#placeFolders button', '^Find this folder');
  await waitFor(p, ()=> /Look for new files/.test((document.getElementById('placeFolders') || {}).textContent || ''), null, 8000);
  const back = await p.evaluate(async()=>{ const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Starter/.test(t.filename)); const rec = await D.idbGet('audio', tr.id); return rec && rec.blob ? rec.blob.size : -1; });
  ok(back === startSize, 'found where it was moved, it plays again (' + back + ')');
  // Play now: the player starts the file again (it was stuck on the lost one).
  await p.evaluate(()=> window.__disk.togglePlay());
  for(let i = 0; i < 40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__aud().paused && window.__aud().t > 0.3)) break; }
  ok(await p.evaluate(()=> !window.__aud().paused && !document.querySelector('audio[data-p37stuck]')), 'and Play in Playing carries on with it (' + JSON.stringify(await p.evaluate(()=> window.__aud())) + ')');
  await p.evaluate(()=> document.querySelectorAll('audio').forEach(a=> a.pause()));

  // ---- The app's data folder emptied (the shell's list of folders gone):
  // the library's own record puts its folder used in place back.
  await p.evaluate(async(rid)=>{ const top = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell'); const fh = await top.getFileHandle('roots.json'); const r = JSON.parse(await (await fh.getFile()).text()); delete r[rid]; const w = await fh.createWritable(); await w.write(JSON.stringify(r)); await w.close(); }, rid);
  await p.reload({waitUntil: 'domcontentloaded'});
  for(let i = 0; i < 80; i++){ await sleep(250); if(await p.evaluate(()=> !!(window.__dbg && window.__dbg.getRoot && window.__dbg.getRoot().library.length)).catch(()=> false)) break; }
  await sleep(1500);
  const restored = await p.evaluate(async()=>{ const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Starter/.test(t.filename)); const rec = await D.idbGet('audio', tr.id); return rec && rec.blob ? rec.blob.size : -1; });
  ok(restored === startSize && (await roots(p))[rid] === 'Backup/Talks', 'the shell\'s list of folders lost, the library\'s own record puts its folder used in place back: its tracks play (' + restored + ')');
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(300);
  await p.evaluate(()=> document.getElementById('btnLibrary').click()); await sleep(300);
  await clickText(p, '.library-pop-item', 'Manage|Libraries'); await sleep(1200);
  await waitFor(p, ()=> /Look for new files/.test((document.getElementById('placeFolders') || {}).textContent || ''), null, 8000);

  // ---- Copy into the library.
  await clickText(p, '#placeFolders button', '^Copy into the library$');
  await waitFor(p, async()=> (await window.__disk.libStore().placeRefs()).size === 0, null, 30000); await sleep(800);
  const cp = await p.evaluate(async()=>{ const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Starter/.test(t.filename)); const rec = await D.idbGet('audio', tr.id); return {inPlace: !!(rec && rec.blob && rec.blob.inPlace), size: rec && rec.blob && rec.blob.size, places: (await D.placeFolders()).length}; });
  const files2 = await shellFiles(p), r2 = await roots(p);
  ok(!cp.inPlace && cp.size === startSize && cp.places === 0 && !(rid in r2), 'Copy into the library makes them the library\'s own, and forgets the folder (' + JSON.stringify(cp) + ')');
  ok(files2.filter(f=> /^Music\/37 Player Libraries\/[^/]+\/music\/.+\.mp3$/.test(f)).length === 2 && await fileSize(p, 'Backup/Talks/Geshe-la/Heart Jewel/01 Starter.mp3') === startSize, 'the copies are in its music/ folder; the originals are still there');

  // ---- Move at the import.
  await putFile(p, 'Users/Me/Music/Chants/Prayers/Migtsema.mp3', TONE, 4096);
  await importFolder(p, 'Users/Me/Music/Chants', 'Move into the library');
  await waitFor(p, ()=> window.__dbg.getRoot().library.length === 3, null, 30000);
  const emptyQ = await waitModal(p, /The folder is empty now/, 30000);
  ok(/The folder is empty now/.test(emptyQ) && /Users\/Me\/Music\/Chants/.test(emptyQ), 'moved, the folder left empty: 37 Player offers to remove it');
  await clickText(p, '.modal button', '^Remove it$'); await sleep(1200);
  ok(await p.evaluate(async()=>{ try{ let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell'); for(const x of ['Users', 'Me', 'Music', 'Chants']) d = await d.getDirectoryHandle(x); return false; }catch(e){ return true; } }), 'and Remove it removes it');
  await waitFor(p, async()=> (await window.__disk.libStore().placeRefs()).size === 0, null, 30000); await sleep(1500); await closeModals(p);
  const mv = await p.evaluate(async()=>{ const D = window.__disk, tr = window.__dbg.getRoot().library.find(t=> /Migtsema/.test(t.filename)); const rec = tr && await D.idbGet('audio', tr.id); return {have: !!(rec && rec.blob && rec.blob.size), inPlace: !!(rec && rec.blob && rec.blob.inPlace)}; });
  ok(mv.have && !mv.inPlace && await fileSize(p, 'Users/Me/Music/Chants/Prayers/Migtsema.mp3') === -1 && (await shellFiles(p)).some(f=> /\/music\/.*Migtsema\.mp3$/.test(f)), 'Move into the library: the recording is the library\'s own, the original deleted (' + JSON.stringify(mv) + ')');

  // ---- Another drive suggests Copy; a library's own folder is refused.
  await putFile(p, 'Volumes/USB/Talks/x.mp3', STARTER, 512);
  const qd = await importFolder(p, 'Volumes/USB/Talks', null);
  const primary = await p.evaluate(()=> [...document.querySelectorAll('.modal button.primary')].filter(b=> b.offsetParent).map(b=> b.textContent.trim()).join('|'));
  ok(/another drive/.test(qd) && primary === 'Copy into the library', 'a folder on another drive says so, and suggests Copy (' + primary + ')');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(500);
  ok(!Object.values(await roots(p)).includes('Volumes/USB/Talks'), 'cancelled, the folder is forgotten again');
  alerts.length = 0;
  const libPath = (await roots(p))['lib-main'];
  await p.evaluate((pick)=>{ window.__fakeShellPick = pick; window.__disk.openImportChoice(); }, libPath); await sleep(400);
  await clickText(p, '.modal button', '^Choose a folder'); await sleep(1200);
  ok(alerts.some(a=> /a library's own folder/.test(a)), 'a library\'s own folder is refused (' + alerts.join(' / ') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
