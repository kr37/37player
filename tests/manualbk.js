// Manual backups (1.4.076): a "changes" backup is useless without its full
// backup, and the page can't see whether that file still exists. The dialog
// must say so, and suggest a new full backup when the full one is more than
// two weeks old (or the changes are big, or the shared library holds it all).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const dialog = p=> p.evaluate(()=>{ const m = document.querySelector('.modal-backdrop.show .modal'); if(!m) return null;
  return {text: m.innerText, buttons: [...m.querySelectorAll('#askButtons button')].map(b=>({t: b.textContent.trim(), primary: b.classList.contains('primary')}))}; });
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=>{ const bi = window.backupInfoForTest(); bi.handle = null; });
  // One track, so a full backup is much bigger than a changes one.
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500);
  for(const x of ['^OK$','^Close$','^Not now$']){ await clickText(p,'.modal button',x); await sleep(300); }
  // A full backup was made a day ago, containing everything as it is now.
  const setBase = ageDays => p.evaluate(async (ageDays)=>{ const bi = window.backupInfoForTest(); const r = window.__dbg.getRoot();
    const plan = await window.__share.manualPlan();
    bi.manualBase = {id:'b1', at: Date.now() - ageDays*864e5, audio: plan.audioSizes, audioRevs: plan.audioRevs, artwork: plan.artSizes};
  }, ageDays);
  const ask = async ()=>{ p.evaluate(()=>{ window.__mb = window.__share.manualBackup(); }); for(let i=0;i<40;i++){ await sleep(150); const d = await dialog(p); if(d && d.buttons.length) return d; } return null; };
  const cancel = ()=> clickText(p,'#askButtons button','^Cancel$');

  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === 1, 'one track imported');
  await setBase(1);
  // Not confirmed yet: asks whether that full backup still exists (1.4.078).
  let d = await ask();
  ok(d && /Do you still have your full backup/.test(d.text) && /can't see your files/.test(d.text), 'a changes backup first asks whether the full backup still exists');
  const yes = d && d.buttons.find(x=>/^Yes: back up the changes/.test(x.t)), no = d && d.buttons.find(x=>/^No, or not sure: new full backup/.test(x.t));
  ok(yes && yes.primary && no && !no.primary, 'with Yes (changes) suggested and No, or not sure (full) beside it');
  await cancel(); await sleep(400);
  await p.evaluate(()=>{ window.backupInfoForTest().manualBase.confirmedAt = Date.now(); });
  d = await ask();
  ok(d && /can't see whether you still have it/.test(d.text), 'says the app cannot see whether the full backup still exists');
  ok(d && !/two weeks/.test(d.text), 'a day-old full backup is not called old');
  const ch1 = d && d.buttons.find(x=>/^Back up changes/.test(x.t));
  ok(ch1 && ch1.primary, 'small changes on a recent full backup still suggest Back up changes');
  await cancel(); await sleep(400);

  await setBase(20);
  d = await ask();
  ok(d && /more than two weeks old/.test(d.text), 'a 20-day-old full backup is called old');
  const full = d && d.buttons.find(x=>/^New full backup/.test(x.t)), ch = d && d.buttons.find(x=>/^Back up changes/.test(x.t));
  ok(full && full.primary && ch && !ch.primary, 'and New full backup is the suggested button');
  await cancel(); await sleep(400);
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
