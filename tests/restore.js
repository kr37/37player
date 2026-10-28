// Automatic restore (1.4.093): turned on in Settings → Backups, each
// library's way back (its shared library, its backups) goes to restore.php,
// which keeps it sealed in a cookie the page can't read. Then the browser
// erases 37 Player's storage (as Safari's 7-day rule does, cookies kept):
// opening it again offers to bring the library back, and does. A library
// with only backups is told where they were. "Start fresh" isn't asked again.
// Runs its own PHP server (port 8863) for tests/www, with restore.php in it.
//   node restore.js CODE      (servers from serve.sh for the shared library)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), {spawn} = require('child_process');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const APP = 'http://localhost:8863/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal').innerText || '') : '');
const waitFor = async (p, fn, ms, arg)=>{ for(let k=0; k<ms/200; k++){ if(await p.evaluate(fn, arg)) return true; await sleep(200); } return false; };
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return; await sleep(200); } };
// Everything a browser erases (storage, not cookies), then a fresh start.
async function erase(p){
  await p.evaluate(async()=>{
    for(const d of (await indexedDB.databases())) await new Promise(r=>{ const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = ()=> r(); });
    localStorage.clear(); sessionStorage.clear();
  });
}
async function freshLoad(p){
  // A new page, as when 37 Player is opened again (no window still holding the old databases).
  const ctx = p.browserContext(); await p.close();
  const q = await ctx.newPage(); await q.setViewport({width: 1100, height: 900});
  await q.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  q.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); q.on('dialog', d=> d.accept());
  await q.goto(APP, {waitUntil: 'networkidle0'}); await sleep(1500);
  return q;
}
(async()=>{
  const www = process.env.WWW || path.join(__dirname, 'www'), data = fs.mkdtempSync(path.join(require('os').tmpdir(), 'p37restore-'));
  fs.copyFileSync(path.join(__dirname, '..', 'restore.php'), path.join(www, 'restore.php'));
  const php = spawn('php', ['-S', 'localhost:8863', '-t', www], {env: Object.assign({}, process.env, {SYNC37_DATA_DIR: data}), stdio: 'ignore'});
  await sleep(1200);
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  try{
    // ---- A library in a shared library
    const ctx = await b.createBrowserContext();
    let p = await ctx.newPage(); await p.setViewport({width: 1100, height: 900});
    await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
    p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
    await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
    await clickText(p, '.modal button', '^English$'); await sleep(400);
    await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
    await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__dbg.bulkImportFolder([new File([blob], 'ten.mp3', {type: 'audio/mpeg'})]); });
    for(let k=0; k<60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
    await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id: 'pl1', kind: 'playlist', name: 'Morning', order: 5, items: [{id: 'i1', kind: 'track', refId: r.library[0].id, order: 0}]}); await window.__dbg.saveState(); });
    await p.evaluate((c, u)=> window.__dbg3.join(u, c, 'Laptop'), CODE, URL_SYNC); await waitIdle(p);
    ok(await waitFor(p, ()=> window.__share.covered(), 20000), 'joined a shared library, everything sent');
    // Settings → Backups → Automatic restore
    await p.evaluate(()=>{ window.__dbg4.settings(); window.__dbg4.section('backups'); }); await sleep(1200);
    ok(!!(await p.$('#autoRestoreToggle')), 'Settings → Backups offers Automatic restore (this site has restore.php)');
    await p.evaluate(()=>{ const c = document.getElementById('autoRestoreToggle'); c.scrollIntoView(); c.click(); }); await sleep(1500);
    const cookies = await p.cookies('http://localhost:8863/restore.php');
    const ck = cookies.find(c=> c.name === 'p37restore');
    ok(ck && ck.httpOnly && ck.path === '/restore.php' && ck.sameSite === 'Strict', 'turned on: a sealed cookie, HttpOnly, only for restore.php');
    ok(!(await p.evaluate(()=> document.cookie.includes('p37restore'))), 'the page itself can\'t read it');
    ok(ck && !/test passphrase|8870/.test(decodeURIComponent(ck.value)), 'and the join code isn\'t readable in it');
    // The browser erases 37 Player.
    await erase(p);
    p = await freshLoad(p);
    let m = await modal(p);
    ok(/Bring your library back\?/.test(m) && /shared library “Test”/.test(m) && /Bring it back/.test(m), 'opened again with nothing in it: "Bring your library back?", naming the shared library');
    await p.screenshot({path: 'shots/restore-offer.png'});
    await clickText(p, '.modal button', '^Bring it back$');
    for(let k=0; k<40; k++){ if(await p.evaluate(()=> window.__radio('^Use the shared library here'))) break; if(await clickText(p, '.modal button', '^Do it now$')) break; if(await p.evaluate(()=> !!window.__dbg.getRoot().settings.sharedLibrary)) break; await sleep(250); }
    await sleep(800); await waitIdle(p);
    ok(await waitFor(p, ()=> window.__dbg.getRoot().tree.some(n=> n.name === 'Morning') && window.__dbg.getRoot().library.length === 1, 20000), 'one tap: the shared library is back, playlists and tracks (' + await p.evaluate(()=> window.__dbg.getRoot().tree.map(n=> n.name).join('|')) + ')');
    ok(await p.evaluate(()=> window.__ar.on()), 'and automatic restore stays on');
    ok(!/join code|Welcome/i.test(await modal(p)), 'no welcome afterwards');
    await ctx.close();

    // ---- A library with only backups; Start fresh
    const ctx2 = await b.createBrowserContext();
    p = await ctx2.newPage(); await p.setViewport({width: 1100, height: 900});
    await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
    p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
    await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
    await clickText(p, '.modal button', '^English$'); await sleep(400);
    await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
    await p.evaluate(async()=>{ localStorage.setItem('37player.autoRestore', '1'); const bi = window.__ar.backupInfo(); bi.lastBackupAt = Date.now() - 86400000; bi.manualBase = {fileName: 'lib-native-backup-full-my-library-2026-10-27-0900.37p'}; await window.__ar.send(); });
    await erase(p);
    p = await freshLoad(p);
    m = await modal(p);
    ok(/Bring your library back\?/.test(m) && /Backed up as files/.test(m), 'a library with backups only: offered, saying it was backed up as files');
    await clickText(p, '.modal button', '^Bring it back$'); await sleep(500);
    m = await modal(p);
    ok(/as a file ending in \.37p/.test(m) && /Choose backup files/.test(m), 'then says where to look, with Choose backup files');
    await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
    // A new, empty library on this device: Start fresh, and it's not asked again there.
    await erase(p);
    p = await freshLoad(p);
    await clickText(p, '.modal button', '^Start fresh$'); await sleep(600);
    m = await modal(p);
    ok(/Choose your language|join code/.test(m), 'Start fresh goes on to the welcome');
    p = await freshLoad(p);
    ok(!/Bring your library back/.test(await modal(p)), 'and isn\'t asked again in this library');
    await ctx2.close();
  } finally {
    await b.close(); php.kill();
    try{ fs.unlinkSync(path.join(www, 'restore.php')); }catch(err){}
  }
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
