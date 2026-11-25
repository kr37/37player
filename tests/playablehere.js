// What this device can play (2.7.013; the audit's fix 22): tiny samples of
// each kind are tried from memory once on a device (again only when the
// browser or app changes, or Check library asks); a track of a kind it can't
// play is unplayable here, so playing it brings the can't-be-played dialog
// with Convert; Check library tries again, counts them, and names every
// stage and track in its status. Chrome can't play AIFF, which stands in
// for macOS 12's WebM. Then, in the stand-in desktop app: tried again when
// the system's version changes (shell 2.7.8's system), since the Mac's
// WebKit user agent stays the same through a macOS update.
//   node playablehere.js     (needs www/ten.mp3)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const SHELL = require('fs').readFileSync(require('path').join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 180000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{ window.__playableCheckMs = 1000; window.__noAutoConverter = true; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await waitFor(p, ()=> /what this device can play, tried with samples/.test(window.__log().join('\n')), 15000), 'a little after opening, the samples are tried');
  let L = await log(p);
  ok(/tried with samples: WAV yes, AIFF no, FLAC yes, Opus yes, Ogg yes, WebM yes/.test(L), 'and each kind\'s answer logged (' + (L.match(/tried with samples: [^\n]*/) || [''])[0] + ')');
  let here = await p.evaluate(()=> ({r: window.__playable.here(), ua: navigator.userAgent}));
  ok(here.r && here.r.kinds.aiff === false && here.r.kinds.webm === true && here.r.key.includes(here.ua), 'kept for this device, with its browser');
  // A reload: not tried again.
  await p.reload({waitUntil: 'networkidle0'}); await sleep(4000);
  ok(((await log(p)).match(/tried with samples/g) || []).length === 1, 'not tried again at the next start');
  // The browser changed: tried again.
  await p.evaluate(()=>{ const r = JSON.parse(localStorage.getItem('37player.playable')); r.key = 'another browser|'; localStorage.setItem('37player.playable', JSON.stringify(r)); });
  await p.reload({waitUntil: 'networkidle0'}); await sleep(5000);
  ok(((await log(p)).match(/tried with samples/g) || []).length === 2, 'after the browser or app changed, tried again');
  // A real track, and one of a kind this device can't play.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'P', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], 'ten.mp3')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true); });
  ok(await waitFor(p, ()=> window.__impDone === true, 90000), 'an MP3 imported');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const ids = await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(), mp3 = r.library[0];
    const aiff = Object.assign({}, mp3, {id: 'aiff1', name: 'An AIFF', filename: 'an.aiff', fileType: 'aiff'});
    r.library.push(aiff); r.tree[0].items.push({id: 'e2', kind: 'track', refId: 'aiff1', order: 1});
    await window.__dbg.saveState(); return {mp3: mp3.id, aiff: 'aiff1'};
  });
  let cp = await p.evaluate((ids)=> ({mp3: window.__playable.cantPlay(ids.mp3), aiff: window.__playable.cantPlay(ids.aiff), conv: window.__playable.canConvert(ids.aiff)}), ids);
  ok(!cp.mp3 && cp.aiff && /Can't be played on this device: AIFF files don't play here/.test(cp.aiff.note) && cp.conv, 'a track of a kind this device can\'t play is unplayable here, and can be converted (' + JSON.stringify(cp) + ')');
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); window.__play('e2'); });
  ok(await waitFor(p, ()=> /AIFF files don't play here/.test(document.querySelector('.modal')?.innerText || '') && /Convert it now/.test(document.querySelector('.modal')?.innerText || ''), 5000), 'playing it: the can\'t-be-played dialog with Convert, without failing first');
  ok(await p.evaluate(()=> document.getElementById('audioEl').paused), 'and nothing plays silently');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  // Check library: tries again, counts, and names its stages and tracks.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); delete r.library[0].loudness; await window.__dbg.saveState(); window.__opTexts = []; });
  await p.evaluate(()=>{ window.__chkDone = false; window.__chk().then(()=> window.__chkDone = true); });
  ok(await waitFor(p, ()=> window.__chkDone, 120000), 'Check library ran');
  const texts = await p.evaluate(()=> window.__opTexts.slice());
  ok(texts.some(x=> /looking again at 1 of 1: .+, reading its sound \(length, waveform, loudness\)/.test(x)), 'its status names the track and what\'s done to it (' + (texts.find(x=> /looking again/.test(x)) || 'none') + ')');
  ok(texts.some(x=> /stored files \d+ of \d+: /.test(x)), 'the stored files step names the track too');
  ok(texts.some(x=> /Checking the library: saving…/.test(x)), 'and says when it saves');
  ok(texts.some(x=> /what this device can play…/.test(x)), 'and when it tries what this device can play');
  ok(((await log(p)).match(/tried with samples/g) || []).length === 3, 'which it tries again');
  ok(await waitFor(p, ()=> /Tracks of a kind this device can't play \(AIFF\): 1\./.test(document.querySelector('.modal')?.innerText || ''), 5000), 'the summary counts the tracks it can\'t play');
  ok(await p.evaluate(()=> /Convert it now/.test(document.getElementById('chkConvertHere')?.textContent || '')), 'with Convert it now');
  // The desktop app: the system's version is part of it.
  const q = await (await b.createBrowserContext()).newPage(); await q.setViewport({width: 1300, height: 900});
  q.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); q.on('dialog', d=> d.accept());
  await q.evaluateOnNewDocument((shell)=>{ window.__playableCheckMs = 1000; window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__fakeShellSystem = sessionStorage.getItem('sys') || 'macOS 12.7.6'; (0, eval)(shell); }, SHELL);
  await q.goto('http://localhost:8861/37-player.html', {waitUntil: 'domcontentloaded'});
  ok(await waitFor(q, ()=> /Where should your libraries live/.test(document.querySelector('.modal')?.innerText || ''), 20000), 'the stand-in desktop app started');
  await clickText(q, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(q, '.modal button', x); await sleep(300); }
  await q.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await waitFor(q, ()=> /tried with samples/.test(window.__log().join('\n')), 15000), 'in the app, tried once');
  here = await q.evaluate(()=> window.__playable.here());
  ok(here && /\|2\.0\.000\|macOS 12\.7\.6$/.test(here.key), 'kept with the app\'s and the system\'s versions (' + (here && here.key.slice(-24)) + ')');
  await q.reload({waitUntil: 'domcontentloaded'}); await sleep(5000);
  ok(((await log(q)).match(/tried with samples/g) || []).length === 1, 'the same system: not tried again');
  await q.evaluate(()=> sessionStorage.setItem('sys', 'macOS 13.7.1'));
  await q.reload({waitUntil: 'domcontentloaded'}); await sleep(6000);
  ok(((await log(q)).match(/tried with samples/g) || []).length === 2, 'after a macOS update (same user agent), tried again');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
