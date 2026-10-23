// A library that didn't load (1.4.065). On a full iPad, Safari handed the
// page empty storage with no error; 37 Player showed "Nothing imported yet"
// and could have been imported or joined into, over the real library.
// Now an empty library with signs of earlier use gets one dialog that can't
// be dismissed and nothing is written; a library meant to be new is left
// alone; and storage that doesn't answer at all is said after 8 seconds.
// Simulated by deleting the database (keeping localStorage), by pretending
// storage is persistent, and by making indexedDB.open never answer.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const URL = 'http://localhost:8861/37-player.html', OTHER = 'http://localhost:8861/manifest.webmanifest';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const dialog = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); };
// Pretends, from the start of every page, that storage is persistent and/or
// that the database never answers (localStorage flags, so a reload keeps them).
const PRETEND = ()=>{
  try{
    if(localStorage.getItem('__persisted') === '1' && navigator.storage) navigator.storage.persisted = ()=> Promise.resolve(true);
    if(localStorage.getItem('__stuck') === '1'){ const o = IDBFactory.prototype.open; IDBFactory.prototype.open = function(n, v){ if(String(n).indexOf('temple-sound-library') === 0) return {}; return o.call(this, n, v); }; }
  }catch(e){}
};
async function context(b){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  await p.evaluateOnNewDocument(PRETEND);
  return p;
}
// Deletes the library's database from another page of the same site, as the
// storage Safari handed over looked: empty. localStorage stays as it was.
async function loseDatabase(p){
  await p.goto(OTHER); await sleep(200);
  const r = await p.evaluate(()=> new Promise(res=>{ const q = indexedDB.deleteDatabase('temple-sound-library'); q.onsuccess = ()=> res('deleted'); q.onerror = ()=> res('error'); q.onblocked = ()=> res('blocked'); }));
  return r;
}
const rootRecord = p=> p.evaluate(()=> new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess = ()=>{ const d = q.result; if(!d.objectStoreNames.contains('state')){ d.close(); return res('no store'); } const g = d.transaction('state').objectStore('state').get('root'); g.onsuccess = ()=>{ d.close(); res(g.result ? 'present' : 'absent'); }; g.onerror = ()=>{ d.close(); res('error'); }; }; q.onerror = ()=> res('open error'); }));

(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});

  // --- 1. A library with tracks; its database comes back empty
  let p = await context(b);
  await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  ok(!/didn't load/.test(await dialog(p)), 'a first visit is just a first visit');
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 1 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  const n = await p.evaluate(()=> window.__dbg.getRoot().library.length);
  console.log('tracks before:', n, 'list:', await p.evaluate(()=> localStorage.getItem('37player.libraries')));
  console.log('delete:', await loseDatabase(p));
  await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(1500);
  let dt = await dialog(p);
  ok(/Your library didn't load/.test(dt) && /Don't import, join a shared library or restore a backup now/.test(dt), 'the database empty, the list remembering tracks: "Your library didn\'t load", with the warning: ' + JSON.stringify(dt.slice(0, 90)));
  ok(!/Welcome/.test(dt), 'no welcome instead');
  await p.mouse.click(10, 880); await p.keyboard.press('Escape'); await sleep(400);
  ok(/didn't load/.test(await dialog(p)), 'tapping outside or Escape doesn\'t close it');
  await p.evaluate(()=> window.__dbg.saveState().catch(()=>{})); await sleep(500);
  await p.evaluate(()=> document.querySelector('.modal-backdrop') && (document.querySelector('.modal-backdrop').classList.remove('show'))); await sleep(2000);
  ok(/didn't load/.test(await dialog(p)), 'closed some other way, it comes back');
  ok(await rootRecord(p) === 'absent', 'nothing was written: no empty library saved over it');
  ok(await p.evaluate(()=> window.__dbg3.put('state', {key: 'x', value: 1}).then(()=> 'written', e=> e.name)) === 'InvalidStateError', 'writes are refused');
  ok(await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.libraries') || '{}').list?.[0]?.tracks) === n, 'the list still remembers the tracks');
  // Try again: still not there
  await p.click('#notLoadedTry'); await sleep(2000);
  ok(/didn't load/.test(await dialog(p)), 'Try again, still empty: still the dialog');
  // Start empty anyway: asks first, then starts as a new library
  await p.click('#notLoadedEmpty'); await sleep(300);
  dt = await dialog(p);
  ok(/Only if you're sure/.test(dt), 'Start with an empty library anyway asks first');
  await p.click('#notLoadedEmptyNo'); await sleep(200);
  ok(await p.evaluate(()=> getComputedStyle(document.getElementById('notLoadedMain')).display !== 'none'), 'Cancel goes back');
  await p.click('#notLoadedEmpty'); await sleep(200); await p.click('#notLoadedEmptyYes'); await sleep(2500);
  dt = await dialog(p);
  ok(!/didn't load/.test(dt), 'Start empty: the dialog is gone after the reload (' + JSON.stringify(dt.slice(0, 40)) + ')');
  await settle(p);
  ok(await rootRecord(p) === 'present', 'and the new, empty library is saved');
  await p.reload({waitUntil:'networkidle0'}); await sleep(1500);
  ok(!/didn't load/.test(await dialog(p)), 'opened again: nothing to warn about');
  await p.browserContext().close();

  // --- 2. Persistent storage around a database just created (the list gone too)
  p = await context(b);
  await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem('__persisted', '1'); });
  await loseDatabase(p);
  await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(1500);
  ok(/didn't load/.test(await dialog(p)), 'storage still persistent, the database new, the list gone: "didn\'t load"');
  // A library made a moment ago (New library) is new, persistent or not
  await loseDatabase(p);
  await p.evaluate(()=> sessionStorage.setItem('37player.newEmpty', 'main'));
  await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(1500);
  ok(!/didn't load/.test(await dialog(p)), 'a library just made with New library: no warning');
  await p.browserContext().close();

  // --- 3. Storage that never answers
  p = await context(b);
  await p.goto(OTHER); await p.evaluate(()=> localStorage.setItem('__stuck', '1'));
  await p.goto(URL); await sleep(4000);
  ok(!/isn't responding/.test(await dialog(p)), 'not said too soon');
  await sleep(6000);
  dt = await dialog(p);
  ok(/storage isn't responding/.test(dt) && /Don't import/.test(dt), 'after 8 seconds: "This device\'s storage isn\'t responding": ' + JSON.stringify(dt.slice(0, 60)));
  await p.evaluate(()=> localStorage.removeItem('__stuck'));
  await p.click('#storageStuckTry'); await sleep(2500);
  ok(!/isn't responding/.test(await dialog(p)), 'Try again, storage answering: it opens');
  await p.browserContext().close();

  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
