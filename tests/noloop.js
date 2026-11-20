// No silent loop on a computer (2.5.046; kr37's MacBook, 18 Nov 2026: one of
// the loop's many stops hung the Mac's media process and froze the page).
// With the window hidden: a pause, a track handing over to a silence and on
// to the next track, and a stop never start it, and a silence still ends on
// time (the silence clock). And in the desktop app, a key the shell refuses
// (shell 2.5.3 doesn't know "37player.install") no longer stops device.json
// from being written: the rest, the playback log among them, still goes.
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
    r.tree.push({id:'pl', kind:'playlist', name:'Morning', items:[{id:'a',kind:'track',refId:'tk',order:0},{id:'si',kind:'silence',seconds:2,order:1},{id:'b',kind:'track',refId:'tk',order:2},{id:'s',kind:'stop',name:'Stop for teaching',order:3},{id:'c',kind:'track',refId:'tk',order:4}]}); await window.__dbg.saveState(); });
  // Watch the loop the whole time.
  await p.evaluate(()=>{ window.__kaSeen = false; setInterval(()=>{ const s = window.__st(); if(s.ka || s.hold || s.stopHold || s.pauseHold) window.__kaSeen = true; }, 100); });
  await p.evaluate(()=> window.__play('a')); await sleep(1500);
  await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>true, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>'hidden', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(500);
  await p.evaluate(()=> window.__ah.pause()); await sleep(800);
  let s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(s.paused && !s.pauseHold && !s.ka, 'paused off screen: no silent loop');
  await p.evaluate(()=> window.__ah.play()); await sleep(800);
  for(let i = 0; i < 50 && !(await p.evaluate(()=> isFinite(document.getElementById('audioEl').duration) && document.getElementById('audioEl').duration > 1)); i++) await sleep(100);
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = a.duration - 0.5; });
  const t0 = Date.now(); let reachedB = 0;
  for(let i = 0; i < 80; i++){ await sleep(100); s = await p.evaluate(()=> window.__st()); if(s.cur === 'b' && !s.paused){ reachedB = Date.now() - t0; break; } }
  ok(reachedB > 1500 && reachedB < 5000, 'track → 2 s silence → track, hidden: on time without the loop (' + reachedB + ' ms)');
  // Seek only once the player knows the track's length: since 2.5.052 the page reads a file's first bytes before handing it over, so the track loads a moment later, and a seek before then did nothing in WebKit (19 Nov 2026).
  for(let i = 0; i < 50 && !(await p.evaluate(()=> isFinite(document.getElementById('audioEl').duration) && document.getElementById('audioEl').duration > 1)); i++) await sleep(100);
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = a.duration - 0.5; }); await sleep(2500);
  s = await p.evaluate(()=> window.__st()); console.log(JSON.stringify(s));
  ok(s.cur === 's' && !s.stopHold && !s.ka, 'at a stop, hidden: no silent loop');
  ok(!(await p.evaluate(()=> window.__kaSeen)), 'the silent loop never played');
  const log = await p.evaluate(()=> window.__log());
  ok(!log.some(l=> /silent loop on|lock screen kept ready/.test(l)), 'and the playback log says so (' + log.slice(-6).join(' | ') + ')');
  await p.close();

  // The desktop app: a shell that refuses a key, as shell 2.5.3 refuses "37player.install".
  const q = await b.newPage(); q.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); q.on('dialog', d=> d.dismiss());
  await q.evaluateOnNewDocument(()=>{
    const KEYS = ["37player.libraries", "37player.device", "37player.libTable", "37player.storage", "37player.autoRestore", "37player.driveSignIn", "37player.playLog"];
    window.__TAURI_INTERNALS__ = {}; window.__puts = []; window.__refused = 0;
    window.__TAURI__ = {event: {listen: async ()=> ()=>{}}, core: {invoke: async (cmd, args)=>{
      if(cmd === 'p37_shell_info') return {version: '2.5.3', bridge: 1, pages: false};
      if(cmd === 'p37_device_put'){
        for(const k of Object.keys(args.values)) if(!KEYS.includes(k)){ window.__refused++; throw "not a device key: " + k; }
        window.__puts.push(args.values);
      }
    }}};
  });
  await q.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  await q.evaluate(()=>{ localStorage.setItem('37player.install', 'abc'); localStorage.setItem('37player.playLog', JSON.stringify(['a line'])); }); await sleep(2000);
  const r = await q.evaluate(()=> ({refused: window.__refused, last: window.__puts[window.__puts.length - 1] || null}));
  ok(r.last && r.last['37player.playLog'] === JSON.stringify(['a line']) && !('37player.install' in r.last), 'a refused key is left out and the rest still written (' + JSON.stringify({refused: r.refused, keys: r.last && Object.keys(r.last)}) + ')');
  await q.evaluate(()=> localStorage.setItem('37player.playLog', JSON.stringify(['a line', 'another']))); await sleep(1500);
  const r2 = await q.evaluate(()=> ({refused: window.__refused, last: window.__puts[window.__puts.length - 1]}));
  ok(r2.refused === r.refused && /another/.test(r2.last['37player.playLog']), 'and it isn\'t tried again');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
