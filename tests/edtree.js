// Edit Playlists and Playing (1.4.130): the line under an open folder (one
// per open subfolder), and dragging an album from column C into column B.
//   node edtree.js        (needs only the http server of serve.sh)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', ...(process.env.CHROME_ARGS||'').split(' ').filter(Boolean)]});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$']){ await clickText(p,'.modal button',x); await sleep(300); }
  let id = null; for(let i = 0; i < 40 && !id; i++){ await sleep(250); id = await p.evaluate(()=> (window.__dbg.getRoot().library[0] || {}).id || null); }
  // Archive / Acoustic, Archive / Sub / Inner, and an empty playlist "Target" at the top
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); const a = r.tree[0]; a.children.push({id: 'subF', kind: 'folder', name: 'Sub', order: 1, children: [{id: 'innerP', kind: 'playlist', name: 'Inner', order: 0, items: []}]}); r.tree.push({id: 'targetP', kind: 'playlist', name: 'Target', order: 1, items: []}); await window.__dbg.saveState(); });
  // Playing: open Archive and Sub
  await p.reload({waitUntil: 'networkidle0'}); await sleep(800);
  for(const n of ['Sub']){ await clickText(p, '#rail .folder-head', n + '$'); await sleep(250); }
  const rail = await p.evaluate(()=> [...document.querySelectorAll('#rail .tree-line')].map(l=>{ const r = l.getBoundingClientRect(); const ic = l.closest('.tree-node').querySelector('.folder-head svg.icon').getBoundingClientRect(); return {x: Math.round(r.left), icon: Math.round(ic.left + ic.width / 2), h: Math.round(r.height)}; }));
  ok(rail.length === 2, 'Playing: one line per open folder: ' + JSON.stringify(rail));
  ok(rail.every(l=> Math.abs(l.x - l.icon) <= 1 && l.h > 10), 'each straight down from its folder\'s icon');
  await p.screenshot({path: 'shots/edtree-playing.png'});

  // Edit Playlists: Target in B, column C on Albums, the album dragged in
  await clickText(p, '.tab, button', '^Edit Playlists$'); await sleep(500);
  await clickText(p, '#editorColA .playlist-row', 'Target'); await sleep(300);
  for(const n of ['Archive']){ await clickText(p, '#editorColA .folder-head', n); await sleep(250); }
  ok(await p.evaluate(()=> document.querySelectorAll('#editorColA .tree-line').length) >= 1, 'Edit Playlists column A has the line too');
  await clickText(p, '.editor-tab', '^Albums$'); await sleep(300);
  const dropped = await p.evaluate(()=>{
    const row = [...document.querySelectorAll('#editorColCList .playlist-row')].find(r=> /Acoustic/.test(r.textContent));
    if(!row) return 'no album row';
    const dt = new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: dt}));
    const B = document.getElementById('editorColB');
    B.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: dt}));
    B.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}));
    row.dispatchEvent(new DragEvent('dragend', {bubbles: true, dataTransfer: dt}));
    return 'ok';
  });
  await sleep(400);
  const items = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); return r.tree.find(n=> n.id === 'targetP').items.map(i=> i.kind + ':' + i.refId); });
  ok(dropped === 'ok' && items.length === 1 && items[0] === 'track:' + id, 'dragging the album from column C into B adds its tracks: ' + dropped + ' ' + JSON.stringify(items));
  await p.screenshot({path: 'shots/edtree-edit.png'});
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
