// The Playing screen with nothing chosen: with no playlists at all it says
// where to make one (kr37, 16 Nov 2026), otherwise to choose one.
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300); };
const empty = p=> p.evaluate(()=> document.querySelector('.empty-state')?.innerText || '');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; delete r.settings.starterPlaylistId; r.session = {}; await window.__dbg.saveState(); window.__dbg.setMode('playing'); window.__dbg.render(); }); await sleep(400);
  let e = await empty(p);
  ok(/Nothing playing yet/.test(e) && /First, make a playlist on “Edit Playlists”\./.test(e), 'no playlists: says to make one on “Edit Playlists” (' + e.replace(/\n+/g, ' / ') + ')');
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id: 'pe1', kind: 'playlist', name: 'Morning', order: 0, items: []}); await window.__dbg.saveState(); window.__dbg.render(); }); await sleep(400);
  e = await empty(p);
  ok(!e || /Choose a playlist from the list to begin\./.test(e), 'with a playlist: no such line (' + e.replace(/\n+/g, ' / ') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
