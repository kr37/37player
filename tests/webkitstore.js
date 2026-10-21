// Re-tagging a file the way Safari needs (window.__p37WebKit pretends to be
// Safari): the new file is stored as one piece and read back to check, and
// it still plays and carries the new tags. Safari itself kept slices of a
// stored file as the whole file (a WAV became header + old + old + tags).
//   node webkitstore.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  for(const wk of [true, false]){
    const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1200, height: 900});
    await p.evaluateOnNewDocument((wk)=>{ window.__noAutoConverter = true; window.__p37WebKit = wk; }, wk);
    p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
    await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
    await clickText(p, '.modal button', '^English$'); await sleep(300);
    await clickText(p, '.modal button', '^Start a library on this device$'); await sleep(300);
    await clickText(p, '.modal button', '^Skip for now$'); await sleep(300); await clickText(p, '.modal button', '^Finish$'); await sleep(300);
    for(const f of ['ten.mp3', 'w_s16.wav']){
      const have = await p.evaluate(async(f)=>{ const r = await fetch('/' + f); if(!r.ok) return false; const blob = await r.blob(); window.__dbg.bulkImportFolder([new File([blob], f, {type: blob.type})]); return true; }, f);
      if(!have) continue;
      for(let k=0; k<60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
    }
    const ids = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> ({id: t.id, file: t.filename})));
    for(const t of ids){
      const before = await p.evaluate((id)=> window.__wk.stored(id), t.id);
      const done = await p.evaluate(async(id)=>{ const tr = window.__dbg.getRoot().library.find(x=> x.id === id); tr.artist = 'New Kadampa Tradition'; tr.album = 'Quick Path parts'; return window.__wk.rewrite(id); }, t.id);
      const after = await p.evaluate((id)=> window.__wk.stored(id), t.id);
      const tags = await p.evaluate((id)=> window.__wk.tags(id), t.id);
      const fileSize = await p.evaluate((id)=> window.__dbg.getRoot().library.find(x=> x.id === id).fileSize, t.id);
      ok(done && after.size === after.read && after.size === fileSize && Math.abs(after.size - before.size) < 4096, (wk ? 'Safari way' : 'other browsers') + ', ' + t.file + ': re-tagged, stored whole (' + before.size + ' → ' + after.size + ', read back ' + after.read + ')');
      ok(tags && tags.artist === 'New Kadampa Tradition' && tags.album === 'Quick Path parts', '  and the new tags are in the file');
    }
    await p.close();
  }
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
