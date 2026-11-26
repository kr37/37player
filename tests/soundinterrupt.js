// An audio interruption (2.7.012, the audit's fix 16, O; narrowed for the
// temple in 2.7.020): when the sound engine goes "interrupted" while a
// track that plays through it is playing, the engine is first asked to run
// again (a lock or a hidden page lets it: nothing pauses); only if it's
// still held 3 s later (a call, Siri) does Playing pause, keeping its place,
// and carry on by itself once the engine runs again; not if something else
// was chosen meanwhile. During a silence nothing pauses: nothing sounds
// through the engine, and a pause would hold the puja. Chrome never
// interrupts, so the engine's state is stood in for (its getter,
// statechange, resume), and the track's routing through it too.
//   node soundinterrupt.js     (needs www/ten.mp3)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; window.__playableCheckMs = 600000; window.__levelInterruptWaitMs = 1000; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.settings.levelMode = 'track'; r.library = []; r.tree = [{id: 'pl1', kind: 'playlist', name: 'P', items: [{id: 'sil1', kind: 'silence', seconds: 120, order: 1}]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], 'ten.mp3')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true); });
  ok(await waitFor(p, ()=> window.__impDone === true, 90000), 'a recording imported');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.mouse.click(5, 5); await sleep(300); // the engine starts at a click
  ok(await p.evaluate(()=> !!window.__levelCtx()), 'the sound engine is there');
  await p.evaluate(()=>{
    const c = window.__levelCtx(); window.__ctxState = 'running'; window.__callOn = false;
    Object.defineProperty(c, 'state', {configurable: true, get: ()=> window.__ctxState});
    c.resume = ()=>{ if(!window.__callOn && window.__ctxState !== 'running'){ window.__ctxState = 'running'; setTimeout(()=> c.dispatchEvent(new Event('statechange')), 0); } return Promise.resolve(); };
    window.__interrupt = (held)=>{ window.__callOn = !!held; window.__ctxState = 'interrupted'; c.dispatchEvent(new Event('statechange')); };
  });
  const trackEntry = await p.evaluate(()=> window.__dbg.getRoot().tree[0].items.find(i=> i.kind === 'track').id);
  // A silence, the screen locked: nothing pauses.
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('sil1'); }); await sleep(800);
  await p.evaluate(()=> window.__interrupt(true)); await sleep(2500);
  ok(await p.evaluate(()=> window.__st().sil === true) && !/sound interrupted/.test(await log(p)), 'during a silence: the silence runs on, nothing paused');
  await p.evaluate(()=>{ window.__callOn = false; window.__levelCtx().resume(); }); await sleep(300);
  // A track through the engine, an interruption that lets go at once (a lock): nothing pauses.
  await p.evaluate((id)=>{ window.__play(id); }, trackEntry);
  ok(await waitFor(p, ()=> !document.getElementById('audioEl').paused, 8000), 'a track plays');
  await p.evaluate(()=> window.__levelRouteMain());
  await p.evaluate(()=> window.__interrupt(false)); await sleep(2500);
  ok(await p.evaluate(()=> !document.getElementById('audioEl').paused) && !/sound interrupted/.test(await log(p)), 'interrupted, but the engine runs again when asked (a lock): it plays on');
  // A call: the engine stays held.
  await p.evaluate(()=> window.__interrupt(true)); await sleep(400);
  ok(await p.evaluate(()=> !document.getElementById('audioEl').paused), 'not paused at once: the engine is asked first');
  await sleep(1500);
  let L = await log(p);
  ok(/sound interrupted \(a call, Siri or the like\): Playing paused, keeping its place/.test(L) && await p.evaluate(()=> document.getElementById('audioEl').paused), 'still held a moment later: Playing pauses, and says so');
  const at = await p.evaluate(()=> document.getElementById('audioEl').currentTime);
  await sleep(4500);
  ok(!/carrying on/.test(await log(p)), 'during the call, it doesn\'t start again');
  await p.evaluate(()=>{ window.__callOn = false; }); await sleep(3000);
  L = await log(p);
  ok(/sound back after the interruption \(\d+ s\): carrying on/.test(L) && await p.evaluate(()=> !document.getElementById('audioEl').paused), 'the call over: it carries on by itself');
  ok(Math.abs(await p.evaluate(()=> document.getElementById('audioEl').currentTime) - at) < 4, 'from where it was');
  // Something else chosen meanwhile: not carried on.
  await p.evaluate(()=> window.__interrupt(true)); await sleep(1800);
  await p.evaluate(()=> window.__play('sil1')); await sleep(300); await p.evaluate(()=> window.__pause());
  await p.evaluate(()=>{ window.__callOn = false; }); await sleep(3000);
  ok(/not carried on: (something else was chosen|already playing)/.test(await log(p)), 'something else chosen meanwhile: not carried on');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
