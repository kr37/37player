// Web Audio kept running while a turned-up track plays (1.4.188): on the Mac
// mini, importing a 1.2 GB WAV left the playing track silent (the time went
// on) until the next track's play started the audio context again. Here the
// context is suspended by hand while a turned-up track plays: within a
// couple of seconds it runs again, and the playback log says so.
//   node levelwatch.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8861/37-player.html';
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type: 'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1000); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  // Turned up 6 dB, so it plays through Web Audio; a click makes the context.
  await p.evaluate(async()=>{ window.__dbg.getRoot().library[0].volumeDb = 6; await window.__dbg.saveState(); });
  await p.mouse.click(5, 5); await sleep(300);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); const f = ns=>{ for(const n of ns){ if(n.kind==='playlist' && n.items.length) return n; if(n.children){ const x=f(n.children); if(x) return x; } } }; window.__play(f(window.__dbg.getRoot().tree).items[0].id); });
  for(let i=0; i<40 && await p.evaluate(()=> window.__aud().paused || window.__aud().t < 0.2); i++) await sleep(250);
  for(let i=0; i<20 && !(await p.evaluate(()=> window.__lvl().routed)); i++) await sleep(250);
  const before = await p.evaluate(()=> ({routed: window.__lvl().routed, state: window.__lvl().ctx && window.__lvl().ctx.state, paused: window.__aud().paused}));
  ok(before.routed && before.state === 'running' && !before.paused, 'a turned-up track plays through Web Audio (' + JSON.stringify(before) + ')');
  // Suspended, and the first attempt to start it again does nothing (as
  // WebKit's "interrupted" went unanswered): only the watch can bring it back.
  await p.evaluate(()=>{ const ctx = window.__lvl().ctx, real = ctx.resume.bind(ctx); let n = 0; ctx.resume = ()=>{ n++; return n === 1 ? Promise.resolve() : real(); }; return ctx.suspend(); }); await sleep(300);
  ok(await p.evaluate(()=> window.__lvl().ctx.state) === 'suspended', 'the context stopped while it plays (as the big import did)');
  await sleep(2500);
  const after = await p.evaluate(()=> ({state: window.__lvl().ctx.state, paused: window.__aud().paused, log: window.__log().join('\n')}));
  ok(after.state === 'running' && !after.paused, 'within a couple of seconds it runs again (' + after.state + ')');
  ok(/Web Audio was suspended while a track played: started again/.test(after.log), 'and the playback log says so');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
