// A silence ends on time on a computer even when the page gets few turns
// (1.4.158; a covered or hidden window on a Mac ended a 60-second silence up
// to 9 s late). Simulated, from page load, by stopping animation frames and dropping
// every timeupdate listener, so only the silence clock's "ended" can end it:
// a 3-second silence must end within about 0.6 s of time.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, o){ if(type === 'timeupdate' && this instanceof HTMLMediaElement) return; return add.call(this, type, fn, o); };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn)=> window.__starve ? 0 : raf(fn); window.__starve = true; // from the start: no turns but a recording's end
  });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 1 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  // A playlist: a 3-second silence, then the track. Then starve the page and start the silence.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id: 'plS', kind: 'playlist', name: 'Silence test', order: 50, items: [{id: 'sil1', kind: 'silence', seconds: 3, order: 0}, {id: 'trk1', kind: 'track', refId: r.library[0].id, order: 1}]}); await window.__dbg.saveState(); window.__dbg.setMode('playing'); });
  await sleep(500);
  for(const starved of [true]){
    await p.evaluate((s)=>{ window.__starve = s; window.__play('sil1'); window.__t0 = performance.now(); }, starved);
    let ended = null;
    for(let i=0; i<100; i++){ await sleep(100); const st = await p.evaluate(()=> ({cur: window.__st().cur, t: performance.now() - window.__t0})); if(st.cur === 'trk1'){ ended = st.t; break; } }
    ok(ended !== null && ended > 2900 && ended < 3600, (starved ? 'with no animation frames or timeupdates (a covered window)' : 'ordinarily') + ': the 3-second silence ends on time (' + (ended === null ? 'never' : Math.round(ended) + ' ms') + ')');
    await p.evaluate(()=> window.__pause && window.__st().cur === 'trk1' && !window.__aud().paused && window.__pause()); await sleep(300);
  }
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
