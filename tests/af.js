const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  const r = await p.evaluate(async()=>{
    const all = [...document.querySelectorAll('input,textarea')].filter(e=>!['checkbox','radio','range','file'].includes(e.type));
    const before = all.filter(e=>e.getAttribute('autocomplete')!=='off').length;
    const m = document.getElementById('modalBody') || document.querySelector('.modal');
    window.__dbg4.settings(); await new Promise(r=>setTimeout(r,500));
    const s = [...document.querySelectorAll('input,textarea')].filter(e=>!['checkbox','radio','range','file'].includes(e.type));
    return {static: all.length, missing: before, afterSettings: s.length, missingNow: s.filter(e=>e.getAttribute('autocomplete')!=='off').length, vp: document.querySelector('meta[name=viewport]').content};
  });
  console.log(JSON.stringify(r));
  console.log(r.missingNow === 0 && /resizes-content/.test(r.vp) ? 'ALL OK' : 'FAILED');
  await b.close();
})();
