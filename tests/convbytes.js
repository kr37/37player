// When ffmpeg can't make sense of a stored file (1.4.171), the error says
// the file's first bytes as the page and as the converter read them, and
// its size: on WebKit stored WMAs failed with "Invalid data found", and the
// bytes showed the start of a .zip ("504b0304…"), which led to the real
// fault (zipwebkit.js). Imitated here by handing the converter garbage.
//   node convbytes.js     (servers from serve.sh running; needs www/conv and www/ffmpeg)
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
  await p.evaluate(()=> window.__conv.garbleProbes(1));
  await p.evaluate(async()=>{ const blob = await (await fetch('/conv/talk.wma')).blob(); window.__conv.importFiles([new File([blob], 'four.wma')], window.__dbg.getRoot().tree[0], null, true); });
  ok(await waitFor(p, ()=> /couldn.t be converted/i.test(document.querySelector('.modal')?.innerText || ''), 180000), 'a file the converter can\'t read: it says it couldn\'t be converted');
  const t2 = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/Invalid data found/.test(t2), 'with ffmpeg\'s reason: ' + (t2.match(/four[^\n]*/) || [''])[0]);
  ok(/\[read here 3026b2758e66cf11, by the converter 5a5a5a5a5a5a5a5a, \d+ bytes\]/.test(t2), 'and the first bytes as the page and the converter read them');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
