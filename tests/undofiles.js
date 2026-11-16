// Undo for artwork and for a replaced recording (2.5.012): the file as it
// was is kept aside before the change (undoKeepFile, called by Edit track
// details, Edit several tracks and Replace audio file), the save makes a
// step that carries it, and undoing or redoing swaps the files. Here the
// calls those three places make are made directly. Needs only the page server.
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } };
const text = (p, store)=> p.evaluate(async (store)=>{ const r = await window.__undo.get(store, 't1'); return r && r.blob ? await r.blob.text() : null; }, store);
const track = p=> p.evaluate(()=>{ const t = window.__dbg.getRoot().library.find(x=> x.id === 't1'); return {hasArtwork: !!t.hasArtwork, fileSize: t.fileSize, filename: t.filename, artRev: t.artRev, audioRev: t.audioRev}; });
const stacks = p=> p.evaluate(()=> window.__undo.stacks());
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1400,height:1000});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(); r.tree = []; delete r.settings.starterPlaylistId;
    r.library = [{id: 't1', name: 'One', artist: 'A', album: 'B', trackNo: 1, duration: 60, filename: 'one.mp3', fileSize: 9}];
    await window.__undo.put('audio', {id: 't1', blob: new Blob(['audio-one'], {type: 'audio/mpeg'})});
    await window.__dbg.saveState();
  });
  await sleep(1800);
  const base = (await stacks(p)).undo;
  // Artwork added
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(), t = r.library.find(x=> x.id === 't1'); await window.__undo.keepFile('t1', 'art'); await window.__undo.put('artwork', {id: 't1', blob: new Blob(['art-A'], {type: 'image/jpeg'})}); t.hasArtwork = true; await window.__dbg.saveState(); });
  await sleep(1600);
  let s = await stacks(p);
  ok(s.undo === base + 1 && /artwork changed/.test(s.labels[s.labels.length - 1]), 'adding artwork makes a step: ' + s.labels[s.labels.length - 1]);
  // Artwork replaced
  await p.evaluate(async()=>{ await window.__undo.keepFile('t1', 'art'); await window.__undo.put('artwork', {id: 't1', blob: new Blob(['art-B'], {type: 'image/jpeg'})}); await window.__dbg.saveState(); });
  await sleep(1600);
  s = await stacks(p);
  ok(s.undo === base + 2, 'replacing it makes another');
  const revB = (await track(p)).artRev;
  await p.evaluate(()=> window.__undo.undo()); await sleep(900);
  ok(await text(p, 'artwork') === 'art-A' && (await track(p)).hasArtwork, 'Undo puts the earlier artwork back');
  ok((await track(p)).artRev !== revB, 'under a new revision, so a shared library sends it on');
  await p.evaluate(()=> window.__undo.undo()); await sleep(900);
  ok(await text(p, 'artwork') === null && !(await track(p)).hasArtwork, 'Undo again: no artwork, as at the start');
  await p.evaluate(()=> window.__undo.redo()); await sleep(900);
  ok(await text(p, 'artwork') === 'art-A' && (await track(p)).hasArtwork, 'Redo: the first artwork');
  await p.evaluate(()=> window.__undo.redo()); await sleep(900);
  ok(await text(p, 'artwork') === 'art-B', 'Redo again: the second');
  // The recording replaced, with a new name from the file
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(), t = r.library.find(x=> x.id === 't1'); await window.__undo.keepFile('t1', 'audio'); await window.__undo.put('audio', {id: 't1', blob: new Blob(['audio-two-longer'], {type: 'audio/mpeg'})}); t.fileSize = 16; t.filename = 'two.mp3'; t.name = 'Two'; await window.__dbg.saveState(); });
  await sleep(1600);
  s = await stacks(p);
  ok(/1 track changed/.test(s.labels[s.labels.length - 1]) && /audio replaced/.test(s.labels[s.labels.length - 1]), 'Replace audio file is one step: ' + s.labels[s.labels.length - 1]);
  // History shows it
  await p.evaluate(()=> window.__hist.open()); for(let i=0;i<40;i++){ await sleep(150); if(await p.$('.hist-point')) break; } await sleep(300);
  const rows = await p.evaluate(()=> [...document.querySelectorAll('.rb-row')].map(r=> r.innerText.replace(/\s+/g,' ').trim()));
  ok(rows.some(r=> /^One Two renamed · different audio$/.test(r)) && await p.evaluate(()=> !!document.getElementById('rbGo')), 'History lists the track with "renamed · different audio", and offers Undo back to this');
  await p.evaluate(()=> document.getElementById('rbGo').click()); await sleep(1500);
  let tr = await track(p);
  ok(await text(p, 'audio') === 'audio-one' && tr.fileSize === 9 && tr.filename === 'one.mp3', 'undone from History: the first recording is back, with its size and file name (' + JSON.stringify(tr) + ')');
  await p.evaluate(()=> window.__undo.redo()); await sleep(900);
  tr = await track(p);
  ok(await text(p, 'audio') === 'audio-two-longer' && tr.fileSize === 16 && tr.filename === 'two.mp3', 'Redo: the replacement again');
  // Artwork alone, seen in History
  await p.evaluate(()=> window.__undo.undo()); await sleep(900);
  await p.evaluate(()=> window.__hist.open()); for(let i=0;i<40;i++){ await sleep(150); if(await p.$('.hist-point')) break; } await sleep(300);
  const rows2 = await p.evaluate(()=> [...document.querySelectorAll('.rb-row')].map(r=> r.innerText.replace(/\s+/g,' ').trim()));
  ok(rows2.some(r=> /^One One different artwork$/.test(r)) && await p.evaluate(()=> !!document.getElementById('rbGo')), 'a step that only changed artwork still shows in History (' + rows2.filter(r=> /One/.test(r)).join(' | ') + ')');
  await p.evaluate(()=> document.getElementById('histClose').click()); await sleep(200);
  // A kept file that has gone: Undo leaves the track and says so
  await p.evaluate(async()=>{ for(const k of await window.__undo.trash()) await window.__undo.delRec('state', k); });
  const before = await text(p, 'artwork');
  await p.evaluate(()=> window.__undo.undo()); await sleep(900);
  const toast = await p.evaluate(()=> (document.querySelector('.toast') || {}).textContent || '');
  ok(await text(p, 'artwork') === before && /left as it is/.test(toast), 'with the kept file gone, Undo leaves the artwork and says some was left as it is');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
