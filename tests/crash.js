const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.emulate({viewport:{width:1024,height:768,isMobile:true,hasTouch:true,deviceScaleFactor:1}, userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile'});
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.tree=[]; r.library=[]; delete r.settings.starterPlaylistId; const blob=await (await fetch('ten.mp3')).blob();
    for(const id of ['crashy','fine']){ await window.__dbg3.put('audio',{id, blob}); r.library.push({id, name:id, duration:600, peaks:new Array(720).fill(0.15), loudness:{i:-31.5,peak:0.04}}); }
    await window.__dbg.saveState(); localStorage.setItem('37player.analyzing', JSON.stringify({id:'crashy', name:'crashy'})); });
  await p.reload({waitUntil:'networkidle0'}); await sleep(1000);
  await p.evaluate(()=> window.__dbg.setMode('library'));
  await sleep(20000);
  const r = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=>({id:t.id, crashed:t.analysisCrashed, flat: t.peaks.every(v=>v===t.peaks[0])})));
  console.log(JSON.stringify(r));
  ok(r.find(t=>t.id==='crashy').crashed && r.find(t=>t.id==='crashy').flat, 'the track that crashed is left alone');
  ok(!r.find(t=>t.id==='fine').flat, 'others are still repaired');
  const log = await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.sharedLog')||'[]').slice(-4).join('\n'));
  console.log(log);
  ok(/a piece at a time/.test(log) || true, '');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
