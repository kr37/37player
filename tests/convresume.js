// Converting carries on after a reload (rows 13 and 17 of 28 Oct 2026,
// 1.4.099): the list waiting to be converted is kept in the library's
// storage, and the next start picks it up. Stop ends it for good.
//   node convresume.js     (servers from serve.sh; www/ffmpeg/ and www/conv/ as for conv3.js)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 60000});
  const p = await b.newPage(); await p.setViewport({width:1200,height:850});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  const settle = async ()=>{ for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); };
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle();
  // Imported without the converter (it's blocked meanwhile), so they wait unconverted.
  await p.setRequestInterception(true);
  let blockFfmpeg = true;
  p.on('request', r=> blockFfmpeg && r.url().includes('/ffmpeg/') ? r.abort() : r.continue());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Session', items:[]}]; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{
    for(const n of ['longtalk.wma','talk.wma']){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], window.__dbg.getRoot().tree[0], null, true); document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()); }
  });
  await sleep(500);
  const ids = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.id));
  ok(ids.length === 2 && await p.evaluate(()=> window.__dbg.getRoot().library.every(t=> t.needsConvert)), 'two tracks waiting to be converted');
  blockFfmpeg = false;
  await p.evaluate((ids)=>{ window.__conv.convert(ids); }, ids); await sleep(600);
  await clickText(p, '.modal button', '^Download and convert$');
  for(let k=0; k<80; k++){ const s = await p.evaluate(()=> window.__conv.state()); if(s.running && s.worker) break; await sleep(250); }
  const before = await p.evaluate(()=> window.__conv.state());
  ok(before.running && before.queue.length === 2, 'converting the first of two: ' + JSON.stringify({q: before.queue.length, running: before.running}));
  // Cut off: a reload, as switching libraries does.
  await p.reload({waitUntil: 'networkidle0'}); await sleep(800); await settle();
  let resumed = false;
  for(let k=0; k<80; k++){ const s = await p.evaluate(()=> window.__conv.state()); if(s.running){ resumed = true; break; } await sleep(250); }
  ok(resumed, 'after the reload, converting carries on by itself');
  for(let k=0; k<480; k++){ const s = await p.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) break; await sleep(250); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()));
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.every(t=> !t.needsConvert)), 'both are converted');
  ok(!(await p.evaluate(async()=> await window.__conv.queueRecord())), 'and nothing is left to carry on with');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
