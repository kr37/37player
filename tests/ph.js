const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__ah = {}; const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (k,f)=>{ window.__ah[k]=f; o(k,f); }; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id:'tk', name:'Ten', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5)}); await window.__dbg3.put('audio',{id:'tk', blob}); r.tree.push({id:'pl', kind:'playlist', name:'P', items:[{id:'it', kind:'track', refId:'tk', order:0}]}); await window.__dbg.saveState(); });
  await p.evaluate(()=> window.__play('it')); await sleep(1500);
  await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>true, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>'hidden', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(500);
  await p.evaluate(()=> window.__ah.pause()); await sleep(800);
  let s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(s.paused && s.pauseHold && s.ka && s.title==='Ten' && s.ms==='paused', 'paused off screen: silent loop keeps it awake, track still on the lock screen');
  await p.evaluate(()=> window.__ah.play()); await sleep(800);
  s = await p.evaluate(()=> window.__st());
  ok(!s.paused && !s.pauseHold, 'lock-screen play resumes');
  await p.evaluate(()=> window.__ah.pause()); await sleep(500);
  await p.evaluate(()=> window.__ah.pause()); await sleep(800);
  s = await p.evaluate(()=> window.__st());
  ok(!s.paused, 'the pause button shown while held also resumes');
  await p.evaluate(()=>{ window.__dbg.getRoot().settings.stopLockScreen = false; }); await p.evaluate(()=> window.__ah.pause()); await sleep(800);
  s = await p.evaluate(()=> window.__st());
  ok(s.paused && !s.pauseHold && !s.ka, 'setting off: nothing kept running');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
