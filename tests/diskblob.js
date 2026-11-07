// Big files in the desktop app (2.0, step 3b): read where they lie
// (DiskBlob), and written without the page ever holding all of one. Runs the
// page as the desktop app with the stand-in shell (fake-shell.js), files
// over 1 MB read where they lie:
//  - a 20 MB recording put in the library reaches the shell in pieces of at
//    most 8 MB (written beside the file and renamed onto it), and comes back
//    as a DiskBlob with the same bytes; nothing half written is left;
//  - the same file under another name is copied by the shell, not read;
//  - a track made from a stretch of it (the splitter: header + stretch +
//    tail, a JoinedBlob) is written in pieces and reads back right;
//  - a part of a file plays as its own bytes, the whole file from its address;
//  - a backup into an ordinary folder writes it piece by piece, whole.
//   node diskblob.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__diskBlobMin = 1048576; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await p.evaluate(()=> window.__disk.kind()) === 'desktop', 'the page runs as the desktop app (bridge 2)');
  const r = await p.evaluate(async()=>{
    const {idbPut, idbGet, DiskBlob, JoinedBlob, audioObjectUrl, writeFileTo} = window.__disk;
    const out = {};
    const hash = async (blob)=> Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(x=> x.toString(16).padStart(2, '0')).join('');
    const leftovers = async ()=>{
      const found = [];
      const walk = async (d, at)=>{ for await (const [n, h] of d.entries()){ if(h.kind === 'directory') await walk(h, at + n + '/'); else if(/\.(p37part|p37tmp[^/]*|crswap)$/.test(n)) found.push(at + n); } };
      await walk(await navigator.storage.getDirectory(), '');
      return found;
    };
    const N = 20 * 1048576, u = new Uint8Array(N);
    for(let i = 0; i < N; i++) u[i] = (i ^ (i >>> 9) ^ (i >>> 17)) & 255;
    const src = new File([u], 'big.wav', {type: 'audio/wav'});
    const want = await hash(src);
    window.__fakeShellBiggestWrite = 0;
    await idbPut('audio', {id: 'dbt1', blob: src});
    out.biggest1 = window.__fakeShellBiggestWrite;
    const rec = await idbGet('audio', 'dbt1');
    out.isDisk = rec.blob instanceof DiskBlob; out.whole = !!rec.blob.whole; out.size1 = rec.blob.size;
    out.same1 = (await hash(rec.blob)) === want;
    out.left1 = await leftovers();
    // The same file under another name: the shell copies it.
    window.__fakeShellCalls.length = 0;
    await idbPut('audio', {id: 'dbt3', blob: rec.blob});
    out.copyCalls = window.__fakeShellCalls.filter(c=> c === 'fs_copy' || c === 'fs_read').join(',');
    out.same3 = (await hash((await idbGet('audio', 'dbt3')).blob)) === want;
    // Header + a stretch + a tail, as the splitter makes a piece.
    const a = 1000, z = N - 5000;
    window.__fakeShellBiggestWrite = 0;
    await idbPut('audio', {id: 'dbt2', blob: new JoinedBlob([new Uint8Array([1, 2, 3]), rec.blob.slice(a, z), new Uint8Array([9])], 'audio/wav')});
    out.biggest2 = window.__fakeShellBiggestWrite;
    const r2 = (await idbGet('audio', 'dbt2')).blob;
    out.size2 = r2.size; out.want2 = 3 + (z - a) + 1;
    out.same2 = (await hash(r2)) === (await hash(new Blob([new Uint8Array([1, 2, 3]), u.subarray(a, z), new Uint8Array([9])])));
    out.left2 = await leftovers();
    // Playing a part, and the whole.
    const partUrl = await audioObjectUrl(rec.blob.slice(0, 1000));
    out.partSize = (await (await fetch(partUrl)).blob()).size;
    const wholeUrl = await audioObjectUrl(rec.blob);
    out.wholeSize = (await (await fetch(wholeUrl)).blob()).size;
    // A backup into an ordinary folder (the browser's own, here).
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('backup-test', {create: true});
    await writeFileTo(d, 'big.wav', rec.blob);
    const back = await (await d.getFileHandle('big.wav')).getFile();
    out.bkSize = back.size; out.bkSame = (await hash(back)) === want;
    out.left3 = await leftovers();
    return out;
  });
  const MB8 = 8 * 1048576;
  ok(r.biggest1 > 0 && r.biggest1 <= MB8, 'a 20 MB recording reaches the shell in pieces of at most 8 MB (biggest ' + r.biggest1 + ')');
  ok(r.isDisk && r.whole && r.size1 === 20 * 1048576 && r.same1, 'it comes back read where it lies, whole, with the same bytes (' + [r.isDisk, r.whole, r.size1, r.same1] + ')');
  ok(!r.left1.length, 'nothing half written is left (' + r.left1 + ')');
  ok(r.copyCalls === 'fs_copy' && r.same3, 'the same file under another name is copied by the shell, not read through the page (' + r.copyCalls + ')');
  ok(r.biggest2 > 0 && r.biggest2 <= MB8 && r.size2 === r.want2 && r.same2, 'a piece made from a stretch of it (header, stretch, tail) is written in pieces and reads back right (' + [r.biggest2, r.size2, r.want2, r.same2] + ')');
  ok(!r.left2.length, 'and leaves nothing half written (' + r.left2 + ')');
  ok(r.partSize === 1000, 'a part of a file plays as its own bytes (' + r.partSize + ')');
  ok(r.wholeSize === 20 * 1048576, 'the whole file plays from its address (' + r.wholeSize + ')');
  ok(r.bkSize === 20 * 1048576 && r.bkSame && !r.left3.length, 'a backup into an ordinary folder writes it whole, piece by piece (' + [r.bkSize, r.bkSame, r.left3] + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
