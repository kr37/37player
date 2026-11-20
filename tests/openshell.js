// Audio files opened with the desktop app (page 2.6.000, shell 2.6.0; kr37's
// MacBook, report 2026-11-20-153553: Finder → Open with started 37 Player
// and nothing more). Through the stand-in shell (fake-shell.js): a file the
// app was started with is asked about once the welcome is done; Play it now
// plays it from where it lies (a DiskBlob) and leaves the library alone; one
// opened while 37 Player runs ("p37-files-opened") is asked about too, and
// Import copies it into the library; the opened file's root reads only that
// file; and an older shell (no `opened`) is never asked.
//   node openshell.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
const TONE = fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 10000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return await modalText(p).catch(()=> ''); };
const putFile = (p, at, b64)=> p.evaluate(async (at, b64)=>{
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell', {create: true});
  const parts = at.split('/'), name = parts.pop();
  for(const x of parts) d = await d.getDirectoryHandle(x, {create: true});
  const w = await (await d.getFileHandle(name, {create: true})).createWritable(); await w.write(Uint8Array.from(atob(b64), c=> c.charCodeAt(0))); await w.close();
}, at, b64);
async function finishImport(p){
  for(let k=0; k<100; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); return true; } await sleep(200); }
  return false;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); if(process.env.LOGC) p.on('console', m=> console.log('CONSOLE:', m.text().slice(0, 200)));
  p.on('dialog', async d=>{ console.log('ALERT:', d.message()); await d.accept(); });
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; if(localStorage.getItem('__opened') === '1') window.__fakeShellOpened = true; (0, eval)(shell); }, SHELL);
  // First, an older shell: nothing is asked, and the page doesn't ask the shell for files.
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  ok(!(await p.evaluate(()=> window.__fakeShellCalls.includes('p37_opened_take'))), 'a shell without `opened` isn\'t asked for opened files');
  const before = await p.evaluate(()=> window.__dbg.getRoot().library.length);
  // Started with a file (Finder → Open with, 37 Player not running).
  await putFile(p, 'Users/Me/Downloads/Opened talk.mp3', TONE);
  await putFile(p, 'Users/Me/Downloads/Not opened.mp3', TONE);
  await p.evaluate(()=>{ localStorage.setItem('__opened', '1'); localStorage.setItem('__fakeOpenAtStart', JSON.stringify(['Users/Me/Downloads/Opened talk.mp3'])); });
  await p.reload({waitUntil: 'networkidle0'});
  let m = await waitModal(p, /Open “Opened talk\.mp3”/);
  ok(/Open “Opened talk\.mp3”/.test(m) && /Play it now/.test(m) && /Play and import/.test(m), 'a file the app was started with is asked about: Play it now, Import, Play and import');
  // The opened file's root reads that file only.
  const guard = await p.evaluate(async()=>{
    const inv = window.__TAURI_INTERNALS__.invoke, out = {};
    try{ await inv('fs_read', {root: 'open-1', path: 'Not opened.mp3'}); out.other = 'read'; }catch(e){ out.other = 'refused'; }
    try{ await inv('fs_list', {root: 'open-1', path: ''}); out.list = 'listed'; }catch(e){ out.list = 'refused'; }
    try{ out.own = (await inv('fs_stat', {root: 'open-1', path: 'Opened talk.mp3'})).size; }catch(e){ out.own = 'refused'; }
    return out;
  });
  ok(guard.other === 'refused' && guard.list === 'refused' && guard.own > 0, 'its root reads only that file: ' + JSON.stringify(guard));
  await clickText(p, '.modal button', '^Play it now$');
  let st = null;
  for(let i = 0; i < 30; i++){ await sleep(200); st = await p.evaluate(()=>{ const a = document.getElementById('openedAudio'); return a ? {paused: a.paused, t: a.currentTime, src: a.src.slice(0, 5), name: document.getElementById('openPlayingName').textContent} : null; }); if(st && st.t > 0.2) break; }
  ok(st && !st.paused && st.t > 0 && st.name === 'Opened talk.mp3', 'Play it now plays it, read where it lies: ' + JSON.stringify(st));
  ok(await p.evaluate(()=> window.__fileUrlPaths.includes('Opened talk.mp3')), 'through the shell\'s address for that file (not a copy in memory)');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === before, 'and the library stays as it was');
  await p.screenshot({path: 'shots/openshell-play.png'});
  await clickText(p, '.modal button', '^Close$'); await sleep(300);
  // Opened while 37 Player runs: the shell's "p37-files-opened".
  await p.evaluate(()=> window.__fakeOpen('Users/Me/Downloads/Opened talk.mp3'));
  m = await waitModal(p, /Open “Opened talk\.mp3”/);
  ok(/Open “Opened talk\.mp3”/.test(m), 'one opened while 37 Player runs is asked about too');
  await clickText(p, '.modal button', '^Import$'); await sleep(500);
  ok(await finishImport(p), 'Import goes through the usual import');
  const lib = await p.evaluate(()=> window.__dbg.getRoot().library.map(x=> x.name));
  ok(lib.length === before + 1 && lib.some(n=> /Opened talk/.test(n)), 'and the track is in the library: ' + JSON.stringify(lib.slice(-2)));
  ok(await p.evaluate(()=> !window.__fakeShellPaths.some(x=> /^fs_(write|remove|rename|mkdir) /.test(x) && /Downloads/.test(x))), 'nothing was written where the opened file lies');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
