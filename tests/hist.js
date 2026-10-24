// History (1.4.084): every version the shared library keeps, listed with who
// saved it and what it changed; restoring chosen differences from an earlier
// version saves a new version, which the other devices then get. Also the
// Shared library page: History… and the "More" fold.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500); };
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const sync = async p=>{ await p.evaluate(()=> window.__dbg3.sync()); await sleep(800); await waitIdle(p); await sleep(500); };
const trackName = p=> p.evaluate(()=> window.__dbg.getRoot().library[0] && window.__dbg.getRoot().library[0].name);
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const versions = async ()=> JSON.parse(require('child_process').execSync(`curl -s -H "X-Library: ${encodeURIComponent(CODE)}" "${URL_SYNC}?op=history"`).toString());
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500); await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  const original = await trackName(A);
  // Two renames, two more versions.
  await A.evaluate(async()=>{ window.__dbg.getRoot().library[0].name = 'Renamed once'; await window.__dbg.saveState(); }); await sync(A);
  await A.evaluate(async()=>{ window.__dbg.getRoot().library[0].name = 'Renamed twice'; await window.__dbg.saveState(); }); await sync(A);
  let vs = await versions();
  console.log('versions:', JSON.stringify(vs.map(v=> [v.version, v.by, v.what])));
  ok(vs.length >= 3, 'the server lists ' + vs.length + ' versions');
  ok(vs[0].by === 'Laptop' && vs[0].what && vs[0].what.tc === 1, 'the newest says who saved it and that 1 track changed');

  // History on A
  await A.evaluate(()=> window.__hist.open()); for(let i=0;i<60;i++){ await sleep(250); if(await A.$('.hist-point')) break; }
  const pts = await A.evaluate(()=> [...document.querySelectorAll('.hist-point')].map(b=>({v: +b.dataset.v, text: b.innerText.replace(/\s+/g,' ')})));
  console.log('points:', JSON.stringify(pts));
  ok(pts.length === vs.length && /now/i.test(pts[0].text), 'History lists every version, the newest marked Now');
  ok(pts.some(x=> /Laptop/.test(x.text) && /1 track changed/.test(x.text)), 'with who saved it and what changed, in words');
  const oldest = Math.min(...pts.map(x=> x.v));
  const firstNamed = vs.filter(v=> v.version <= vs[0].version).map(v=> v.version).sort((a,b)=>a-b);
  // Choose the version that still had the original name (the first one with the track).
  await A.evaluate((v)=> document.querySelector('.hist-point[data-v="' + v + '"]').click(), oldest);
  for(let i=0;i<40;i++){ await sleep(200); if(await A.evaluate(()=> !!document.querySelector('.hist-row') || !!document.querySelector('.hist-nothing'))) break; }
  let rows = await A.evaluate(()=> [...document.querySelectorAll('.hist-row')].map(r=> r.innerText.replace(/\s+/g,' ')));
  console.log('rows vs v' + oldest + ':', JSON.stringify(rows));
  ok(rows.length >= 1 && rows.some(r=> /Changed since/.test(r) && /Renamed twice/.test(r)), 'the renamed track shows as changed since');
  ok(await A.evaluate(()=> document.getElementById('histGo').disabled), 'Restore is off until something is chosen');
  // Choose the track's row and restore it.
  await A.evaluate(()=>{ const row = [...document.querySelectorAll('.hist-row')].find(r=> /♪/.test(r.querySelector('.rv-icon').textContent)); row.querySelector('[data-pick]').click(); });
  await sleep(300);
  ok(await A.evaluate(()=> /Restore 1 change/.test(document.getElementById('histGo').textContent) && !document.getElementById('histGo').disabled), 'chosen: Restore 1 change');
  await A.evaluate(()=> document.getElementById('histGo').click());
  for(let i=0;i<60;i++){ await sleep(250); if(!(await A.$('#historyPage'))) break; }
  await waitIdle(A); await sleep(1000); await waitIdle(A);
  ok(!(await A.$('#historyPage')), 'History closes after restoring');
  ok(await trackName(A) === original, 'the track has its original name again (' + await trackName(A) + ')');
  vs = await versions();
  ok(vs[0].what && vs[0].what.rs, 'the restore is a new version that says it restored (' + JSON.stringify(vs[0].what) + ')');

  // B joins: it gets the restored name.
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B); await sleep(1500); await waitIdle(B);
  ok(await trackName(B) === original, 'another device gets the restored name');

  // What changed at a point
  await A.evaluate(()=> window.__hist.open()); for(let i=0;i<60;i++){ await sleep(250); if(await A.$('.hist-point')) break; }
  const v2 = vs.find(v=> v.what && v.what.tc === 1 && !v.what.rs);
  await A.evaluate((v)=> document.querySelector('.hist-point[data-v="' + v + '"]').click(), v2.version);
  for(let i=0;i<40;i++){ await sleep(200); if(await A.$('.hist-row, .hist-nothing')) break; }
  await A.evaluate(()=> document.querySelector('input[name="histMode"][value="point"]').click()); await sleep(300);
  rows = await A.evaluate(()=> [...document.querySelectorAll('.hist-row')].map(r=> r.innerText.replace(/\s+/g,' ')));
  console.log('point rows:', JSON.stringify(rows));
  ok(rows.length === 1 && /Changed here/.test(rows[0]), 'What changed at this point: the one rename');
  ok(!(await A.$('#histGo')), 'and nothing to restore in that view');
  await A.keyboard.press('Escape'); await sleep(300);
  ok(!(await A.$('#historyPage')), 'Escape closes History');

  // Settings → Shared library
  await A.evaluate(()=>{ window.__dbg4.settings(); window.__dbg4.section('shared'); }); await sleep(600);
  const s = await A.evaluate(()=>({hist: !!document.getElementById('shHistory'), more: !!document.getElementById('shMore'), moreOpen: document.getElementById('shMore') && document.getElementById('shMore').open, reviewInMore: !!document.querySelector('#shMore #shReviewMode'), log: !!document.querySelector('#shMore #shLog'), leaveOutside: !document.querySelector('#shMore #shLeave')}));
  ok(s.hist && s.more && !s.moreOpen && s.reviewInMore && s.log && s.leaveOutside, 'Shared library: History…, and More (closed) holding the switches and the log; Leave outside it');
  await A.evaluate(()=>{ window.__dbg4.section('backups'); }); await sleep(400);
  ok(await A.evaluate(()=> !!document.getElementById('bkHistoryBtn')), 'Backups has History… too');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
