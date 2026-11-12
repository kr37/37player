// Dialogs that open by themselves wait their turn (2.2.028; Gen Rinzin:
// "Import finished" replaced the dialog he was working in). A folder import
// runs while the person opens a dialog of their own: it's neither replaced
// nor closed when the import ends; the status bar says the summary is
// waiting; closing the dialog brings the summary. Without another dialog,
// the summary takes the place of the import's own progress dialog at once.
//   node dialogq.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const short = s=> (s || '').replace(/\n+/g, ' | ').slice(0, 140);
const startImport = async (p, n, from = 0)=>{
  await p.evaluate(async(n, from)=>{ const big = await (await fetch('/ten.mp3')).blob(); const files = []; for(let i = from; i < from + n; i++){ const f = new File([big, new Uint8Array([i])], 'long ' + i + '.mp3', {type: 'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/long ' + i + '.mp3'}); files.push(f); } window.__dbg.bulkImportFolder(files); }, n, from);
  for(let i=0; i<80; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
};
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());

  // 1. A dialog of the person's own opened while the import runs.
  await startImport(p, 4);
  await p.evaluate(()=>{ document.getElementById('folderImportGo').click(); setTimeout(()=> window.openImportExportForTest(), 300); });
  await sleep(800);
  let m = await modal(p);
  ok(/Import/.test(m) && /Export/.test(m) && !/Importing/.test(m), 'the person\'s own dialog (Import / Export) is open over the import (' + short(m) + ')');
  for(let i=0; i<160; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 4)) break; }
  await sleep(1500);
  m = await modal(p);
  const bar = await p.evaluate(()=> document.getElementById('globalOperationBar')?.innerText || '');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === 4, 'the import finished underneath');
  ok(/Export/.test(m) && !/Import finished/.test(m), 'the dialog is still there: neither replaced nor closed (' + short(m) + ')');
  ok(/Import finished: waiting until the open dialog is closed/.test(bar), 'the status bar says the summary is waiting (' + short(bar) + ')');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click() || document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  let shown = '';
  for(let i=0; i<20; i++){ await sleep(200); shown = await modal(p); if(/Import finished/.test(shown)) break; }
  ok(/Import finished/.test(shown) && /4 tracks added/.test(shown), 'closing it brings the summary (' + short(shown) + ')');
  ok(!/waiting until/.test(await p.evaluate(()=> document.getElementById('globalOperationBar')?.innerText || '')), 'and the status bar no longer says it\'s waiting');
  await clickText(p, '.modal button', '^OK$'); await sleep(400);

  // 2. No other dialog: the summary takes the progress dialog's place at once.
  await startImport(p, 1, 10);
  await p.evaluate(()=> document.getElementById('folderImportGo').click());
  let seenGap = false, sum = '';
  for(let i=0; i<160; i++){
    await sleep(100);
    const t = await modal(p);
    if(!t && await p.evaluate(()=> window.__dbg.getRoot().library.length >= 5)) seenGap = true;
    if(/Import finished/.test(t)){ sum = t; break; }
  }
  ok(/Import finished/.test(sum) && /1 track added/.test(sum) && !seenGap, 'on its own, the summary replaces the import\'s progress dialog straight away (' + short(sum) + ')');
  await clickText(p, '.modal button', '^OK$');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
