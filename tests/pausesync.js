const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__ah = {}; const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (k,f)=>{ window.__ah[k]=f; o(k,f); }; });
  await p.emulate({viewport:{width:1024,height:768,isMobile:true,hasTouch:true,deviceScaleFactor:1}, userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile'});
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate((u,c)=> window.__dbg3.join(u,c,'iPad'), 'http://127.0.0.1:8870/sync.php', process.argv[2]); await sleep(1500);
  console.log('server version seen:', await p.evaluate(()=> window.__srv()));
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.settings.sharedLibrary.keepAwake = true; const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id:'tk', name:'Ten', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5)}); await window.__dbg3.put('audio',{id:'tk', blob}); r.tree.push({id:'pl', kind:'playlist', name:'P', items:[{id:'it', kind:'track', refId:'tk', order:0}]}); await window.__dbg.saveState(); window.__fakeOut = true; });
  await p.evaluate(()=> window.__play('it')); await sleep(2500);
  await p.evaluate(()=> window.__ah.pause()); await sleep(1500);
  let s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(await p.evaluate(()=> window.__aw()), 'paused from the lock screen: syncing carries on');
  ok(s.title === 'Ten' && /Paused/.test(s.artist) && s.ms === 'paused', 'lock screen still shows the paused track');
  await p.evaluate(()=> window.__ah.play()); await sleep(1500);
  s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(!s.paused && s.t > 2 && !(await p.evaluate(()=> window.__aw())) && s.title === 'Ten' && !/Paused/.test(s.artist||''), 'lock-screen play resumes the track where it was');
  await p.evaluate(()=> window.__ah.pause()); await sleep(1500);
  await p.evaluate(()=> window.__ah.pause()); await sleep(1500); // the button some lock screens show while the silent loop plays
  s = await p.evaluate(()=> window.__st());
  ok(!s.paused, 'pause shown during syncing also resumes the paused track');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
