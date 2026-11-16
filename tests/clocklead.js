// The Linux app's clock and the sound (2.5.005). Through Web Audio, WebKitGTK
// counts about a second of sound as played the moment a track starts or is
// moved, so the seekbar ran a second ahead of what was heard (Gen Rinzin's
// T470) until a pause. The page now holds the clock still (speed 0, which
// leaves the sound going) for as long as it's ahead. Chrome has no such
// leap, so the test says how far ahead the clock is (__fakeClockLead).
//   node clocklead.js
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
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; window.__clockLeadTest = true; window.__fakeClockLead = 0.9; });
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
  const rates = []; const t0 = Date.now();
  for(let i=0; i<40; i++){ rates.push(await p.evaluate(()=>{ const a = document.getElementById('audioEl'); return {r: a.playbackRate, p: a.paused, t: a.currentTime}; })); await sleep(60); }
  const held = rates.filter(x=> x.r === 0), first = rates.findIndex(x=> x.r === 0), last = rates.length - 1 - [...rates].reverse().findIndex(x=> x.r === 0);
  ok(held.length >= 8 && held.length <= 20, 'the clock is held for about as long as it was ahead (' + held.length * 60 + ' ms of 900)');
  ok(held.every(x=> !x.p), 'without pausing the player (the sound goes on, the button stays as it is)');
  ok(held.length && Math.abs(held[held.length - 1].t - held[0].t) < 0.05, 'the time stands still meanwhile');
  ok(rates[rates.length - 1].r === 1 && rates[rates.length - 1].t > rates[last].t + 0.3, 'then it runs at normal speed again');
  const log = await p.evaluate(()=> window.__log().join('\n'));
  ok(/the clock was 0\.9 s ahead of the sound: held until the sound caught up/.test(log), 'and the playback log says so');
  // Not twice for one start; again after a seek; and a pause during a hold lets go.
  await sleep(800);
  ok(await p.evaluate(()=> document.getElementById('audioEl').playbackRate) === 1, 'held once for a start, not over and over');
  await p.evaluate(()=>{ document.getElementById('audioEl').currentTime = 2; });
  let again = false; for(let i=0; i<20 && !again; i++){ await sleep(60); again = await p.evaluate(()=> document.getElementById('audioEl').playbackRate === 0); }
  ok(again, 'held again after a seek (the engine leaps there too)');
  await p.evaluate(()=> document.getElementById('audioEl').pause()); await sleep(200);
  ok(await p.evaluate(()=> document.getElementById('audioEl').playbackRate) === 1, 'a pause during a hold ends it (speed back to normal)');
  await p.evaluate(()=>{ window.__fakeClockLead = 0.1; return document.getElementById('audioEl').play(); }); await sleep(700);
  ok(await p.evaluate(()=> document.getElementById('audioEl').playbackRate) === 1, 'a clock that is barely ahead is left alone');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
