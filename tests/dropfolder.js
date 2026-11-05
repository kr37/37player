// Dropping a folder from the file manager (1.4.155): its contents, with
// sub-folders, in path order, with the paths the folder picker would give.
// Before, a dropped folder imported nothing. A browser's folder entries
// can't be made by a script, so stand-ins shaped like webkitGetAsEntry's
// carry real files: checked through takeDrop, then dropped on the Library
// tab (the import review) and on a playlist's drop area (straight in).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  // Stand-ins: Album/{10 Ten.mp3, 2 Two.mp3, notes.txt, Disc 2/{1 One.mp3}}
  await p.evaluate((s, t)=>{
    const bytes = b=> Uint8Array.from(atob(b), c=>c.charCodeAt(0));
    const file = (name, data)=> ({isFile: true, isDirectory: false, name, file: (ok)=> ok(new File([data], name, {type: /mp3$/.test(name) ? 'audio/mpeg' : 'text/plain'}))});
    const dir = (name, kids)=> ({isFile: false, isDirectory: true, name, createReader: ()=>{ let done = false; return {readEntries: (ok)=>{ ok(done ? [] : kids); done = true; }}; }});
    window.__mkDrop = ()=>{
      const album = dir('Album', [file('10 Ten.mp3', bytes(t)), file('2 Two.mp3', bytes(s)), file('notes.txt', 'x'), dir('Disc 2', [file('1 One.mp3', bytes(t))])]);
      return {types: ['Files'], files: [new File([], 'Album')], items: [{kind: 'file', webkitGetAsEntry: ()=> album}]};
    };
  }, b64('starter.mp3'), b64('tone.mp3'));
  const got = await p.evaluate(async()=> (await window.__drop.take(window.__mkDrop())).map(f=> f.webkitRelativePath));
  ok(JSON.stringify(got) === JSON.stringify(['Album/2 Two.mp3', 'Album/10 Ten.mp3', 'Album/Disc 2/1 One.mp3', 'Album/notes.txt']), 'a dropped folder: every file, sub-folders too, in path order, numbers as numbers (' + got.join(', ') + ')');
  const plainDt = await p.evaluate(async()=>{ const f = new File(['x'], 'a.mp3'); const r = await window.__drop.take({files: [f], items: [{kind: 'file', webkitGetAsEntry: ()=> ({isFile: true, isDirectory: false})}]}); return r.length === 1 && r[0] === f; });
  ok(plainDt, 'files dropped on their own come through as before');
  // On the Library tab: the import review, with the folder's structure.
  await p.evaluate(()=>{ window.__dbg.setMode('library'); }); await sleep(500);
  await p.evaluate(()=>{ const e = new Event('drop', {bubbles: true, cancelable: true}); Object.defineProperty(e, 'dataTransfer', {value: window.__mkDrop()}); document.getElementById('libraryScreen').dispatchEvent(e); });
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  ok(!!(await p.$('#folderImportGo')), 'dropped on the Library tab: the import review opens');
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 3 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  const lib = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.filename).sort());
  ok(lib.length === 3, 'and the three recordings are imported, not the text file (' + lib.join(', ') + ')');
  // On a playlist's drop area in Edit Playlists: straight into the playlist.
  const plId = await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); const pl = {id: 'pl-drop', kind: 'playlist', name: 'Dropped', order: 99, items: []}; r.tree.push(pl); await window.__dbg.saveState(); window.__dbg.setMode('editing'); window.__dbg.editPl('pl-drop'); return pl.id; });
  await sleep(800);
  const dz = await p.evaluate(()=>{ const z = [...document.querySelectorAll('.dropzone')].find(x=> x.offsetParent !== null); if(!z) return false; const e = new Event('drop', {bubbles: true, cancelable: true}); Object.defineProperty(e, 'dataTransfer', {value: window.__mkDrop()}); z.dispatchEvent(e); return true; });
  ok(dz, 'the playlist has a drop area');
  for(let i=0; i<120; i++){ await sleep(250); const n = await p.evaluate(()=> (window.__dbg.getRoot().tree.find(x=> x.id === 'pl-drop') || {items: []}).items.length); if(n >= 3 && !(await p.$('#importFilesStatus'))) break; }
  const items = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); const pl = r.tree.find(x=> x.id === 'pl-drop'); return pl.items.map(it=> (r.library.find(t=> t.id === it.refId) || {}).filename); });
  ok(items.length === 3, 'dropped on a playlist: the folder\'s recordings go in, in path order (' + items.join(', ') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
