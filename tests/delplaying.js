// Deleting a track that's playing (1.4.162, Gen's design): the confirmation
// says first that it's playing and that deleting stops it; Delete stops it
// and deletes. Deleting another track says nothing of the kind, and what's
// playing carries on.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
const modalText = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{
    const mk = (b64, name)=>{ const f = new File([Uint8Array.from(atob(b64), x=>x.charCodeAt(0))], name, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; };
    window.__dbg.bulkImportFolder([mk(a, 'starter.mp3'), mk(c, 'tone.mp3')]);
  }, b64('starter.mp3'), b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 2 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  // Edit Playlists' player at the bottom (1.4.170: Gen found it unwarned on the Mac mini).
  const edId = await p.evaluate(()=> window.__dbg.getRoot().library[1].id);
  await p.evaluate((id)=> window.__edPrev(id), edId);
  for(let i=0; i<40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__edPrevPaused())) break; }
  ok(await p.evaluate(()=> !window.__edPrevPaused()), 'Edit Playlists\' player is playing a track');
  await p.evaluate((id)=> window.__delAsk([id]), edId); await sleep(500);
  ok(/is playing right now/.test(await modalText(p)), 'deleting it warns that it\'s playing');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  await p.evaluate(()=> document.getElementById('edPreviewAudio').pause()); await sleep(200);
  // Play the first track of a playlist holding both.
  const ids = await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); const [a, c] = r.library; r.tree.push({id: 'plD', kind: 'playlist', name: 'Del test', order: 50, items: [{id: 'eA', kind: 'track', refId: a.id, order: 0}, {id: 'eC', kind: 'track', refId: c.id, order: 1}]}); await window.__dbg.saveState(); window.__dbg.setMode('playing'); window.__play('eA'); return {a: a.id, aName: a.name, c: c.id}; });
  for(let i=0; i<40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__aud().paused && window.__aud().t > 0.2)) break; }
  ok(await p.evaluate(()=> !window.__aud().paused), 'playing the first track');
  // Deleting the other track: no warning, playing carries on.
  await p.evaluate((id)=> window.__delAsk([id]), ids.c); await sleep(500);
  let m = await modalText(p);
  ok(!/playing right now/.test(m), 'deleting a track that isn\'t playing: no warning');
  await clickText(p, '.modal button', '^Delete$'); await sleep(800);
  ok(await p.evaluate(()=> !window.__aud().paused), 'and what\'s playing carries on');
  // Deleting the playing track: warned, then stopped and deleted.
  await p.evaluate((id)=> window.__delAsk([id]), ids.a); await sleep(500);
  m = await modalText(p);
  ok(m.includes('This track, “' + ids.aName + '”, is playing right now. Deleting it stops it.'), 'deleting the playing track: the confirmation says so first (' + m.split('\n')[0] + ' | ' + m.split('\n').find(l=> /playing/.test(l)) + ')');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(400);
  ok(await p.evaluate(()=> !window.__aud().paused) && await p.evaluate((id)=> !!window.__dbg.getRoot().library.find(t=> t.id === id), ids.a), 'Cancel: still playing, still there');
  await p.evaluate((id)=> window.__delAsk([id]), ids.a); await sleep(500);
  await clickText(p, '.modal button', '^Delete$'); await sleep(1000);
  ok(await p.evaluate(()=> window.__aud().paused), 'Delete: playing stops');
  ok(await p.evaluate((id)=> !window.__dbg.getRoot().library.find(t=> t.id === id), ids.a), 'and the track is gone');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
