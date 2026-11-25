// One way of playing in the desktop app (2.7.014; the audit's fix M, 18):
// a recording of 32 MB or less is played from its address (p37lib), as a
// bigger one always was, not read whole into the page and played as a
// blob; the Library's preview too. Its bytes are read only for what needs
// them. window.__playFromMemory brings back the old way (the tests', and a
// way back from the console). Through the stand-in shell.
//   node playaddr.js     (needs www/ten.mp3)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
const SIZE = fs.statSync(path.join(__dirname, 'www/ten.mp3')).size;
async function start(b, fromMemory){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.evaluateOnNewDocument((shell, fromMemory)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__diskBlobMin = 32 * 1048576; /* the real limit: the stand-in's own is 0 */ if(fromMemory) window.__playFromMemory = true;
    window.__audioBlobUrls = 0; const cu = URL.createObjectURL; URL.createObjectURL = function(o){ if(o && /^audio\/(mpeg|mp3)/.test(o.type || '') && !window.__inFakeShell) window.__audioBlobUrls++; return cu.call(URL, o); };
    (0, eval)(shell);
    // The stand-in's own answer to an address is a blob of the file: not counted.
    const f = window.__p37FileUrl; window.__p37FileUrl = async (...a)=>{ window.__inFakeShell = true; try{ return await f(...a); } finally{ window.__inFakeShell = false; } };
  }, SHELL, fromMemory);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1000);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'P', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], 'ten.mp3')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true); });
  await waitFor(p, ()=> window.__impDone === true, 90000);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await sleep(500);
  return p;
}
async function play(p){
  await p.evaluate(()=>{ window.__fileUrlPaths.length = 0; window.__fakeShellReadBytes = 0; window.__audioBlobUrls = 0; const r = window.__dbg.getRoot(); window.__dbg.setMode('playing'); window.__play(r.tree[0].items[0].id); });
  const playing = await waitFor(p, ()=> window.__st().t > 1 && !window.__st().paused, 15000);
  return Object.assign({playing}, await p.evaluate(()=> ({paths: window.__fileUrlPaths.slice(), read: window.__fakeShellReadBytes, blobs: window.__audioBlobUrls, src: window.__st().src, log: window.__log().join('\n')})));
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  let p = await start(b, false);
  let r = await play(p);
  ok(r.playing, 'a small recording plays');
  ok(r.paths.some(x=> /\.mp3$/.test(x)), 'from its address, as the shell serves it (' + JSON.stringify(r.paths) + ')');
  ok(r.blobs === 0, 'no blob made of it (' + r.blobs + ')');
  ok(r.read < SIZE / 2, 'not read into the page: ' + r.read + ' of ' + SIZE + ' bytes read');
  await p.evaluate(()=> window.__dbg.stop ? window.__dbg.stop() : document.getElementById('audioEl').pause());
  // The Library's preview.
  await p.evaluate(()=> window.__dbg.setMode('library'));
  await sleep(3000);
  const id = await p.evaluate(()=> window.__dbg.getRoot().library[0].id);
  await p.evaluate((id)=>{ window.__fileUrlPaths.length = 0; window.__fakeShellReadBytes = 0; window.__conv.libPreview(id); }, id);
  const prev = await waitFor(p, ()=> { const a = document.getElementById('libPreviewAudio'); return a && a.currentTime > 0.5; }, 10000);
  r = await p.evaluate(()=> ({paths: window.__fileUrlPaths.slice(), read: window.__fakeShellReadBytes}));
  ok(prev && r.paths.some(x=> /\.mp3$/.test(x)) && r.read < SIZE / 2, 'the Library\'s preview plays from the address too (' + JSON.stringify(r) + ')');
  // The old way, for comparison.
  p = await start(b, true);
  r = await play(p);
  ok(r.playing && r.blobs >= 1 && r.read >= SIZE && /^blob:/.test(r.src) && !r.paths.some(x=> /\.mp3$/.test(x)), 'with __playFromMemory, read whole and played as a blob, as before (read ' + r.read + ', blobs ' + r.blobs + ', ' + JSON.stringify(r.paths) + ', ' + r.src.slice(0, 30) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
