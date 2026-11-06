// WebKit (1.4.169): a recording kept in IndexedDB can read as garbage inside
// the converter's worker ("Invalid data found when processing input"), while
// the page reads it fine. Imitated here by handing the worker garbage for the
// first probe: the page's in-memory copy is tried, works, and is used first
// for the rest of the session. If the copy is no better, the error stands.
//   node convcopy.js     (servers from serve.sh running; needs www/conv and www/ffmpeg)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'], protocolTimeout: 120000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Conv', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  const importWmas = (names)=> p.evaluate(async(names)=>{ const blob = await (await fetch('/conv/talk.wma')).blob(); window.__impDone = false; window.__conv.importFiles(names.map(n=> new File([blob], n)), window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true, e=> window.__impDone = 'error ' + e.message); }, names);
  await p.evaluate(()=> window.__conv.garbleProbes(1));
  await importWmas(['one.wma', 'two.wma', 'three.wma']);
  ok(await waitFor(p, ()=> /Keep the originals\?/.test(document.querySelector('.modal')?.innerText || ''), 180000), 'the conversions finish');
  const txt = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(!/couldn.t be converted/i.test(txt), 'none failed: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
  await clickText(p, '.modal button', '^Keep$'); await sleep(500);
  ok(await p.evaluate(()=> ['one','two','three'].every(n=> window.__dbg.getRoot().library.some(t=> t.filename === n + '.mp3' && !t.needsConvert))), 'all three are MP3s');
  ok(await p.evaluate(()=> window.__conv.copyFirst()) === true, 'and in-memory copies are used first from now on');
  // A fresh page: a file that reads as garbage either way still fails, with ffmpeg's reason.
  await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  ok(await p.evaluate(()=> window.__conv.copyFirst()) === false, 'a new session starts without copies');
  await p.evaluate(()=> window.__conv.garbleProbes(2));
  await importWmas(['four.wma']);
  ok(await waitFor(p, ()=> /couldn.t be converted/i.test(document.querySelector('.modal')?.innerText || ''), 180000), 'garbage both ways: it says it couldn\'t be converted');
  const t2 = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/Invalid data found/.test(t2), 'with ffmpeg\'s reason: ' + (t2.match(/four[^\n]*/) || [''])[0]);
  ok(await p.evaluate(()=> window.__conv.copyFirst()) === false, 'and copies aren\'t switched on by a copy that didn\'t help');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
