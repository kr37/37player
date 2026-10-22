// A shared library is a joined device's backup: the welcome asks about
// sharing first and a device that joins gets no backup advice; "Back up
// library" goes away once everything is in the shared library; the devices
// see who keeps backups; restoring on a joined device takes the shared
// library again rather than bringing back what was deleted; a backup of a
// shared library points to joining it.
//   node share.js CODE
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const waitFor = async (p, fn, ms, arg)=>{ for(let k=0; k<ms/200; k++){ if(await p.evaluate(fn, arg)) return true; await sleep(200); } return false; };
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return; await sleep(200); } };
const tree = p=> p.evaluate(()=> window.__dbg.getRoot().tree.map(n=> n.name).join('|'));
async function open(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1200, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name, 'ALERT:', d.message()); d.dismiss(); });
  await p.setRequestInterception(true); p.on('request', r=> r.url().startsWith('http://localhost') || r.url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  await clickText(p, '.modal button', '^English$'); await sleep(500);
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});
  // ---- A: starts its own library, then joins (the first device)
  const A = await open(b, 'A');
  let m = await modal(A);
  ok(/share a library with other devices\?/.test(m) && /Start a library on this device/.test(m) && /Join a shared library/.test(m), 'the welcome asks about sharing first');
  await A.screenshot({path: 'shots/share-welcome.png'});
  await clickText(A, '.modal button', '^Start a library on this device$'); await sleep(300);
  ok(/First, a backup folder/.test(await modal(A)), 'starting here goes on to the backup folder');
  await clickText(A, '.modal button', '^Skip for now$'); await sleep(300); await clickText(A, '.modal button', '^Finish$'); await sleep(300);
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__dbg.bulkImportFolder([new File([blob], 'ten.mp3', {type: 'audio/mpeg'})]); });
  for(let k=0; k<60; k++){ const h = await A.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(A, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); const id = r.library[0].id; r.tree.push({id:'p1', kind:'playlist', name:'Morning', order:0, items:[{id:'i1', kind:'track', refId:id, order:0}]}, {id:'p2', kind:'playlist', name:'Evening', order:1, items:[]}); await window.__dbg.saveState(); });
  ok(await A.evaluate(()=> window.__share.label()) === 'Back up library', 'unshared, with a track: "Back up library"');
  ok(await A.evaluate(()=> window.__share.prompt()), 'and the reminder on leaving Edit');
  await A.evaluate((c,u)=> window.__dbg3.join(u, c, 'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  ok(await waitFor(A, ()=> window.__share.covered(), 15000), 'joined and sent: everything is in the shared library');
  ok(await A.evaluate(()=> window.__share.label()) === 'In sync', 'the button says "In sync": ' + await A.evaluate(()=> window.__share.label()));
  ok(!(await A.evaluate(()=> window.__share.prompt())), 'and there\'s no reminder on leaving Edit');
  await A.evaluate(()=> window.__share.noteKept()); await A.evaluate(()=> window.__dbg3.sync()); await waitIdle(A);

  // ---- B: joins from the welcome
  const B = await open(b, 'B');
  await clickText(B, '.modal button', '^Join a shared library$'); await sleep(300);
  m = await modal(B);
  ok(/Join code/.test(m), 'Join a shared library asks for the code in the welcome');
  await B.evaluate((c, u)=>{ document.getElementById('swCode').value = c; document.getElementById('swDevice').value = 'iPad'; document.getElementById('swUrl').value = u; }, CODE, URL_SYNC);
  await B.screenshot({path: 'shots/share-join.png'});
  await B.evaluate(()=> document.getElementById('swJoin').click());
  for(let k=0; k<30; k++){ if(await clickText(B, '.modal button', '^Use the shared library here')) break; if(await clickText(B, '.modal button', '^Join$')) break; await sleep(250); }
  await sleep(500); await waitIdle(B);
  m = await modal(B);
  ok(/Keep backups on this computer too\?/.test(m), 'a computer that can keep a folder is offered one, as optional');
  await clickText(B, '.modal button', '^Skip for now$'); await sleep(300);
  ok(await B.evaluate(()=> window.__share.setup()), 'setup is done, with no backup advice');
  ok(/Morning/.test(await tree(B)) && await B.evaluate(()=> window.__dbg.getRoot().library.length) === 1, 'B has the shared library: ' + await tree(B));
  ok(await waitFor(B, ()=> window.__share.covered(), 15000), 'B: everything is in the shared library');
  const lines = await B.evaluate(()=> window.__share.keeperLines());
  ok(lines.length === 1 && /Backed up by Laptop, today/.test(lines[0]), 'B sees who keeps backups: ' + lines.join(' / '));
  ok(/Backed up by Laptop/.test(await B.evaluate(()=> document.getElementById('btnBackup').title)), 'and says so on the button');
  // tapping "In sync": the backup dialog opens with "Up to date"
  await B.evaluate(()=> document.getElementById('btnBackup').click()); await sleep(400);
  m = await modal(B);
  ok(/^Up to date/.test(m) && /in sync with the shared library “Test”/.test(m) && /Back up library/.test(m), 'tapping it opens with "Up to date", then the backup choices');
  await B.screenshot({path: 'shots/share-uptodate.png'});
  await clickText(B, '.modal button', '^Cancel$'); await sleep(300);
  // Import / Export points to the shared library, not server libraries
  await B.evaluate(()=> openImportExportForTest()); await sleep(300);
  m = await modal(B);
  ok(/Shared library/.test(m) && !/Server libraries/.test(m), 'Import / Export offers Shared library, not Server libraries');
  await B.evaluate(()=> document.getElementById('ieShared').click()); await sleep(700);
  ok(await B.evaluate(()=> !!document.getElementById('shStatus')), 'and it opens Settings → Shared library');
  ok(await B.evaluate(()=> !!document.querySelector(".sh-status-row #shSyncNow")), 'Sync now sits beside Last checked');
  const nav = await B.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].map(e=> e.textContent).join(' | '));
  ok(nav === 'Library info | Shared library | Switch libraries | Playback | Library cleanup | File format | Backups | PIN | All settings | About', 'Settings in the new order: ' + nav);
  await B.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> e.textContent === 'Library info').click()); await sleep(600);
  const info = await B.evaluate(()=> ({lib: document.getElementById('infoLibrary')?.textContent, sh: document.getElementById('infoShared')?.textContent}));
  ok(info.lib && /“Test”, on 127\.0\.0\.1:8870/.test(info.sh || ''), 'Library info names the library and where it\'s shared: ' + JSON.stringify(info));
  await B.evaluate(()=> document.getElementById('settingsClose').click()); await sleep(300);
  // an edit on B: no backup reminder while it's on its way
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree[0].name = 'Morning prayers'; await window.__dbg.saveState(); });
  ok(!(await B.evaluate(()=> window.__share.prompt())), 'an edit on a joined device doesn\'t ask for a backup');
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
  ok(await waitFor(B, ()=> window.__share.covered(), 15000), 'and once it\'s sent, it\'s covered again');
  // B deletes Evening; A hasn't heard yet
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = r.tree.filter(n=> n.name !== 'Evening'); await window.__dbg.saveState(); });
  await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);

  // ---- restoring on a joined device
  const oldMeta = await A.evaluate(()=> window.__share.meta());
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pA', kind:'playlist', name:'Only on A', order:9, items:[]}); await window.__dbg.saveState(); });
  ok(oldMeta.sharedFrom && oldMeta.sharedFrom.name === 'Test' && !JSON.stringify(oldMeta).includes(CODE.split(' ')[1]), 'a backup says which shared library it\'s from, without the join code');
  await A.evaluate((m)=>{ window.__share.offer(m); }, oldMeta); await sleep(400);
  m = await modal(A);
  ok(/This library is shared/.test(m) && /Get the current shared library/.test(m), 'restoring on a joined device offers the current shared library first');
  ok(/aren't in the shared library yet, and would be removed from this device/.test(m), 'and warns that what\'s only here would go');
  await A.screenshot({path: 'shots/share-restore.png'});
  await clickText(A, '.modal button', '^Get the current shared library$');
  for(let k=0; k<30; k++){ if(await clickText(A, '.modal button', '^Join$')) break; await sleep(250); }
  await sleep(500); await waitIdle(A);
  ok(await A.evaluate(()=> !!window.__dbg.getRoot().settings.sharedLibrary), 'A is in the shared library again');
  ok(await tree(A) === 'Morning prayers', 'with the current library: B\'s rename, and Evening stays deleted (' + await tree(A) + ')');
  await waitIdle(B); await B.evaluate(()=> window.__dbg3.sync()); await waitIdle(B);
  ok(await tree(B) === 'Morning prayers', 'and nothing came back for B either');

  // ---- D joins from the welcome with partial sync ticked
  const D = await open(b, 'D');
  await clickText(D, '.modal button', '^Join a shared library$'); await sleep(300);
  m = await modal(D);
  ok(/Bring only the playlists I choose/.test(m) && /next step says how much will travel/.test(m), 'partial sync can be chosen with the join code, and the next step is promised');
  await D.evaluate((c, u)=>{ document.getElementById('swCode').value = c; document.getElementById('swDevice').value = 'Phone'; document.getElementById('swUrl').value = u; document.getElementById('swPartial').checked = true; document.getElementById('swJoin').click(); }, CODE, URL_SYNC);
  await waitFor(D, ()=> /Only what I choose/.test(document.querySelector('.modal')?.innerText || ''), 10000);
  const first = await D.evaluate(()=> { const b = document.querySelector('.modal .btn.primary'); return b ? b.textContent : ''; });
  ok(first === 'Only what I choose', 'ticked, the next step leads with Only what I choose: ' + first);
  await D.screenshot({path: 'shots/share-partial.png'});
  await clickText(D, '.modal button', '^Only what I choose$'); await sleep(800); await waitIdle(D);
  ok(await D.evaluate(()=> !!(window.__dbg.getRoot().settings.sharedLibrary || {}).partial), 'D joined with partial sync');
  // a track the server has comes "from the shared library", not from a device
  const note = await D.evaluate(()=> window.__share.missingNote());
  ok(/on its way from the shared library/.test(note) && !/Laptop/.test(note), 'a file on the server is "on its way from the shared library": ' + note);

  // ---- a backup of a shared library, restored on a fresh device
  const C = await open(b, 'C');
  await C.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await C.evaluate(()=>{ const bd = document.getElementById('modalBackdrop'); if(bd.classList.contains('show')) [...document.querySelectorAll('.modal button')].pop()?.click(); }); await sleep(300);
  await C.evaluate((m)=>{ window.__share.offer(m); }, oldMeta); await sleep(400);
  m = await modal(C);
  ok(/This backup is of a shared library/.test(m) && /“Test”/.test(m) && /Join the shared library instead/.test(m), 'a backup of a shared library points to joining it');
  await clickText(C, '.modal button', '^Join the shared library instead$'); await sleep(600);
  ok(await C.evaluate(()=> !!document.getElementById('shCode')), 'and "Join instead" opens Settings → Shared library');

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
