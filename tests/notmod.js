// A sync with nothing new doesn't download the shared list (2.5.043):
// the page sends the version it has (?have=N) and sync.php answers 304,
// and the saved copy stands in for it. A change made elsewhere still
// arrives. (Google Drive does the same from its listing: drive.js.)
//   node notmod.js <code>
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function device(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  p.states = [];
  p.on('response', r=>{ const u = r.url(); if(/op=state/.test(u) && r.request().method() === 'GET' && !/[?&]version=/.test(u)) p.states.push(r.status()); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=> window.__dbg3.status().state); if(s!=='syncing') return; await sleep(200); } };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(2500); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B); await sleep(2500); await waitIdle(B);
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(1200); await waitIdle(A); // catching up with B's joining
  A.states = [];
  for(let i = 0; i < 2; i++){ await A.evaluate(()=> window.__dbg3.sync()); await sleep(1200); await waitIdle(A); }
  ok(A.states.length >= 2 && A.states.every(s=> s === 304), 'two syncs with nothing new: "not modified" each time (' + A.states.join(', ') + ')');
  // B renames a playlist; A's next sync downloads the list and gets it.
  const name = await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); const pl = (function f(a){ for(const n of a){ if(n.kind === 'playlist') return n; if(n.children){ const x = f(n.children); if(x) return x; } } })(r.tree); pl.name = 'Renamed on the iPad'; await window.__dbg.saveState(); await window.__dbg3.sync(); return pl.id; });
  await sleep(1500); await waitIdle(B);
  A.states = [];
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(1500); await waitIdle(A);
  const got = await A.evaluate(id=>{ const f = a=>{ for(const n of a){ if(n.id === id) return n; if(n.children){ const x = f(n.children); if(x) return x; } } }; return (f(window.__dbg.getRoot().tree) || {}).name; }, name);
  ok(A.states.includes(200) && got === 'Renamed on the iPad', 'a change made elsewhere: the list is downloaded and the change arrives (' + A.states.join(', ') + '; ' + got + ')');
  A.states = [];
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(1200); await waitIdle(A);
  ok(A.states.every(s=> s === 304), 'and the sync after that: "not modified" again (' + A.states.join(', ') + ')');
  console.log(fails ? fails+' FAILED' : 'ALL OK'); await b.close();
})();
