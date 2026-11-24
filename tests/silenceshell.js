// Silences from the shell's audio, made to length (2.7.007, shell 2.7.4;
// the audit's fix 11, L): in the desktop app the silence clock's pieces come
// from p37lib://localhost/_silence/<ms>, so no audio made by the page plays;
// they keep time with the page starved of turns, as the page's own did
// (silclock.js); a piece that won't play falls back to the page's own; an
// older shell gets the page's own. Through the stand-in shell.
//   node silenceshell.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
async function start(b, opts){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell, opts)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__fakeShellSilence = opts.silence; window.__fakeSilenceBroken = opts.broken;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, o){ if(type === 'timeupdate' && this instanceof HTMLMediaElement) return; return add.call(this, type, fn, o); };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn)=> window.__starve ? 0 : raf(fn);
    window.__blobUrls = 0; const cu = URL.createObjectURL; URL.createObjectURL = function(o){ if(o && o.type === 'audio/wav' && o.size < 300000 && !window.__inFakeShell) window.__blobUrls++; return cu.call(URL, o); };
    (0, eval)(shell);
  }, SHELL, opts);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = [{id: 'plS', kind: 'playlist', name: 'Silences', order: 50, items: [{id: 'sil1', kind: 'silence', seconds: 3, order: 0}, {id: 'sil2', kind: 'silence', seconds: 2, order: 1}]}]; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); window.__dbg.setMode('playing'); });
  await sleep(500);
  return p;
}
async function timeSilence(p){
  await p.evaluate(()=>{ window.__starve = true; window.__play('sil1'); window.__t0 = performance.now(); });
  for(let i = 0; i < 100; i++){ await sleep(100); const st = await p.evaluate(()=> ({cur: window.__st().cur, t: performance.now() - window.__t0})); if(st.cur === 'sil2') return st.t; }
  return null;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  let p = await start(b, {silence: true});
  let t = await timeSilence(p);
  ok(t !== null && t > 2900 && t < 3600, 'with the shell\'s silence, a starved page\'s 3-second silence ends on time (' + (t === null ? 'never' : Math.round(t) + ' ms') + ')');
  let asked = await p.evaluate(()=> window.__fakeSilences || []);
  ok(asked.some(ms=> ms > 2900 && ms <= 3000), 'the piece came from the shell, made to length (' + JSON.stringify(asked) + ')');
  await sleep(2500);
  asked = await p.evaluate(()=> window.__fakeSilences || []);
  ok(asked.includes(2000), 'and the next silence\'s too');
  ok(await p.evaluate(()=> window.__blobUrls === 0), 'no silent audio made by the page (' + await p.evaluate(()=> window.__blobUrls) + ')');
  // The shell's piece won't play: the page's own, at once.
  p = await start(b, {silence: true, broken: true});
  t = await timeSilence(p);
  ok(t !== null && t > 2900 && t < 4000, 'a piece that won\'t play: the page\'s own instead, still on time (' + (t === null ? 'never' : Math.round(t) + ' ms') + ')');
  ok(/the app's silence wouldn't play \(.+\): silences made here again/.test(await p.evaluate(()=> window.__log().join('\n'))), 'and that\'s logged');
  // An older shell: the page's own, as before.
  p = await start(b, {silence: false});
  t = await timeSilence(p);
  ok(t !== null && t > 2900 && t < 3600 && !(await p.evaluate(()=> (window.__fakeSilences || []).length)), 'with an older shell, the page\'s own silences, on time (' + (t === null ? 'never' : Math.round(t) + ' ms') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
