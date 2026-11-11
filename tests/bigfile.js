// Big files never held whole in the page (2.2.010; Gen Rinzin's 8 GB Mac
// mini, 11 Nov 2026: sending a 2.7 GB WAV to a Google Drive library took
// 5.48 GB of memory and the whole Mac swapped). The page runs as the desktop
// app with the stand-in shell (fake-shell.js), files over 1 MB read where
// they lie, "big" set to 8 MB, against the fake Google (fake-google.js):
//  - a real Blob of a disk file is made piece by piece (8 MB at most at a time);
//  - a 20 MB disk file goes to a Google Drive library in 1 MB pieces, each
//    read from the disk as it's sent, and arrives with the same bytes;
//  - writing a track's details never reads a big file, or one with no writer;
//  - a big file isn't converted by itself (after an import, or carried over
//    a restart); asked for, it gets a warning first, and Cancel leaves it.
//   node bigfile.js      (needs the app server from serve.sh on 8861)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const google = require('./fake-google');
const APP = process.env.APP || 'http://localhost:8861/37-player.html', DRIVE = 'http://127.0.0.1:8873', TOKEN = 'http://token.test/token.php';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
(async()=>{
  const g = google.start(8873); g.grant('bigacc');
  await sleep(300);
  // A library folder as 37 Player makes one: its subfolders named in its appProperties.
  const mk = async (m)=> (await fetch(DRIVE + '/drive/v3/files', {method: 'POST', headers: {Authorization: 'Bearer bigacc', 'Content-Type': 'application/json'}, body: JSON.stringify(Object.assign({mimeType: 'application/vnd.google-apps.folder'}, m))})).json();
  const sub = {}; for(const n of ['st', 'au', 'ar', 'pk']) sub[n] = (await mk({name: n})).id;
  const folder = await mk({name: 'Big test', appProperties: Object.assign({p37: 'library', nm: 'Big test'}, sub)});
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument((shell, drive, token)=>{
    window.__noAutoConverter = true; window.__diskBlobMin = 1048576; window.__bigFileBytes = 8 * 1048576; window.__convertResumeMs = 400;
    window.__p37DriveApi = drive; window.__p37TokenUrl = token; window.__p37DriveChunk = 1048576; window.__p37DriveSimpleMax = 1048576;
    const realFetch = window.fetch.bind(window);
    window.fetch = (u, init)=> String(u).startsWith(token) ? Promise.resolve(new Response(JSON.stringify({access_token: 'bigacc', expires_in: 3600}), {status: 200, headers: {'Content-Type': 'application/json'}})) : realFetch(u, init);
    (0, eval)(shell);
  }, SHELL, DRIVE, TOKEN);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await p.evaluate(()=> window.__disk.kind()) === 'desktop' && await p.evaluate(()=> window.__big.bigBytes()) === 8 * 1048576, 'the page runs as the desktop app, with "big" at 8 MB');
  const r = await p.evaluate(async(folderId)=>{
    const {idbPut, idbGet, DiskBlob} = window.__disk, {realBlob, sharedFetch, blobWithCurrentTags} = window.__big;
    const out = {};
    const hash = async (blob)=> Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(x=> x.toString(16).padStart(2, '0')).join('');
    const N = 20 * 1048576, u = new Uint8Array(N);
    for(let i = 0; i < N; i++) u[i] = (i ^ (i >>> 9) ^ (i >>> 17)) & 255;
    u.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]); // "RIFF....WAVE"
    out.want = await hash(new Blob([u]));
    await idbPut('audio', {id: 'big1', blob: new File([u], 'big.wav', {type: 'audio/wav'})});
    const rec = await idbGet('audio', 'big1');
    out.isDisk = rec.blob instanceof DiskBlob;
    // The biggest stretch of a disk file read into the page at once.
    let biggest = 0;
    const real = DiskBlob.prototype.arrayBuffer;
    DiskBlob.prototype.arrayBuffer = function(){ biggest = Math.max(biggest, this.size); return real.call(this); };
    const rb = await realBlob(rec.blob);
    out.rbBiggest = biggest; out.rbIsBlob = rb instanceof Blob; out.rbSize = rb.size; out.rbType = rb.type;
    out.rbSame = (await hash(rb)) === out.want;
    // To a Google Drive library.
    biggest = 0;
    const cfg = {kind: 'gdrive', folderId, refreshToken: 'r', code: 'gdrive ' + folderId, url: ''};
    const res = await sharedFetch(cfg, {op: 'file', kind: 'audio', name: 'big1-r1.wav'}, {method: 'PUT', body: rec.blob});
    out.sent = res.ok ? await res.json() : {status: res.status};
    out.sendBiggest = biggest;
    // Its details: a file over the line is left as it is, unread.
    biggest = 0;
    const tg = await blobWithCurrentTags({id: 'big1', name: 'Big', filename: 'big.wav'}, rec.blob);
    out.tagWritten = tg.written; out.tagTooBig = !!tg.tooBig; out.tagSameBlob = tg.blob === rec.blob; out.tagBiggest = biggest;
    DiskBlob.prototype.arrayBuffer = real;
    return out;
  }, folder.id);
  const MB = 1048576;
  ok(r.isDisk, 'a 20 MB recording in the library is read where it lies');
  ok(r.rbIsBlob && r.rbSize === 20 * MB && r.rbSame && r.rbType === 'audio/wav', 'a real Blob of it has the same bytes and type (' + [r.rbIsBlob, r.rbSize, r.rbSame, r.rbType] + ')');
  ok(r.rbBiggest > 0 && r.rbBiggest <= 8 * MB, 'made piece by piece: at most 8 MB read at once (biggest ' + r.rbBiggest + ')');
  ok(r.sent && r.sent.stored === true, 'the file is sent to the Google Drive library (' + JSON.stringify(r.sent) + ')');
  ok(r.sendBiggest > 0 && r.sendBiggest <= MB, 'each piece read from the disk as it is sent: at most 1 MB at once, never the whole file (biggest ' + r.sendBiggest + ')');
  const up = [...g.files.values()].find(f=> f.name === 'big1-r1.wav');
  const chunks = g.uploads.filter(x=> x.kind === 'chunk' && x.name === 'big1-r1.wav');
  ok(chunks.length === 20 && chunks.every(c=> c.size === MB), 'it went up in 20 pieces of 1 MB (' + chunks.length + ')');
  ok(!!up && up.data.length === 20 * MB && crypto.createHash('sha256').update(up.data).digest('hex') === r.want, 'and arrived whole, with the same bytes');
  ok(r.tagWritten === false && r.tagTooBig && r.tagSameBlob && r.tagBiggest <= 4096, 'writing its details leaves a big file as it is, without reading it (' + [r.tagWritten, r.tagTooBig, r.tagSameBlob, r.tagBiggest] + ')');

  // ---- Converting
  await p.evaluate(async()=>{
    const root = window.__dbg.getRoot();
    root.library.push({id: 'big1', name: 'Big talk', filename: 'big.wav', duration: 120, fileSize: 20 * 1048576, peaks: [0.1]});
    root.library.push({id: 'small1', name: 'Small bell', filename: 'small.wav', duration: 3, fileSize: 500000, peaks: [0.1]});
    await window.__dbg.saveState();
  });
  ok(await p.evaluate(()=> window.__big.trackIsBigFile(window.__dbg.getRoot().library.find(t=> t.id === 'big1')) && !window.__big.trackIsBigFile(window.__dbg.getRoot().library.find(t=> t.id === 'small1'))), 'a 20 MB track counts as big here, a small one doesn\'t');
  await p.evaluate(()=> window.__big.convertTracks(['big1'], {auto: true}));
  await sleep(300);
  ok(!(await modal(p)) && !(await p.evaluate(()=> window.__big.queue())).length, 'by itself (after an import): a big file isn\'t queued, and nothing is asked');
  p.evaluate(()=>{ window.__big.convertTracks(['big1']); });
  await sleep(400);
  let m = await modal(p);
  ok(/This file is big/.test(m) && /Big talk \(20 MB\)/.test(m) && /Convert it anyway/.test(m) && !/Convert only the smaller ones/.test(m), 'asked for: a warning names it and its size (' + m.replace(/\n/g, ' | ').slice(0, 120) + ')');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  ok(!(await p.evaluate(()=> window.__big.queue())).length, 'Cancel leaves it unconverted');
  p.evaluate(()=>{ window.__big.convertTracks(['big1', 'small1']); });
  await sleep(400);
  m = await modal(p);
  ok(/1 of these files are big|This file is big/.test(m) && /Convert only the smaller ones/.test(m), 'with smaller ones too, they can go ahead without it (' + m.replace(/\n/g, ' | ').slice(0, 90) + ')');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  // A queue carried over a restart: the big one isn't taken up again.
  await p.evaluate(async()=>{ await window.__disk.idbPut('state', {key: 'convertQueue', value: {ids: ['big1'], total: 1, done: 0}}); window.__big.scheduleConvertResume(); });
  await sleep(1500);
  ok((await p.evaluate(()=> window.__conv.queueRecord())) === null && !(await p.evaluate(()=> window.__big.queue())).length, 'carried over a restart, a big file isn\'t converted again by itself');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close(); g.close();
})();
