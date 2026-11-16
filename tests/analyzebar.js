// A folder import's first step, looking through the folder, can be clicked
// away (2.2.037; Gen Rinzin: on a big folder of near-duplicates it was easy
// to dismiss and seemed lost, then the review turned up many minutes later).
// Clicked away, it goes on in the status bar ("Checking what to import:
// n of N…"); clicking the bar brings the dialog back, live; when it's done,
// the review waits for a dialog opened meanwhile to close (it used to close
// that dialog). Stop, in the dialog or the bar, ends it with nothing
// imported. Fixture tests/www/stopimp (make-fixtures.sh): 25 tracks.
//   node analyzebar.js
const puppeteer = require('puppeteer-core'); const path = require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const DIR = path.join(__dirname, 'www', 'stopimp', 'Set');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  await p.evaluate(()=>{ window.__p37SlowAnalyze = 120; });
  const pick = async ()=>{
    const cdp = await p.target().createCDPSession();
    const {root} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#bulkFolderInput'});
    await cdp.send('DOM.setFileInputFiles', {nodeId, files: [DIR]});
    for(let i=0; i<80; i++){ await sleep(100); if(await p.$('#analyzingFolderFile')) return true; }
    return false;
  };
  const bar = ()=> p.evaluate(()=>{ const b = document.getElementById('globalOperationBar'); return b && b.style.display !== 'none' ? b.textContent : ''; });
  const modal = ()=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');

  // 1. Clicked away: it goes on in the bar, and the bar brings it back.
  ok(await pick(), 'the folder import starts by looking through the folder');
  await sleep(500);
  await p.keyboard.press('Escape'); await sleep(400);
  const away = {modal: await modal(), bar: await bar()};
  ok(!/Analyzing folder/.test(away.modal) && /Checking what to import: \d+ of 25/.test(away.bar), 'clicked away, it goes on in the status bar (' + away.bar + ')');
  await sleep(600);
  await p.evaluate(()=> document.getElementById('globalOperationBar').click()); await sleep(300);
  const back = await modal();
  ok(/Analyzing folder/.test(back) && /Checked \d+ of 25/.test(back), 'clicking the bar brings the dialog back, still counting (' + back.replace(/\n/g, ' | ').slice(0, 90) + ')');

  // 2. Clicked away again, with a dialog of the person's own opened meanwhile (Import / Export):
  // when the looking through is done, that dialog stays; the review waits for it to close.
  await p.keyboard.press('Escape'); await sleep(200);
  await p.evaluate(()=> window.openImportExportForTest()); await sleep(300);
  ok(/Export/.test(await modal()), 'a dialog of the person\'s own is open (Import / Export)');
  for(let i=0; i<80; i++){ await sleep(150); if(!/Checking what to import/.test(await bar())) break; }
  await sleep(1200);
  const during = await modal(), waiting = await bar();
  ok(/Export/.test(during) && !/Review before importing/i.test(during), 'done meanwhile: that dialog is still there, not closed or replaced (' + during.replace(/\n/g, ' | ').slice(0, 60) + ')');
  ok(/waiting until the open dialog is closed/i.test(waiting), 'and the bar says the review is waiting (' + waiting + ')');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200);
  let review = '';
  for(let i=0; i<40; i++){ await sleep(150); review = await modal(); if(/Review before importing/i.test(review)) break; }
  ok(/Review before importing/i.test(review) && /25/.test(review), 'once it closes, the review comes (' + review.replace(/\n/g, ' | ').slice(0, 80) + ')');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(400);

  // 3. Stop from the bar: nothing imported, no review.
  const before = await p.evaluate(()=> window.__dbg.getRoot().library.length);
  ok(await pick(), 'started again');
  await sleep(400);
  await p.keyboard.press('Escape'); await sleep(300);
  await p.evaluate(()=> document.querySelector('#globalOperationBar .op-part button')?.click());
  await sleep(2500);
  const after = {n: await p.evaluate(()=> window.__dbg.getRoot().library.length), modal: await modal(), bar: await bar()};
  ok(after.n === before && !/Review before importing/i.test(after.modal) && !/Checking what to import/.test(after.bar), 'Stop in the bar ends it: nothing imported, no review, gone from the bar (' + JSON.stringify(after).slice(0, 120) + ')');

  // 4. Stop in the dialog.
  ok(await pick(), 'started a third time');
  await sleep(400);
  await p.evaluate(()=> document.getElementById('analyzingFolderStop').click());
  await sleep(2500);
  const after2 = {n: await p.evaluate(()=> window.__dbg.getRoot().library.length), modal: await modal(), bar: await bar()};
  ok(after2.n === before && !/Analyzing folder|Review before importing/i.test(after2.modal) && !/Checking what to import/.test(after2.bar), 'Stop in the dialog does the same (' + JSON.stringify(after2).slice(0, 120) + ')');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
