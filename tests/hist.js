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
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500); };
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
  // Bring back (2.5.018): find the track by its first name, choose the earlier state that has it, and replace.
  await A.evaluate(()=> document.querySelector('.hist-tabs [data-tab="bring"]').click());
  for(let i=0;i<60;i++){ await sleep(200); if(await A.$('#bbA')) break; } await sleep(300);
  await A.evaluate(()=> document.querySelector('[data-kind="tr"]').click()); await sleep(300);
  await A.evaluate(()=> document.querySelector('input[name="bbView"][value="flat"]').click()); await sleep(300);
  const flat = await A.evaluate(()=> [...document.querySelectorAll('#bbA .bb-it')].map(e=> e.innerText.replace(/\s+/g,' ').trim()));
  console.log('flat list:', JSON.stringify(flat));
  ok(flat.some(x=> x.indexOf(original) === 0 && /now “Renamed twice”/.test(x)), 'Bring back\'s flat list has the track under its first name, saying what it\'s called now');
  await A.evaluate((o)=> [...document.querySelectorAll('#bbA [data-id]')].find(e=> e.innerText.indexOf(o) === 0).click(), original);
  for(let i=0;i<60;i++){ await sleep(200); if(await A.$('#bbC .bb-ver')) break; }
  const states = await A.evaluate(()=> document.querySelectorAll('#bbC .bb-ver').length);
  ok(states === 2, 'two earlier states: its first name, and the name between (' + states + ')');
  for(let i = 0; i < states; i++){
    await A.evaluate((i)=> document.querySelectorAll('#bbC .bb-ver')[i].click(), i); await sleep(300);
    if(await A.evaluate((o)=> document.querySelectorAll('#bbBD .bb-head')[1].innerText.indexOf(o) >= 0, original)) break;
  }
  ok(await A.evaluate((o)=> document.querySelectorAll('#bbBD .bb-head')[0].innerText.indexOf('Renamed twice') >= 0 && document.querySelectorAll('#bbBD .bb-head')[1].innerText.indexOf(o) >= 0, original), 'Now: Renamed twice; Earlier: its first name');
  await A.evaluate(()=> document.querySelector('#bbBD [data-bb="replace"]').click());
  for(let i=0;i<60;i++){ await sleep(250); if(!(await A.$('#historyPage'))) break; }
  await waitIdle(A); await sleep(1000); await waitIdle(A);
  ok(!(await A.$('#historyPage')), 'History closes after bringing it back');
  ok(await trackName(A) === original, 'the track has its original name again (' + await trackName(A) + ')');
  vs = await versions();
  ok(vs[0].what && vs[0].what.rs, 'the restore is a new version that says it restored (' + JSON.stringify(vs[0].what) + ')');

  // B joins: it gets the restored name.
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B); await sleep(1500); await waitIdle(B);
  ok(await trackName(B) === original, 'another device gets the restored name');

  // ("What changed at this point" went with the old Bring back tab in 2.5.018.)
  await A.keyboard.press('Escape'); await sleep(300);
  ok(!(await A.$('#historyPage')), 'Escape closes History');

  // Roll back the library (2.5.007): everything as it was at the first save with the track, in one go.
  await A.evaluate(async()=>{ window.__dbg.getRoot().library[0].name = 'Renamed a third time'; await window.__dbg.saveState(); }); await sync(A);
  await A.evaluate(()=> window.__hist.open()); for(let i=0;i<60;i++){ await sleep(250); if(await A.$('.hist-point')) break; }
  ok(await A.evaluate(()=> document.querySelector('.hist-tabs .mode-tab.active').dataset.tab === 'roll'), 'History opens on Roll back the library');
  await A.evaluate((v)=> document.querySelector('.hist-point[data-v="' + v + '"]').click(), oldest);
  for(let i=0;i<40;i++){ await sleep(200); if(await A.$('#rbGo')) break; }
  const rb = await A.evaluate(()=> [...document.querySelectorAll('.rb-row')].map(r=> r.innerText.replace(/\s+/g,' ').trim()));
  console.log('roll back rows:', JSON.stringify(rb));
  ok(rb.some(r=> r.indexOf(original) >= 0 && /Renamed a third time renamed/.test(r)), 'the track shows its name then and its name now');
  await A.evaluate(()=> document.getElementById('rbGo').click()); await sleep(400);
  ok(await A.evaluate(()=> /Roll back to/.test(document.querySelector('.modal h3').textContent)), 'Roll back to this asks first');
  await clickText(A, '.modal button', '^Roll back to this$');
  for(let i=0;i<60;i++){ await sleep(250); if(!(await A.$('#historyPage'))) break; }
  await waitIdle(A); await sleep(1000); await waitIdle(A);
  ok(!(await A.$('#historyPage')) && await trackName(A) === original, 'rolled back: History closes and the track has its original name (' + await trackName(A) + ')');
  vs = await versions();
  ok(vs[0].what && vs[0].what.rs, 'the rollback is a new version at the top');
  await sync(B); ok(await trackName(B) === original, 'and the other device gets it');

  // This device's own changes, not yet synced, sit above the versions (2.5.011).
  ok((await A.evaluate(()=> window.__undo.flags())).every(x=> x), 'after a sync, every undo step so far is marked as sent');
  await A.setOfflineMode(true);
  await A.evaluate(async()=>{ window.__dbg.getRoot().library[0].name = 'Changed while offline'; await window.__dbg.saveState(); }); await sleep(1500);
  await A.evaluate(()=> window.__hist.open()); for(let i=0;i<120;i++){ await sleep(250); if(await A.$('.hist-point')) break; }
  const off = await A.evaluate(()=> ({points: [...document.querySelectorAll('.hist-point')].map(b=> b.innerText.replace(/\s+/g,' ').trim()), tabs: document.querySelectorAll('.hist-tabs .mode-tab').length, older: (document.querySelector('.hist-older') || {}).textContent || ''}));
  console.log('offline:', JSON.stringify(off));
  ok(off.points.length === 2 && /This device/.test(off.points[0]) && /Before these changes/.test(off.points[1]) && off.tabs === 0 && /can't be reached/.test(off.older), 'offline, History lists only this device\'s unsynced change, and says the versions can\'t be reached');
  ok(await A.evaluate(()=> /Undo back to this/.test((document.getElementById('rbGo') || {}).textContent || '') && /only on this device so far/.test(document.querySelector('.rb-foot').innerText)), 'the button is Undo back to this, and the foot says it is only on this device');
  await A.evaluate(()=> document.getElementById('rbGo').click()); await sleep(1500);
  ok(!(await A.$('#historyPage')) && await trackName(A) === original, 'undone here: the track has its name back (' + await trackName(A) + ')');
  await A.setOfflineMode(false); await sync(A);

  // Settings → Shared library
  await A.evaluate(()=>{ window.__dbg4.settings(); window.__dbg4.section('shared'); }); await sleep(600);
  const s = await A.evaluate(()=>({hist: !!document.getElementById('shHistory'), more: !!document.getElementById('shMore'), moreOpen: document.getElementById('shMore') && document.getElementById('shMore').open, reviewInMore: !!document.querySelector('#shMore #shReviewMode'), log: !!document.querySelector('#shMore #shLog'), leaveOutside: !document.querySelector('#shMore #shLeave')}));
  ok(s.hist && s.more && !s.moreOpen && s.reviewInMore && s.log && s.leaveOutside, 'Shared library: History…, and More (closed) holding the switches and the log; Leave outside it');
  await A.evaluate(()=>{ window.__dbg4.section('backups'); }); await sleep(400);
  ok(await A.evaluate(()=> !!document.getElementById('bkHistoryBtn')), 'Backups has History… too');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
