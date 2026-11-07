// The backup folder keeps a track's files while the track is in the library,
// even when this browser has lost its audio (1.4.150). Before, a backup run
// deleted every folder file whose audio wasn't in IndexedDB at that moment:
// a full disk, a restore whose writes failed, or storage thrown away while
// the track list came back from the shared library emptied the backup
// (Gen Rinzin's T470, 1 Nov 2026). Only a track leaving the library frees its file.
// The folder is a stand-in in the browser's private file system (OPFS).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('dialog', async d=>{ await d.accept(); });
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  await settle(p);
  // Two tracks, imported as a folder.
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
  const ids = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.id));
  ok(ids.length === 2, 'two tracks imported (' + ids.length + ')');

  // A backup folder for this library.
  await p.evaluate(async()=>{
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('bk', {recursive: true}).catch(()=>{});
    const info = window.__bk.info();
    info.handle = await root.getDirectoryHandle('bk', {create: true});
    info.copyId = info.copyId || 'test-copy'; info.setupDone = true;
  });
  const audioFiles = ()=> p.evaluate(async()=>{
    const dir = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bk')).getDirectoryHandle('Library - do not touch')).getDirectoryHandle('audio');
    const out = []; for await (const [n] of dir.entries()) out.push(n); return out.sort();
  });
  const metaIds = ()=> p.evaluate(async()=>{
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bk')).getDirectoryHandle('Library - do not touch');
    const m = JSON.parse(await (await (await dir.getFileHandle('meta.json')).getFile()).text());
    return (m.library || []).map(t=> t.id).sort();
  });
  const has = (files, id)=> files.some(n=> n === id || n.startsWith(id + '.'));
  await p.evaluate(()=> window.__bk.run());
  let files = await audioFiles();
  ok(files.length === 2 && ids.every(id=> has(files, id)), 'the first backup writes both recordings (' + files.join(', ') + ')');

  // This browser loses the first track's audio; the track stays in the library.
  await p.evaluate((id)=> window.__idbDel('audio', id), ids[0]);
  await p.evaluate(()=>{ window.__bk.fullScan(); return window.__bk.run(); });
  files = await audioFiles();
  ok(has(files, ids[0]), 'a track with no audio here keeps its file in the folder (' + files.join(', ') + ')');
  ok(has(files, ids[1]), 'and the other track\'s file is still there');
  ok(JSON.stringify(await metaIds()) === JSON.stringify(ids.slice().sort()), 'meta.json still lists both tracks');
  ok(!(await p.evaluate(()=> window.__bk.info().lastError)), 'the backup reports no error (' + await p.evaluate(()=> window.__bk.info().lastError) + ')');
  ok((await p.evaluate(()=> window.__log().join('\n'))).includes('folder\'s copies were kept'), 'the playback log says so');
  // A second, ordinary (not full) run keeps it too.
  await p.evaluate(()=> window.__bk.run());
  ok(has(await audioFiles(), ids[0]), 'an ordinary run afterwards keeps it as well');

  // A track that leaves the library frees its file.
  await p.evaluate((id)=> window.__bk.del([id]), ids[1]);
  await sleep(500);
  await p.evaluate(()=>{ window.__bk.fullScan(); return window.__bk.run(); });
  files = await audioFiles();
  ok(!has(files, ids[1]) && has(files, ids[0]), 'deleting a track from the library removes only its file (' + files.join(', ') + ')');

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
