// A shared library with nothing in it yet (just made, to be filled): joining
// it from a library with tracks sends everything up without asking "use the
// shared library or combine?" (using it would have emptied this device), and
// restoring a backup on a device joined to it restores straight in and stays
// joined, instead of "This library is shared… leave, then restore".
//   node emptyshared.js CODE1 CODE2
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE1 = process.argv[2], CODE2 = process.argv[3], URL_SYNC = 'http://127.0.0.1:8870/sync.php', APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return; await sleep(200); } };
const remote = async (code)=>{ const r = await fetch(URL_SYNC + '?op=state', {headers: {'X-Library': encodeURIComponent(code)}}); return {version: +r.headers.get('X-Version'), doc: await r.json()}; };
const playlists = doc=> JSON.stringify(doc ? doc.tree : []).match(/"name":"[^"]*"/g) || [];
// Watches the dialogs while something runs: notes every one, presses Join.
async function through(p, run, ...args){
  const seen = [];
  const pr = p.evaluate(run, ...args);
  for(let k = 0; k < 60; k++){
    const m = await modal(p);
    if(m && !seen.includes(m)) seen.push(m);
    if(/Use the shared library/.test(m)) break;
    if(await clickText(p, '.modal button', '^Join$')) { await sleep(300); continue; }
    if(await Promise.race([pr.then(()=> true), sleep(250).then(()=> false)])) break;
  }
  return seen;
}
async function open(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1200, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name, 'ALERT:', d.message()); d.dismiss(); });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  await clickText(p, '.modal button', '^English$'); await sleep(500);
  await clickText(p, '.modal button', '^Start a library on this device$'); await sleep(300);
  await clickText(p, '.modal button', '^Skip for now$'); await sleep(300); await clickText(p, '.modal button', '^Finish$'); await sleep(300);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
(async()=>{
  // Both shared libraries: made and saved once, empty (version 1, nothing in it)
  for(const c of [CODE1, CODE2]){
    const r = await fetch(URL_SYNC + '?op=state&base=0', {method: 'POST', headers: {'X-Library': encodeURIComponent(c), 'Content-Type': 'application/json'}, body: JSON.stringify({tracks: [], tree: []})});
    ok(r.ok, 'an empty shared library, saved once (' + r.status + ')');
  }
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});

  // ---- A library with a track and a playlist joins the empty one
  const A = await open(b, 'A');
  await A.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__dbg.bulkImportFolder([new File([blob], 'ten.mp3', {type: 'audio/mpeg'})]); });
  for(let k=0; k<60; k++){ const h = await A.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(A, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); const id = r.library[0].id; r.tree.push({id:'p1', kind:'playlist', name:'Morning', order:0, items:[{id:'i1', kind:'track', refId:id, order:0}]}); await window.__dbg.saveState(); });
  const meta = await A.evaluate(()=> window.__share.meta());
  const seen = await through(A, (c, u)=> window.__dbg3.join(u, c, 'Mac mini').then(()=> 1), CODE1, URL_SYNC);
  ok(!seen.some(m=> /Use the shared library/.test(m)), 'joining an empty shared library doesn\'t ask "use the shared library or combine"');
  const jd = await A.evaluate(()=> window.__joinDialog || '');
  ok(/send/i.test(jd) && !/download/i.test(jd), 'it says what will be sent: ' + jd.replace(/\s+/g, ' ').slice(0, 120));
  await A.screenshot({path: 'shots/emptyshared-join.png'});
  await sleep(500); await waitIdle(A);
  ok(await A.evaluate(()=> window.__dbg.getRoot().library.length) === 1 && /Morning/.test(await A.evaluate(()=> JSON.stringify(window.__dbg.getRoot().tree))), 'A keeps its track and playlist');
  let r = await remote(CODE1);
  ok(r.doc && r.doc.tracks.length === 1 && playlists(r.doc).some(n=> /Morning/.test(n)), 'and they\'re in the shared library now (v' + r.version + ')');

  // ---- Restoring a backup on a device joined to an empty shared library
  const B = await open(b, 'B');
  await through(B, (c, u)=> window.__dbg3.join(u, c, 'Test site').then(()=> 1), CODE2, URL_SYNC);
  await sleep(500); await waitIdle(B);
  ok(await B.evaluate(()=> (window.__dbg.getRoot().settings.sharedLibrary || {}).code) === CODE2, 'B is in the second, still empty, shared library');
  await B.evaluate((m)=>{ window.__share.offer(m); }, meta); await sleep(800);
  let m = await modal(B);
  ok(!/This library is shared/.test(m) && /Restore exactly|exactly/i.test(m), 'restoring there skips "This library is shared" and goes straight to the restore: ' + m.slice(0, 80));
  await B.screenshot({path: 'shots/emptyshared-restore.png'});
  await B.evaluate(()=> document.getElementById('replaceGo').click());
  for(let k = 0; k < 40; k++){ await clickText(B, '.modal button', '^Join$'); if(await B.evaluate(()=> !!(window.__dbg.getRoot().settings.sharedLibrary || {}).code) && !(await modal(B))) break; await sleep(250); }
  await sleep(500); await waitIdle(B); await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
  ok(await B.evaluate(()=> (window.__dbg.getRoot().settings.sharedLibrary || {}).code) === CODE2, 'after the restore, B is still in the shared library');
  ok(/Morning/.test(await B.evaluate(()=> JSON.stringify(window.__dbg.getRoot().tree))), 'with the restored playlist');
  r = await remote(CODE2);
  ok(playlists(r.doc).some(n=> /Morning/.test(n)), 'which is now in the shared library too (v' + r.version + ')');

  // ---- Not empty any more: restoring asks first, as before
  await B.evaluate((m)=>{ window.__share.offer(m); }, meta); await sleep(800);
  ok(/This library is shared/.test(await modal(B)), 'once the shared library has something in it, restoring asks first, as before');

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
