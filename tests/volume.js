// The Playing volume slider (2.2.038, Gen Rinzin): kept per device, so a
// reload (a page update) no longer puts it back to full; and squared, not
// cubed, so its bottom half doesn't go silent so soon.
//   node volume.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  const start = await p.evaluate(()=> window.__vol.get());
  ok(start === 1, 'a first start is at full (' + start + ')');
  const set = await p.evaluate(async()=>{
    window.__vol.set(0.5); const atHalf = window.__vol.gain(), el1 = document.getElementById('audioEl').volume;
    window.__vol.set(0.25); const atQuarter = window.__vol.gain();
    window.__vol.set(0.4);
    await new Promise(r=> setTimeout(r, 700));
    return {atHalf, el1, atQuarter, kept: JSON.parse(localStorage.getItem('37player.device') || '{}').volume};
  });
  ok(Math.abs(set.atHalf - 0.25) < 0.001 && Math.abs(set.el1 - 0.25) < 0.001 && Math.abs(set.atQuarter - 0.0625) < 0.001, 'squared: half way plays at a quarter (-6 dB), a quarter at a sixteenth (-12 dB) (' + JSON.stringify(set) + ')');
  ok(set.kept === 0.4, 'kept for this device a moment after it\'s moved (' + set.kept + ')');
  await p.reload({waitUntil: 'networkidle0'}); await sleep(1200);
  const after = await p.evaluate(()=> window.__vol.get());
  ok(after === 0.4, 'after a reload (as after a page update) it\'s where it was (' + after + ')');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
