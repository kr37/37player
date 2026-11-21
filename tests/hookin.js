// A player holding a quiet track is hooked in to turn it up as soon as the
// sound engine starts (2.6.005; kr37's Mac mini, 20 Nov 2026: after a reload
// the Italian translation was put back in Playing before any click, and the
// click on Play started the engine too late for it, so it played without
// its boost until it was loaded again). Here: a track turned up 6 dB is in
// Playing, paused, with no engine; the first click starts the engine and
// hooks Playing in, the track keeping its place. One playing when the
// engine starts is hooked in at its next pause, not mid-sound. And every
// player follows Playing's slider (the Library's player too).
//   node hookin.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function open(b){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  // (The welcome is clicked through with element clicks, which make no pointerdown.)
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()));
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library = [{id:'tk', name:'Quiet', duration:600, volumeDb: 6, peaks:Array.from({length:720},(_, i)=>i%5/5)}, {id:'t2', name:'Plain', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5)}]; await window.__dbg3.put('audio',{id:'tk', blob}); await window.__dbg3.put('audio',{id:'t2', blob}); r.tree = [{id:'pl', kind:'playlist', name:'P', items:[{id:'it', kind:'track', refId:'tk', order:0}]}]; r.settings.levelMode = 'off'; await window.__dbg.saveState(); });
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  // 1. Paused in Playing, no engine yet; the first click hooks it in.
  let p = await open(b);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(2500);
  await p.evaluate(()=> document.getElementById('audioEl').pause()); await sleep(300);
  const pos = (await p.evaluate(()=> window.__st())).t;
  let L = await p.evaluate(()=> window.__lvl());
  ok(!L.ctx && !L.routed, 'before any click: no engine, Playing not hooked in');
  await p.mouse.click(640, 5); await sleep(800);
  L = await p.evaluate(()=> window.__lvl());
  ok(L.ctx && L.routed, 'the first click starts the engine and hooks Playing in');
  const pos2 = (await p.evaluate(()=> window.__st())).t;
  ok(Math.abs(pos2 - pos) < 0.3 && pos > 1, 'the paused track keeps its place (' + pos.toFixed(2) + ' → ' + pos2.toFixed(2) + ')');
  // 2. Every player follows Playing's slider.
  await p.evaluate(()=> window.__vol.set(0.5)); await sleep(200);
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(400);
  await p.evaluate(()=> window.__conv.libPreview('t2')); await sleep(1500);
  const libVol = await p.evaluate(()=> document.getElementById('libPreviewAudio').volume);
  ok(Math.abs(libVol - 0.25) < 0.01, 'the Library\'s player follows Playing\'s slider (half way: 0.25, got ' + libVol + ')');
  await p.evaluate(()=> window.__vol.set(1)); await sleep(200);
  ok(Math.abs(await p.evaluate(()=> document.getElementById('libPreviewAudio').volume) - 1) < 0.01, '… and moves with it');
  await p.close();
  // 3. Playing when the engine starts: hooked in at the next pause.
  p = await open(b);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(2000);
  ok(!(await p.evaluate(()=> window.__st().paused)), 'playing, with no engine yet');
  await p.mouse.click(640, 5); await sleep(600);
  L = await p.evaluate(()=> window.__lvl());
  ok(L.ctx && !L.routed && L.hookOnPause, 'the click starts the engine; the playing track waits for its next pause');
  await p.evaluate(()=> document.getElementById('audioEl').pause()); await sleep(600);
  ok((await p.evaluate(()=> window.__lvl())).routed, 'paused: hooked in');
  // 4. A track that needs no boost isn't hooked in.
  await p.close();
  p = await open(b);
  await p.evaluate(async()=>{ window.__dbg.getRoot().library[0].volumeDb = -6; await window.__dbg.saveState(); window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(1500);
  await p.evaluate(()=> document.getElementById('audioEl').pause());
  await p.mouse.click(640, 5); await sleep(600);
  L = await p.evaluate(()=> window.__lvl());
  ok(!L.routed, 'a track turned down isn\'t hooked in (its volume does it)' + (L.ctx ? '' : ' (no engine: nothing boosted)'));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
