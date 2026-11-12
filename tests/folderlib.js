// Libraries kept in a folder the person chose (1.4.153). The "chosen"
// folders are stand-ins in the browser's private file system (OPFS):
// showDirectoryPicker is replaced to hand them out, and permission can be
// made to need asking (localStorage __permPrompt).
// Checks: Library info offers it; the move copies everything, reloads and
// runs from the folder; the browser's copy is offered for removal and goes;
// edits land in the folder and survive a reload; the backup button says
// "In a folder"; lost permission asks and opens; a lost handle is found
// again, refusing a folder that isn't this library's.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
const modalText = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
const waitModal = async (p, re, ms)=>{ for(let i=0; i<(ms||15000)/200; i++){ const t = await modalText(p); if(re.test(t)) return t; await sleep(200); } return await modalText(p); };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  const alerts = []; p.on('dialog', async d=>{ alerts.push(d.message()); await d.accept(); });
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{
    window.showDirectoryPicker = async ()=>{
      let d = await navigator.storage.getDirectory();
      for(const part of (localStorage.getItem('__pick') || 'picked').split('/')) d = await d.getDirectoryHandle(part, {create: true});
      return d;
    };
    const q = FileSystemHandle.prototype.queryPermission;
    FileSystemHandle.prototype.queryPermission = async function(o){ return localStorage.getItem('__permPrompt') ? 'prompt' : (q ? q.call(this, o) : 'granted'); };
    FileSystemHandle.prototype.requestPermission = async function(){ localStorage.removeItem('__permPrompt'); return 'granted'; };
  });
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  await p.evaluate(async()=>{ const top = await navigator.storage.getDirectory(); await top.removeEntry('picked', {recursive: true}).catch(()=>{}); localStorage.removeItem('__pick'); localStorage.removeItem('__permPrompt'); });
  await settle(p);
  // A library with two tracks.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{
    const mk = (b64, name)=>{ const f = new File([Uint8Array.from(atob(b64), x=>x.charCodeAt(0))], name, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; };
    window.__dbg.bulkImportFolder([mk(a, 'starter.mp3'), mk(c, 'tone.mp3')]);
  }, b64('starter.mp3'), b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 2 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500);
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()).catch(()=>{});
  const before = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); return {ids: r.library.map(t=> t.id).sort(), tree: JSON.stringify(r.tree)}; });
  ok(before.ids.length === 2, 'two tracks to move');

  // Library info offers it.
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300);
  await p.evaluate(()=> window.__dbg4.section('info')); await sleep(800);
  const info = await p.evaluate(()=> ({kept: document.getElementById('infoKept')?.textContent, btn: document.getElementById('infoKeepFolder')?.style.display}));
  ok(/browser/.test(info.kept || '') && info.btn === '', 'Library info: kept in the browser, with "Keep it in a folder…" (' + JSON.stringify(info) + ')');
  await p.evaluate(()=> document.getElementById('infoKeepFolder').click());
  const ask = await waitModal(p, /Keep this library in a folder/);
  ok(/Automatic backups stop/.test(ask), 'the dialog explains (where, how much, backups)');
  ok(/empty folder for this library/.test(ask), 'it says an empty folder made for the library can be chosen');
  await clickText(p, '.modal button', '^Choose where');
  // "picked" is empty (1.4.180, Gen Rinzin): use it as it is, or make the library's folder inside it.
  const which = await waitModal(p, /Use this folder/);
  const btns = await p.evaluate(()=> [...document.querySelectorAll('#askButtons button')].map(b=> b.textContent.trim() + (b.classList.contains('primary') ? '*' : '')));
  ok(/is empty/.test(which) && btns[0] === 'Use “picked”*' && /^Make “.+” inside$/.test(btns[1]), 'an empty folder: use it, or make the library\'s folder inside (' + btns.join(' | ') + ')');
  const nav = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 60000});
  await clickText(p, '.modal button', '^Make “');
  await nav; await sleep(1000);
  const after = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); return {ids: r.library.map(t=> t.id).sort(), tree: JSON.stringify(r.tree), kind: window.__fl.kind(), folder: window.__fl.name()}; });
  ok(after.kind === 'FolderLibraryStore' && !!after.folder, 'after the reload it runs from the folder (' + after.kind + ', "' + after.folder + '")');
  ok(JSON.stringify(after.ids) === JSON.stringify(before.ids) && after.tree === before.tree, 'the same tracks and playlists');
  const files = await p.evaluate(async (folder)=>{
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle(folder);
    const top = []; for await (const [n] of d.entries()) top.push(n);
    // Readable names (1.4.174): recordings as Artist/Album/Title, the rest in "37 Player's own files"
    const music = []; const walk = async (dir, pre)=>{ for await (const [n, h] of dir.entries()){ if(n === "37 Player's own files") continue; if(h.kind === 'directory') await walk(h, pre + n + '/'); else if(pre) music.push(pre + n); } };
    await walk(d, '');
    const own = []; for await (const [n] of (await d.getDirectoryHandle("37 Player's own files")).entries()) own.push(n);
    return {top: top.sort(), audio: music.sort(), own: own.sort()};
  }, after.folder);
  ok(files.top.includes('37 Player library.json') && files.top.includes('README.txt') && files.top.includes("37 Player's own files") && files.own.includes('state') && files.own.includes('audio'), 'the folder has its marker, a README and the library (' + files.top.join(', ') + ' | own: ' + files.own.join(', ') + ')');
  ok(files.audio.filter(n=> /^music\/[^/]+\/[^/]+\/[^/]+\.mp3$/.test(n)).length === 2, 'and both recordings, under music/ with readable names (' + files.audio.join(', ') + ')');
  const plays = await p.evaluate(async (id)=>{ const u = await window.__audioUrl(id); const b = await (await fetch(u)).blob(); return b.size; }, after.ids[0]);
  ok(plays > 1000, 'a track\'s audio comes from the folder (' + plays + ' bytes)');
  // The browser's copy.
  const done = await waitModal(p, /in its folder/);
  ok(/2 tracks/.test(done), 'it offers to remove the browser\'s copy');
  await clickText(p, '.modal button', "^Remove the browser's copy$"); await sleep(1200);
  const dbs = await p.evaluate(async()=> (await indexedDB.databases()).map(d=> d.name));
  ok(!dbs.includes('temple-sound-library') && dbs.includes('37player-folders'), 'the browser\'s copy is gone; only the folder\'s note is left (' + dbs.join(', ') + ')');
  ok((await p.evaluate(()=> document.getElementById('btnBackup').textContent)) === 'In a folder', 'the backup button says "In a folder"');
  // Edits land in the folder.
  await p.evaluate(async()=>{ const f = ns=>{ for(const n of ns){ if(n.kind==='playlist') return n; if(n.children){ const x=f(n.children); if(x) return x; } } }; f(window.__dbg.getRoot().tree).name = 'Renamed in a folder'; await window.__dbg.saveState(); });
  await p.reload({waitUntil: 'networkidle0'}); await sleep(1200);
  ok((await p.evaluate(()=> JSON.stringify(window.__dbg.getRoot().tree))).includes('Renamed in a folder'), 'an edit is kept after a reload');
  // A track's details change: its recording's name follows (1.4.174), and back on Undo
  const ls = (folder)=> p.evaluate(async (folder)=>{ const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle(folder); const out = []; const walk = async (dir, pre)=>{ for await (const [n, h] of dir.entries()){ if(n === "37 Player's own files") continue; if(h.kind === 'directory') await walk(h, pre + n + '/'); else if(pre) out.push(pre + n); } }; await walk(d, ''); return out.sort(); }, folder);
  await p.evaluate(async()=>{ const tr = window.__dbg.getRoot().library.find(t=> /tone/i.test(t.filename || t.name)); tr.artist = 'Test Artist'; tr.album = 'Test Album'; tr.trackNo = 7; tr.name = 'Renamed tone'; await window.__dbg.saveState(); });
  await sleep(4500);
  const renamed = await ls(after.folder);
  ok(renamed.includes('music/Test Artist/Test Album/07 Renamed tone.mp3') && !renamed.some(n=> n.startsWith('music/Unknown Artist/')), 'editing a track\'s details renames its recording (' + renamed.join(', ') + ')');
  const plays2 = await p.evaluate(async ()=>{ const tr = window.__dbg.getRoot().library.find(t=> t.name === 'Renamed tone'); const u = await window.__audioUrl(tr.id); return (await (await fetch(u)).blob()).size; });
  ok(plays2 > 100000, 'and it still plays from there (' + plays2 + ' bytes)');
  // playlists/: an .m3u8 for each playlist, pointing into ../music/ (1.4.179), and today's README
  const pl = await p.evaluate(async (folder)=>{ const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle(folder); const out = {}; const walk = async (dir, pre)=>{ for await (const [n, h] of dir.entries()){ if(h.kind === 'directory') await walk(h, pre + n + '/'); else out[pre + n] = await (await h.getFile()).text(); } }; await walk(await d.getDirectoryHandle('playlists'), 'playlists/'); out.README = await (await (await d.getFileHandle('README.txt')).getFile()).text(); return out; }, after.folder);
  const m3u = Object.entries(pl).filter(([k])=> k.endsWith('.m3u8'));
  ok(m3u.length >= 1 && m3u.some(([, v])=> /^#EXTM3U/.test(v) && /\.\.\/(\.\.\/)*music\/Test Artist\/Test Album\/07 Renamed tone\.mp3/.test(v)), 'playlists/ has the playlists as .m3u8, pointing into music/ (' + m3u.map(([k])=> k).join(', ') + ')');
  ok(/"music"/.test(pl.README) && /"playlists"/.test(pl.README), 'and the README says what\'s where');

  // Permission to ask for again.
  await p.evaluate(()=> localStorage.setItem('__permPrompt', '1'));
  await p.reload({waitUntil: 'networkidle0'});
  const perm = await waitModal(p, /permission/);
  ok(/needs your permission/.test(perm), 'without permission it asks first (' + perm.slice(0, 80).replace(/\n/g, ' | ') + ')');
  await clickText(p, '.modal button', '^Open it$'); await sleep(2500);
  ok((await p.evaluate(()=> window.__dbg.getRoot().library.length)) === 2, 'and then opens the library');

  // The note of where the folder is, lost.
  await p.evaluate(()=> window.__fl.forget());
  await p.evaluate(()=> localStorage.setItem('__pick', 'picked')); // the parent, not the library's folder
  await p.reload({waitUntil: 'networkidle0'});
  const lost = await waitModal(p, /can't find it/);
  ok(/can't find it/.test(lost), 'a lost folder: says so, offers Find the folder');
  alerts.length = 0;
  await clickText(p, '.modal button', '^Find the folder'); await sleep(1500);
  ok(alerts.some(a=> /isn't this library's/.test(a)), 'a folder that isn\'t this library\'s is refused');
  await p.evaluate((folder)=> localStorage.setItem('__pick', 'picked/' + folder), after.folder);
  await waitModal(p, /can't find it/);
  await clickText(p, '.modal button', '^Find the folder'); await sleep(2500);
  ok((await p.evaluate(()=> window.__dbg.getRoot().library.length)) === 2, 'the right folder is taken, and the library opens');
  await p.reload({waitUntil: 'networkidle0'}); await sleep(1200);
  ok((await p.evaluate(()=> window.__dbg.getRoot().library.length)) === 2 && !(await modalText(p)).includes("can't find"), 'and it\'s remembered');

  // An existing library's folder is never written over (2.2.019; the plan's
  // 5.1). Every browser's first library has the same ID ("main"), so after
  // the browser's storage is cleared, a new, empty first library used to take
  // the old library's folder for its own unfinished copy and write its own
  // (empty) records over that library's.
  const folderTracks = (folder)=> p.evaluate(async (folder)=>{
    let d = await navigator.storage.getDirectory(); for(const part of folder.split('/')) d = await d.getDirectoryHandle(part);
    const st = await (await d.getDirectoryHandle("37 Player's own files")).getDirectoryHandle('state');
    const r = JSON.parse(await (await (await st.getFileHandle('root.json')).getFile()).text());
    return ((r.value && r.value.library) || []).map(t=> t.name).sort().join(', ');
  }, folder);
  const oldTracks = await folderTracks('picked/' + after.folder);
  ok(/Renamed tone/.test(oldTracks), 'the folder\'s library has its tracks (' + oldTracks + ')');
  // The browser's storage cleared (the stand-in folders, in OPFS, stay).
  const clearBrowser = async ()=>{
    await p.goto('http://localhost:8861/', {waitUntil: 'networkidle0'});
    await p.evaluate(async()=>{ for(const d of await indexedDB.databases()) await new Promise(r=>{ const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); localStorage.clear(); sessionStorage.clear(); });
    await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
    await settle(p);
  };
  await clearBrowser();
  const fresh = await p.evaluate(()=> ({n: window.__dbg.getRoot().library.length, kind: window.__fl.kind(), folder: window.__fl.name()}));
  ok(fresh.kind === 'IdbLibraryStore' && !fresh.folder && fresh.n < 2, 'a new first library, in the browser (' + JSON.stringify(fresh) + ')');
  const tryMove = async (pick)=>{
    await p.evaluate((pick)=> localStorage.setItem('__pick', pick), pick);
    alerts.length = 0;
    await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300);
    await p.evaluate(()=> window.__dbg4.section('info')); await sleep(800);
    await p.evaluate(()=> document.getElementById('infoKeepFolder').click());
    await waitModal(p, /Keep this library in a folder/);
    await clickText(p, '.modal button', '^Choose where'); await sleep(2500);
    return {alerts: alerts.slice(), modal: await modalText(p), kind: await p.evaluate(()=> window.__fl.kind()).catch(()=> 'reloaded')};
  };
  // The old library's folder itself: refused, with "Open that library" offered.
  const t1 = await tryMove('picked/' + after.folder);
  ok(/already holds a 37 Player library/.test(t1.modal) && /Open that library/.test(t1.modal) && t1.kind === 'IdbLibraryStore', 'choosing it is refused, offering to open that library (' + t1.modal.slice(0, 120).replace(/\n/g, ' | ') + ')');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(500);
  ok(await folderTracks('picked/' + after.folder) === oldTracks && (await p.evaluate(()=> window.__fl.kind())) === 'IdbLibraryStore', 'Cancel: its library is untouched, and this one stays in the browser');
  // The folder it's in, where the new library's folder would go by the same
  // name; this time Open that library: the folder's library takes the new,
  // empty one's place (2.2.020, the T470 rebuild).
  const newName = await p.evaluate(()=> window.__fl.folderNameFor());
  ok(newName === after.folder, 'the new library\'s folder would have the same name ("' + newName + '")');
  const t2 = await tryMove('picked');
  ok(/already holds a 37 Player library/.test(t2.modal), 'choosing the folder it\'s in is refused too');
  ok(await folderTracks('picked/' + after.folder) === oldTracks, 'and its library is still untouched');
  let nav2 = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 60000}).catch(()=>{});
  await clickText(p, '.modal button', '^Open that library$');
  await nav2; await sleep(1500);
  const opened = await p.evaluate(()=> ({kind: window.__fl.kind(), folder: window.__fl.name(), tracks: window.__dbg.getRoot().library.map(t=> t.name).sort().join(', ')}));
  ok(opened.kind === 'FolderLibraryStore' && opened.folder === after.folder && opened.tracks === oldTracks, 'Open that library: the folder\'s library opens in place of the empty one (' + JSON.stringify(opened) + ')');
  // Settings → Libraries → Find a library folder…
  const findFolder = async (pick)=>{
    await p.evaluate((pick)=> localStorage.setItem('__pick', pick), pick);
    alerts.length = 0;
    await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300);
    await p.evaluate(()=> window.__dbg4.section('info')); await sleep(800);
    const btn = await p.evaluate(()=>{ const b = document.getElementById('libFindFolder'); if(b){ b.click(); return b.textContent; } return null; });
    await sleep(2500);
    return {btn, alerts: alerts.slice(), modal: await modalText(p)};
  };
  // A second clearing; this time the new first library gets a track of its own.
  await clearBrowser();
  await p.evaluate((c)=>{ const f = new File([Uint8Array.from(atob(c), x=>x.charCodeAt(0))], 'tone.mp3', {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Mine/tone.mp3'}); window.__dbg.bulkImportFolder([f]); }, b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.some(t=> /tone/i.test(t.filename || t.name)) && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500);
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()).catch(()=>{});
  const mine = await p.evaluate(()=> window.__dbg.getRoot().library.length);
  const f1 = await findFolder('picked/' + after.folder);
  ok(f1.btn === 'Find a library folder…', 'Settings → Libraries has "Find a library folder…" in Chrome (' + f1.btn + ')');
  ok(f1.alerts.some(a=> /same identity/.test(a)) && (await p.evaluate(()=> window.__fl.kind())) === 'IdbLibraryStore' && (await p.evaluate(()=> window.__dbg.getRoot().library.length)) === mine, 'a first library with tracks of its own isn\'t replaced by the folder\'s (' + f1.alerts.join(' | ') + ')');
  ok(await folderTracks('picked/' + after.folder) === oldTracks, 'and the folder is untouched');
  // A folder holding another library (its own ID): added to the list.
  await p.evaluate(async()=>{ const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked3', {create: true}); const w = await (await d.getFileHandle('37 Player library.json', {create: true})).createWritable(); await w.write(JSON.stringify({format: '37player-library', id: 'other1', name: 'Another library'})); await w.close(); });
  const f2 = await findFolder('picked3');
  const listed = await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.libraries') || '{}').list.find(l=> l.id === 'other1') || null);
  ok(listed && listed.name === 'Another library' && listed.folder === 'picked3', 'a folder of another library is added to the list (' + JSON.stringify(listed) + ')');
  ok(await p.evaluate(()=> document.body.innerText.includes('Another library')), 'and shown there');
  // This library's own copy, cut off after its library record was written,
  // still carries on when the same place is chosen again.
  await p.evaluate(()=>{ const P = window.__fl.store.prototype, put = P.put; P.put = async function(store, rec){ if(store === 'state' && rec && rec.key === 'view' && !window.__cutOnce){ window.__cutOnce = true; throw new Error('cut off for the test'); } return put.apply(this, arguments); }; });
  const t4 = await tryMove('picked2');
  if(/Use this folder/.test(t4.modal)){ await clickText(p, '.modal button', '^Use “picked2”'); await sleep(2500); }
  const cut = await p.evaluate(async()=>{ const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked2'); try{ await (await (await d.getDirectoryHandle("37 Player's own files")).getDirectoryHandle('state')).getFileHandle('root.json'); return true; }catch(e){ return false; } });
  ok(alerts.some(a=> /couldn't be copied/.test(a)) && cut, 'a copy cut off after the library record is written (' + alerts.join(' | ') + ')');
  nav2 = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 60000}).catch(()=>{});
  await tryMove('picked2');
  await nav2; await sleep(1500);
  const resumed = await p.evaluate(()=> ({kind: window.__fl.kind(), folder: window.__fl.name(), n: window.__dbg.getRoot().library.length}));
  ok(resumed.kind === 'FolderLibraryStore' && resumed.folder === 'picked2' && resumed.n === mine, 'choosing the same place again carries on (' + JSON.stringify(resumed) + ')');
  await clickText(p, '.modal button', '^Not now$'); await sleep(300);
  // Now kept in picked2: Find a library folder… with the old folder (the
  // same ID, another folder) asks before using it instead.
  const f3 = await findFolder('picked/' + after.folder);
  ok(/Use this folder for/.test(f3.modal) && /picked2/.test(f3.modal), 'the same library in another folder: asks first (' + f3.modal.slice(0, 140).replace(/\n/g, ' | ') + ')');
  nav2 = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 60000}).catch(()=>{});
  await clickText(p, '.modal button', '^Use “');
  await nav2; await sleep(1500);
  const swapped = await p.evaluate(()=> ({kind: window.__fl.kind(), folder: window.__fl.name(), tracks: window.__dbg.getRoot().library.map(t=> t.name).sort().join(', ')}));
  ok(swapped.folder === after.folder && swapped.tracks === oldTracks, 'Use: the library runs from that folder (' + JSON.stringify(swapped) + ')');
  ok(await p.evaluate(async()=>{ const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked2'); try{ await d.getFileHandle('37 Player library.json'); return true; }catch(e){ return false; } }), 'and the other folder stays as it was');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
