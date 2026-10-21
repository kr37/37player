// The move from player.37dakinis.net to 37player.com. At the old address
// (pretended here with window.__p37MovedTo), a browser that never used it is
// sent straight to the new one; one with a library stays, and is shown
// "37 Player has moved" in the top bar, which opens the way across for that
// library (nothing pops up by itself). Saved
// addresses (sync.php, the update check) follow the move.
//   node moved.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const OLD = {to: '37player.com', base: 'http://localhost:8861/landing'};
async function page(ctx, moved){
  const p = await ctx.newPage();
  await p.setViewport({width: 1200, height: 900});
  await p.evaluateOnNewDocument((o)=>{
    window.__noAutoConverter = true;
    if(o){ window.__p37MovedTo = o.to; window.__p37MovedBase = o.base; }
  }, moved || null);
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});

  // ---- A browser that never used the old address goes straight to the new one
  let ctx = await b.createBrowserContext();
  let p = await page(ctx, OLD);
  await p.goto(APP + '?x=1', {waitUntil: 'networkidle0'}).catch(()=>{}); await sleep(800);
  ok(p.url() === 'http://localhost:8861/landing/37-player.html?x=1', 'never used here: sent on to the new address, keeping the query (' + p.url() + ')');
  await ctx.close();

  // ---- A browser with a library at the old address stays
  ctx = await b.createBrowserContext();
  p = await page(ctx, null);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  await clickText(p, '.modal button', '^English$'); await sleep(400);
  await clickText(p, '.modal button', '^Start a library on this device$'); await sleep(300);
  await clickText(p, '.modal button', '^Skip for now$'); await sleep(300);
  await clickText(p, '.modal button', '^Finish$'); await sleep(300);
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__dbg.bulkImportFolder([new File([blob], 'ten.mp3', {type: 'audio/mpeg'})]); });
  for(let k = 0; k < 60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)) break; await sleep(150); }
  await p.evaluate(()=> document.querySelector('.modal button')?.click()); await sleep(300);
  // old addresses saved in settings
  await p.evaluate(async()=>{ const s = window.__dbg.getRoot().settings; s.sharedLastUrl = 'https://player.37dakinis.net/sync.php'; s.updateUrl = 'https://playertest.37dakinis.net/37-player.html'; s.librariesUrl = 'https://example.org/libraries/'; await window.__dbg.saveState(); });
  ok(!(await p.evaluate(()=> document.getElementById('btnMoved').offsetParent)), 'at the new address: no "has moved" in the top bar');
  let p2 = await page(ctx, OLD);
  await p.close();
  await p2.goto(APP, {waitUntil: 'networkidle0'}); await sleep(1200);
  ok(p2.url() === APP, 'used here: stays at the old address');
  const s = await p2.evaluate(()=> window.__dbg.getRoot().settings);
  ok(s.sharedLastUrl === 'https://37player.com/sync.php' && s.updateUrl === 'https://test.37player.com/37-player.html' && s.librariesUrl === 'https://example.org/libraries/', 'saved addresses follow the move: ' + [s.sharedLastUrl, s.updateUrl, s.librariesUrl].join(', '));
  ok(!(await modal(p2)), 'nothing pops up by itself: just the button in the top bar');
  ok(await p2.evaluate(()=> document.getElementById('btnMoved').textContent) === '37 Player has moved', 'the top bar says "37 Player has moved"');
  await p2.evaluate(()=> document.getElementById('btnMoved').click()); await sleep(400);
  let m = await modal(p2);
  ok(/37 Player has a new address/.test(m) && /37player\.com/.test(m), 'the button opens the "new address" notice');
  ok(/export it here/.test(m) && /Export…/.test(m) && !/join code/.test(m), 'a library of its own: export here, import there');
  ok(/change your bookmark to 37player\.com/.test(m) && !/Home Screen/.test(m), 'in a browser tab on a computer: change the bookmark (no Home Screen talk)');
  await p2.screenshot({path: 'shots/moved-notice.png'});
  await clickText(p2, '.modal button', '^Decide later$'); await sleep(400);
  // the top bar button opens it; Export… opens Import / Export
  await p2.evaluate(()=> document.getElementById('btnMoved').click()); await sleep(400);
  ok(/new address/.test(await modal(p2)), 'the top bar button opens it');
  await clickText(p2, '.modal button', '^Export…$'); await sleep(500);
  ok(/Import|Export/.test(await modal(p2)) && !/new address/.test(await modal(p2)), 'Export… opens Import / Export');
  await p2.close();
  p2 = await page(ctx, OLD);
  await p2.goto(APP, {waitUntil: 'networkidle0'}); await sleep(1200);
  // a shared library: join again with the code
  await p2.evaluate(()=> window.__moved.setShared({url: 'https://37player.com/sync.php', code: 'ikrc Death comes to us all', deviceName: 'Laptop'}));
  await p2.evaluate(()=>{ window.__moved.open(); }); await sleep(400);
  m = await modal(p2);
  ok(/nothing to carry over/.test(m) && /ikrc Death comes to us all/.test(m) && /In sync/.test(m) && !/Export…/.test(m), 'a shared library: join again with its code, once "In sync"');
  await clickText(p2, '.modal button', '^Decide later$'); await sleep(300);
  await p2.evaluate(()=> window.__moved.setShared({kind: 'gdrive', url: 'gdrive', code: 'gdrive abc', libraryName: 'IKRC Library'}));
  await p2.evaluate(()=>{ window.__moved.open(); }); await sleep(400);
  m = await modal(p2);
  ok(/Google Drive/.test(m) && /IKRC Library/.test(m) && !/gdrive abc/.test(m), 'on Google Drive: choose Google Drive and pick the library');
  await clickText(p2, '.modal button', '^Decide later$'); await sleep(300);
  await p2.evaluate(()=> window.__moved.setShared(null));
  // addresses
  const a = await p2.evaluate(()=> ['https://player.37dakinis.net/sync.php', 'https://PLAYER.37dakinis.net', 'https://playertest.37dakinis.net/token.php?op=status', 'https://myplayer.37dakinis.net/x', 'https://player.37dakinis.net.evil.com/'].map(window.__moved.newAddress));
  ok(a[0] === 'https://37player.com/sync.php' && a[1] === 'https://37player.com' && a[2] === 'https://test.37player.com/token.php?op=status' && a[3] === 'https://myplayer.37dakinis.net/x' && a[4] === 'https://player.37dakinis.net.evil.com/', 'only the two old names are rewritten: ' + a.join(' | '));
  await ctx.close();
  await b.close();
  console.log(fails ? 'FAILED: ' + fails : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
