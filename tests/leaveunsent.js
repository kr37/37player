// A device that leaves takes back what it never sent (2.4.002; Gen Rinzin,
// 13 Nov 2026: tracks waited for from a device that has gone are waited for
// for ever). A adds a track whose audio never reaches the shared library; B
// waits for it; A leaves: the Leave question says so, the track goes from
// the shared library (and from B, playlist row included), and stays on A.
//   node leaveunsent.js <code>      (needs both servers from serve.sh)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitModal = async (p, re, ms)=>{ for(let i=0; i<(ms||10000)/200; i++){ const t = await modal(p); if(re.test(t)) return t; await sleep(200); } return await modal(p); };
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; }
const device = async (b)=>{
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
};
const add = (p, id, name, file)=> p.evaluate(async(id, name, b)=>{
  const r = window.__dbg.getRoot(), blob = new Blob([Uint8Array.from(atob(b), x=>x.charCodeAt(0))], {type:'audio/mpeg'});
  r.library.push({id, name, duration: 3, peaks: [0.2, 0.5, 0.3], filename: name + '.mp3', fileSize: blob.size});
  await window.__dbg3.put('audio', {id, blob});
  let pl = r.tree.find(n=> n.id === 'pl'); if(!pl){ pl = {id: 'pl', kind: 'playlist', name: 'Set', items: []}; r.tree.push(pl); }
  pl.items.push({id: 'i' + id, kind: 'track', refId: id, order: pl.items.length});
  await window.__dbg.saveState();
}, id, name, b64(file));
const look = (p)=> p.evaluate(()=>{ const r = window.__dbg.getRoot(), pl = r.tree.find(n=> n.id === 'pl'); return {lib: r.library.map(t=> t.name).sort().join(','), rows: pl ? pl.items.map(i=> i.refId).join(',') : null, joined: !!r.settings.sharedLibrary}; });
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const CODE = process.argv[2];
  const A = await device(b);
  await add(A, 'tx', 'X', 'starter.mp3');
  await A.evaluate((c,u)=> window.__dbg3.join(u, c, 'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  const B = await device(b);
  await B.evaluate((c,u)=> window.__dbg3.join(u, c, 'iPad'), CODE, URL_SYNC); await waitIdle(B);
  // From now on A's audio never reaches the shared library (its lid closed, say).
  await A.setRequestInterception(true);
  A.on('request', r=>{ if(r.method() === 'PUT' && /op=file/.test(r.url()) && /kind=audio/.test(r.url())) r.abort(); else r.continue(); });
  await add(A, 'tz', 'Z', 'tone.mp3');
  await A.evaluate(()=> window.__dbg3.sync()); await sleep(3000);
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B); await sleep(1000);
  const waitingB = await B.evaluate(()=> ({lib: window.__dbg.getRoot().library.map(t=> t.name).sort().join(','), pending: Object.keys((window.__dbg3.pending() || {audio: {}}).audio)}));
  ok(waitingB.lib === 'X,Z' && waitingB.pending.includes('tz'), 'B lists Z and waits for its audio (' + JSON.stringify(waitingB) + ')');
  // A leaves.
  await A.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300);
  await A.evaluate(()=> window.__dbg4.section('shared')); await sleep(1000);
  await A.evaluate(()=> document.getElementById('shLeave').click());
  const m = await waitModal(A, /Stop syncing/);
  ok(/1 of this device's tracks were never fully sent/.test(m) && /stay in this library/.test(m), 'the Leave question says a track was never sent and will be taken out (' + m.replace(/\n+/g, ' | ').slice(0, 220) + ')');
  await clickText(A, '.modal button', '^Leave shared library$'); await sleep(2500);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const a = await look(A);
  ok(!a.joined && a.lib === 'X,Z' && a.rows === 'tx,tz', 'A has left, and keeps Z in its own library and playlist (' + JSON.stringify(a) + ')');
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B); await sleep(1000);
  const bb = await look(B), pend = await B.evaluate(()=> Object.keys((window.__dbg3.pending() || {audio: {}}).audio));
  ok(bb.lib === 'X' && bb.rows === 'tx' && !pend.includes('tz'), 'B no longer lists Z or waits for it; X stays (' + JSON.stringify([bb, pend]) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
