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
  // "picked" is empty (1.4.180, Gen): use it as it is, or make the library's folder inside it.
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
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
