// "Your library didn't load" only for storage that really came back empty
// (1.4.154). A restore (Replace) or "Get the current shared library" clears
// the library record before writing the new one; cut off in between (a
// reload, a crash, a full disk), the next start used to say "didn't load",
// with no way on. Now the marker written before the clear says what
// happened: the library opens empty, with a notice. And storage that still
// holds the library's other records (its name, settings) isn't taken for
// lost. Storage emptied completely still gets "didn't load" (notloaded.js).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const URL = 'http://localhost:8861/37-player.html';
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const dialog = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
const stateKeys = p=> p.evaluate(()=> new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess = ()=>{ const r = q.result.transaction('state').objectStore('state').getAllKeys(); r.onsuccess = ()=>{ res(r.result); q.result.close(); }; }; }));
async function withTrack(p){
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 1 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300);
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  for(const what of ['restore', 'rejoin']){
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
    p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
    await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
    await withTrack(p);
    const listed = await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.libraries')).list[0].tracks);
    // Cleared, then cut off before the new library is written.
    await p.evaluate((w)=> window.__int.clear(w), what);
    const mid = await stateKeys(p);
    ok(mid.includes('replacing') && !mid.includes('root'), what + ': the marker is written and kept through the clear (' + mid.join(', ') + '; the list says ' + listed + ' tracks)');
    await p.reload({waitUntil:'networkidle0'}); await sleep(1800);
    const d = await dialog(p);
    ok(!/didn't load/.test(d), what + ': no "Your library didn\'t load"');
    ok(what === 'restore' ? /A restore didn't finish/.test(d) && /Restore the backup again/.test(d) : /Join the shared library again/.test(d), what + ': it says what happened (' + d.replace(/\n+/g, ' | ').slice(0, 110) + ')');
    ok((await p.evaluate(()=> window.__dbg.getRoot().library.length)) === 0, what + ': the library opens, empty');
    await sleep(800);
    const after = await stateKeys(p);
    ok(after.includes('root') && !after.includes('replacing'), what + ': an empty library is written and the marker removed (' + after.join(', ') + ')');
    await clickText(p, '.modal button', '^OK$'); await sleep(300);
    await p.reload({waitUntil:'networkidle0'}); await sleep(1500);
    ok(!/didn't finish|didn't load/.test(await dialog(p)), what + ': and the next start is an ordinary one');
    await ctx.close();
  }
  // The library record missing, its other records there, no marker: not lost.
  {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
    p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
    await p.goto(URL, {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
    await withTrack(p);
    await p.evaluate(()=> new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess = ()=>{ const tx = q.result.transaction('state', 'readwrite'); tx.objectStore('state').delete('root'); tx.objectStore('state').delete('rootSpare'); tx.oncomplete = ()=>{ q.result.close(); res(); }; }; }));
    await p.reload({waitUntil:'networkidle0'}); await sleep(1800);
    ok(!/didn't load/.test(await dialog(p)), 'its other records still there: not taken for lost storage');
    await ctx.close();
  }
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
