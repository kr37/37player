// Saving refused, not a full device (2.2.041; Gen Rinzin's T470, 13 Nov
// 2026: a library's folder was a read-only copy, and the message blamed a
// full device). Saves fail with the shell's "Permission denied (os error
// 13)": the message says 37 Player isn't allowed to save in the library's
// folder; a full device still gets its own message.
//   node denied.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...a){ if(window.__deny) throw (window.__deny === 'full' ? new DOMException('The quota has been exceeded.', 'QuotaExceededError') : new Error('Permission denied (os error 13)')); return put.apply(this, a); };
  });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(1500);
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  const shown = async (kind)=>{
    await p.evaluate(async(kind)=>{ window.__deny = kind; await window.__dbg.saveState().catch(()=>{}); }, kind); await sleep(400);
    await p.evaluate(()=> document.getElementById('btnNotSaving').click()); await sleep(500);
    const tx = await p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
    await p.evaluate(async()=>{ window.__deny = null; await window.__dbg.saveState(); }); await sleep(400);
    return tx;
  };
  const d = await shown('denied');
  ok(/isn't allowed to save in this library's folder \(Permission denied \(os error 13\)\)/.test(d) && /read-only/.test(d) && /Find a library folder/.test(d) && !/full device/.test(d), 'a refused save says so, not "a full device" (' + d.slice(0, 160).replace(/\n/g, ' ') + ')');
  const gone = await p.evaluate(()=> getComputedStyle(document.getElementById('btnNotSaving')).display);
  ok(gone === 'none', 'and it clears once saving works');
  const f = await shown('full');
  ok(/out of storage space/.test(f) && !/isn't allowed/.test(f), 'a full device keeps its own message (' + f.slice(0, 80).replace(/\n/g, ' ') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
