// Undo and redo (1.4.084): every saved change to tracks, playlists and
// folders is a step; quick saves join into one; undo puts back only what
// is still as the step left it; a deleted track's audio comes back; the
// steps survive a reload; changes from the shared library are not steps.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500); };
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const st = p=> p.evaluate(()=> window.__undo.stacks());
const lib = p=> p.evaluate(()=>{ const r = window.__dbg.getRoot(); const pl = []; (function w(ns){ ns.forEach(n=>{ if(n.kind==='playlist') pl.push(n.name + ':' + n.items.length); if(n.children) w(n.children); }); })(r.tree); return {tracks: r.library.map(t=> t.name), pl}; });
const edit = (p, fn)=> p.evaluate(async (src)=>{ const r = window.__dbg.getRoot(); (new Function('r', src))(r); await window.__dbg.saveState(); }, fn);
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(1500);
  const start = await lib(A); const trackName = start.tracks[0];
  console.log('start', JSON.stringify(start), JSON.stringify(await st(A)));
  await A.evaluate(()=> window.__dbg.setMode('editing')); await sleep(300);

  await edit(A, "(function f(ns){ ns.forEach(n=>{ if(n.kind==='playlist') n.name='Morning'; if(n.children) f(n.children); }); })(r.tree);");
  await sleep(1500);
  await edit(A, "r.library[0].name='Renamed track';");
  let s = await st(A);
  console.log('stacks', JSON.stringify(s));
  ok(/Morning/.test(s.labels[s.labels.length-2]) && s.labels[s.labels.length-1] === '1 track changed', 'two steps: the playlist rename, then the track rename (' + s.labels.slice(-2).join(' | ') + ')');
  ok(await A.evaluate(()=> !document.getElementById('btnUndo').disabled && /^Undo: 1 track changed/.test(document.getElementById('btnUndo').title)), 'Undo is on, saying what it will undo');
  ok(await A.evaluate(()=> document.getElementById('btnRedo').disabled), 'Redo is off');

  await A.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(600);
  let l = await lib(A);
  ok(l.tracks[0] === trackName && l.pl.some(x=> /^Morning:/.test(x)), 'Undo: the track has its name back, the playlist keeps Morning');
  ok(await A.evaluate(()=> /Undone: 1 track changed/.test((document.getElementById('toast') || {}).textContent || '')), 'a notice says what was undone');
  await A.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(600);
  l = await lib(A);
  ok(!l.pl.some(x=> /^Morning:/.test(x)), 'Undo again: the playlist has its old name back');
  await A.evaluate(()=> document.getElementById('btnRedo').click()); await sleep(600);
  l = await lib(A);
  ok(l.pl.some(x=> /^Morning:/.test(x)) && l.tracks[0] === trackName, 'Redo: Morning again, the track rename still undone');

  // Keyboard, in Library
  await A.evaluate(()=> window.__dbg.setMode('library')); await sleep(300);
  await A.evaluate(()=> document.activeElement && document.activeElement.blur());
  await A.keyboard.down('Control'); await A.keyboard.press('KeyZ'); await A.keyboard.up('Control'); await sleep(600);
  ok(!(await lib(A)).pl.some(x=> /^Morning:/.test(x)), 'Ctrl-Z undoes on Library');
  await A.keyboard.down('Control'); await A.keyboard.down('Shift'); await A.keyboard.press('KeyZ'); await A.keyboard.up('Shift'); await A.keyboard.up('Control'); await sleep(600);
  ok((await lib(A)).pl.some(x=> /^Morning:/.test(x)), 'Ctrl-Shift-Z redoes');

  // Not while Settings is open over the screen (1.4.085)
  await A.evaluate(()=> window.__dbg4.settings()); await sleep(300);
  const cov = await A.evaluate(()=> document.getElementById('btnUndo').disabled);
  await A.keyboard.down('Control'); await A.keyboard.press('KeyZ'); await A.keyboard.up('Control'); await sleep(400);
  ok(cov && (await lib(A)).pl.some(x=> /^Morning:/.test(x)), 'with Settings open, Undo is greyed out and Ctrl-Z does nothing');
  await A.keyboard.press('Escape'); await sleep(400);
  ok(await A.evaluate(()=> !document.getElementById('btnUndo').disabled), 'Settings closed: Undo is back');
  // Quick saves join into one step
  const before = (await st(A)).undo;
  await edit(A, "r.library[0].artist='X';"); await sleep(200); await edit(A, "r.library[0].album='Y';");
  ok((await st(A)).undo === before + 1, 'two saves a moment apart are one step');
  await A.evaluate(()=> window.__undo.undo()); await sleep(500);
  ok(await A.evaluate(()=> { const t = window.__dbg.getRoot().library[0]; return t.artist !== 'X' && t.album !== 'Y'; }), 'and one Undo takes back both');

  // Deleting a track: Undo brings it back, in its playlist, with its audio
  await sleep(1500);
  const id = await A.evaluate(()=> window.__dbg.getRoot().library[0].id);
  await A.evaluate((id)=> window.__undo.del([id]), id); await sleep(500);
  ok(await A.evaluate((id)=> !window.__dbg.getRoot().library.some(t=> t.id === id), id), 'the track is deleted');
  await A.evaluate(()=> window.__undo.undo()); await sleep(800);
  const back = await A.evaluate(async (id)=>{ const r = window.__dbg.getRoot(); const t = r.library.find(x=> x.id === id); let inPl = false; (function w(ns){ ns.forEach(n=>{ if(n.kind==='playlist' && n.items.some(i=> i.refId === id)) inPl = true; if(n.children) w(n.children); }); })(r.tree); const a = await window.__dmg.get(id).catch(()=> null); return {track: !!t, inPl, audio: !!(a && a.size), peaks: !!(t && t.peaks && t.peaks.length)}; }, id);
  ok(back.track && back.inPl && back.audio && back.peaks, 'Undo brings the deleted track back, in its playlist, with its audio and waveform ' + JSON.stringify(back));

  // Changed since: left as it is
  await sleep(1500);
  await edit(A, "r.library[0].name='Step name';");
  await A.evaluate(()=>{ window.__dbg.getRoot().library[0].name = 'Someone else'; window.__undo.rebase(); }); // as if from another device
  await A.evaluate(()=> window.__undo.undo()); await sleep(600);
  ok(await A.evaluate(()=> window.__dbg.getRoot().library[0].name) === 'Someone else', 'a later change from elsewhere is left as it is');
  ok(await A.evaluate(()=> /changed since/.test(document.getElementById('toast').textContent)), 'and the notice says so');

  // Survives a reload
  await sleep(1500);
  await edit(A, "r.library[0].name='Before reload';");
  await sleep(800);
  await A.reload({waitUntil:'networkidle0'}); await sleep(1500); await settle(A);
  await A.evaluate(()=> window.__dbg.setMode('editing')); await sleep(300);
  ok(await A.evaluate(()=> !document.getElementById('btnUndo').disabled), 'after a reload, Undo is still there');
  await A.evaluate(()=> window.__undo.undo()); await sleep(600);
  ok(await A.evaluate(()=> window.__dbg.getRoot().library[0].name) === 'Someone else', 'and still undoes');

  // Shared library: what arrives isn't a step
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B); await sleep(1500); await waitIdle(B);
  const n0 = (await st(A)).undo;
  await edit(B, "r.library[0].name='From the iPad';"); await sleep(500);
  await B.evaluate(()=> window.__dbg3.sync()); await sleep(800); await waitIdle(B);
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(800); await waitIdle(A); await sleep(500);
  ok(await A.evaluate(()=> window.__dbg.getRoot().library[0].name) === 'From the iPad', 'the laptop got the iPad\'s rename');
  ok((await st(A)).undo === n0, 'and it is not a step on the laptop');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
