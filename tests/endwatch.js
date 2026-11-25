// An unexpected end noticed at the next start (2.7.015; the audit's fix T,
// 21): while on screen the page keeps a record of what it's doing; hidden or
// closed, it takes it away. At the next start a record still there is said,
// with the time, what it was doing and playing: this window's own at once,
// another window's only if it hasn't been written again a while later (it
// may be open and busy). A reload doesn't count. The "ended" is made by
// keeping the page from taking its record away, or by crashing the tab.
//   node endwatch.js     (needs www/ten.mp3)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
const modal = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | ')).catch(()=> '');
const records = (p)=> p.evaluate(()=> Object.keys(localStorage).filter(k=> k.startsWith('37player.onscreen.')).map(k=> JSON.parse(localStorage.getItem(k))));
async function open(ctx, first){
  const p = await ctx.newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{
    window.__noAutoConverter = true; window.__playableCheckMs = 600000;
    // "Ends" without taking its record away: as a page the system ends.
    const rm = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(k){ if(window.__dropHide && String(k).startsWith('37player.onscreen.')) return; return rm.call(this, k); };
  });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  if(first){ for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); }
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 180000});
  const ctx = await b.createBrowserContext();
  let p = await open(ctx, true);
  await sleep(1500);
  let r = await records(p);
  ok(r.length === 1 && Date.now() - r[0].at < 10000, 'on screen, a record of it is kept (' + JSON.stringify(r) + ')');
  // A reload hides the page first: nothing said.
  await p.reload({waitUntil: 'networkidle0'}); await sleep(2500);
  ok(!/closed unexpectedly/.test(await modal(p)), 'a reload isn\'t an unexpected end');
  ok(/ended unexpectedly/.test(await p.evaluate(()=> window.__log().join('\n'))) === false, 'and isn\'t logged as one');
  // Importing, then ending while on screen: said at the next start.
  await p.evaluate(()=> window.__op('Importing 120 of 240: Long Life Prayer.mp3'));
  await sleep(300);
  r = await records(p);
  ok(r.length === 1 && /Importing 120 of 240/.test(r[0].doing), 'an operation that starts is kept at once (' + (r[0] && r[0].doing) + ')');
  await p.evaluate(()=> window.__dropHide = true);
  await p.reload({waitUntil: 'networkidle0'});
  ok(await waitFor(p, ()=> /closed unexpectedly/.test(document.querySelector('.modal')?.innerText || ''), 8000), 'the same window, opened again: said at once');
  let m = await modal(p);
  ok(/It closed at .+ while it was on screen/.test(m) && /What it was doing: Importing 120 of 240: Long Life Prayer\.mp3/.test(m), 'with the time and what it was doing');
  ok(/Browsers don't say why a page ended/.test(m), 'and, off an iPad, that browsers don\'t say why');
  let L = await p.evaluate(()=> window.__log().join('\n'));
  ok(/37 Player ended unexpectedly last time, at .+, while on screen, doing: Importing 120 of 240/.test(L), 'in the playback log too (so in feedback)');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  // Said once.
  await p.reload({waitUntil: 'networkidle0'}); await sleep(2500);
  ok(!/closed unexpectedly/.test(await modal(p)), 'said once');
  // Playing.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'P', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], 'ten.mp3')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true); });
  await waitFor(p, ()=> window.__impDone === true, 90000);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library[0].name = 'Long Life Prayer'; await window.__dbg.saveState(); window.__dbg.setMode('playing'); window.__play(r.tree[0].items[0].id); });
  await waitFor(p, ()=> window.__st().t > 1, 15000); await sleep(5500);
  r = await records(p);
  ok(r.length === 1 && r[0].playing === 'Long Life Prayer' && r[0].doing === '', 'while it plays, the 5-second timer keeps what\'s playing (' + JSON.stringify(r[0]) + ')');
  // The tab crashes: another window, opened later, says it, once it's sure the first isn't just busy.
  await p.evaluate(()=> window.__dropHide = true);
  await p.bringToFront();
  const cdp = await p.createCDPSession(); cdp.send('Page.crash').catch(()=>{}); await sleep(1500);
  const q = await open(ctx, false);
  await sleep(3000);
  ok(!/closed unexpectedly/.test(await modal(q)), 'a new window waits before saying another window ended (it may only be busy)');
  ok(await waitFor(q, ()=> /closed unexpectedly/.test(document.querySelector('.modal')?.innerText || ''), 20000), 'then says it');
  m = await modal(q);
  ok(/It was playing “Long Life Prayer”\. Its place in the playlist is kept\./.test(m), 'with what was playing');
  await q.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  r = await records(q);
  ok(r.length === 1, 'the ended window\'s record is gone; only this one\'s is left (' + r.length + ')');
  // A window that's open, and so writes again: not said. (Stood in for by a
  // record written every few seconds: in headless Chrome a tab behind is hidden.)
  const stamp = ()=> q.evaluate(()=> localStorage.setItem('37player.onscreen.another', JSON.stringify({at: Date.now(), doing: 'Converting 3 of 9', playing: '', v: 'x'})));
  await stamp();
  const keep = setInterval(()=> stamp().catch(()=>{}), 3000);
  const w = await open(ctx, false);
  await w.bringToFront(); await sleep(18000);
  clearInterval(keep);
  ok(!/closed unexpectedly/.test(await modal(w)), 'another window still open (its record written again) isn\'t said to have ended');
  ok((await records(w)).some(x=> x.doing === 'Converting 3 of 9'), 'and its record is left alone');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
