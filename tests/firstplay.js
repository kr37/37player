// The first Play after a start, in the desktop app (2.5.004; Gen Rinzin's
// T470, 14 Nov 2026: the button stayed a triangle through a click or two).
// Play waited until every track's record had been read once, to know which
// are used in place. Now, until that's known, the track starts inside the
// click. Here reading the records is made slow, and Play still starts at once.
//   node firstplay.js
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.evaluateOnNewDocument(fs.readFileSync(__dirname + '/fake-shell.js', 'utf8'));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(1000);
  for(const x of ['^English$','^Keep them there$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$','^OK$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id: 'tk', name: 'Ten', duration: 600, peaks: [0.2, 0.4]}); await window.__dbg3.put('audio', {id: 'tk', blob: new File([blob], 'Ten.mp3', {type: 'audio/mpeg'})}); r.tree.push({id: 'pl', kind: 'playlist', name: 'P', items: [{id: 'it', kind: 'track', refId: 'tk', order: 0}]}); await window.__dbg.saveState(); });
  await p.evaluate(()=> window.__play('it')); await sleep(1500);
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(800); // paused partway: put back at the next start
  // The next start, with the records slow to read (as hundreds of tracks are).
  await p.evaluateOnNewDocument(()=>{ window.__slowPlaceRefs = 6000; });
  await p.reload({waitUntil: 'networkidle0'}); await sleep(1200);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const before = await p.evaluate(()=> window.__st());
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(900);
  const after = await p.evaluate(()=> window.__st());
  ok(before.paused && !after.paused, 'the first Play after a start plays at once, though which tracks are used in place isn\'t known yet (' + JSON.stringify({before: before.paused, after: after.paused, t: after.t}) + ')');
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(500);
  ok((await p.evaluate(()=> window.__st())).paused, 'and the next click pauses');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
