// Pause after a passing error on the player (2.3.001). Any error event used
// to mark the track "stuck" (meant for a track used in place whose drive went
// away), and only a track used in place had the mark taken off: from then
// on Pause, the space bar and the lock screen's pause played instead. Found
// by the WebKit tests (bridge3's "pause pauses"), 13 Nov 2026.
//   node stuckpause.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__ah = {}; const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (k,f)=>{ window.__ah[k]=f; o(k,f); }; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id:'tk', name:'Ten', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5)}); await window.__dbg3.put('audio',{id:'tk', blob}); r.tree.push({id:'pl', kind:'playlist', name:'P', items:[{id:'it', kind:'track', refId:'tk', order:0}]}); await window.__dbg.saveState(); });
  await p.evaluate(()=> window.__play('it')); await sleep(1500);
  ok(!(await p.evaluate(()=> window.__st())).paused, 'it plays');
  // A passing error (WebKit gives one, for instance, for an address let go meanwhile).
  await p.evaluate(()=> document.getElementById('audioEl').dispatchEvent(new Event('error'))); await sleep(300);
  await p.evaluate(()=> window.__ah.pause()); await sleep(500);
  let s = await p.evaluate(()=> window.__st());
  ok(s.paused, 'the lock screen\'s pause still pauses (' + JSON.stringify({paused: s.paused, t: s.t}) + ')');
  await p.evaluate(()=> window.__ah.play()); await sleep(800);
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(500);
  s = await p.evaluate(()=> window.__st());
  ok(s.paused, 'and so does the Play/Pause button');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
