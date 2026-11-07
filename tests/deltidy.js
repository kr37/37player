// Deleting tracks that playlists use (1.4.177, Gen Rinzin): after the first
// "Delete", a second question: delete the playlists and folders this leaves
// empty (ticked), and the playlists that used the tracks but hold others
// (not ticked, listed). A playlist or folder empty before stays. One Undo
// brings tracks and playlists back; Cancel deletes nothing.
//   node deltidy.js     (servers from serve.sh running)
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> (document.querySelector('.modal') || {}).innerText || '');
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1100, height: 820});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{ const mk = (b64, name)=>{ const f = new File([Uint8Array.from(atob(b64), x=>x.charCodeAt(0))], name, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; }; window.__dbg.bulkImportFolder([mk(a, 'starter.mp3'), mk(c, 'tone.mp3')]); }, b64('starter.mp3'), b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 2 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  const setup = ()=> p.evaluate(async()=>{
    const r = window.__dbg.getRoot(); const [a, c] = r.library;
    r.tree = [
      {id: 'F', kind: 'folder', name: 'Festival', children: [{id: 'P1', kind: 'playlist', name: 'Only A', items: [{id: 'e1', kind: 'track', refId: a.id}]}]},
      {id: 'P2', kind: 'playlist', name: 'A and B', items: [{id: 'e2', kind: 'track', refId: a.id}, {id: 'e3', kind: 'track', refId: c.id}]},
      {id: 'P3', kind: 'playlist', name: 'Empty before', items: []},
      {id: 'G', kind: 'folder', name: 'Empty folder', children: []},
    ];
    await window.__dbg.saveState(); await new Promise(r=> setTimeout(r, 1500)); return a.id; // past Undo's joining of quick saves (UNDO_JOIN_MS)
  });
  const names = ()=> p.evaluate(()=>{ const out = []; (function walk(ns){ for(const n of ns){ out.push(n.id); if(n.children) walk(n.children); } })(window.__dbg.getRoot().tree); return out.sort().join(','); });
  // 1. The defaults: what's left empty goes; the playlist with other tracks stays
  let a = await setup();
  await p.evaluate((id)=> window.__delAsk([id]), a); await sleep(400);
  await clickText(p, '.modal button', '^Delete$'); await sleep(500);
  let m = await modalText(p);
  ok(/Tidy the playlists too/.test(m) && /left as they are/.test(m), 'after Delete, a second question');
  const boxes = await p.evaluate(()=> ({e: document.getElementById('tidyEmpty')?.checked, u: document.getElementById('tidyUsed')?.checked}));
  ok(boxes.e === true && boxes.u === false && /leaves empty \(1\)/.test(m) && /Festival \/ Only A/.test(m) && /used these tracks \(1\)/.test(m) && /A and B/.test(m), 'empties ticked, the other playlist not, both listed');
  await (await p.$('.modal')).screenshot({path: 'shots/deltidy.png'});
  ok(await p.evaluate((id)=> !!window.__dbg.getRoot().library.find(t=> t.id === id), a), 'nothing is deleted while it asks');
  await p.click('#tidyGo'); await sleep(900);
  ok(await names() === 'G,P2,P3' && await p.evaluate((id)=> !window.__dbg.getRoot().library.find(t=> t.id === id), a), 'the track, the playlist it emptied and that folder go; the rest stays (' + await names() + ')');
  // 2. One Undo brings it all back
  await p.evaluate(()=> window.__undo.undo()); await sleep(900);
  ok(await names() === 'F,G,P1,P2,P3' && await p.evaluate((id)=> !!window.__dbg.getRoot().library.find(t=> t.id === id), a), 'one Undo brings back the track and the playlists (' + await names() + ')');
  // 3. Ticking the other: that playlist goes too
  a = await setup();
  await p.evaluate((id)=> window.__delAsk([id]), a); await sleep(400);
  await clickText(p, '.modal button', '^Delete$'); await sleep(500);
  await p.click('#tidyUsed'); await p.click('#tidyGo'); await sleep(900);
  ok(await names() === 'G,P3', 'ticking "used these tracks" deletes that playlist too (' + await names() + ')');
  await p.evaluate(()=> window.__undo.undo()); await sleep(900);
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === 2, 'and Undo brings it back again');
  // 4. Cancel at the second question: nothing deleted
  a = await setup();
  await p.evaluate((id)=> window.__delAsk([id]), a); await sleep(400);
  await clickText(p, '.modal button', '^Delete$'); await sleep(500);
  await clickText(p, '.modal button', '^Cancel$'); await sleep(600);
  ok(await names() === 'F,G,P1,P2,P3' && await p.evaluate((id)=> !!window.__dbg.getRoot().library.find(t=> t.id === id), a), 'Cancel there deletes nothing');
  // 5. A track no playlist uses: no second question
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; await window.__dbg.saveState(); });
  await p.evaluate((id)=> window.__delAsk([id]), a); await sleep(400);
  await clickText(p, '.modal button', '^Delete$'); await sleep(800);
  ok(!/Tidy the playlists/.test(await modalText(p)) && await p.evaluate((id)=> !window.__dbg.getRoot().library.find(t=> t.id === id), a), 'a track in no playlist: deleted, no second question');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
