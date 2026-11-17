// Receiving in pieces in the desktop app (2.5.035): each piece goes onto the
// end of one file in the library's "receiving" folder, which the app copies
// into place, so the recording passes through the page once and is never
// all in memory (before: each piece stored as a file, read back, the whole
// put together in the page and written out again; kr37's new Mac froze for
// good on a 51 MB recording). As pieces.js, with the stand-in shell and the
// piece size made 256 KB so the 1.3 MB starter track comes in 5 pieces:
// - A (a browser) sends it;
// - B (the desktop app) receives it in pieces, byte for byte; the bytes
//   written through the page are the file's once, almost nothing is read
//   back, and nothing is left in "receiving";
// - C is cut off after 3 pieces: the file being received holds 3 pieces;
//   reopened, it carries on from the 4th and comes out whole;
// - pieces kept the old way (before 2.5.035) are let go, and it starts again.
//   node piecesdisk.js <code>
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const BYTES = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3'));
const STARTER = BYTES.toString('base64'), SHA = crypto.createHash('sha256').update(BYTES).digest('hex');
const PIECE = 256 * 1024;
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); };
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const pendingAudio = p=> p.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length);
// What a desktop device holds: the stored audio's SHA-256, pieces kept the
// old way, and the files in "receiving" with their sizes.
const stored = p=> p.evaluate(async()=>{
  const D = window.__disk, R = window.__dbg.getRoot();
  let sha = null, audio = 0, file = '';
  for(const t of R.library){ try{ const raw = await D.libStore().readRaw('audio', t.id); file = raw && raw.blob ? (raw.blob.$path || raw.blob.$blob || '') : ''; }catch(err){} const rec = await D.idbGet('audio', t.id).catch(()=> null); if(rec && rec.blob){ audio++; const buf = await rec.blob.arrayBuffer(); sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b=> b.toString(16).padStart(2, '0')).join(''); } }
  const keys = await D.stateKeys('dlpart:');
  const receiving = [];
  try{ const own = D.libStore().own, dir = await own.getDirectoryHandle('receiving'); for await (const [n, h] of dir.entries()) receiving.push(n + ':' + (await h.getFile()).size); }catch(err){}
  return {sha, audio, file, pieces: keys.filter(k=> !/:disk$/.test(k)).length, notes: keys.filter(k=> /:disk$/.test(k)).length, receiving};
});
async function device(b, name, opts){
  opts = opts || {};
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  p.ranges = []; p.cutAt = opts.cutAt;
  await p.setRequestInterception(true);
  p.on('request', r=>{
    const u = r.url();
    if(!(u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'))) return r.abort();
    if(/[?&]op=file\b/.test(u) && /kind=audio/.test(u) && r.method() === 'GET'){
      const range = r.headers()['range'] || '';
      p.ranges.push(range);
      const start = +((/bytes=(\d+)-/.exec(range) || [])[1] || 0);
      if(p.cutAt != null && start >= p.cutAt) return r.abort('connectionreset');
    }
    r.continue();
  });
  await p.evaluateOnNewDocument((n, shell, desktop)=>{ window.__pieceBytes = n; if(desktop){ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; (0, eval)(shell); } }, PIECE, SHELL, !!opts.desktop);
  await p.goto('http://localhost:8861/37-player.html',{waitUntil: 'domcontentloaded'}); await sleep(1500);
  if(opts.desktop){ await clickText(p, '.modal button', '^Use this place$'); await sleep(1500); }
  await settle(p);
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

  // --- B: the desktop app, in pieces, whole, each byte through the page once
  const B = await device(b, 'B', {desktop: true});
  await B.evaluate(()=>{ window.__fakeShellWriteBytes = 0; window.__fakeShellReadBytes = 0; window.__fakeShellBiggestWrite = 0; });
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'B'), CODE, URL_SYNC); await waitIdle(B); await sleep(3000); await waitIdle(B);
  const moved = await B.evaluate(()=> ({w: window.__fakeShellWriteBytes, r: window.__fakeShellReadBytes, big: window.__fakeShellBiggestWrite}));
  const sB = await stored(B);
  console.log('B ranges:', B.ranges.join(' | '));
  ok(B.ranges.length === 5 && B.ranges.every(r=> /^bytes=\d+-\d+$/.test(r)), 'B asked for 5 pieces');
  ok(sB.sha === SHA && sB.audio === 1 && /\.mp3$/.test(sB.file), 'and the file is the same, byte for byte, kept as an .mp3 (' + sB.file + ')');
  ok(moved.w < BYTES.length + 200000 && moved.big <= PIECE && moved.r < 200000, 'through the page: the file\'s bytes written once, a piece at a time, almost nothing read back (' + JSON.stringify(moved) + ', file ' + BYTES.length + ')');
  ok(sB.pieces === 0 && sB.notes === 0 && sB.receiving.length === 0 && await pendingAudio(B) === 0, 'nothing left in "receiving", no notes, nothing waiting (' + JSON.stringify(sB) + ')');

  // --- C: cut off after 3 pieces, then carries on
  const C = await device(b, 'C', {desktop: true, cutAt: 3 * PIECE});
  await C.evaluate((c,u)=> window.__dbg3.join(u,c,'C'), CODE, URL_SYNC); await waitIdle(C); await sleep(3000);
  let sC = await stored(C);
  ok(sC.audio === 0 && sC.notes === 1 && sC.receiving.length === 1 && /:786432$/.test(sC.receiving[0]), 'C, cut off: the file being received holds 3 pieces, no recording yet (' + JSON.stringify(sC) + ')');
  C.cutAt = null; C.ranges = [];
  await C.reload({waitUntil: 'domcontentloaded'}); await sleep(2500);
  await C.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await waitIdle(C); await sleep(1500);
  sC = await stored(C);
  console.log('C ranges after reopening:', C.ranges.join(' | '));
  ok(C.ranges.length === 2 && C.ranges[0] === 'bytes=' + (3 * PIECE) + '-' + (4 * PIECE - 1), 'reopened, it carries on from the 4th piece');
  ok(sC.sha === SHA && sC.receiving.length === 0 && sC.notes === 0, 'and the file comes out whole, with nothing left behind (' + JSON.stringify(sC) + ')');

  // --- E: pieces kept the old way (before 2.5.035) are let go; it starts again
  const E = await device(b, 'E', {desktop: true, cutAt: 2 * PIECE});
  await E.evaluate((c,u)=> window.__dbg3.join(u,c,'E'), CODE, URL_SYNC); await waitIdle(E); await sleep(3000);
  // Turn what was kept into old-style pieces: two piece records, no file, no note.
  await E.evaluate(async(PIECE)=>{
    const D = window.__disk, keys = await D.stateKeys('dlpart:'), note = keys.find(k=> /:disk$/.test(k)), name = note.slice(7).replace(/:disk$/, '');
    await D.idbDeleteMany('state', [note]);
    const dir = await D.libStore().own.getDirectoryHandle('receiving'); for await (const [n] of dir.entries()) await dir.removeEntry(n);
    for(let n = 0; n < 2; n++) await D.idbPut('state', {key: 'dlpart:' + name + ':' + n, blob: new Blob([new Uint8Array(PIECE)]), total: 1, type: ''});
  }, PIECE);
  E.cutAt = null; E.ranges = [];
  await E.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await waitIdle(E); await sleep(1500);
  const sE = await stored(E);
  ok(E.ranges[0] === 'bytes=0-' + (PIECE - 1) && sE.sha === SHA && sE.pieces === 0 && sE.notes === 0, 'old pieces let go: it starts again from the beginning and comes out whole (' + E.ranges[0] + ', ' + JSON.stringify(sE) + ')');

  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
