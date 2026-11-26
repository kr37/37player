// The player plays only when 37 Player asks (2.7.019; kr37's iPad): a start
// it didn't ask for, after a pause it asked for, is paused again and logged
// (iPadOS started the player at the unlock, once while Playing ran a
// silence); a start after a pause it didn't make (a call, the headphones)
// stays. And a silence skipped to (queued, not playing) names itself on the
// lock screen. The "system" here is HTMLMediaElement.prototype.play/pause,
// which don't go through the page.
//   node lockguard.js     (needs www/ten.mp3)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage();
  await p.emulate({viewport:{width:1024,height:768,isMobile:true,hasTouch:true,deviceScaleFactor:1}, userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile'});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; window.__playableCheckMs = 600000; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$', '^Close$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'P', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], 'ten.mp3')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true); });
  ok(await waitFor(p, ()=> window.__impDone === true, 90000), 'a recording imported');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(), pl = r.tree[0]; pl.items.push({id: 's1', kind: 'silence', name: 'One minute of silence', seconds: 60, order: 5}); await window.__dbg.saveState(); window.__dbg.setMode('playing'); window.__play(pl.items[0].id); });
  const A = ()=> document.getElementById('audioEl');
  ok(await waitFor(p, ()=> !document.getElementById('audioEl').paused && document.getElementById('audioEl').currentTime > 0.5, 10000), 'a track plays');
  await p.evaluate(()=> window.__pause()); await sleep(400);
  ok(await p.evaluate(()=> document.getElementById('audioEl').paused), '37 Player paused it');
  // The system starts it.
  await p.evaluate(()=> HTMLMediaElement.prototype.play.call(document.getElementById('audioEl')).catch(()=>{}));
  await sleep(800);
  ok(await p.evaluate(()=> document.getElementById('audioEl').paused), 'a start 37 Player didn\'t ask for is paused again');
  ok(/the player started without 37 Player asking \(on screen\): paused again\. Playing holds track “ten”/.test(await p.evaluate(()=> window.__log().join('\n'))), 'and logged, with what Playing held');
  // 37 Player's own play still plays.
  await p.evaluate(()=> window.__pause()); await sleep(800);
  ok(await p.evaluate(()=> !document.getElementById('audioEl').paused), 'Playing\'s own play plays');
  // The system pauses it (a call), then starts it again: left alone.
  await p.evaluate(()=> HTMLMediaElement.prototype.pause.call(document.getElementById('audioEl'))); await sleep(300);
  await p.evaluate(()=> HTMLMediaElement.prototype.play.call(document.getElementById('audioEl')).catch(()=>{})); await sleep(800);
  ok(await p.evaluate(()=> !document.getElementById('audioEl').paused), 'after a pause the system made, its start again stays');
  // Skipping into a silence, paused: the lock screen names the silence; the player holding the track can't be started by the system.
  await p.evaluate(()=> window.__pause()); await sleep(300);
  await p.evaluate(()=> window.__userSkip(1)); await sleep(500);
  ok(await p.evaluate(()=> navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) === 'One minute of silence', 'a silence skipped to names itself on the lock screen (' + await p.evaluate(()=> navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) + ')');
  await p.evaluate(()=> HTMLMediaElement.prototype.play.call(document.getElementById('audioEl')).catch(()=>{})); await sleep(800);
  ok(await p.evaluate(()=> document.getElementById('audioEl').paused), 'with Playing in the silence, the system can\'t start the track the player still holds');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
