// A file that already looks like Safari's damage as it comes from the
// shared library (1.4.082): an MP3 with two ID3 tags in a row, which plays
// fine. An iPad (WebKit) receiving it in pieces must keep it, not refuse it
// for good as before. Based on pieces.js:
// Receiving in pieces (1.4.067). A 1.2 GB recording read whole into memory
// closed 37 Player on the iPad; files now arrive a piece at a time, each
// stored before the next, put together and checked at the end. Here the
// piece size is made 256 KB (window.__pieceBytes) so the 1.3 MB starter
// track comes in 5 pieces:
// - B receives it in pieces, byte for byte, and no pieces are left behind;
// - C is cut off after 3 pieces, and carries on from the 4th when reopened;
// - D is told a wrong total size, so the file comes out the wrong length:
//   the sync log says so, nothing is stored, it isn't tried again by itself.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const ORIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3'));
const BYTES = Buffer.concat([Buffer.from([0x49,0x44,0x33,3,0,0,0,0,0,0]), ORIG]); // an empty ID3 tag, then the file (which starts with its own)
const STARTER = BYTES.toString('base64'), SHA = crypto.createHash('sha256').update(BYTES).digest('hex');
const PIECE = 256 * 1024;
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); };
const log = p=> p.evaluate(()=> (JSON.parse(localStorage.getItem('37player.sharedLog') || '[]')).join('\n'));
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const pendingAudio = p=> p.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length);
// The stored audio's SHA-256, and any pieces left in the state store.
const stored = p=> p.evaluate(()=> new Promise(res=>{
  const q = indexedDB.open('temple-sound-library'); q.onsuccess = async ()=>{
    const d = q.result;
    const get = (st, k)=> new Promise(r=>{ const g = d.transaction(st).objectStore(st).get(k); g.onsuccess = ()=> r(g.result); g.onerror = ()=> r(null); });
    const keys = await new Promise(r=>{ const g = d.transaction('state').objectStore('state').getAllKeys(IDBKeyRange.bound('dlpart:', 'dlpart:￿')); g.onsuccess = ()=> r(g.result); });
    const ids = await new Promise(r=>{ const g = d.transaction('audio').objectStore('audio').getAllKeys(); g.onsuccess = ()=> r(g.result); });
    let sha = null;
    if(ids.length){ const rec = await get('audio', ids[0]); const buf = await rec.blob.arrayBuffer(); sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b=> b.toString(16).padStart(2, '0')).join(''); }
    d.close(); res({sha, pieces: keys.length, audio: ids.length});
  };
}));
async function device(b, name, opts){
  opts = opts || {};
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  p.ranges = []; p.cutAt = opts.cutAt; p.lie = opts.lie;
  await p.setRequestInterception(true);
  p.on('request', r=>{
    const u = r.url();
    if(!(u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'))) return r.abort();
    if(/[?&]op=file\b/.test(u) && /kind=audio/.test(u) && r.method() === 'GET'){
      const range = r.headers()['range'] || '';
      p.ranges.push(range);
      const start = +((/bytes=(\d+)-/.exec(range) || [])[1] || 0);
      if(p.cutAt != null && start >= p.cutAt) return r.abort('connectionreset');
      if(p.lie && start === 0) return r.respond({status: 206, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length', 'Content-Range': 'bytes 0-' + (PIECE - 1) + '/9999999', 'Content-Type': 'application/octet-stream'}, body: BYTES.subarray(0, PIECE)});
    }
    r.continue();
  });
  await p.evaluateOnNewDocument((n, wk)=>{ window.__pieceBytes = n; if(wk) window.__p37WebKit = true; }, PIECE, !!opts.webkit);
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  ok((await stored(A)).sha === SHA, 'A holds the two-tag MP3 as imported');
  const E = await device(b, 'E', {webkit: true});
  await E.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(E); await sleep(3000); await waitIdle(E);
  const sE = await stored(E), lE = await log(E);
  ok(E.ranges.length > 1, 'the iPad received it in pieces (' + E.ranges.length + ')');
  ok(sE.sha === SHA && sE.pieces === 0 && await pendingAudio(E) === 0, 'and kept it, byte for byte, with nothing left waiting');
  ok(!/couldn't receive/.test(lE), 'no "couldn\'t receive" in the sync log');

  // A split part starts straight with sound (no ID3 tag). Received, it must
  // be stored with its real type: the server sends application/octet-stream,
  // and Safari won't play an untyped file it doesn't recognise.
  const pid = await A.evaluate(async ()=>{ const tr = window.__dbg.getRoot().library[0]; const r = await window.__split(tr, 30, null, {name: 'part two', artist: '', album: '', trackNo: null}, ()=>{}); return r.track2.id; });
  await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A); await sleep(1500); await waitIdle(A);
  await E.evaluate(()=> window.__dbg3.sync()); await sleep(1500); await waitIdle(E); await sleep(1500); await waitIdle(E);
  const t = await E.evaluate(async (id)=>{
    const blob = await window.__dmg.get(id);
    const head = String.fromCharCode(...new Uint8Array(await blob.slice(0, 3).arrayBuffer()));
    return {type: blob.type, head};
  }, pid);
  ok(t.head !== 'ID3' && t.type === 'audio/mpeg', 'a received split part (no ID3 tag) is stored as audio/mpeg (' + JSON.stringify(t) + ')');
  // One stored earlier as application/octet-stream is typed when played.
  const u = await E.evaluate(async (id)=>{
    const blob = await window.__dmg.get(id);
    await window.__dbg3.put('audio', {id, blob: new Blob([blob], {type: 'application/octet-stream'})});
    const url = await window.__audioUrl(id);
    return (await fetch(url)).headers.get('content-type');
  }, pid);
  ok(u === 'audio/mpeg', 'and one stored untyped earlier plays as audio/mpeg (' + u + ')');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
