// Two copies of one recording when a device rejoins (1.4.190, Gen Rinzin's cases):
// B leaves the shared library; meanwhile A replaces three tracks' audio:
//   t1 with the same bytes (1. the same recording: B takes the new revision,
//      nothing downloaded),
//   t2 with other bytes, then that file is taken off the server (2. never
//      reached the server: B keeps its own, and the shared library uses it),
//   t3 with other bytes (4. both good: the newer, A's, replaces B's, whose
//      copy goes into Undo's trash).
// B rejoins ("Combine"), and each choice is in its sync log.
//   node reconcile.js "<join code>"
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sleep = ms=> new Promise(r=> setTimeout(r, ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const LIB = CODE.split(' ')[0], DATA = path.join(__dirname, 'syncdata', LIB);
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const FILES = {t1: fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')), t2: fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3')), t3: fs.readFileSync(path.join(__dirname, 'www', 'ten.mp3'))};
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(250); } return 'timeout'; };
const syncNow = async P=>{ await P.evaluate(()=> window.__dbg3.sync()); await sleep(1500); await waitIdle(P); };
const log = P=> P.evaluate(()=> JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=> /log/i.test(k) && /shared/i.test(k))) || '[]').join('\n'));
async function device(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name, 'ALERT:', d.message()); d.dismiss(); });
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const sha = (p, id)=> p.evaluate(async(id)=>{ const b = await window.__dmg.get(id).catch(()=> null); if(!b) return null; return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))].map(x=> x.toString(16).padStart(2, '0')).join(''); }, id);
const tracks = p=> p.evaluate(()=> Object.fromEntries(window.__dbg.getRoot().library.map(t=> [t.filename, {id: t.id, rev: t.audioRev}])));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate((f)=>{ const list = Object.entries(f).map(([k, b64])=>{ const x = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], k + '.mp3', {type: 'audio/mpeg'}); Object.defineProperty(x, 'webkitRelativePath', {value: 'Set/' + k + '.mp3'}); return x; }); window.__dbg.bulkImportFolder(list); }, Object.fromEntries(Object.entries(FILES).map(([k, v])=> [k, v.toString('base64')])));
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length === 3 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await A.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await A.evaluate((c, u)=> window.__dbg3.join(u, c, 'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c, u)=>{ window.__dbg3.join(u, c, 'Mac mini'); }, CODE, URL_SYNC);
  for(let k=0; k<40; k++){ if(await B.evaluate(()=> window.__radio('^Use the shared library here'))) break; await sleep(250); }
  await waitIdle(B); await sleep(2000); await waitIdle(B);
  const tA = await tracks(A), tB0 = await tracks(B);
  ok(Object.keys(tB0).length === 3 && await sha(B, tB0['t3.mp3'].id) === await sha(A, tA['t3.mp3'].id), 'B has all three, byte for byte');
  await B.evaluate(()=> window.__dbg3.leave()); await sleep(500);
  // Meanwhile on A.
  const put = (id, bytes)=> A.evaluate(async(id, b64)=>{ const blob = new Blob([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], {type: 'audio/mpeg'}); await window.__dmg.put(id, blob); window.__dbg.getRoot().library.find(t=> t.id === id).fileSize = blob.size; await window.__dbg.saveState(); }, id, bytes.toString('base64'));
  await put(tA['t1.mp3'].id, FILES.t1);
  await put(tA['t2.mp3'].id, Buffer.concat([FILES.t2, Buffer.alloc(5000)]));
  await put(tA['t3.mp3'].id, Buffer.concat([FILES.t3, Buffer.alloc(9000)]));
  await syncNow(A); await sleep(1500); await syncNow(A);
  const tA2 = await tracks(A);
  const t2File = path.join(DATA, 'audio', tA2['t2.mp3'].id + '.' + tA2['t2.mp3'].rev);
  ok(fs.existsSync(t2File), 'A sent its new copies'); if(fs.existsSync(t2File)) fs.unlinkSync(t2File); // as if it never had
  // B rejoins, combining.
  await B.evaluate((c, u)=>{ window.__dbg3.join(u, c, 'Mac mini'); }, CODE, URL_SYNC); // not waited for: it asks first
  for(let k=0; k<80; k++){ if(await B.evaluate(()=> window.__radio('^Combine'))) break; await sleep(250); }
  await waitIdle(B); await sleep(2500); await waitIdle(B); await syncNow(B);
  const L = await log(B), tB = await tracks(B);
  console.log(L.split('\n').filter(x=> /copy|recording/.test(x)).join('\n'));
  ok(/t1.*the same recording here and in the shared library/.test(L) || /the same recording here and in the shared library/.test(L), '1. the same recording: said so');
  ok(tB['t1.mp3'] && tB['t1.mp3'].rev === tA2['t1.mp3'].rev && !(await B.evaluate((id)=> window.__dbg3.pending().audio[id] !== undefined, tB['t1.mp3'].id)), '   B took the new revision, with nothing to download');
  ok(/never reached the server; this device's is kept and sent/.test(L), '2. never reached the server: B keeps its own, said so');
  const doc2 = await A.evaluate(async()=>{ await window.__dbg3.sync(); return null; });
  await sleep(2000); await waitIdle(A);
  const tA3 = await tracks(A);
  for(let i=0; i<40 && await sha(A, tA3['t2.mp3'].id) !== await sha(B, tB['t2.mp3'].id); i++){ await sleep(500); await A.evaluate(()=> window.__dbg3.sync()); }
  const tA4 = await tracks(A);
  ok(tA4['t2.mp3'].rev === (await tracks(B))['t2.mp3'].rev && await sha(A, tA3['t2.mp3'].id) === await sha(B, tB['t2.mp3'].id), '   and the shared library uses B\'s copy: A has it now too (' + tA4['t2.mp3'].rev + ')');
  ok(/the shared library's is newer, so it replaces this device's/.test(L), '4. both good: the newer (A\'s) replaces B\'s, said so');
  for(let i=0; i<40 && await sha(B, tB['t3.mp3'].id) !== await sha(A, tA2['t3.mp3'].id); i++){ await sleep(500); }
  ok(await sha(B, tB['t3.mp3'].id) === await sha(A, tA2['t3.mp3'].id), '   B now has A\'s copy');
  ok(await B.evaluate(async()=> (await window.__dbg3.trashKeys()).length) >= 1, '   B\'s older copy is in Undo\'s trash');
  // Waiting for itself (1.4.190): B is named as the sender of a revision no
  // one has, while it holds a good copy: it uses its own, as a new revision.
  const id1 = tB['t1.mp3'].id;
  await B.evaluate(async(id)=>{ const t = window.__dbg.getRoot().library.find(x=> x.id === id); t.audioRev = 'mw0000000ghost'; t.audioFrom = 'Mac mini'; window.__dbg3.pending().audio[id] = 'mw0000000ghost'; await window.__dbg3.put('state', {key: 'sharedPending', value: window.__dbg3.pending()}); await window.__dbg.saveState(); await window.__dbg3.downloadPass(); }, id1);
  await sleep(2500); await waitIdle(B); await syncNow(B); await sleep(1500); await syncNow(B);
  const L2 = await log(B), r1 = await B.evaluate((id)=> ({rev: window.__dbg.getRoot().library.find(x=> x.id === id).audioRev, pend: window.__dbg3.pending().audio[id]}), id1);
  ok(/was waiting for this device to send a copy it no longer has; its own copy is used and sent instead/.test(L2), 'waiting for itself: it uses its own copy, and says so');
  ok(r1.rev !== 'mw0000000ghost' && r1.pend === undefined && fs.existsSync(path.join(DATA, 'audio', id1 + '.' + r1.rev)), '   as a new revision, sent to the server (' + r1.rev + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
