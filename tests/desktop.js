// The desktop app's bridge (1.4.156), with a stand-in for Tauri's shell:
// a close with nothing going on quits at once (after saving); a close while
// playing asks, "Keep it open" keeps it, "Close anyway" quits; Google Drive
// says it isn't available in the desktop app yet. In a plain browser none
// of it is there (IN_DESKTOP_APP false).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
const modalText = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{
    window.__TAURI_INTERNALS__ = {};
    window.__quits = 0; window.__listeners = {};
    window.__TAURI__ = {event: {listen: async (name, fn)=>{ window.__listeners[name] = fn; return ()=>{}; }}, core: {invoke: async (cmd)=>{ if(cmd === 'p37_quit') window.__quits++; }}};
  });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  ok(await p.evaluate(()=> typeof window.__listeners['p37-close-requested'] === 'function'), 'in the desktop app, it listens for the shell\'s close');
  await p.evaluate(()=> window.__listeners['p37-close-requested']()); await sleep(800);
  ok((await p.evaluate(()=> window.__quits)) === 1 && !/Close 37 Player/.test(await modalText(p)), 'nothing going on: it quits at once');
  // Something playing.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 1 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  await p.evaluate(()=>{ window.__dbg.setMode('playing'); const f = ns=>{ for(const n of ns){ if(n.kind==='playlist' && n.items.length) return n; if(n.children){ const x=f(n.children); if(x) return x; } } }; window.__play(f(window.__dbg.getRoot().tree).items[0].id); });
  for(let i=0; i<40; i++){ await sleep(250); if(await p.evaluate(()=> !window.__aud().paused && window.__aud().t > 0.2)) break; }
  ok(await p.evaluate(()=> !window.__aud().paused), 'playing');
  await p.evaluate(()=>{ window.__listeners['p37-close-requested'](); }); await sleep(600);
  const ask = await modalText(p);
  ok(/Close 37 Player/.test(ask) && /what's playing/.test(ask), 'closing while playing asks, and says what would stop (' + ask.replace(/\n+/g, ' | ').slice(0, 90) + ')');
  await clickText(p, '.modal button', '^Keep it open$'); await sleep(400);
  ok((await p.evaluate(()=> window.__quits)) === 1 && await p.evaluate(()=> !window.__aud().paused), '"Keep it open": still open, still playing');
  await p.evaluate(()=>{ window.__listeners['p37-close-requested'](); }); await sleep(600);
  await clickText(p, '.modal button', '^Close anyway$'); await sleep(800);
  ok((await p.evaluate(()=> window.__quits)) === 2, '"Close anyway": it quits');
  // Google Drive.
  const drive = await p.evaluate(async()=>{ const el = document.createElement('p'); await window.__driveStart(el); return el.textContent; });
  ok(/isn't available in the desktop app yet/.test(drive), 'Google Drive: not available in the desktop app yet (' + drive.slice(0, 60) + ')');
  // A plain browser: none of it.
  const p2 = await b.newPage();
  await p2.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  ok(await p2.evaluate(()=> !window.__TAURI_INTERNALS__ && window.__inDesktop() === false), 'in a browser, IN_DESKTOP_APP is false');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
