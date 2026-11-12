// Joining again after leaving partway (2.2.018; Gen Rinzin's test, 11 Nov
// 2026): tracks whose audio never arrived used to count as already here, so
// the choices said "Downloads nothing" and the tracks stayed silent.
//  - B joins A's library and receives everything; two tracks' audio is then
//    removed from B's storage and B leaves (as if it left partway through);
//  - joining again, "Use the shared library here" says it downloads something;
//  - after joining, the recording is fetched again;
//  - an already joined device that loses a track's audio fetches it again on
//    Sync now, and in ordinary rounds only once it has been absent for two.
//   node rejoin.js <code>      (needs both servers from serve.sh)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const base = 'www/ovt'; const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push([path.relative(base,f), fs.readFileSync(f).toString('base64')]); } })(base);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  await p.setRequestInterception(true); p.on('request', r=> r.url().startsWith('http://localhost') || r.url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return s; await sleep(200); } return 'timeout'; };
const stored = p=> p.evaluate(async()=> (await window.__rejoin.storedAudioIds()).length);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b,'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  const B = await device(b,'B');
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  const n = await B.evaluate(()=> window.__dbg.getRoot().library.length);
  ok(n >= 2 && await stored(B) === n, 'B joined and has all ' + n + ' recordings');
  // As if B had left partway: two tracks without their audio, and not joined.
  const gone = await B.evaluate(async()=>{ const ids = window.__dbg.getRoot().library.slice(0, 1).map(t=> t.id); for(const id of ids) await window.__rejoin.idbDelete('audio', id); await window.__dbg3.leave(); return ids; });
  ok(await stored(B) === n - 1 && !(await B.evaluate(()=> window.__dbg.getRoot().settings.sharedLibrary)), 'B has left, with one track\'s audio missing');
  const joining = B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC);
  let m = ''; for(let k = 0; k < 50 && !/Use the shared library/.test(m); k++){ await sleep(200); m = await modal(B); }
  const useLine = (m.split('\n').find((l, i, a)=> /Downloads/.test(l) && a.slice(Math.max(0, i - 3), i + 1).some(x=> /Use the shared library/.test(x))) || '');
  ok(/Use the shared library/.test(m) && /Downloads/.test(m) && !/Downloads nothing/.test(useLine), 'joining again: the choice says it will download them (' + (useLine || m.replace(/\n/g, ' | ').slice(0, 160)) + ')');
  await B.evaluate(()=>{ const l = [...document.querySelectorAll('.modal label')].find(x=> /Use the shared library/.test(x.textContent)); const i = l && (l.querySelector('input') || l); i && i.click(); }); await sleep(200);
  await clickText(B, '.modal button', '^Do it now$');
  await joining; await waitIdle(B);
  for(let k = 0; k < 40 && await stored(B) < n; k++) await sleep(250);
  ok(await stored(B) === n, 'after joining again, the recording is fetched (' + await stored(B) + ' of ' + n + ')');
  // Already joined: a track's audio goes missing.
  await B.evaluate(async(id)=>{ await window.__rejoin.idbDelete('audio', id); }, gone[0]);
  await B.evaluate(()=> window.__dbg3.sync()); await sleep(1500); await waitIdle(B);
  for(let k = 0; k < 40 && await stored(B) < n; k++) await sleep(250);
  ok(await stored(B) === n, 'joined already: a track that loses its audio gets it back on Sync now (' + await stored(B) + ' of ' + n + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
