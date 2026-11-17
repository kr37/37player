// Importing a file that's already in the library (2.5.037: compared a piece
// at a time, stopping at the first difference, instead of hashing both whole):
// the very same file is recognised and not imported again; a file of the
// same size differing only in its last byte, or in its first, is imported.
//   node samefile.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const BYTES = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3'));
const lastByte = Buffer.from(BYTES); lastByte[lastByte.length - 1] ^= 0xFF;
const firstByte = Buffer.from(BYTES); firstByte[200] ^= 0xFF; // inside the ID3 tag's padding or text: still the same size

const importFiles = async (p, list)=>{
  await p.evaluate((list)=>{ window.__dbg.bulkImportFolder(list.map(([name, b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=> c.charCodeAt(0))], name, {type: 'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; })); }, list);
  let review = '';
  for(let i = 0; i < 80; i++){ await sleep(250); if(await p.$('#folderImportGo')){ review = await p.evaluate(()=> document.querySelector('.modal')?.innerText || ''); break; } }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i = 0; i < 80; i++){ await sleep(250); if(await p.evaluate(()=> !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=> b.click())); await sleep(500);
  return review;
};

(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await importFiles(p, [['one.mp3', BYTES.toString('base64')]]);
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === 1, 'the first import: one track');
  const review = await importFiles(p, [['again.mp3', BYTES.toString('base64')], ['last.mp3', lastByte.toString('base64')], ['first.mp3', firstByte.toString('base64')]]);
  ok(/1 file is already in your library — the very same file/.test(review), 'the very same file is recognised (' + review.split('\n').filter(l=> /same|import/i.test(l)).slice(0, 2).join(' / ') + ')');
  const names = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.filename || t.name).sort().join(', '));
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === 3, 'the two of the same size that differ by one byte are imported (' + names + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
