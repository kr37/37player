// Stopping a folder import part-way: the stop dialog's playlist choice, and
// "Carry on importing". Fixture tests/www/stopimp (make-fixtures.sh):
// Set/A (3 tracks), Set/B (22), imported with "Make a playlist of each folder".
const puppeteer = require('puppeteer-core'); const path = require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0, stoppingShown = null; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const DIR = path.join(__dirname, 'www', 'stopimp', 'Set');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  const pick = async ()=>{
    const cdp = await p.target().createCDPSession();
    const {root} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#bulkFolderInput'});
    await cdp.send('DOM.setFileInputFiles', {nodeId, files: [DIR]});
    for(let i=0; i<120; i++){ await sleep(250); if(await p.$('#folderImportGo')) return true; }
    return false;
  };
  // Starts the import and presses Stop once the count reaches `after`.
  const startAndStop = async (after)=>{
    await p.click('#folderImportGo');
    for(let i=0; i<400; i++){ await sleep(50); const n = await p.evaluate(()=> +((document.getElementById('bulkImportStatus')?.textContent || '').match(/\d+/) || [0])[0]); if(n >= after) break; }
    // At once, before the file in hand finishes: the dialog and the bar say so.
    stoppingShown = await p.evaluate(()=>{ document.getElementById('bulkImportStop').click(); const btn = document.getElementById('bulkImportStop'); return [btn.disabled && /Stopping/.test(btn.textContent), /Stopping once this file is done/.test(document.getElementById('bulkImportStatus').textContent), /^Stopping…/.test(document.querySelector('#globalOperationBar span').textContent), !document.querySelector('#globalOperationBar button')]; });
    for(let i=0; i<200; i++){ await sleep(100); if(await p.$('#stopDone')) return true; }
    return false;
  };
  const finish = async ()=>{
    for(let i=0; i<400; i++){ await sleep(100); if(await p.evaluate(()=> /finished/i.test(document.querySelector('.modal h3')?.textContent || ''))) break; }
    const text = await p.evaluate(()=> document.querySelector('.modal').textContent);
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
    return text;
  };
  const shape = ()=> p.evaluate(()=>{
    const r = window.__dbg.getRoot();
    const set = r.tree.find(n=> n.kind==='folder' && n.name==='Set');
    return set ? set.children.map(n=> n.name + ':' + n.items.filter(i=> i.kind==='track').length + '+' + n.items.filter(i=> i.kind==='stop').length + 's').join(',') : '';
  });
  const reset = ()=> p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.splice(0, r.tree.length, ...r.tree.filter(n=> n.name!=='Set')); r.library.splice(0, r.library.length); await window.__dbg.saveState(); });

  ok(await pick(), 'review appears');
  ok(await startAndStop(5), 'Stop brings up the stop dialog');
  ok(stoppingShown.every(Boolean), 'Stop says "Stopping…" at once in the dialog and on the bar ' + JSON.stringify(stoppingShown));
  let txt = await p.evaluate(()=> document.querySelector('.modal').textContent);
  ok(/Stopped after \d+ of 25/.test(txt) && /1 of the 2 playlists have all their tracks/.test(txt), 'says how far, and 1 of 2 complete');
  ok(await p.evaluate(()=> document.querySelector('input[name="stopPlChoice"]:checked').value) === 'complete', 'B is mostly not imported: complete ones by default');
  await p.click('#stopDone');
  txt = await finish();
  ok(await shape() === 'A:3+0s', 'Done: only A made, complete (' + await shape() + ')');
  ok(/1 playlist left out/.test(txt), 'done dialog says 1 left out');

  await reset(); await pick();
  ok(await startAndStop(5), 'stopped again');
  await p.click('input[name="stopPlChoice"][value="all"]');
  await p.click('#stopDone');
  await finish();
  const s2 = await shape();
  ok(/^A:3\+0s,B:\d+\+\d+s$/.test(s2) && s2 !== 'A:3+0s', 'all: B made too, with Stops for what wasn\'t imported (' + s2 + ')');
  ok(await p.evaluate(()=> window.__dbg.getRoot().tree.find(n=> n.name==='Set').children.find(n=> n.name==='B').needsAttention === true), 'the partial B is flagged');

  await reset(); await pick();
  ok(await startAndStop(5), 'stopped a third time');
  await p.click('#stopCarryOn');
  ok(!!(await p.$('#bulkImportStatus')), 'Carry on brings the progress dialog back');
  txt = await finish();
  ok(await shape() === 'A:3+0s,B:22+0s', 'carried on to the end: both complete (' + await shape() + ')');
  ok(!/Stopped early/.test(txt), 'not reported as stopped early');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
