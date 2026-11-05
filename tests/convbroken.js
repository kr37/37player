// A stored converter this browser can't compile (1.4.166): one kept from
// before, built with SIMD, on a webview without SIMD (the desktop app on
// macOS 12). It's fetched again from the server, once, and the conversion
// goes ahead; if the server's copy won't compile either, it stops with the
// error instead of trying for ever.
//   node convbroken.js     (servers from serve.sh running; needs www/conv and www/ffmpeg)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'], protocolTimeout: 120000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  let breakServer = false, wasmFetches = 0;
  await p.setRequestInterception(true);
  p.on('request', r=>{
    if(r.url().endsWith('/ffmpeg/ffmpeg-core.wasm')){ wasmFetches++; if(breakServer) return r.respond({status: 200, contentType: 'application/wasm', body: Buffer.from([0,0x61,0x73,0x6d,1,0,0,0,0x0a,0x05,0x01,0x03,0x01,0x7b,0x0b])}); }
    r.continue();
  });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Conv', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  // The stored converter: the real JS, and a wasm whose one function has a v128
  // local, which a browser without SIMD can't parse (and this one can't
  // validate either: the body is cut short).
  const broken = [0,0x61,0x73,0x6d,1,0,0,0,0x01,0x04,0x01,0x60,0,0,0x03,0x02,0x01,0,0x0a,0x05,0x01,0x03,0x01,0x7b,0x0b];
  await p.evaluate(async(broken)=>{ const js = await (await fetch('/ffmpeg/ffmpeg-core.js')).blob(); await window.__conv.put(js, new Blob([new Uint8Array(broken)]), '0.12.10'); }, broken);
  ok(await p.evaluate(()=> window.__conv.version()) === '0.12.10', 'a converter that won\'t compile is stored');
  const importWma = (name)=> p.evaluate(async(name)=>{ const blob = await (await fetch('/conv/talk.wma')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], name)], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true, e=> window.__impDone = 'error ' + e.message); }, name);
  const before = wasmFetches;
  await importWma('talk.wma');
  ok(await waitFor(p, ()=> /Keep the originals\?/.test(document.querySelector('.modal')?.innerText || ''), 120000), 'the WMA is converted all the same');
  await clickText(p, '.modal button', '^Keep$'); await sleep(500);
  ok(wasmFetches - before === 1, 'the converter was fetched once (' + (wasmFetches - before) + ')');
  ok(await p.evaluate(()=> window.__conv.version()) === '0.12.10-nosimd', 'the stored converter is now the server\'s (' + await p.evaluate(()=> window.__conv.version()) + ')');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.some(t=> t.filename === 'talk.mp3' && !t.needsConvert)), 'the track is talk.mp3');
  // The server's copy won't compile either: one fetch, then the error, no loop.
  await p.evaluate(async(broken)=>{ const js = await (await fetch('/ffmpeg/ffmpeg-core.js')).blob(); await window.__conv.put(js, new Blob([new Uint8Array(broken)]), '0.12.10'); }, broken);
  await p.evaluate(()=> window.__conv.stop && window.__conv.stop());
  breakServer = true; const before2 = wasmFetches;
  await importWma('talk2.wma');
  ok(await waitFor(p, ()=> window.__impDone !== false, 120000), 'the import ends');
  await sleep(1500);
  ok(wasmFetches - before2 === 1, 'with a server copy that won\'t compile either, it fetched once and stopped (' + (wasmFetches - before2) + ')');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.some(t=> t.filename === 'talk2.wma' && t.needsConvert)), 'and the file is kept, marked to convert later');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
