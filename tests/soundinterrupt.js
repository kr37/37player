// An audio interruption (2.7.012; the audit's fix 16, O): when the sound
// engine goes "interrupted" (a call, Siri), Playing pauses, keeping its
// place; once the engine runs again it carries on by itself; not if
// something else was chosen meanwhile. Chrome never interrupts, so the
// engine's state is stood in for (its getter, statechange, resume).
//   node soundinterrupt.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.settings.levelMode = 'track'; r.tree = [{id: 'plS', kind: 'playlist', name: 'Long silence', order: 50, items: [{id: 'sil1', kind: 'silence', seconds: 120, order: 0}, {id: 'sil2', kind: 'silence', seconds: 60, order: 1}]}]; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); window.__dbg.setMode('playing'); });
  await p.mouse.click(5, 5); await sleep(300); // the engine starts at a click
  ok(await p.evaluate(()=> !!window.__levelCtx()), 'the sound engine is there');
  // Stand in for WebKit's interruption.
  await p.evaluate(()=>{
    const c = window.__levelCtx(); window.__ctxState = 'running'; window.__callOn = false;
    Object.defineProperty(c, 'state', {configurable: true, get: ()=> window.__ctxState});
    c.resume = ()=>{ if(!window.__callOn && window.__ctxState !== 'running'){ window.__ctxState = 'running'; setTimeout(()=> c.dispatchEvent(new Event('statechange')), 0); } return Promise.resolve(); };
    window.__interrupt = ()=>{ window.__callOn = true; window.__ctxState = 'interrupted'; c.dispatchEvent(new Event('statechange')); };
  });
  await p.evaluate(()=> window.__play('sil1')); await sleep(1500);
  const before = await p.evaluate(()=> window.__st().cur);
  await p.evaluate(()=> window.__interrupt()); await sleep(500);
  let L = await log(p);
  ok(/sound interrupted \(a call, Siri or the like\): Playing paused, keeping its place/.test(L), 'interrupted: Playing pauses, and says so');
  const paused = await p.evaluate(()=> ({cur: window.__st().cur, sil: window.__st().sil}));
  ok(paused.cur === before && paused.sil === false, 'paused, its place kept (' + JSON.stringify(paused) + ')');
  await sleep(5000);
  ok(!/carrying on/.test(await log(p)), 'during the call, it doesn\'t start again (asked every 2 s, the system holding it)');
  // The call ends.
  await p.evaluate(()=>{ window.__callOn = false; });
  await sleep(3000);
  L = await log(p);
  ok(/sound back after the interruption \(\d+ s\): carrying on/.test(L), 'the call over: it carries on by itself');
  ok(await p.evaluate(()=> window.__st().cur === 'sil1'), 'from where it was');
  // Something else chosen meanwhile: not carried on.
  await p.evaluate(()=> window.__interrupt()); await sleep(500);
  await p.evaluate(()=> window.__play('sil2')); await sleep(300); await p.evaluate(()=> window.__pause && window.__pause());
  await p.evaluate(()=>{ window.__callOn = false; }); await sleep(3000);
  ok(/not carried on: (something else was chosen|already playing)/.test(await log(p)), 'something else chosen meanwhile: not carried on');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
