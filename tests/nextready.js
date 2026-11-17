// The next track ready before it's needed (2.5.036). A playlist of short
// tracks: track 1, a silence, track 2, a stop, track 3. A moment after an
// item starts (window.__nextReadyMs), the next track past silences is made
// ready, so the move on needs nothing read at that moment:
// - while track 1 plays, track 2 (past the silence) is ready, and it starts
//   "ready ahead" (the playback log's start line);
// - nothing is made ready past the stop: track 3 isn't, while track 2 plays.
//   node nextready.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), os = require('os'), {execFileSync} = require('child_process');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p37-next-'));
const tone = (f, d)=>{ const out = path.join(tmp, f + '.mp3'); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=' + f + ':d=' + d, '-c:a', 'libmp3lame', '-b:a', '64k', out]); return fs.readFileSync(out).toString('base64'); };
const T = [tone(300, 2), tone(400, 2), tone(500, 2)];

(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__nextReadyMs = 300; });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async(T)=>{
    const R = window.__dbg.getRoot(), now = Date.now();
    R.tree = []; R.library = []; delete R.settings.starterPlaylistId;
    T.forEach((b64, i)=>{ R.library.push({id: 'nr' + i, name: 'Tone ' + (i + 1), filename: 'tone' + i + '.mp3', duration: 2, peaks: new Array(100).fill(0.4), addedAt: now}); });
    for(let i = 0; i < T.length; i++) await window.__dbg3.put('audio', {id: 'nr' + i, blob: new File([Uint8Array.from(atob(T[i]), c=> c.charCodeAt(0))], 'tone' + i + '.mp3', {type: 'audio/mpeg'})});
    R.tree.push({id: 'plnr', kind: 'playlist', name: 'Ready', items: [
      {id: 'i1', kind: 'track', refId: 'nr0', order: 1}, {id: 'i2', kind: 'silence', seconds: 1, order: 2},
      {id: 'i3', kind: 'track', refId: 'nr1', order: 3}, {id: 'i4', kind: 'stop', order: 4}, {id: 'i5', kind: 'track', refId: 'nr2', order: 5}]});
    await window.__dbg.saveState();
    window.__dbg.setMode('playing');
  }, T);
  await sleep(500);
  await p.evaluate(()=>{ const el = [...document.querySelectorAll('nav.rail *')].find(e=> e.children.length === 0 && e.textContent.trim() === 'Ready'); el && el.click(); });
  await sleep(800);
  await p.evaluate(()=> window.__play('i1'));
  await sleep(1000);
  const during1 = await p.evaluate(()=> window.__nextReady());
  ok(during1 === 'nr1', 'while track 1 plays, track 2 (past the silence) is ready (' + during1 + ')');
  let log = '';
  for(let i = 0; i < 60; i++){ await sleep(200); log = (await p.evaluate(()=> window.__log())).join('\n'); if(/start “Tone 2”/.test(log)) break; }
  const t2 = /start “Tone 2”([^\n]*)/.exec(log);
  ok(t2 && /ready ahead/.test(t2[1]), 'after the silence, track 2 starts "ready ahead" (' + (t2 ? t2[0] : 'not started') + ')');
  ok(!/start “Tone 1”[^\n]*ready ahead/.test(log), 'track 1, started by hand, wasn\'t');
  await sleep(1000);
  const during2 = await p.evaluate(()=> window.__nextReady());
  ok(during2 !== 'nr2', 'nothing is made ready past the stop: track 3 isn\'t, while track 2 plays (' + during2 + ')');
  fs.rmSync(tmp, {recursive: true, force: true});
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
