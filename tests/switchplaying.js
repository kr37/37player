// Switching to another library while something plays asks first, whichever
// player it is (Gen Rinzin on the HP, 7 Nov 2026: Edit Playlists' player
// playing, no question): Playing, the Library tab's player, Edit Playlists'
// player at the bottom. Nothing playing: no question. In the desktop app
// (the stand-in shell), where he saw it.
//   node switchplaying.js
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{
    const mk = (b64, name)=>{ const f = new File([Uint8Array.from(atob(b64), x=>x.charCodeAt(0))], name, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; };
    window.__dbg.bulkImportFolder([mk(a, 'starter.mp3'), mk(c, 'tone.mp3')]);
  }, b64('starter.mp3'), b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 2 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  ok(await p.evaluate(()=> window.__disk.kind()) === 'desktop', 'the desktop app (bridge 2)');
  await p.evaluate(()=>{ const D = window.__disk, reg = D.readLibraryList(); reg.list.push({id: 'other1', name: 'Other'}); D.writeLibraryList(reg); });
  // Asks, and Cancel leaves everything as it was.
  const asks = async (what)=>{
    p.evaluate(()=>{ window.__disk.switchLibrary('other1'); });
    let m = '';
    for(let i = 0; i < 12; i++){ await sleep(250); m = await modalText(p); if(m) break; }
    const said = /Switching to “Other” stops it/.test(m);
    if(m) await clickText(p, '.modal button', '^Cancel$');
    await sleep(300);
    ok(said && await p.evaluate(()=> window.__disk.id()) === 'main', what + ': switching asks first, and Cancel stays (' + m.slice(0, 80).replace(/\n/g, ' ') + ')');
  };
  // Edit Playlists' player.
  const id2 = await p.evaluate(()=> window.__dbg.getRoot().library[1].id);
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(500);
  await p.evaluate((id)=> window.__edPrev(id), id2);
  for(let i=0; i<40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__edPrevPaused())) break; }
  ok(await p.evaluate(()=> !window.__edPrevPaused()), 'Edit Playlists\' player plays a track');
  await asks('Edit Playlists\' player');
  await p.evaluate(()=> document.getElementById('edPreviewAudio').pause()); await sleep(300);
  // Playing.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); const [a, c] = r.library; r.tree.push({id: 'plS', kind: 'playlist', name: 'Switch test', order: 50, items: [{id: 'sA', kind: 'track', refId: a.id, order: 0}, {id: 'sC', kind: 'track', refId: c.id, order: 1}]}); await window.__dbg.saveState(); window.__dbg.setMode('playing'); window.__play('sA'); });
  for(let i=0; i<40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__aud().paused && window.__aud().t > 0.2)) break; }
  ok(await p.evaluate(()=> !window.__aud().paused), 'Playing plays a track');
  await asks('Playing');
  // Nothing playing: straight there.
  await p.evaluate(()=> [...document.querySelectorAll('audio')].forEach(a=> a.pause())); await sleep(300);
  const nav = p.waitForNavigation({timeout: 15000}).catch(()=> null);
  await p.evaluate(()=>{ window.__disk.switchLibrary('other1'); });
  await nav; await sleep(1500);
  ok(await p.evaluate(()=> window.__disk.id()) === 'other1', 'nothing playing: it switches without asking');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
