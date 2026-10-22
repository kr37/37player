// Playlists whose audio isn't all in the folder: the review's choice of all /
// only complete / none. Fixture tests/www/plmiss (make-fixtures.sh):
// Good (2 of 2 found), Mostly (2 of 3), Old (1 of 4).
const puppeteer = require('puppeteer-core'); const path = require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const DIR = path.join(__dirname, 'www', 'plmiss', 'Set');
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
    for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) return true; }
    return false;
  };
  const go = async ()=>{
    await p.click('#folderImportGo');
    for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> /finished/i.test(document.querySelector('.modal h3')?.textContent || ''))) break; }
    const text = await p.evaluate(()=> document.querySelector('.modal').textContent);
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
    return text;
  };
  const playlists = ()=> p.evaluate(()=> window.__dbg.getRoot().tree.filter(n=> n.kind==='playlist').map(n=> n.name).sort().join(','));
  const reset = ()=> p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.splice(0, r.tree.length, ...r.tree.filter(n=> n.kind!=='playlist')); await window.__dbg.saveState(); });
  const choice = ()=> p.evaluate(()=> document.querySelector('input[name="reviewPlChoice"]:checked')?.value);

  ok(await pick(), 'review appears');
  ok(await choice() === 'complete', 'Old is mostly missing, so only complete ones by default (got ' + await choice() + ')');
  ok(/2 of the 3 playlists/.test(await p.evaluate(()=> document.querySelector('.review-pl-choice').textContent)), 'says 2 of 3 are missing audio');
  let done = await go();
  ok(await playlists() === 'Good', 'only Good imported');
  ok(/2 playlists left out/.test(done), 'done dialog says 2 left out');

  await reset(); await pick();
  await p.click('input[name="reviewPlChoice"][value="all"]'); await sleep(200);
  await go();
  ok(await playlists() === 'Good,Mostly,Old', 'all: three imported');

  await reset(); await pick();
  await p.click('input[name="reviewPlChoice"][value="none"]'); await sleep(200);
  ok(await p.evaluate(()=>{ const l = document.getElementById('reviewOnlyUsedLabel'); return !l || l.style.display === 'none'; }), 'none: "only tracks in playlists" hidden');
  await go();
  ok(await playlists() === '', 'none: no playlists');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.filter(t=> /^(one|two|three)$/.test(t.name)).length) >= 3, 'the audio still came in');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
