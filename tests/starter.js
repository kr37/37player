// A new library starts with one prayer. Until something of the person's own
// is added, it isn't treated as their library: restoring a backup doesn't
// warn that the backup is older, and there's no "Back up library".
//   node starter.js
const puppeteer = require('puppeteer-core'); const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
async function importAs(p, from, as){
  await p.evaluate(async(from, as)=>{ const blob = await (await fetch('/' + from)).blob(); window.__dbg.bulkImportFolder([new File([blob], as, {type: blob.type || 'audio/mpeg'})]); }, from, as);
  for(let k=0; k<60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
}
async function open(b){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1200, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
  await clickText(p, '.modal button', '^English$'); await sleep(300);
  await clickText(p, '.modal button', '^Start a library on this device$'); await sleep(300);
  await clickText(p, '.modal button', '^Skip for now$'); await sleep(300); await clickText(p, '.modal button', '^Finish$'); await sleep(300);
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  // someone's real library, to restore from
  const A = await open(b);
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; await window.__dbg.saveState(); });
  await importAs(A, 'ten.mp3', 'ten.mp3');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'p1', kind:'playlist', name:'Morning', order:0, items:[{id:'i1', kind:'track', refId:r.library[0].id, order:0}]}); r.modifiedAt = Date.now() - 86400000; await window.__dbg.saveState(); });
  const meta = await A.evaluate(()=> window.__share.meta());
  await sleep(1500);
  // a new device: the starter prayer, as fetched (here: a stand-in file of that name)
  const B = await open(b);
  await importAs(B, 'ten.mp3', 'TheLiberatingPrayer.mp3');
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); const pl = (function f(a){ for(const n of a){ if(n.kind === 'playlist') return n; if(n.children){ const x = f(n.children); if(x) return x; } } })(r.tree); pl.items.push({id: 'st', kind: 'track', refId: r.library[0].id, order: 0}); r.modifiedAt = Date.now(); await window.__dbg.saveState(); window.__starter.update(); });
  const tree = await B.evaluate(()=> JSON.stringify(window.__dbg.getRoot().tree.map(n=> [n.kind, n.name, (n.children || []).map(c=> c.name)])));
  ok(await B.evaluate(()=> window.__starter.just()), 'a new library with only the starter prayer counts as not yet the person\'s: ' + tree);
  ok(await B.evaluate(()=> window.__starter.label()) === '', 'no "Back up library" for it');
  // what restoring from a backup folder or file asks first
  const verdict = await B.evaluate((m)=> Promise.race([window.__starter.check(m), new Promise(r=> setTimeout(()=> r('asked: ' + (document.querySelector('.modal')?.innerText || '').replace(/\s+/g, ' ').slice(0, 80)), 1500))]), meta);
  ok(verdict === 'restore', 'restoring a backup older than the starter library: no "older than your library" warning (' + verdict + ')');
  await B.evaluate((m)=>{ window.__share.offer(m); }, meta); await sleep(600);
  await B.evaluate(()=> document.getElementById('replaceGo').click()); await sleep(1500);
  ok(/Morning/.test(await B.evaluate(()=> JSON.stringify(window.__dbg.getRoot().tree))) && await B.evaluate(()=> window.__dbg.getRoot().library.length) === 1, 'and the backup replaces it');
  // once something of the person's own is added, it's their library
  const C = await open(b);
  await importAs(C, 'ten.mp3', 'TheLiberatingPrayer.mp3');
  await importAs(C, 'w_mono48.wav', 'My own talk.wav');
  await C.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.modifiedAt = Date.now(); await window.__dbg.saveState(); window.__starter.update(); });
  ok(!(await C.evaluate(()=> window.__starter.just())) && /Back up library/.test(await C.evaluate(()=> window.__starter.label())), 'with a track of their own added, it\'s their library: "' + await C.evaluate(()=> window.__starter.label()) + '"');
  C.evaluate((m)=>{ window.__starter.check(m); }, meta); await sleep(800);
  const mc = await modal(C);
  ok(/older/i.test(mc), 'and restoring an older backup over it warns, as before: ' + mc.replace(/\s+/g, ' ').slice(0, 100));
  // A brand-new device: the starter track is fetched (libraries/starter.mp3) into Archive → Acoustic
  fs.mkdirSync(path.join(__dirname, 'www', 'libraries'), {recursive: true});
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'starter.mp3'), path.join(__dirname, 'www', 'libraries', 'starter.mp3'));
  const D = await (await b.createBrowserContext()).newPage(); await D.setViewport({width: 1200, height: 900});
  await D.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; try{ if(!localStorage.getItem('37player.device')) localStorage.setItem('37player.device', JSON.stringify({librariesUrl: 'http://localhost:8861/libraries/'})); }catch(e){} });
  D.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); D.on('dialog', d=> d.dismiss());
  await D.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
  let got = null;
  for(let k = 0; k < 40 && !got; k++){ await sleep(250); got = await D.evaluate(()=>{ const r = window.__dbg.getRoot(); const t = r.library[0]; return t ? {name: t.name, file: t.filename, tree: JSON.stringify(r.tree.map(n=> [n.name, (n.children || []).map(c=> [c.name, (c.items || []).length])])), just: window.__starter.just()} : null; }); }
  ok(got && got.name === 'Spontaneous Accomplishment of Wishes - Acoustic' && got.tree === '[["Archive",[["Acoustic",1]]]]', 'a new library gets the starter track in Archive → Acoustic: ' + JSON.stringify(got));
  ok(got && got.file === 'Spontaneous Accomplishment of Wishes - Acoustic.mp3' && got.just, 'named after the track, and still "not yet the person\'s library"');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
