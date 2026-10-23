// A full device (1.4.060): every write fails. Saving failures must show in
// the top bar (and once as a dialog), be retried, and clear once there's
// room, with nothing lost while the window stayed open. A failed audio write
// must take back the track's new revision. Receiving from a shared library
// must stop at the first file it can't store (not download it again every
// 30 seconds), say why in the sync log, and resume at Sync now.
// Simulated by making IndexedDB puts throw, as in quota.js.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
async function opened(p){
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(1500);
  // The welcome can come up again a moment later
  for(const x of ['^English$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  console.log('(after opening, dialog: ' + JSON.stringify(await p.evaluate(()=> (document.querySelector('.modal-backdrop.show .modal')?.innerText || '').slice(0, 50))) + ')');
}
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  p.fileRequests = 0;
  await p.setRequestInterception(true);
  p.on('request', r=>{ const u = r.url(); if(!(u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'))) return r.abort(); if(/[?&]op=file\b/.test(u) && /kind=audio/.test(u) && r.method() !== 'OPTIONS') p.fileRequests++; r.continue(); });
  await opened(p);
  return p;
}
// Every put fails while window.__full is set: with QuotaExceededError, or
// with whatever error name __fullName says.
const breakable = p=> p.evaluate(()=>{
  if(window.__breakable) return; window.__breakable = true;
  const orig = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...a){
    if(window.__full && (!window.__fullStores || window.__fullStores.includes(this.name))) throw new DOMException(window.__fullName === 'UnknownError' ? 'An internal error was encountered in the Indexed Database server' : 'The quota has been exceeded.', window.__fullName || 'QuotaExceededError');
    return orig.apply(this, a);
  };
});
const bar = p=> p.evaluate(()=>{ const b = document.getElementById('btnNotSaving'); return {shown: b.style.display !== 'none', text: b.textContent}; });
const dialog = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
const firstPl = p=> p.evaluate(()=>{ const f = ns=>{ for(const n of ns){ if(n.kind==='playlist') return n.name; if(n.children){ const x=f(n.children); if(x) return x; } } }; return f(window.__dbg.getRoot().tree); });
const renamePl = (p, name)=> p.evaluate(async (name)=>{ const f = ns=>{ for(const n of ns){ if(n.kind==='playlist') return n; if(n.children){ const x=f(n.children); if(x) return x; } } }; f(window.__dbg.getRoot().tree).name = name; try{ await window.__dbg.saveState(); return 'saved'; }catch(err){ return 'failed: ' + err.name; } }, name);
const log = p=> p.evaluate(()=> window.__shLog ? window.__shLog() : (JSON.parse(localStorage.getItem('37player.sharedLog') || '[]')).join('\n'));
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };

(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b,'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  const pl0 = await firstPl(A);
  ok(!!pl0 && (await A.evaluate(()=> window.__dbg.getRoot().library.length)) === 1, 'set up: one track in playlist “' + pl0 + '”');

  // --- The device fills up: a rename can't be saved
  await breakable(A);
  ok(!(await bar(A)).shown, 'no warning while saving works');
  await A.evaluate(()=>{ window.__full = true; });
  const r1 = await renamePl(A, 'Renamed while full');
  await sleep(400);
  ok(/failed/.test(r1), 'the save fails (' + r1 + ')');
  let bb = await bar(A);
  ok(bb.shown && /Device full/.test(bb.text), 'the top bar says so in red: ' + JSON.stringify(bb.text));
  let dt = await dialog(A);
  ok(/aren't being saved/.test(dt) && /out of storage space/.test(dt) && /iPad Storage/.test(dt), 'a dialog explains, once: ' + JSON.stringify(dt.slice(0, 120)));
  await A.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  await renamePl(A, 'Renamed again while full'); await sleep(400);
  ok(!(await dialog(A)), 'a second failure brings no second dialog');
  // A failed audio write takes back the revision it gave the track
  const rev = await A.evaluate(async()=>{ const t = window.__dbg.getRoot().library[0]; t.audioRev = 'r1'; const before = t.audioRev; let threw = false; try{ await window.__dbg3.put('audio', {id: t.id, blob: new Blob([new Uint8Array(1000)])}); }catch(err){ threw = true; } const after = window.__dbg.getRoot().library[0].audioRev; delete window.__dbg.getRoot().library[0].audioRev; return {before, after, threw}; });
  ok(rev.threw && rev.before === rev.after, 'a failed audio write keeps the track\'s revision (' + JSON.stringify(rev) + ')');
  // The bar opens the dialog; Try again while still full
  await A.click('#btnNotSaving'); await sleep(300);
  await A.click('#notSavingRetry'); await sleep(600);
  ok(/Still not saving/.test(await dialog(A)), 'Try again now, still full: says so');
  // Room again: Try again now saves, everything clears
  await A.evaluate(()=>{ window.__full = false; });
  await A.click('#notSavingRetry'); await sleep(800);
  ok(!(await bar(A)).shown && !(await dialog(A)), 'room again: Try again now saves, and the bar and dialog go');
  const lg = await log(A);
  ok(/saving on this device failed: QuotaExceededError/.test(lg) && /saving works again/.test(lg), 'the sync log records both');
  await opened(A);
  ok((await firstPl(A)) === 'Renamed again while full', 'after a reload the rename is there: ' + await firstPl(A));

  // --- Coming back on screen retries by itself; another kind of error gets the plainer wording
  await breakable(A);
  await A.evaluate(()=>{ window.__full = true; window.__fullName = 'UnknownError'; });
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300);
  await renamePl(A, 'Renamed during UnknownError'); await sleep(400);
  bb = await bar(A); dt = await dialog(A);
  if(!/aren't being saved/.test(dt)){ console.log('(another dialog was up: ' + JSON.stringify(dt.slice(0, 40)) + '; opening it from the bar)'); await A.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); await A.click('#btnNotSaving'); await sleep(300); dt = await dialog(A); }
  ok(bb.shown && bb.text === 'Not saving', 'another error: "Not saving"');
  ok(/UnknownError/.test(dt) && /usual cause/.test(dt), 'and the dialog names the error: ' + JSON.stringify(dt.slice(0, 160)));
  await A.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await A.evaluate(()=>{ window.__full = false; delete window.__fullName; Object.defineProperty(document, 'hidden', {value: false, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(800);
  ok(!(await bar(A)).shown, 'coming back on screen saved it, and the bar went');
  await opened(A);
  ok((await firstPl(A)) === 'Renamed during UnknownError', 'kept after a reload');

  // --- Receiving on a full device
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  const B = await device(b,'B');
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await breakable(B);
  await B.evaluate(()=>{ window.__full = true; window.__fullStores = ['audio']; }); // the library fits, the recording doesn't
  B.fileRequests = 0;
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  await sleep(4000);
  const tries1 = B.fileRequests;
  let lb = await log(B);
  console.log('B log:\n' + lb);
  ok(tries1 === 1, 'the file was downloaded once (' + tries1 + ')');
  ok(/couldn't store .*QuotaExceededError.*this device is full.*tries again in 2 min/.test(lb), 'the sync log says it couldn\'t be stored and when it tries again');
  ok(!/received “/.test(lb), 'and doesn\'t claim it was received');
  // The ordinary 30-second retry doesn't fire
  await sleep(33000);
  ok(B.fileRequests === tries1, 'not downloaded again 30 seconds later (' + B.fileRequests + ')');
  const pend = await B.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length);
  ok(pend === 1, 'still waiting to arrive');
  // Room again, Sync now
  await B.evaluate(()=>{ window.__full = false; });
  await B.evaluate(()=> window.__dbg3.sync()); await sleep(1500); await waitIdle(B); await sleep(1500);
  lb = await log(B);
  ok(/received “/.test(lb) && await B.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length) === 0, 'Sync now with room again: it arrives');

  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
