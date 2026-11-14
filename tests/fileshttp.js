// Recordings in the Linux app (2.5.000, shell 2.5.0). Its webview played a
// recording handed over as a blob from the wrong place, and takes no audio
// from p37lib://; the shell serves the files at http://127.0.0.1 too and
// says where (files_http). With that, a track's address is the shell's, by
// the file's place on the disk; without it (Mac, Windows, an older shell),
// a blob as before.
//   node fileshttp.js
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const FAKE = fs.readFileSync(__dirname + '/fake-shell.js', 'utf8');
const BASE = 'http://127.0.0.1:9/s3cret';
const start = async (b, base)=>{
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.evaluateOnNewDocument((base)=>{ window.__fakeFilesHttp = base; }, base);
  await p.evaluateOnNewDocument(FAKE);
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(1000);
  for(const x of ['^English$','^Keep them there$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$','^OK$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); const blob = await (await fetch('ten.mp3')).blob(); r.library.push({id: 'tk', name: 'Refuge & bodhichitta', artist: 'NKT', album: 'Essence #1', duration: 600, peaks: [0.2, 0.4], filename: 'x.mp3'}); await window.__dbg3.put('audio', {id: 'tk', blob}); r.tree.push({id: 'pl', kind: 'playlist', name: 'P', items: [{id: 'it', kind: 'track', refId: 'tk', order: 0}]}); await window.__dbg.saveState(); });
  await sleep(1500);
  return p;
};
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  let p = await start(b, BASE);
  const u1 = await p.evaluate(()=> window.__audioUrl('tk')), u2 = await p.evaluate(()=> window.__audioUrl('tk'));
  let path = ''; try{ path = decodeURIComponent(u1.slice(BASE.length)); }catch(e){}
  ok(u1.startsWith(BASE + '/lib-') && /\.mp3$/.test(path) && !/[ #&]/.test(u1.slice(BASE.length)), 'a track\'s address is the shell\'s local one, by the file\'s place, safely encoded (' + u1 + ')');
  ok(u1 === u2, 'the same each time while the file stays put');
  await p.evaluate(()=> window.__play('it')); await sleep(800);
  const el = await p.evaluate(()=> ({src: document.getElementById('audioEl').src, co: document.getElementById('audioEl').crossOrigin}));
  // Not marked cross-origin, and never routed through Web Audio there (2.5.002: with the mark, tracks started in the wrong place on the T470).
  ok(el.src === u1 && !el.co, 'the player loads it plainly, not marked cross-origin (' + JSON.stringify(el.co) + ')');
  const routed = await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library.find(t=> t.id === 'tk').volumeDb = 6; await window.__dbg.saveState(); document.body.click(); await new Promise(r=> setTimeout(r, 300)); await window.__play('it'); await new Promise(r=> setTimeout(r, 500)); return {log: (window.__lazy.log() || []).join('\n'), vol: document.getElementById('audioEl').volume}; });
  ok(!/turns tracks up through Web Audio/.test(routed.log) && routed.vol === 1 && /start “Refuge & bodhichitta”, from the app's local address/.test(routed.log), 'a track turned up plays at full volume, not through Web Audio; the log says where it came from');
  await p.close();
  p = await start(b, null);
  const u3 = await p.evaluate(()=> window.__audioUrl('tk'));
  ok(/^blob:/.test(u3), 'a shell without it: a blob, as before (' + u3.slice(0, 30) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
