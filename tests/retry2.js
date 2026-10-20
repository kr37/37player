const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(); r.tree=[]; r.library=[]; delete r.settings.starterPlaylistId;
    const blob = await (await fetch('ten.mp3')).blob(); window.__long = await (await fetch('long2h.mp3')).blob();
    const mk = (id, L)=>({id, name:id, duration:600, peaks:new Array(720).fill(0.15), loudness:L, fileSize: blob.size});
    r.library.push(mk('loudFromElsewhere', {i:-20.1, peak:0.5}), mk('long', {i:-19, peak:0.5}));
    for(const t of r.library) await window.__dbg3.put('audio', {id:t.id, blob: t.id==='long' ? window.__long : blob}); r.library[1].duration = 7200;
    await window.__dbg.saveState(); window.__dbg.setMode('library');
  });
  await sleep(60000); console.log('version check:', await p.evaluate(async()=> window.__ver(await (await fetch('37-player.html', {headers:{Range:'bytes=0-4095'}})).text())));
  const lib = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=>({id:t.id, L:t.loudness, flat: t.peaks.every(v=>v===t.peaks[0])})));
  console.log(JSON.stringify(lib));
  const good = lib.every(t=> !t.flat && t.L && t.L.i != null);
  console.log(good ? 'ok   flat stand-in waveforms repaired, loudness kept' : 'FAIL flat stand-in waveforms not repaired');
  console.log(good ? 'ALL OK' : '1 FAILED');
  await b.close();
})();
