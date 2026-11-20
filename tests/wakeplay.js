// A computer's "play" on waking is ignored (2.6.000; kr37's MacBook, report
// 2026-11-20-153553: 37 Player started playing when he opened the lid,
// though it had been paused). macOS sent "pause" as the lid closed, with
// 37 Player already paused, and "play" on waking. On a computer: such a
// "play" over a minute later is ignored (and logged), a second press plays;
// within a minute, or after a real pause, or once something has played since,
// "play" plays. On a tablet every "play" plays.
//   node wakeplay.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function open(b, tablet){
  const p = await (await b.createBrowserContext()).newPage();
  if(tablet) await p.emulate({viewport:{width:1024,height:768,isMobile:true,hasTouch:true,deviceScaleFactor:1}, userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile'});
  else await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{
    window.__ah = {}; const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (k,f)=>{ window.__ah[k]=f; o(k,f); };
    // The clock, moved on by the test (the computer asleep).
    const real = Date.now; window.__skew = 0; Date.now = ()=> real() + window.__skew;
  });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id:'tk', name:'Ten', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5)}); await window.__dbg3.put('audio',{id:'tk', blob}); r.tree.push({id:'pl', kind:'playlist', name:'P', items:[{id:'it', kind:'track', refId:'tk', order:0}]}); await window.__dbg.saveState(); });
  return p;
}
const paused = p=> p.evaluate(()=> window.__st().paused);
const sleepOver = p=> p.evaluate(()=>{ window.__skew += 3 * 3600000; }); // three hours with the lid shut
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await open(b, false);
  await p.evaluate(()=> window.__play('it')); await sleep(1500);
  ok(!(await paused(p)), 'it plays');
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(500);
  ok(await paused(p), 'paused in 37 Player');
  // The lid closes: macOS says pause (already paused); hours later it opens: play.
  await p.evaluate(()=> window.__ah.pause()); await sleepOver(p);
  await p.evaluate(()=> window.__ah.play()); await sleep(800);
  ok(await paused(p), 'the computer\'s play on waking is ignored');
  ok((await p.evaluate(()=> window.__log())).some(l=> /play, ignored: the computer's own, on waking/.test(l)), 'and the playback log says so');
  await p.evaluate(()=> window.__ah.play()); await sleep(800);
  ok(!(await paused(p)), 'a second press of the play key plays');
  // Paused by the play key itself (a real pause), then play hours later: plays.
  await p.evaluate(()=> window.__ah.pause()); await sleep(400);
  ok(await paused(p), 'the pause key pauses');
  await sleepOver(p); await p.evaluate(()=> window.__ah.play()); await sleep(800);
  ok(!(await paused(p)), 'after a real pause, play hours later plays');
  // A pause while paused, then play within the minute: plays.
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(400);
  await p.evaluate(()=> window.__ah.pause()); await p.evaluate(()=>{ window.__skew += 20000; });
  await p.evaluate(()=> window.__ah.play()); await sleep(800);
  ok(!(await paused(p)), 'play within a minute of that pause plays');
  // A pause while paused, then 37 Player played and paused by hand: the guard is gone.
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(400);
  await p.evaluate(()=> window.__ah.pause());
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(800);
  await p.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(400);
  await sleepOver(p); await p.evaluate(()=> window.__ah.play()); await sleep(800);
  ok(!(await paused(p)), 'once something has played since, play plays');
  // On a tablet the lock screen's play is how it's used: it plays.
  const t = await open(b, true);
  await t.evaluate(()=> window.__play('it')); await sleep(1500);
  await t.evaluate(()=> document.getElementById('btnPlay').click()); await sleep(500);
  await t.evaluate(()=> window.__ah.pause()); await sleepOver(t);
  await t.evaluate(()=> window.__ah.play()); await sleep(800);
  ok(!(await paused(t)), 'on a tablet the same play plays');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
