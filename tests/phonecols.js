// On a phone (narrow screen), Edit Playlists' and Library's columns can be
// resized with a finger: the handle between two columns trades width between
// them, and the widths (shares of the screen) are kept for next time.
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage();
  await p.emulate({viewport:{width:412, height:900, deviceScaleFactor:2, isMobile:true, hasTouch:true}, userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  for(let k=0;k<8;k++){ const more = await p.evaluate(()=>{ if(!document.querySelector('.modal-backdrop').classList.contains('show')) return false; const btns=[...document.querySelectorAll('.modal button')].filter(e=>e.offsetParent); const b=btns.find(x=>/^(English|Start a library on this device|Skip for now|Finish|Not now|Later|OK|Close)$/i.test(x.textContent.trim()))||btns[btns.length-1]; b&&b.click(); return true; }); if(!more) break; await sleep(400); }
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(500);
  const widths = ()=> p.evaluate(()=> ['editorColA','editorColB'].map(id=> Math.round(document.getElementById(id).getBoundingClientRect().width)));
  const before = await widths();
  const h = await p.evaluate(()=>{ const el = document.getElementById('editorColA').nextElementSibling; const r = el.getBoundingClientRect(); return {vis: getComputedStyle(el).display !== 'none' && r.width > 0, x: r.left + r.width/2, y: r.top + 200}; });
  ok(h.vis, 'the handle between the first two columns shows on a phone');
  await p.touchscreen.touchStart(h.x, h.y);
  let snapDuring = '';
  for(let i = 1; i <= 6; i++){ await p.touchscreen.touchMove(h.x - i*10, h.y); await sleep(30); if(i === 3) snapDuring = await p.evaluate(()=> getComputedStyle(document.querySelector('.editor-screen')).scrollSnapType); }
  await p.touchscreen.touchEnd(); await sleep(400);
  const after = await widths();
  ok(snapDuring === 'none' && await p.evaluate(()=> getComputedStyle(document.querySelector('.editor-screen')).scrollSnapType) !== 'none', 'snapping is off while the finger is on the line, and back on after (' + snapDuring + ')');
  ok(after[0] < before[0] - 40, 'dragging it with a finger narrows the first column (' + before.join('/') + ' → ' + after.join('/') + ')');
  ok(Math.abs(after[1] - before[1]) <= 1, 'and only the first: the second keeps its width');
  { const hx = await p.evaluate(()=>{ const r = document.getElementById('editorColA').nextElementSibling.getBoundingClientRect(); return r.left + r.width/2; });
    await p.touchscreen.touchStart(hx, h.y); for(let i = 1; i <= 8; i++){ await p.touchscreen.touchMove(hx + i*25, h.y); await sleep(25); } await p.touchscreen.touchEnd(); await sleep(400);
    const wide = (await widths())[0];
    ok(Math.abs(wide - Math.round(412 * 0.9)) <= 2, 'and no wider than 90% of the screen, however far it is dragged (' + wide + ' of 412)');
    after[0] = wide; }
  // Column B, scrolled into place: its own right-hand line is on screen.
  const bLine = await p.evaluate(async ()=>{ const scr = document.querySelector('.editor-screen'), bEl = document.getElementById('editorColB'); scr.scrollLeft = bEl.offsetLeft; await new Promise(r=> setTimeout(r, 400)); const r = bEl.nextElementSibling.getBoundingClientRect(); return Math.round(r.left) + '–' + Math.round(r.right); });
  ok(parseInt(bLine) < 412, 'with column B in view, its own line is on screen to drag (' + bLine + ')');
  const saved = await p.evaluate(()=> JSON.stringify(window.__dbg.getRoot().settings.narrowColumnWidths || {}));
  ok(/editorColA/.test(saved), 'the share is saved (' + saved + ')');
  // Columns 3 and 4: each sized on its own (4 by a line after it), together wider than the screen.
  const dragLine = async (afterId, dx)=>{
    const pos = await p.evaluate(async (id)=>{ const scr = document.querySelector('.editor-screen'), el = document.getElementById(id); scr.scrollLeft = el.offsetLeft; await new Promise(r=> setTimeout(r, 400)); const r = el.nextElementSibling.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + 200, cls: el.nextElementSibling.className}; }, afterId);
    await p.touchscreen.touchStart(pos.x, pos.y);
    for(let i = 1; i <= 8; i++){ await p.touchscreen.touchMove(pos.x + dx*i/8, pos.y); await sleep(25); }
    await p.touchscreen.touchEnd(); await sleep(400);
    return pos;
  };
  const cd = ()=> p.evaluate(()=> ['editorColCWrap','editorColD'].map(id=> Math.round(document.getElementById(id).getBoundingClientRect().width)));
  const cd0 = await cd();
  await dragLine('editorColCWrap', -60);
  const cd1 = await cd();
  ok(cd1[0] < cd0[0] - 30 && Math.abs(cd1[1] - cd0[1]) <= 1, 'narrowing column 3 leaves column 4 as it was (' + cd0.join('/') + ' → ' + cd1.join('/') + ')');
  const lineD = await dragLine('editorColD', -80);
  const cd2 = await cd();
  ok(/narrow-only/.test(lineD.cls) && lineD.x < 412 && cd2[1] < cd1[1] - 40, 'column 4 has a line after it, on screen, and dragging it sizes column 4 (' + cd1[1] + ' → ' + cd2[1] + ')');
  await dragLine('editorColCWrap', 120);
  const cd3 = await cd();
  ok(cd3[0] + cd3[1] > 412 * 1.1, 'columns 3 and 4 can together be wider than the screen (' + cd3.join(' + ') + ' of 412)');
  await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(500);
  const again = await widths();
  ok(Math.abs(again[0] - after[0]) <= 2, 'and kept after a reload (' + again.join('/') + ')');
  // Landscape, Library: Artists | Albums, a set of shares of its own.
  await p.emulate({viewport:{width:860, height:400, deviceScaleFactor:2, isMobile:true, hasTouch:true}, userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'});
  await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(500);
  const lw = ()=> p.evaluate(()=> ['libColArtists','libColAlbums'].map(id=> Math.round(document.getElementById(id).getBoundingClientRect().width)));
  const lb = await lw();
  const lh = await p.evaluate(()=>{ const r = document.getElementById('libColArtists').nextElementSibling.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + 150}; });
  await p.touchscreen.touchStart(lh.x, lh.y);
  for(let i = 1; i <= 5; i++){ await p.touchscreen.touchMove(lh.x - i*10, lh.y); await sleep(30); }
  await p.touchscreen.touchEnd(); await sleep(400);
  const la = await lw();
  ok(la[0] <= lb[0] - 30 && Math.abs(la[1] - lb[1]) <= 1, 'landscape, Library: dragging left narrows Artists, Albums keeps its width (' + lb.join('/') + ' → ' + la.join('/') + ')');
  const saved2 = await p.evaluate(()=> window.__dbg.getRoot().settings.narrowColumnWidths || {});
  ok(saved2['900'] && saved2['900'].libColArtists && saved2['600'] && saved2['600'].editorColA, 'portrait and landscape keep their own shares (' + JSON.stringify(saved2) + ')');
  // Display → Reset column widths: every column back to where it started.
  await p.evaluate(()=> document.getElementById('resetColumnsBtn').click()); await sleep(300);
  const reset = await lw();
  ok(Math.abs(reset[0] - lb[0]) <= 2 && !(await p.evaluate(()=> window.__dbg.getRoot().settings.narrowColumnWidths)), 'Reset column widths puts them back and forgets the saved ones (' + la.join('/') + ' → ' + reset.join('/') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
