// "What's on this device": the whole shared library, ticked where it's here.
// Unticking on a full-sync device switches it to "Only what I choose";
// a new playlist from elsewhere waits, marked New, until ticked; with "come
// here by themselves" on it arrives alone; "Everything" brings all back.
//   node choose.js CODE
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return; await sleep(200); } };
const names = p=> p.evaluate(()=>{ const out=[]; (function w(a){ (a||[]).forEach(n=>{ if(n.kind==='playlist') out.push(n.name); if(n.children) w(n.children); }); })(window.__dbg.getRoot().tree); return out.sort().join('|'); });
const base = 'www/ovt'; const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push([path.relative(base,f), fs.readFileSync(f).toString('base64')]); } })(base);
async function device(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name, 'ALERT:', d.message()); d.dismiss(); });
  await p.setRequestInterception(true); p.on('request', r=> r.url().startsWith('http://localhost') || r.url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(250); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const findRow = (txt)=> [...document.querySelectorAll('.ch-row')].find(e=>{ const n = e.querySelector('.ch-name'); if(!n) return false; const c = n.querySelector('.ch-count'); return (n.textContent.slice(0, c ? n.textContent.length - c.textContent.length : undefined)).trim() === txt; });
const row = (p, txt)=> p.evaluate((src, txt)=>{ const findRow = eval(src); const r = findRow(txt); if(!r) return null; return {state: r.querySelector('.ch-box').className.replace('ch-box ', ''), isNew: !!r.querySelector('.ch-new')}; }, findRow.toString(), txt);
const tick = (p, txt)=> p.evaluate((src, txt)=>{ const findRow = eval(src); findRow(txt).querySelector('.ch-box').click(); }, findRow.toString(), txt);
const addPl = (p, name)=> p.evaluate(async(name)=>{ const r = window.__dbg.getRoot(); const t = r.library[0]; r.tree.push({id:'pl'+Math.random().toString(36).slice(2), kind:'playlist', name, order:r.tree.length, items:[{id:'it'+Math.random().toString(36).slice(2), kind:'track', refId:t.id, order:0}]}); await window.__dbg.saveState(); }, name);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});
  // ---- A: the first device, with a library
  const A = await device(b, 'A');
  await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); const t2 = r.library[1] || r.library[0]; r.tree.push({id:'fF', kind:'folder', name:'Festival', order:9, children:[{id:'pF', kind:'playlist', name:'Opening', order:0, items:[{id:'iF', kind:'track', refId:t2.id, order:0}]}]}); await window.__dbg.saveState(); });
  const all = await names(A); console.log('A playlists:', all);
  await A.evaluate((c,u)=> window.__dbg3.join(u, c, 'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  // ---- B: joins with everything
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u, c, 'Phone'), CODE, URL_SYNC); await waitIdle(B);
  ok(await names(B) === all, 'B has everything: ' + await names(B));
  // Settings: the choice, not a Partial switch
  await B.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400);
  await B.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> e.textContent === 'Shared library').click()); await sleep(400);
  let sec = await B.evaluate(()=> document.getElementById('settingsBody').innerText);
  ok(/On this device/.test(sec) && /Everything in the shared library/.test(sec) && /Only what I choose/.test(sec) && !(await B.evaluate(()=> !!document.getElementById('shReview'))), 'Settings → Shared library: Everything / Only what I choose, and no Review changes button');
  ok(await B.evaluate(()=> document.querySelector('input[name="shMode"][value="all"]').checked), 'B is on Everything');
  await B.screenshot({path: 'shots/choose-settings.png'});
  // ---- the overview: everything ticked
  await B.evaluate(()=> document.getElementById('shChoose').click()); await sleep(1200);
  let text = await B.evaluate(()=> document.getElementById('reviewPage')?.innerText || '');
  ok(/What's on this device/.test(text) && /has everything in the shared library/.test(text), 'the overview opens, saying this device has everything');
  ok((await row(B, 'Two')).state === 'all' && (await row(B, 'Festival')).state === 'all', 'everything is ticked');
  ok(await B.evaluate(()=>{ const r = document.querySelector('.ch-list'); return r.getBoundingClientRect().width <= 610; }), 'the list is no wider than it needs');
  // a folder's name opens it; it doesn't tick
  await B.evaluate(()=> [...document.querySelectorAll('.ch-folder .ch-name')].find(e=> /Festival/.test(e.textContent)).click()); await sleep(200);
  ok(!!(await row(B, 'Opening')) && (await row(B, 'Festival')).state === 'all', 'tapping a folder\'s name opens it without ticking anything');
  ok(await B.evaluate(()=> document.getElementById('chClose').textContent) === 'Cancel', 'the overview\'s way out says Cancel');
  await B.screenshot({path: 'shots/choose-all.png'});
  // untick Two and the Festival folder
  await tick(B, 'Two'); await tick(B, 'Festival'); await sleep(200);
  ok((await row(B, 'Two')).state === 'none' && (await row(B, 'Festival')).state === 'none', 'unticked: Two and the Festival folder');
  await B.evaluate(()=> document.getElementById('chGo').click()); await sleep(400);
  let m = await modal(B);
  ok(/Keep only what you choose\?/.test(m), 'unticking on a full-sync device asks to switch first');
  await clickText(B, '.modal button', '^Switch and apply$'); await sleep(2500); await waitIdle(B);
  ok(await B.evaluate(()=> !!window.__choose.cfg().partial), 'B is now on Only what I choose');
  ok(!/Two/.test(await names(B)) && !/Opening/.test(await names(B)), 'Two and Opening are gone from B: ' + await names(B));
  await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
  ok(await names(A) === all, 'and A still has everything');
  // ---- a new playlist on A waits on B, marked New
  await addPl(A, 'Fresh'); await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B); await sleep(500);
  ok(!/Fresh/.test(await names(B)), 'a new playlist from A doesn\'t come by itself');
  ok(await B.evaluate(()=>{ const b = document.getElementById('btnSharedReview'); return b.style.display !== 'none' && /new/.test(b.textContent); }), 'the top bar says something is new');
  await B.evaluate(()=> document.getElementById('btnSharedReview').click()); await sleep(1200);
  const fresh = await row(B, 'Fresh');
  ok(fresh && fresh.state === 'none' && fresh.isNew, 'the badge opens the overview, with Fresh marked New');
  await sleep(500);
  ok(await B.evaluate(()=> document.getElementById('btnSharedReview').style.display === 'none'), 'looking clears the count at the top (Fresh still marked New here)');
  await B.screenshot({path: 'shots/choose-partial.png'});
  await tick(B, 'Fresh'); await sleep(200);
  text = await B.evaluate(()=> document.getElementById('rvFoot').innerText);
  ok(/Brings 1 tracks|Apply/.test(text), 'the footer says what Apply will do: ' + text.replace(/\n/g, ' '));
  await B.evaluate(()=> document.getElementById('chGo').click()); await sleep(2500); await waitIdle(B);
  ok(/Fresh/.test(await names(B)), 'ticked and applied: Fresh is on B');
  // ---- an album: its tracks come here without its playlists
  // A adds a track to its library, in no playlist; B (Only what I choose) doesn't get it
  await A.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__dbg.bulkImportFolder([new File([blob], 'ten.mp3', {type: 'audio/mpeg'})]); });
  for(let k=0; k<60; k++){ const h = await A.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(A, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
  await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
  const loose = await A.evaluate(()=>{ const r = window.__dbg.getRoot(); const tr = r.library.find(t=> t.filename === 'ten.mp3' || /ten/.test(t.name)); return tr ? {id: tr.id, album: tr.album || ''} : null; });
  const missing = loose ? [loose.id] : [];
  const album = loose ? loose.album : null;
  console.log('the new track:', JSON.stringify(loose));
  ok(loose && !(await B.evaluate((id)=> window.__dbg.getRoot().library.some(t=> t.id === id), loose.id)), 'a track in no playlist doesn\'t come to B by itself');
  await B.evaluate(()=> document.getElementById('btnSharedReview') && 0); await B.evaluate(()=> window.__choose.open()); await sleep(1200);
  await B.evaluate(()=>{ const b = document.querySelector('.ch-section .ch-twist'); if(b && b.getAttribute('aria-expanded') !== 'true') b.click(); }); await sleep(300);
  const albumName = album || 'No album';
  const before = await row(B, albumName);
  ok(before && before.state !== 'all', 'Albums lists ' + albumName + ', not all here: ' + JSON.stringify(before));
  await B.screenshot({path: 'shots/choose-albums.png'});
  await tick(B, albumName); await sleep(200);
  ok((await row(B, albumName)).state === 'all', 'ticking it ticks the album');
  await B.evaluate(()=> document.getElementById('chGo').click()); await sleep(2500); await waitIdle(B);
  const onB2 = await B.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.id));
  ok(missing.every(id=> onB2.includes(id)) && !/Two/.test(await names(B)), 'the album\'s tracks are on B, without bringing any playlist');
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
  ok(missing.every(id=> onB2.includes(id)) && (await B.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.id))).length === onB2.length, 'and they stay after the next sync');
  await B.evaluate(()=> window.__choose.open()); await sleep(1200);
  await B.evaluate(()=>{ const b = document.querySelector('.ch-section .ch-twist'); if(b && b.getAttribute('aria-expanded') !== 'true') b.click(); }); await sleep(300);
  ok((await row(B, albumName)).state === 'all', 'opened again, the album shows as here');
  await B.evaluate(()=> document.getElementById('chClose').click()); await sleep(300);
  // ---- come by themselves
  await B.evaluate(async()=>{ window.__choose.cfg().autoNew = true; await window.__choose.markAllSeen(); await window.__dbg.saveState(); });
  await addPl(A, 'Fresher'); await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
  await B.evaluate(()=> window.__dbg3.sync()); await sleep(1500); await waitIdle(B);
  ok(/Fresher/.test(await names(B)), 'with "come here by themselves" on, a new playlist arrives');
  ok(!/Two/.test(await names(B)), 'but what was unticked stays off');
  // ---- back to Everything
  await B.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400);
  await B.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> e.textContent === 'Shared library').click()); await sleep(400);
  sec = await B.evaluate(()=> document.getElementById('settingsBody').innerText);
  ok(/come here by themselves/.test(sec), 'with Only what I choose, the "come here by themselves" switch shows');
  await B.evaluate(()=>{ const r = document.querySelector('input[name="shMode"][value="all"]'); r.checked = true; r.dispatchEvent(new Event('change')); }); await sleep(800);
  m = await modal(B);
  ok(/Bring everything here\?/.test(m), 'choosing Everything says how much will come');
  await clickText(B, '.modal button', '^Bring everything$'); await sleep(2500); await waitIdle(B);
  await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);
  ok(await names(B) === await names(A), 'B has everything again: ' + await names(B));
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
