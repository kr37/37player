// Deleting in a playlist on Edit Playlists (2.5.040): after Backspace or
// Delete, the item that took the deleted one's place is selected, or the
// one above when it was last, so stops can be deleted one after another.
//   node editdel.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^No, just start$']){ await clickText(p, '.modal button', x); await sleep(300); }
  let id = null; for(let i = 0; i < 40 && !id; i++){ await sleep(250); id = await p.evaluate(()=> (window.__dbg.getRoot().library[0] || {}).id || null); }
  await p.evaluate(async(id)=>{
    const r = window.__dbg.getRoot();
    r.tree.push({id: 'delP', kind: 'playlist', name: 'Deleting', order: -1, items: [
      {id: 'a', kind: 'track', refId: id, order: 1}, {id: 's1', kind: 'stop', order: 2}, {id: 'b', kind: 'track', refId: id, order: 3},
      {id: 's2', kind: 'stop', order: 4}, {id: 'c', kind: 'track', refId: id, order: 5}, {id: 's3', kind: 'stop', order: 6}]});
    await window.__dbg.saveState();
  }, id);
  await p.reload({waitUntil: 'networkidle0'}); await sleep(800);
  await clickText(p, '.tab, button', '^Edit Playlists$'); await sleep(500);
  await clickText(p, '#editorColA .playlist-row', 'Deleting'); await sleep(400);
  const rows = ()=> p.evaluate(()=> [...document.querySelectorAll('#editorColB [data-id]')].map(r=> r.dataset.id + (r.classList.contains('selected') ? '*' : '')).join(' '));
  const del = async(id)=>{ await p.click(`#editorColB [data-id="${id}"]`); await sleep(250); await p.keyboard.press('Backspace'); await sleep(400); return rows(); };
  let r = await del('s1');
  ok(r === 'a b* s2 c s3', 'a stop deleted: the track below it is selected (' + r + ')');
  await p.keyboard.press('ArrowDown'); await sleep(250); await p.keyboard.press('Delete'); await sleep(400); r = await rows();
  ok(r === 'a b c* s3', 'down to the next stop and Delete: the one below again (' + r + ')');
  r = await del('s3');
  ok(r === 'a b c*', 'the last one deleted: the one above it is selected (' + r + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
