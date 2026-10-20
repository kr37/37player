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
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id:'tk', name:'Ten', duration:600, peaks:new Array(720).fill(0.5)}); await window.__dbg3.put('audio',{id:'tk', blob});
    r.tree.push({id:'pl', kind:'playlist', name:'Morning', items:[{id:'a',kind:'track',refId:'tk',order:0},{id:'s',kind:'stop',name:'Stop for teaching',order:1},{id:'b',kind:'track',refId:'tk',order:2}]}); await window.__dbg.saveState();
    Object.defineProperty(document,'hidden',{get:()=>true, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>'hidden', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(()=> window.__play('a')); await sleep(800);
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = a.duration - 0.5; }); await sleep(2500);
  let s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(s.cur==='s' && s.stopHold && s.ka && s.title==='Stop for teaching' && /continue/.test(s.artist) && s.ms==='paused', 'at the stop: loop on, lock screen shows the stop');
  await sleep(3000);
  s = await p.evaluate(()=> window.__st());
  ok(s.ka && s.stopHold, 'still held a while later');
  await p.evaluate(()=> window.__ah.play()); await sleep(1500);
  s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(s.cur==='b' && !s.paused && !s.stopHold, 'lock-screen play continues to the next track');
  // setting off
  await p.evaluate(()=>{ window.__dbg.getRoot().settings.stopLockScreen = false; window.__play('s'); }); await sleep(800);
  s = await p.evaluate(()=> window.__st());
  ok(s.cur==='s' && !s.stopHold && !s.ka, 'setting off: nothing kept running at a stop');
  console.log((await p.evaluate(()=>window.__log())).slice(-12).join('\n'));
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
