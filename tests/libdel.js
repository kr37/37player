// New library → Start empty skips the welcome's sharing question; deleting a
// library can delete its backup folder too, but only what 37 Player put there
// and only while the folder still holds that library's backup. The backup
// folder is a stand-in in the browser's private file system (OPFS).
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
async function reloading(p, fn){ const nav = p.waitForNavigation({waitUntil:'networkidle0', timeout: 20000}); await p.evaluate(fn).catch(()=>{}); await nav; await sleep(800); }
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  const alerts = []; p.on('dialog', async d=>{ alerts.push(d.message()); await d.accept(); });
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  await settle(p);

  // ---- Start empty: no "will this device share?" in the new library's welcome
  await p.evaluate(()=> window.__lib.newDialog()); await sleep(300);
  await p.evaluate(()=>{ document.querySelector('input[name=libNewHow][value=empty]').click(); document.getElementById('libNewName').value = 'Second'; });
  await reloading(p, ()=> document.getElementById('libNewGo').click());
  const idB = await p.evaluate(()=> window.__lib.id());
  const first = await p.evaluate(()=> (document.querySelector('.modal-backdrop.show .modal')?.innerText || '').slice(0, 200));
  ok(idB !== 'main' && !/Will this device share a library/.test(first), 'Start empty: the welcome skips the sharing question (' + first.replace(/\n/g, ' | ').slice(0, 120) + ')');
  await settle(p);
  // Its backup folder: a stand-in with 37 Player's files, plus one of the person's own.
  await p.evaluate(async()=>{
    const root = await navigator.storage.getDirectory();
    for(const n of ['bkB', 'bkC']) await root.removeEntry(n, {recursive: true}).catch(()=>{});
    const mk = async (name, owner)=>{
      const dir = await root.getDirectoryHandle(name, {create: true});
      const put = async (d, f, text)=>{ const w = await (await d.getFileHandle(f, {create: true})).createWritable(); await w.write(text); await w.close(); };
      const lib = await dir.getDirectoryHandle('Library - do not touch', {create: true});
      await put(lib, 'meta.json', JSON.stringify({format: 'temple-sound-library', ownerCopyId: owner}));
      await (await lib.getDirectoryHandle('audio', {create: true})).getFileHandle('t1', {create: true});
      await put(dir, 'README.txt', 'x'); await put(dir, 'contents.csv', 'x'); await put(dir, '37-player.html', 'x'); await put(dir, 'my notes.txt', 'mine');
      return dir;
    };
    window.__bkB = await mk('bkB', 'copyB');
    window.__bkC = await mk('bkC', 'someone-else');
    // OPFS handles have no permission prompt; a real folder's would.
    FileSystemDirectoryHandle.prototype.requestPermission = async ()=> 'granted';
  });
  await reloading(p, ()=> window.__lib.switchTo('main'));
  await settle(p);
  // Library B's backup record points at bkB, owned by copyB.
  const setRecord = (id, folder, copyId)=> p.evaluate(async (id, folder, copyId)=>{
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
    const name = 'temple-sound-library~' + id;
    const db = await new Promise((res, rej)=>{ const r = indexedDB.open(name); r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error); });
    await new Promise((res, rej)=>{ const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({key: 'backup', handle: dir, copyId, folderName: folder, setupDone: true}); tx.oncomplete = res; tx.onerror = ()=> rej(tx.error); });
    db.close();
  }, id, folder, copyId);
  await setRecord(idB, 'bkB', 'copyB');
  const list = (folder)=> p.evaluate(async (folder)=>{ const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder); const out = []; for await (const [n] of dir.entries()) out.push(n); return out.sort().join(','); }, folder);
  const openDelete = async ()=>{
    await p.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400);
    await p.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> /Switch libraries/.test(e.textContent)).click()); await sleep(400);
    await p.evaluate(()=> document.querySelector('.library-row:not(.current) [data-act=delete]').click()); await sleep(600);
  };
  await openDelete();
  const txt = await p.evaluate(()=> document.querySelector('.modal').innerText);
  ok(/Also delete its backup in the folder “bkB”/.test(txt) && !(await p.evaluate(()=> document.getElementById('libDelBackup').checked)), 'the delete dialog offers its backup folder, unticked');
  await p.evaluate(()=> document.getElementById('libDelBackup').click());
  await clickText(p, '.modal button', '^Delete from this device$'); await sleep(1500);
  ok(await list('bkB') === 'my notes.txt', 'only 37 Player\'s files were deleted, the person\'s own kept (' + await list('bkB') + ')');
  ok(alerts.some(a=> /backup in “bkB” was deleted too/.test(a)), 'and it says so');
  ok(!(await p.evaluate(()=> window.__lib.list().list.some(l=> l.name === 'Second'))), 'the library is gone');

  // ---- A folder another library took over is left alone
  await p.evaluate(()=> document.querySelector('.settings-page [data-close], #settingsClose')?.click()).catch(()=>{});
  await reloading(p, ()=> window.__lib.create('Third'));
  const idC = await p.evaluate(()=> window.__lib.id());
  await settle(p);
  await reloading(p, ()=> window.__lib.switchTo('main'));
  await settle(p);
  await setRecord(idC, 'bkC', 'copyC');
  await openDelete();
  await p.evaluate(()=> document.getElementById('libDelBackup').click());
  await clickText(p, '.modal button', '^Delete from this device$'); await sleep(1500);
  ok(/37-player.html/.test(await list('bkC')) && /Library - do not touch/.test(await list('bkC')), 'a folder holding another library\'s backup is untouched');
  ok(alerts.some(a=> /now holds another library’s backup/.test(a)), 'and it says why');

  // ---- Manual backups: the dialog says what to look for
  await reloading(p, ()=> window.__lib.create('SKBC Main'));
  const idD = await p.evaluate(()=> window.__lib.id());
  await settle(p);
  await reloading(p, ()=> window.__lib.switchTo('main'));
  await settle(p);
  await p.evaluate(async (id)=>{
    const db = await new Promise((res, rej)=>{ const r = indexedDB.open('temple-sound-library~' + id); r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error); });
    await new Promise((res, rej)=>{ const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({key: 'backup', lastBackupAt: Date.now(), manualBase: {id: 'x', at: Date.now()}, setupDone: true}); tx.oncomplete = res; tx.onerror = ()=> rej(tx.error); });
    db.close();
  }, idD);
  await openDelete();
  const txt2 = await p.evaluate(()=> document.querySelector('.modal').innerText);
  ok(/can’t delete them/.test(txt2) && /lib-native-backup-full-skbc-main-/.test(txt2) && !(await p.$('#libDelBackup')), 'manual backups: no checkbox, says what the files are called');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
