// Backups without a folder (1.4.078):
//  - after a full backup, a changes backup first asks whether that full
//    backup still exists (once a week);
//  - Settings → Backups → Check my backup files reads picked zips (their
//    table of contents and meta.json only) and says which to keep and which
//    can be deleted; a missing full backup can be forgotten, so the next
//    backup is full;
//  - an iPad in a shared library says it doesn't need a backup file; made
//    anyway, the file is handed over with what to do on Safari's page.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), os = require('os');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const dialog = p=> p.evaluate(()=>{ const m = document.querySelector('.modal-backdrop.show .modal'); if(!m) return null;
  return {text: m.innerText, buttons: [...m.querySelectorAll('#askButtons button')].map(b=>({t: b.textContent.trim(), primary: b.classList.contains('primary')}))}; });
const waitDialog = async (p, re)=>{ for(let i=0;i<200;i++){ const d = await dialog(p); if(d && re.test(d.text)) return d; await sleep(150); } return dialog(p); };
const waitFile = async (dir, re, not)=>{ for(let i=0;i<200;i++){ const f = fs.readdirSync(dir).find(n=> re.test(n) && !/\.crdownload$/.test(n) && !(not||[]).includes(n)); if(f) return f; await sleep(150); } return null; };
async function open(b, ua){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1100,height:900});
  if(ua){ await p.setUserAgent(ua); await p.evaluateOnNewDocument(()=> Object.defineProperty(navigator, 'maxTouchPoints', {get: ()=> 5})); }
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.dl = fs.mkdtempSync(path.join(os.tmpdir(), 'p37bk-'));
  const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: p.dl, browserContextId: ctx._contextId || ctx.id}).catch(()=> cdp.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: p.dl}));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^Use it in Safari anyway$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button, .modal a',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  await p.evaluate(()=>{ window.backupInfoForTest().handle = null; });
  return p;
}
async function importStarter(p){
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500);
  for(const x of ['^OK$','^Close$','^Not now$','^Keep them$']){ await clickText(p,'.modal button',x); await sleep(300); }
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  // ---- A computer without folder access
  const A = await open(b);
  await importStarter(A);
  A.evaluate(()=>{ window.__mb = window.__share.manualBackup(); });
  let d = await waitDialog(A, /full backup of your library/);
  ok(d && d.buttons.some(x=>/^New full backup/.test(x.t)), 'the first backup is a full one');
  await clickText(A, '#askButtons button', '^New full backup');
  const fullName = await waitFile(A.dl, /^lib-native-backup-full-.*\.zip$/);
  ok(!!fullName, 'full backup downloaded: ' + fullName);
  await sleep(500);
  const base = await A.evaluate(()=> window.backupInfoForTest().manualBase);
  ok(base && base.fileName === fullName && base.size > 0, 'the full backup\'s file name and size are remembered');

  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library[0].name = 'Renamed'; await window.__dbg.saveState(); });
  A.evaluate(()=>{ window.__mb = window.__share.manualBackup(); });
  d = await waitDialog(A, /Do you still have your full backup/);
  ok(d && d.text.includes(fullName), 'the question names that file');
  await clickText(A, '#askButtons button', '^Yes: back up the changes');
  const chName = await waitFile(A.dl, /^lib-native-backup-changes-.*\.zip$/);
  ok(!!chName, 'changes backup downloaded: ' + chName);
  await sleep(500);
  A.evaluate(()=>{ window.__mb = window.__share.manualBackup(); });
  d = await waitDialog(A, /Choose|backup/);
  ok(d && !/Do you still have/.test(d.text) && /can't see whether you still have it/.test(d.text), 'answered Yes, it isn\'t asked again that week');
  await clickText(A, '#askButtons button', '^Cancel$'); await sleep(400);

  // Check my backup files
  fs.writeFileSync(path.join(A.dl, 'holiday-photos.zip'), Buffer.from('PK not really a zip'));
  await A.evaluate(()=>{ window.backupInfoForTest().manualBase.confirmedAt = 0; window.__dbg4.settings(); window.__dbg4.section('backups'); }); await sleep(500);
  const input = await A.$('#bkCheckInput');
  ok(!!input && await A.evaluate(()=> !!document.getElementById('bkCheckFilesBtn') && !!document.getElementById('bkCheckFolderBtn')), 'Settings → Backups offers Choose backup files… and Choose a folder…');
  await input.uploadFile(path.join(A.dl, fullName), path.join(A.dl, chName), path.join(A.dl, 'holiday-photos.zip'));
  for(let i=0;i<40;i++){ await sleep(200); if(await A.$('.bk-check-row')) break; }
  let rows = await A.evaluate(()=> [...document.querySelectorAll('.bk-check-row')].map(r=>({v: r.dataset.verdict, t: r.innerText})));
  const v = n=> (rows.find(r=> r.t.includes(n)) || {}).v;
  ok(v(fullName) === 'bkKeepFull' && v(chName) === 'bkKeepChanges' && v('holiday-photos.zip') === 'bkNotBackup', 'keeps the full backup and its changes; the other zip isn\'t a backup (' + rows.map(r=>r.v).join(', ') + ')');
  ok(await A.evaluate(()=> /includes? the full backup|include the full backup/.test(document.getElementById('bkCheckResult').innerText)), 'says the next changes backup\'s full backup is among them');
  ok(await A.evaluate(()=> window.backupInfoForTest().manualBase.confirmedAt > 0), 'and counts that as confirmed');

  // Only the changes file: it can't be restored, and the full backup can be forgotten
  await A.evaluate(()=>{ window.__dbg4.section('backups'); }); await sleep(400);
  await (await A.$('#bkCheckInput')).uploadFile(path.join(A.dl, chName));
  for(let i=0;i<40;i++){ await sleep(200); if(await A.$('.bk-check-row')) break; }
  rows = await A.evaluate(()=> [...document.querySelectorAll('.bk-check-row')].map(r=>({v: r.dataset.verdict, t: r.innerText})));
  ok(rows.length === 1 && rows[0].v === 'bkOrphan', 'a changes file without its full backup can\'t be restored');
  ok(!!await A.$('#bkForgetBaseBtn'), 'the missing full backup can be forgotten');
  await A.click('#bkForgetBaseBtn'); await sleep(400);
  ok(await A.evaluate(()=> window.backupInfoForTest().manualBase) === null, 'and then the next backup is a full one');

  // The judging itself: older full, another library, unknown library
  const j = await A.evaluate(()=>{
    const F = (name, at, meta)=> ({file: {name, size: 1000, lastModified: at}, meta: Object.assign({format: 'temple-sound-library', scope: 'library'}, meta)});
    const r = window.__share.judge([
      F('lib-native-backup-full-my-lib-2026-09-01-1000.zip', 1, {backupKind: 'full', baseId: 'old', createdAt: 1}),
      F('a.zip', 2, {backupKind: 'changes', baseId: 'old', createdAt: 2, backupOf: {name: 'My lib'}}),
      F('b.zip', 3, {backupKind: 'full', baseId: 'new', createdAt: 3, backupOf: {name: 'My lib'}}),
      F('c.zip', 4, {backupKind: 'full', baseId: 'x', createdAt: 4, backupOf: {name: 'Other'}}),
      F('lib-native-backup-full-2026-08-01-1000.zip', 0.5, {backupKind: 'full', baseId: 'u', createdAt: 0.5}),
      F('d.zip', 5, {backupKind: 'changes', baseId: 'gone', createdAt: 5, backupOf: {name: 'My lib'}}),
    ], 'My lib', 'new');
    return {v: Object.fromEntries(r.rows.map(x=> [x.file.name, x.verdict])), del: r.deletable, base: r.baseFound};
  });
  ok(j.v['lib-native-backup-full-my-lib-2026-09-01-1000.zip'] === 'bkOldFull' && j.v['a.zip'] === 'bkOldChanges' && j.v['b.zip'] === 'bkKeepFull', 'older full and changes can go; the newest full stays');
  ok(j.v['c.zip'] === 'bkOtherLibrary' && j.v['lib-native-backup-full-2026-08-01-1000.zip'] === 'bkUnknownLibrary', 'another library\'s and a nameless one are left alone');
  ok(j.v['d.zip'] === 'bkOrphan' && j.del === 2000 && j.base, 'newer changes with no full backup are flagged; 2 files can be deleted; the base is found');

  // ---- An iPad in a shared library
  const I = await open(b, 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await importStarter(I);
  await I.evaluate((c,u)=> window.__dbg3.join(u, c, 'iPad'), CODE, URL_SYNC).catch(e=> console.log('join:', e.message));
  for(let i=0;i<60;i++){ await sleep(250); const s = await I.evaluate(()=> window.__dbg3.status()); if(s.state !== 'syncing' && !s.transfer) break; }
  await sleep(1000);
  I.evaluate(()=>{ window.__mb = window.__share.manualBackup(); });
  d = await waitDialog(I, /doesn't need a backup file/);
  ok(d && /in the shared library/.test(d.text) && /free space/.test(d.text), 'an iPad in a shared library: no backup file needed, with its size and the space it needs');
  ok(d && d.buttons[0].t === 'Close' && d.buttons[0].primary, 'Close is the suggested button');
  await clickText(I, '#askButtons button', '^Make a backup file anyway$');
  d = await waitDialog(I, /full backup of your library/);
  ok(d && /iPad or iPhone/.test(d.text) && !/Up to date/.test(d.text), 'made anyway: the iPad tip, without "Up to date" again');
  await clickText(I, '#askButtons button', '^New full backup');
  d = await waitDialog(I, /Safari is saving the backup|The backup is ready/);
  ok(d && /Safari is saving the backup/.test(d.text) && /Save to Files/.test(d.text), 'no file sharing here: downloaded, saying what to do on Safari\'s page');
  ok(!!await waitFile(I.dl, /^lib-native-backup-full-.*\.zip$/), 'and the file was downloaded');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
