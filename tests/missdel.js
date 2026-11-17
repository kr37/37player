// Deleting a track whose audio hasn't reached the shared library, on a
// device with everything (2.5.041; kr37: mostly the sending device's
// library was disconnected or deleted). Laptop (A) adds two tracks but
// can't send their audio; iPad (B) and Phone (C) hold everything.
// - B deletes one: the dialog says Laptop still has to send it, and offers
//   Only on this device and Delete everywhere; Only on this device makes B
//   choose what it holds, the track leaves B, and Laptop keeps it;
// - C deletes the other everywhere: it leaves Laptop too.
//   node missdel.js <code>
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
async function device(b, name, blockPut){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.setRequestInterception(true);
  p.on('request', r=>{ const u = r.url(); if(!(u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'))) return r.abort(); if(blockPut && r.method() === 'PUT' && /kind=audio/.test(u)) return r.abort(); r.continue(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state})); if(s.st!=='syncing') return; await sleep(200); } };
const has = (p, id)=> p.evaluate(id=> !!window.__dbg.getRoot().library.find(t=> t.id === id), id);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A', true);
  await A.evaluate(async(b64)=>{
    const r = window.__dbg.getRoot(), bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0));
    for(const id of ['md1', 'md2']){
      r.library.push({id, name: id === 'md1' ? 'Only here' : 'Everywhere', filename: id + '.mp3', duration: 60, fileSize: bytes.length, peaks: new Array(100).fill(0.3), addedAt: Date.now()});
      await window.__dbg3.put('audio', {id, blob: new File([bytes], id + '.mp3', {type: 'audio/mpeg'})});
    }
    await window.__dbg.saveState();
  }, STARTER);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(2500); await waitIdle(A);
  const B = await device(b, 'B'), C = await device(b, 'C');
  for(const [p, n] of [[B, 'iPad'], [C, 'Phone']]){ await p.evaluate((c,u,n)=> window.__dbg3.join(u,c,n), CODE, URL_SYNC, n); await waitIdle(p); await sleep(2500); await waitIdle(p); }
  const m = await B.evaluate(()=> window.__dbg3.missing('md1'));
  ok(m && m.waiting && m.from === 'Laptop' && await has(B, 'md1'), 'B has the track, its audio waiting for Laptop (' + JSON.stringify(m) + ')');

  await B.evaluate(()=> window.__dbg3.delTracks(['md1'])); await sleep(500);
  const dlg = await B.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/Laptop still has to send it/.test(dlg) && /Only on this device/.test(dlg) && /Delete everywhere/.test(dlg) && /Settings → Shared library → What's on this device/.test(dlg), 'B: the dialog says Laptop has to send it, and offers both (' + dlg.replace(/\s+/g, ' ').slice(0, 160) + '…)');
  await B.click('#delMissHere'); await sleep(1500);
  ok(!(await has(B, 'md1')) && (await B.evaluate(()=> window.__dbg3.cfg().partial)) === true, 'Only on this device: the track leaves B, and B now chooses what it holds');
  await B.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await waitIdle(B);
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await waitIdle(A);
  ok(await has(A, 'md1') && await has(C, 'md2'), 'Laptop keeps it');

  await C.evaluate(()=> window.__dbg3.delTracks(['md2'])); await sleep(500);
  await C.click('#delMissAll'); await sleep(1500);
  await C.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await waitIdle(C);
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await waitIdle(A);
  ok(!(await has(C, 'md2')) && !(await has(A, 'md2')) && (await C.evaluate(()=> !window.__dbg3.cfg().partial)), 'Delete everywhere (C): it leaves Laptop too, and C still holds everything');
  console.log(fails ? fails+' FAILED' : 'ALL OK'); await b.close();
})();
