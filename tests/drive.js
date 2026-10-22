// Shared libraries on Google Drive, against a fake Google (fake-google.js)
// and the real token.php: signing in (the redirect there and back), making
// a library folder, a second device joining it, changes both ways, saving
// at the same moment on two devices, an access token expiring, a revoked
// sign-in and signing in again, and a big file sent in pieces.
//   node drive.js        (needs the app server from serve.sh on 8861)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), {spawn} = require('child_process');
const google = require('./fake-google');
const APP = 'http://localhost:8861/37-player.html', TOKEN = 'http://127.0.0.1:8871/token.php', DRIVE = 'http://127.0.0.1:8872';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitFor = async (p, fn, ms)=>{ for(let k=0; k<ms/200; k++){ try{ if(await p.evaluate(fn)) return true; }catch(err){} await sleep(200); } return false; };
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return s; await sleep(200); } return 'timeout'; };
const names = p=> p.evaluate(()=>{ const out=[]; (function w(a){ (a||[]).forEach(n=>{ if(n.kind==='playlist') out.push(n.name); if(n.children) w(n.children); }); })(window.__dbg.getRoot().tree); return out.sort().join('|'); });
const base = 'www/ovt'; const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push([path.relative(base,f), fs.readFileSync(f).toString('base64')]); } })(base);
async function device(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  await p.evaluateOnNewDocument((t, d)=>{ window.__noAutoConverter = true; window.__p37TokenUrl = t; window.__p37DriveApi = d; window.__p37DriveChunk = 1024 * 1024; window.__p37DriveSimpleMax = 1024 * 1024; }, TOKEN, DRIVE);
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name, 'ALERT:', d.message()); d.dismiss(); });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  return p;
}
const settle = async p=>{ for(const x of ['^English$', '^Start a library on this device$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(250); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); };
// Clicks something that leaves for Google's sign-in, and waits until 37 Player is back.
async function signIn(p, clickFn){
  const nav = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 30000});
  await p.evaluate(clickFn);
  await nav; await sleep(1200);
}
const openShared = async p=>{ await p.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400); await p.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> e.textContent === 'Shared library').click()); await sleep(400); };
(async()=>{
  // token.php under PHP, set up for the fake Google
  const cfgFile = path.join(__dirname, 'syncdata', 'google-config.php');
  fs.mkdirSync(path.dirname(cfgFile), {recursive: true});
  fs.writeFileSync(cfgFile, `<?php\ndefine('GOOGLE_CLIENT_ID', 'test-client');\ndefine('GOOGLE_CLIENT_SECRET', 'test-secret');\ndefine('ALLOWED_ORIGINS', ['http://localhost:8861']);\ndefine('TOKEN_URL', '${TOKEN}');\n`);
  const php = spawn('php', ['-S', '127.0.0.1:8871', '-t', '..'], {cwd: __dirname, env: Object.assign({}, process.env, {P37_GOOGLE_CONFIG: cfgFile, P37_GOOGLE_TOKEN_ENDPOINT: DRIVE + '/token', P37_GOOGLE_AUTH_ENDPOINT: DRIVE + '/o/oauth2/v2/auth'}), stdio: 'ignore'});
  const g = google.start(8872);
  await sleep(800);
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});
  try{
    // ---- A: a library, then onto Google Drive
    const A = await device(b, 'A'); await settle(A);
    await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
    await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
    await sleep(2500); await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
    await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
    const all = await names(A); console.log('A playlists:', all);
    await openShared(A);
    let sec = await A.evaluate(()=> document.getElementById('settingsBody').innerText);
    ok(/Or keep it on Google Drive/.test(sec) && /Use Google Drive/.test(sec), 'Settings → Shared library offers Google Drive');
    await signIn(A, ()=> document.getElementById('shDrive').click());
    let m = await modal(A);
    ok(/37 Player libraries on Google Drive/.test(m) && /no 37 Player libraries/.test(m), 'back from signing in: the Drive chooser, with nothing there yet');
    await A.screenshot({path: 'shots/drive-chooser-empty.png'});
    await A.evaluate(()=>{ document.getElementById('drName').value = 'IKRC'; document.getElementById('drDevice').value = 'Laptop'; document.getElementById('drCreate').click(); });
    for(let k=0; k<40; k++){ if(await clickText(A, '.modal button', '^Join$')) break; await sleep(250); }
    await sleep(1000); console.log('A:', JSON.stringify(await waitIdle(A)));
    const cfgA = await A.evaluate(()=> window.__dbg.getRoot().settings.sharedLibrary);
    ok(cfgA && cfgA.kind === 'gdrive' && cfgA.folderId && cfgA.refreshToken, 'A is in a Drive library, with a lasting sign-in kept here');
    ok(!/#p37auth/.test(await A.evaluate(()=> location.href)), 'the tokens are gone from the address');
    const top = g.files.get(cfgA.folderId);
    ok(top && top.name === '37 Player – IKRC' && top.appProperties.p37 === 'library', 'the folder "37 Player – IKRC" is in Drive, marked as a 37 Player library');
    const inFolder = id=> [...g.files.values()].filter(f=> f.parents.includes(id));
    const state = inFolder(top.appProperties.st);
    ok(state.length === 1 && state[0].name === '000001.json.gz', 'version 1 saved as state/000001.json.gz: ' + state.map(f=> f.name).join(','));
    const audioN = inFolder(top.appProperties.au).length, libN = await A.evaluate(()=> window.__dbg.getRoot().library.length);
    ok(audioN === libN && libN > 0, `every audio file is in Drive (${audioN} of ${libN})`);
    ok(g.uploads.some(u=> u.kind === 'chunk') , 'a file over the one-request size went up in pieces (' + g.uploads.filter(u=> u.kind === 'chunk').length + ' pieces)');
    sec = await A.evaluate(()=> document.getElementById('settingsBody')?.innerText || '');
    // ---- B: joins from the welcome
    const B = await device(b, 'B');
    await clickText(B, '.modal button', '^English$'); await sleep(400);
    await clickText(B, '.modal button', '^Join a shared library$'); await sleep(400);
    await signIn(B, ()=> document.getElementById('swDrive').click());
    m = await modal(B);
    ok(/IKRC/.test(m), 'B, back from signing in, sees IKRC in the chooser');
    await B.screenshot({path: 'shots/drive-chooser.png'});
    await B.evaluate(()=>{ document.getElementById('drDevice').value = 'iPad'; [...document.querySelectorAll('.drive-libs [data-lib]')].find(x=> x.textContent === 'IKRC').click(); });
    for(let k=0; k<40; k++){ if(await clickText(B, '.modal button', '^Join$') || await clickText(B, '.modal button', '^Use the shared library here')) break; await sleep(250); }
    await sleep(1000); console.log('B:', JSON.stringify(await waitIdle(B)));
    await B.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
    ok(await names(B) === all, 'B has the library: ' + await names(B));
    const blobs = await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); let n = 0; for(const t of r.library){ const db = await new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess=()=>res(q.result); }); const got = await new Promise(res=>{ const x = db.transaction('audio').objectStore('audio').get(t.id); x.onsuccess=()=>res(x.result); }); db.close(); if(got && got.blob && got.blob.size) n++; } return [n, r.library.length]; });
    ok(blobs[0] === blobs[1], `B downloaded every audio file (${blobs[0]} of ${blobs[1]})`);
    ok(await B.evaluate(()=> window.__dbg.getRoot().library.every(t=> t.peaks && t.peaks.length)), 'and their waveforms');
    // ---- changes both ways
    await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pB', kind:'playlist', name:'From iPad', order:9, items:[]}); await window.__dbg.saveState(); });
    await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
    await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
    ok(/From iPad/.test(await names(A)), 'a playlist made on B reaches A');
    // ---- both save at the same moment
    await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pA2', kind:'playlist', name:'A at once', order:10, items:[]}); await window.__dbg.saveState(); });
    await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pB2', kind:'playlist', name:'B at once', order:11, items:[]}); await window.__dbg.saveState(); });
    await Promise.all([A.evaluate(()=> window.__dbg3.sync()), B.evaluate(()=> window.__dbg3.sync())]);
    await waitIdle(A); await waitIdle(B);
    for(let i = 0; i < 2; i++){ await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A); await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B); }
    const nA = await names(A), nB = await names(B);
    ok(nA === nB && /A at once/.test(nA) && /B at once/.test(nA), 'saving at the same moment: both changes kept, A and B agree: ' + nA);
    const stateNames = inFolder(top.appProperties.st).map(f=> f.name).sort();
    ok(new Set(stateNames).size === stateNames.length, 'no version number is left twice: ' + stateNames.join(' '));
    // ---- a true tie: two saves at the same version at the same moment
    const tie = await A.evaluate(async()=>{
      const cur = await window.__drive.fetch({op: 'state'}); const v = parseInt(cur.headers.get('X-Version'), 10);
      const doc = JSON.stringify(window.__drive.doc());
      const rs = await Promise.all([window.__drive.fetch({op: 'state', base: String(v)}, {method: 'POST', headers: {}, body: doc}), window.__drive.fetch({op: 'state', base: String(v)}, {method: 'POST', headers: {}, body: doc})]);
      return {v, statuses: rs.map(r=> r.status).sort()};
    });
    ok(JSON.stringify(tie.statuses) === '[200,409]', 'two saves at version ' + tie.v + ' at once: one wins, the other is told to try again: ' + tie.statuses);
    const stateNames2 = inFolder(top.appProperties.st).map(f=> f.name);
    ok(stateNames2.filter(n=> n.startsWith(String(tie.v + 1).padStart(6, '0'))).length === 1, 'and only one version ' + (tie.v + 1) + ' is left');
    ok(g.calls.some(c=> c.startsWith('DELETE')), 'the loser deleted its own');
    await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A); await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
    // ---- an access token expires: refreshed through token.php, quietly
    g.expireAccess();
    await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pA3', kind:'playlist', name:'After expiry', order:12, items:[]}); await window.__dbg.saveState(); });
    await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
    ok(await A.evaluate(()=> window.__dbg3.status().state) !== 'error', 'after the hour is up, A gets a new access token by itself');
    await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
    ok(/After expiry/.test(await names(B)), 'and B gets the change');
    // ---- the sign-in is revoked: A asks to sign in again, and can
    g.revokeRefresh();
    await A.evaluate(()=> window.__dbg3.sync()); await sleep(1500);
    await openShared(A);
    const again = await A.evaluate(()=>{ const r = document.getElementById('shDriveAgainRow'); return r && r.style.display !== 'none'; });
    const st = await A.evaluate(()=> document.getElementById('shStatus').textContent);
    ok(again && /sign in again/.test(st), 'revoked: Settings says so and offers "Sign in to Google again": ' + st);
    ok(await A.evaluate(()=> document.getElementById('btnBackup').textContent) === 'Sign in to Google', 'and the top bar says "Sign in to Google", not "In sync"');
    await A.screenshot({path: 'shots/drive-signin-again.png'});
    await signIn(A, ()=> document.getElementById('shDriveAgain').click());
    await A.evaluate(()=> document.getElementById('settingsClose')?.click());
    await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
    ok(await A.evaluate(()=> window.__dbg3.status().state) !== 'error', 'signed in again, A syncs');
    ok(await A.evaluate(()=> window.__dbg.getRoot().settings.sharedLibrary.refreshToken) !== cfgA.refreshToken, 'with the new sign-in kept');
    // ---- C: Switch libraries → New library → Join a shared library → Google Drive…
    const C = await device(b, 'C'); await settle(C);
    await C.evaluate(()=> window.__lib.newDialog()); await sleep(400);
    await C.evaluate(()=>{ document.querySelector('input[name=libNewHow][value=join]').click(); document.getElementById('libNewDevice').value = 'Laptop'; });
    ok(await C.evaluate(()=> !!document.getElementById('libNewDrive') && document.getElementById('libNewDrive').offsetParent !== null), 'New library → Join a shared library offers Google Drive');
    await C.screenshot({path: 'shots/drive-newlib.png'});
    await C.evaluate(()=> document.getElementById('libNewDrive').click());
    let chooser = false;
    for(let k = 0; k < 120 && !chooser; k++){ await sleep(300); try{ chooser = await C.evaluate(()=> !!document.querySelector('.drive-libs [data-lib]')); }catch(e){} }
    ok(chooser, 'the new library opens, signs in to Google and shows the Drive\'s libraries');
    ok(await C.evaluate(()=> document.getElementById('drDevice').value) === 'Laptop', 'with the device name carried over');
    ok(await C.evaluate(()=> window.__lib.id()) !== 'main', 'in the new library, not the first one');
    await C.evaluate(()=>{ [...document.querySelectorAll('.drive-libs [data-lib]')].find(x=> x.textContent === 'IKRC').click(); });
    for(let k=0; k<40; k++){ if(await clickText(C, '.modal button', '^Join$') || await clickText(C, '.modal button', '^Use the shared library here')) break; await sleep(250); }
    await sleep(1000); await waitIdle(C);
    ok(await C.evaluate(()=> (window.__dbg.getRoot().settings.sharedLibrary || {}).kind) === 'gdrive' && /From iPad/.test(await names(C)), 'and joins it: ' + await names(C));
    ok(await C.evaluate(()=> window.__lib.list().list.find(l=> l.id === window.__lib.id()).name) === 'IKRC', 'taking its name');
  } finally {
    console.log(fails ? fails + ' FAILED' : 'ALL OK');
    await b.close(); g.close(); php.kill();
  }
})();
