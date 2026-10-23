// A download that closes the page (1.4.066). On the iPad one file closed
// 37 Player each time it was received, eight times in a row. Now the file
// being received is noted first; if the page is gone before it's stored, the
// next start says so in the sync log and doesn't receive that file again,
// until Sync now. Simulated by a download that never finishes, then a
// reload in the middle of it.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); };
const log = p=> p.evaluate(()=> (JSON.parse(localStorage.getItem('37player.sharedLog') || '[]')).join('\n'));
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
// From the start of every page: while localStorage __hang is set, an audio
// download's body never finishes arriving (as a huge file on a small device).
const HANG = ()=>{
  const orig = Response.prototype.blob;
  Response.prototype.blob = function(){ if(localStorage.getItem('__hang') === '1' && /kind=audio/.test(this.url || '')) return new Promise(()=>{}); return orig.call(this); };
};
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  p.audioGets = 0;
  await p.setRequestInterception(true);
  p.on('request', r=>{ const u = r.url(); if(!(u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'))) return r.abort(); if(/[?&]op=file\b/.test(u) && /kind=audio/.test(u) && r.method() === 'GET') p.audioGets++; r.continue(); });
  await p.evaluateOnNewDocument(HANG);
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);

  const B = await device(b, 'B');
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await B.evaluate(()=> localStorage.setItem('__hang', '1'));
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC);
  let marker = null;
  for(let i=0; i<60 && !marker; i++){ await sleep(250); marker = await B.evaluate(()=> localStorage.getItem('37player.downloading')); }
  ok(!!marker && /Spontaneous/.test(marker), 'the file being received is noted first: ' + marker);
  // The page "crashes" mid-download: reloaded, downloads working again
  await B.evaluate(()=> localStorage.removeItem('__hang'));
  B.audioGets = 0;
  await B.reload({waitUntil:'networkidle0'}); await sleep(4000);
  let lb = await log(B);
  console.log('B log:\n' + lb);
  ok(/37 Player was closed while receiving “Spontaneous[^”]*”.*isn't received again on this device until Sync now/.test(lb), 'the next start says which file closed it');
  ok(!(await B.evaluate(()=> localStorage.getItem('37player.downloading'))), 'the note is taken back');
  await sleep(33000);
  ok(B.audioGets === 0, 'that file isn\'t received again by itself (' + B.audioGets + ' tries)');
  ok(await B.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length) === 1, 'it still waits to arrive');
  // Sync now tries again
  await B.evaluate(()=> window.__dbg3.sync()); await sleep(2000); await waitIdle(B); await sleep(1500);
  lb = await log(B);
  ok(B.audioGets >= 1 && /received “Spontaneous/.test(lb) && await B.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length) === 0, 'Sync now receives it, and it arrives');
  ok(!(await B.evaluate(()=> localStorage.getItem('37player.downloadCrashed'))), 'and the skip is forgotten');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
