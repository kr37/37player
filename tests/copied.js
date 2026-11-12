// A joined library opened by another install of 37 Player (2.2.021; the
// plan's item 3): a library folder copied to another device carries its join
// and device name with it. Simulated here by giving the browser another
// install ID (localStorage "37player.install") and reloading.
//  - joining records this install; the copy doesn't sync, and asks first;
//  - "Another device" needs a name, not empty and not the old one; then it
//    syncs under that name;
//  - "This is still …" adds the install and syncs under the same name;
//  - closed unanswered: Settings says so, and Sync now asks again;
//  - a join from before 2.2.021 (no list) is taken as this install's.
//   node copied.js <code>      (needs both servers from serve.sh)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const b64 = f=> fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitModal = async (p, re, ms)=>{ for(let i=0; i<(ms||15000)/200; i++){ const t = await modal(p); if(re.test(t)) return t; await sleep(200); } return await modal(p); };
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const cfg = p=> p.evaluate(()=>{ const c = window.__dbg.getRoot().settings.sharedLibrary || {}; return {name: c.deviceName, installs: c.installs || null, synced: window.__dbg3.status().lastSyncAt || 0}; });
const setName = (p, v)=> p.evaluate((v)=>{ const i = document.getElementById('sdName'); i.value = v; i.dispatchEvent(new Event('input')); }, v);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  const alerts = []; p.on('dialog', async d=>{ alerts.push(d.message()); await d.accept(); });
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a)=>{ const f = new File([Uint8Array.from(atob(a), x=>x.charCodeAt(0))], 'tone.mp3', {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/tone.mp3'}); window.__dbg.bulkImportFolder([f]); }, b64('tone.mp3'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 1 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1000); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()));
  await p.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(p);
  const mine = await p.evaluate(()=> localStorage.getItem('37player.install'));
  let c = await cfg(p);
  ok(c.name === 'Laptop' && mine && JSON.stringify(c.installs) === JSON.stringify([mine]), 'joining records this install (' + JSON.stringify(c) + ')');

  // Opened by another install: no sync, a question.
  const reopen = async (install)=>{ await p.evaluate((i)=> localStorage.setItem('37player.install', i), install); await p.reload({waitUntil: 'networkidle0'}); await sleep(800); };
  await reopen('other-install');
  let m = await waitModal(p, /Is this another device/);
  ok(/Is this another device/.test(m) && /as “Laptop”/.test(m) && /This is still “Laptop”/.test(m), 'another install: asks whether this is another device (' + m.slice(0, 160).replace(/\n/g, ' | ') + ')');
  c = await cfg(p);
  ok(!c.synced, 'and hasn\'t synced meanwhile');
  await setName(p, ''); await clickText(p, '.modal button', '^Another device');
  m = await waitModal(p, /Type a name/, 4000);
  ok(/Type a name for this device/.test(m), 'an empty name isn\'t taken');
  await setName(p, 'laptop'); await clickText(p, '.modal button', '^Another device');
  m = await waitModal(p, /Type a name/, 4000);
  ok(/Type a name for this device/.test(m) && !(await cfg(p)).synced, 'nor the old one (any capitals), and still no sync');
  await setName(p, 'Desk copy'); await clickText(p, '.modal button', '^Another device');
  await sleep(1500); await waitIdle(p);
  c = await cfg(p);
  ok(c.name === 'Desk copy' && JSON.stringify(c.installs) === JSON.stringify(['other-install']) && c.synced > 0, 'a new name: this install alone, and it syncs (' + JSON.stringify(c) + ')');

  // The same device, from another install (another browser, the data cleared).
  await reopen('third-install');
  m = await waitModal(p, /Is this another device/);
  await clickText(p, '.modal button', '^This is still “Desk copy”');
  await sleep(1500); await waitIdle(p);
  c = await cfg(p);
  ok(c.name === 'Desk copy' && JSON.stringify(c.installs) === JSON.stringify(['other-install', 'third-install']) && c.synced > 0, '"This is still": the install is added, same name, it syncs (' + JSON.stringify(c) + ')');
  await reopen('other-install');
  await sleep(3500);
  ok(!/Is this another device/.test(await modal(p)), 'and neither install is asked again');

  // Closed unanswered.
  await reopen('fifth-install');
  await waitModal(p, /Is this another device/);
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click() || document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  await sleep(800);
  ok(!(await modal(p)), 'the question can be closed');
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300);
  await p.evaluate(()=> window.__dbg4.section('shared')); await sleep(1000);
  const st = await p.evaluate(()=> document.getElementById('shStatus')?.textContent || '');
  ok(/Not syncing until you say which device this is/.test(st) && !(await cfg(p)).synced, 'Settings says it isn\'t syncing, and why (' + st + ')');
  await p.evaluate(()=> document.getElementById('shSyncNow').click());
  m = await waitModal(p, /Is this another device/, 6000);
  ok(/Is this another device/.test(m), 'Sync now asks again');
  await clickText(p, '.modal button', '^This is still');
  await sleep(1500); await waitIdle(p);

  // A join from before 2.2.021: no list. Taken as this install's, no question.
  await p.evaluate(async()=>{ delete window.__dbg.getRoot().settings.sharedLibrary.installs; await window.__dbg.saveState(); });
  await reopen('sixth-install');
  await sleep(4000);
  c = await cfg(p);
  ok(!/Is this another device/.test(await modal(p)) && JSON.stringify(c.installs) === JSON.stringify(['sixth-install']) && c.synced > 0, 'a join from before: taken as this install\'s, and it syncs (' + JSON.stringify(c) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
