// Leaving a shared library cleans up after itself (2.2.027; the plan's item
// 6): tracks whose recording never arrived on this device are removed, then
// it asks about the playlists that used them (left empty; left with some
// tracks missing). Two runs: the defaults, and the other choices.
//   node leave.js <code> <code>      (needs both servers from serve.sh)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitModal = async (p, re, ms)=>{ for(let i=0; i<(ms||10000)/200; i++){ const t = await modal(p); if(re.test(t)) return t; await sleep(200); } return await modal(p); };
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const short = s=> (s || '').replace(/\n+/g, ' | ').slice(0, 170);
async function run(b, code, label, emptyChoice, partlyChoice){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(label, 'PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{ const mk = (b, n)=>{ const f = new File([Uint8Array.from(atob(b), x=>x.charCodeAt(0))], n, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + n}); return f; }; window.__dbg.bulkImportFolder([mk(a, 'tone.mp3'), mk(c, 'starter.mp3')]); }, b64('tone.mp3'), b64('starter.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<160; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 2 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(800); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const ids = await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(), [x, y] = r.library.map(t=> t.id);
    const it = (refId)=> ({id: Math.random().toString(36).slice(2), kind: 'track', refId});
    r.tree = [
      {kind: 'playlist', id: 'pX', name: 'Only X', items: [it(x), {id: 'st1', kind: 'stop', name: 'Pause'}]},
      {kind: 'folder', id: 'f1', name: 'Mixed', children: [{kind: 'playlist', id: 'pXY', name: 'X and Y', items: [it(x), it(y), it(x)]}]},
      {kind: 'playlist', id: 'pY', name: 'Only Y', items: [it(y)]},
    ];
    await window.__dbg.saveState();
    return {x, y};
  });
  await p.evaluate((c,u)=> window.__dbg3.join(u, c, 'Leaver'), code, URL_SYNC); await waitIdle(p);
  // X's recording never arrived here.
  await p.evaluate((x)=> window.__dropAudio(x), ids.x);
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300);
  await p.evaluate(()=> window.__dbg4.section('shared')); await sleep(1000);
  await p.evaluate(()=> document.getElementById('shLeave').click());
  let m = await waitModal(p, /Stop syncing/);
  ok(/1 of its tracks never arrived on this device/.test(m), label + ': the Leave question says what will be removed (' + short(m) + ')');
  await clickText(p, '.modal button', '^Leave shared library$');
  m = await waitModal(p, /Tidying up after leaving/);
  ok(/never arrived on this device: 1/.test(m) && /left with no tracks/.test(m) && /Only X/.test(m) && !/Only Y/.test(m), label + ': X removed; "Only X" (a stop is no track) is left empty (' + short(m) + ')');
  if(emptyChoice === 'close') await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click() || document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  else await clickText(p, '.modal button', emptyChoice);
  m = await waitModal(p, /some of their tracks missing/);
  ok(/Mixed \/ X and Y/.test(m), label + ': "Mixed / X and Y" is left with some missing (' + short(m) + ')');
  await clickText(p, '.modal button', partlyChoice); await sleep(800);
  const after = await p.evaluate((x)=>{ const r = window.__dbg.getRoot(); const names = []; const items = {}; (function w(ns){ ns.forEach(n=>{ if(n.kind === 'folder') return w(n.children || []); names.push(n.name); items[n.name] = (n.items || []).map(i=> i.kind === 'track' ? (i.refId === x ? 'X' : 'Y') : i.kind).join(','); }); })(r.tree); return {lib: r.library.length, hasX: r.library.some(t=> t.id === x), names, items, joined: !!r.settings.sharedLibrary}; }, ids.x);
  return {p, after};
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  // The defaults (closing the first question takes its default too).
  let {p, after} = await run(b, process.argv[2], 'defaults', 'close', '^Remove the missing tracks from them$');
  ok(!after.joined && after.lib === 1 && !after.hasX, 'left, and only the track that arrived is in the library (' + JSON.stringify(after) + ')');
  ok(!after.names.includes('Only X') && after.items['X and Y'] === 'Y' && after.items['Only Y'] === 'Y', 'the empty playlist removed; the other keeps its tracks that are here; "Only Y" untouched');
  await p.browserContext().close();
  // The other choices.
  ({p, after} = await run(b, process.argv[3], 'others', '^Keep them, empty$', '^Remove these playlists$'));
  ok(after.items['Only X'] === 'stop' && !after.names.includes('X and Y') && after.items['Only Y'] === 'Y', 'Keep them, empty: "Only X" stays with just its stop; Remove these playlists: "X and Y" goes (' + JSON.stringify(after) + ')');
  await p.browserContext().close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
