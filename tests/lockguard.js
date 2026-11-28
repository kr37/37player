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
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; window.__playableCheckMs = 600000;
    // The lock screen's buttons, to press them here.
    window.__ms = {}; const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (a, h)=>{ window.__ms[a] = h; return set(a, h); }; });
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
  // The silent loop made ready by a tap that plays (2.7.029; kr37's iPad: the
  // loop first started when the app left the screen, with no tap, and iPadOS
  // refused it, NotAllowedError). Once, at the first tap on Play; and a tap
  // that plays nothing doesn't.
  await p.reload({waitUntil: 'networkidle0'}); await sleep(1200);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(()=> window.__userSkip(-1)); await sleep(600);
  if(await p.evaluate(()=> !document.getElementById('audioEl').paused)){ await p.evaluate(()=> window.__pause()); await sleep(400); }
  const made = ()=> p.evaluate(()=> window.__log().filter(l=> /silent loop made ready/.test(l)).length);
  const before = await made();
  await p.click('#btnPlay'); await sleep(800);
  ok(await made() === before + 1, 'a tap on Play makes the silent loop ready (' + (await made() - before) + ')');
  ok(await p.evaluate(()=> !document.getElementById('audioEl').paused), 'and the track plays');
  await p.click('#btnPlay'); await sleep(400); await p.click('#btnPlay'); await sleep(800);
  ok(await made() === before + 1, 'only once a page');
  // Back and forward 10 s (2.7.030): they move the track, not the silent loop.
  await p.evaluate(()=>{ document.getElementById('audioEl').currentTime = 6; }); await sleep(300);
  await p.evaluate(()=> window.__ms.seekbackward({action: 'seekbackward'})); await sleep(300);
  const back = await p.evaluate(()=> document.getElementById('audioEl').currentTime);
  ok(back < 1.5, 'back 10 s moves the track back (' + back.toFixed(1) + ' s)');
  await p.evaluate(()=> window.__ms.seekforward({action: 'seekforward', seekOffset: 5})); await sleep(300);
  const fwd = await p.evaluate(()=> document.getElementById('audioEl').currentTime);
  ok(fwd > 4.5 && fwd < 7, 'forward, by what the lock screen asks (5 s), moves it on (' + fwd.toFixed(1) + ' s)');
  ok(/lock screen \/ phone: back 10 s[\s\S]*lock screen \/ phone: forward 5 s/.test(await p.evaluate(()=> window.__log().join('\n'))), 'both logged');
  // A silence paused from the lock screen keeps it (2.7.031; kr37's iPad: the
  // loop stopped, the lock screen lost 37 Player, Apple Music took over), and
  // play there goes on with it.
  await p.evaluate(()=> window.__userSkip(1)); await sleep(1500);
  await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>true, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>'hidden', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(1200);
  const n0 = await p.evaluate(()=> window.__log().length);
  await p.evaluate(()=> window.__ms.pause({action: 'pause'})); await sleep(600);
  let tail = await p.evaluate((n0)=> window.__log().slice(n0).join('\n'), n0);
  ok(/paused off screen: lock screen kept ready/.test(tail) && !/silent loop off/.test(tail), 'a silence paused off screen keeps the lock screen ready, the loop on');
  await p.evaluate(()=> window.__ms.play({action: 'play'})); await sleep(2200);
  tail = await p.evaluate((n0)=> window.__log().slice(n0).join('\n'), n0);
  ok(/pause hold ended \(playing\)/.test(tail), 'play from the lock screen goes on with the silence');

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
