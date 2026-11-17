// A dialog closes first, then does its work (2.5.031, kr37's design, 16 Nov
// 2026): Edit details, Delete and editing several tracks close at once and
// show the change at once, even while saving is held up (slowSaves, as sync
// or another save would); "Saving…" / "Deleting…" shows in the status bar
// only when it takes longer than half a second; closing the window asks
// while one is waiting; Undo waits for it; something that fails says so.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300); };
const modalOpen = p=> p.evaluate(()=> !!document.querySelector('.modal-backdrop.show'));
const modalText = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{
    const mk = (b64, name)=>{ const f = new File([Uint8Array.from(atob(b64), x=>x.charCodeAt(0))], name, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; };
    window.__dbg.bulkImportFolder([mk(a, 'starter.mp3'), mk(c, 'tone.mp3'), mk(c, 'tone2.mp3')]);
  }, b64('starter.mp3'), b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<160; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 3 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(500);
  const [A, C, D] = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.id));
  await p.evaluate(()=> window.__ad.idle()); await sleep(300);

  // ---- Edit details, with saving held up 3 s: closes at once, shows the new name at once.
  await p.evaluate((id)=> window.__ad.edit(id), A); await sleep(500);
  await p.evaluate(()=>{ document.getElementById('editName').value = 'Renamed while slow'; });
  await p.evaluate(()=> window.__ad.slowSaves(3000));
  const t0 = Date.now();
  await p.evaluate(()=> document.getElementById('editSaveGo').click());
  await sleep(80);
  ok(!await modalOpen(p) && Date.now() - t0 < 1000, 'Save: the dialog is gone at once (' + (Date.now() - t0) + ' ms), with saving held up');
  ok(await p.evaluate(()=> document.body.innerText.includes('Renamed while slow')), 'and the Library shows the new name at once');
  ok(await p.evaluate(()=> window.__ad.pending() === 1 && !/Saving/.test(window.__ad.bar())), 'the save is waiting; the status bar says nothing yet');
  await sleep(700);
  ok(/Saving…/.test(await p.evaluate(()=> window.__ad.bar())), 'after half a second the status bar says "Saving…" (' + await p.evaluate(()=> window.__ad.bar()) + ')');
  ok((await p.evaluate(()=> window.__ad.closing())).includes('saving your last change'), 'closing the desktop app\'s window would ask first ("saving your last change")');
  await p.evaluate(()=> window.__ad.idle()); await sleep(200);
  ok(await p.evaluate(()=> window.__ad.pending() === 0 && !/Saving/.test(window.__ad.bar())), 'once saved: the status bar line has gone');

  // ---- A quick save never shows "Saving…".
  await p.evaluate((id)=> window.__ad.edit(id), C); await sleep(500);
  await p.evaluate(()=>{ document.getElementById('editArtist').value = 'Quick artist'; document.getElementById('editSaveGo').click(); });
  let sawSaving = false;
  for(let i=0; i<12; i++){ await sleep(100); if(/Saving/.test(await p.evaluate(()=> window.__ad.bar()))) sawSaving = true; }
  ok(!sawSaving && await p.evaluate(()=> window.__ad.pending() === 0), 'a quick save: no "Saving…" at all');

  // ---- A new picture shows at once, and is written in the background.
  const png = await p.evaluate(async()=>{ const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 40, 40); const bl = await new Promise(r=> c.toBlob(r, 'image/png')); window.__ad.copyPic(bl); return bl.size; });
  await p.evaluate((id)=> window.__ad.edit(id), D); await sleep(500);
  await p.evaluate(()=> document.getElementById('editArtworkPaste').click()); await sleep(200);
  await p.evaluate(()=> window.__ad.slowSaves(2500));
  const artAtOnce = await p.evaluate((id)=>{ document.getElementById('editSaveGo').click(); return window.__ad.art(id) || ''; }, D); await sleep(80);
  ok(!await modalOpen(p) && /^blob:/.test(artAtOnce), 'a pasted picture: dialog gone, and its thumbnail is ready at once');
  await p.evaluate(()=> window.__ad.idle()); await sleep(300);
  ok(await p.evaluate((id)=> !!window.__dbg.getRoot().library.find(t=> t.id === id).hasArtwork, D), 'once written: the track has its picture');

  // ---- Delete, saving held up: the track leaves the screen at once; Undo waits and brings it back with its audio.
  const dName = await p.evaluate((id)=> window.__dbg.getRoot().library.find(t=> t.id === id).name, D);
  await p.evaluate(()=> window.__ad.slowSaves(3000));
  await p.evaluate((id)=> window.__delAsk([id]), D); await sleep(400);
  await clickText(p, '.modal button', '^Delete$'); await sleep(300);
  await p.evaluate(()=> document.getElementById('tidyGo')?.click()); await sleep(80); // the playlists question (1.4.177)
  ok(!await modalOpen(p) && await p.evaluate((id)=> !window.__dbg.getRoot().library.find(t=> t.id === id), D), 'Delete: the dialog is gone and the track is out of the library at once');
  ok(await p.evaluate((n)=> ![...document.querySelectorAll('.lib-track-row, .lib-row, tr')].some(r=> r.innerText.includes(n)), dName), 'and off the screen at once');
  await sleep(700);
  ok(/Deleting…/.test(await p.evaluate(()=> window.__ad.bar())), 'the status bar says "Deleting…" while it finishes');
  const undone = p.evaluate(()=> window.__ad.undo());
  await sleep(300);
  ok(await p.evaluate((id)=> !window.__dbg.getRoot().library.find(t=> t.id === id), D), 'Undo pressed meanwhile waits for the delete to finish');
  await undone; await sleep(800);
  ok(await p.evaluate(async(id)=> !!window.__dbg.getRoot().library.find(t=> t.id === id) && !!(await window.__undo.get('audio', id)), D), 'then brings the track back, with its audio');

  // ---- Editing several tracks: the list shows the new artist at once.
  await p.evaluate(()=> window.__ad.slowSaves(2500));
  await p.evaluate((ids)=> window.__ad.bulk(ids), [A, C]); await sleep(500);
  await p.evaluate(()=>{ document.getElementById('bulkEditArtist').value = 'Bulk artist'; document.getElementById('bulkEditGo').click(); }); await sleep(100);
  ok(!await modalOpen(p) && await p.evaluate(()=> document.body.innerText.includes('Bulk artist')), 'editing several tracks: dialog gone and the new artist shown at once');
  await p.evaluate(()=> window.__ad.idle());

  // ---- Something that fails after the dialog closed says so.
  await p.evaluate(()=> window.__ad.run('bgSaving', 'bgSaveFailed', async()=>{ throw new Error('test failure'); }));
  await sleep(1200);
  const m = await modalText(p);
  ok(/Not finished/.test(m) && /Saving your change didn't finish: .*test failure/.test(m), 'a failure after the dialog closed is shown (' + m.replace(/\n/g, ' | ').slice(0, 100) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
