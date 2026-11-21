// A player holding a quiet track is hooked in to turn it up as soon as the
// sound engine starts (2.6.005; kr37's Mac mini, 20 Nov 2026: after a reload
// the Italian translation was put back in Playing before any click, and the
// click on Play started the engine too late for it, so it played without
// its boost until it was loaded again). Here: a track turned up 6 dB is in
// Playing, paused, with no engine; the first click starts the engine and
// hooks Playing in, the track keeping its place. A play with no engine (a
// media key, not a click) is held a moment while the engine starts, then
// plays turned up; if the engine can't start, the track stays paused and a
// note asks for a click (2.6.008, kr37: "If loudness is on, then we need to
// play according to loudness… Not willy nilly."). And every player follows
// Playing's slider (the Library's player too).
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
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library = [{id:'tk', name:'Quiet', duration:600, volumeDb: 6, peaks:Array.from({length:720},(_, i)=>i%5/5)}, {id:'t2', name:'Plain', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5)}]; await window.__dbg3.put('audio',{id:'tk', blob}); await window.__dbg3.put('audio',{id:'t2', blob}); r.tree = [{id:'pl', kind:'playlist', name:'P', items:[{id:'it', kind:'track', refId:'tk', order:0}, {id:'it2', kind:'track', refId:'tk', order:1}]}]; r.settings.levelMode = 'off'; await window.__dbg.saveState(); });
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  // 1. Paused in Playing, no engine yet; the first click hooks it in.
  let p = await open(b);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(2500);
  await p.evaluate(()=> document.getElementById('audioEl').pause()); await sleep(300);
  // A reload: Playing puts the track back, paused, where it was (as on the Mac mini).
  await p.evaluate(async()=>{ await window.__dbg.saveState(); }); await sleep(300);
  await p.reload({waitUntil:'load'}); await sleep(3000);
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
  // 3. A play with no engine yet (as from a media key, not a click): held a
  // moment, the engine started, hooked in, then played: never unboosted.
  p = await open(b);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(2000);
  L = await p.evaluate(()=> window.__lvl());
  ok(L.ctx && L.routed && !(await p.evaluate(()=> window.__st().paused)), 'a play with no engine: the engine is started, Playing hooked in, and it plays');
  await p.close();
  // 3b. The engine can't start (a browser that wants a click): it waits, and says so.
  p = await open(b);
  await p.evaluate(()=>{ window.__noLevelStart = true; window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(2500);
  L = await p.evaluate(()=> window.__lvl());
  const st3 = await p.evaluate(()=> window.__st().paused);
  ok(!L.routed && st3, 'no engine to be had: the quiet track stays paused rather than play unboosted (routed ' + L.routed + ', paused ' + st3 + ')');
  ok(/needs one click in 37 Player's window/.test(await p.evaluate(()=> document.getElementById('toast')?.textContent || '')), 'and says one click in the window is needed');
  await p.evaluate(()=>{ window.__noLevelStart = false; }); await p.mouse.click(640, 5); await sleep(300);
  await p.evaluate(()=> window.__play('it')); await sleep(1500);
  ok((await p.evaluate(()=> window.__lvl())).routed && !(await p.evaluate(()=> window.__st().paused)), 'after a click, Play plays it turned up');
  await p.close();
  // 5. The desktop app: the engine starts as it opens, with no click, and the
  // put-back track is hooked in (__engineAtStart stands for the desktop app;
  // its webview lets sound start without a click, as Chrome does here).
  p = await open(b);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('it'); }); await sleep(1500);
  await p.evaluate(async()=>{ document.getElementById('audioEl').pause(); await window.__dbg.saveState(); }); await sleep(300);
  await p.evaluateOnNewDocument(()=>{ window.__engineAtStart = true; });
  await p.reload({waitUntil:'load'}); await sleep(3500);
  const d5 = await p.evaluate(()=>{ const l = window.__lvl(); return {state: l.ctx && l.ctx.state, routed: l.routed, paused: window.__st().paused}; });
  ok(d5.state === 'running' && d5.routed && d5.paused, 'desktop app: the engine runs from the start, with no click, and the put-back track (paused) is hooked in: ' + JSON.stringify(d5));
  await p.close();
  // 4. A track that needs no boost isn't hooked in.
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
