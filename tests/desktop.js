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
    window.__TAURI__ = {event: {listen: async (name, fn)=>{ window.__listeners[name] = fn; return ()=>{}; }}, core: {invoke: async (cmd, args)=>{
      // Page updates (1.4.182): what the stand-in shell says comes from localStorage, and the calls are kept in sessionStorage across reloads.
      const calls = JSON.parse(sessionStorage.getItem('__calls') || '[]'); calls.push(cmd + (args && args.version ? ' ' + args.version : '')); sessionStorage.setItem('__calls', JSON.stringify(calls));
      if(cmd === 'p37_quit') window.__quits++;
      if(cmd === 'p37_shell_info') return {version: '1.4.159', bridge: Number(localStorage.getItem('__bridge') || 1), pages: localStorage.getItem('__pages') === '1'};
      if(cmd === 'p37_page_info'){ const i = JSON.parse(localStorage.getItem('__pageInfo') || '{}'); const once = {...i}; delete i.reverted; localStorage.setItem('__pageInfo', JSON.stringify(i)); return once; }
      if(cmd === 'p37_page_check') return JSON.parse(localStorage.getItem('__pageCheck') || '{"status":"error","error":"none"}');
      if(cmd === 'p37_page_switch') return '9.9.001';
    }}};
  });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  ok(await p.evaluate(()=> typeof window.__listeners['p37-close-requested'] === 'function'), 'in the desktop app, it listens for the shell\'s close');
  // The page's height is the window's (1.4.184: Monterey's webview made 100vh 28px too tall).
  const fit = async ()=> p.evaluate(()=> ({cls: document.documentElement.classList.contains('fit-height'), app: Math.round(document.getElementById('app').getBoundingClientRect().height), win: window.innerHeight}));
  let f = await fit();
  ok(f.cls && f.app === f.win, 'the page is exactly as tall as the window (' + JSON.stringify(f) + ')');
  await p.setViewport({width: 1300, height: 700}); for(let i = 0; i < 20 && (f = await fit()).app !== 700; i++) await sleep(150);
  ok(f.app === 700, 'and follows it when the window changes (' + f.app + ')');
  await p.setViewport({width: 1300, height: 900}); await sleep(300);
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); window.__dbg4.section('about'); }); await sleep(500);
  const about = await p.evaluate(()=> document.getElementById('aboutRunning').textContent);
  ok(/desktop app \(version 1\.4\.159\)/.test(about), 'About names the desktop app\'s own version (' + about + ')');
  await p.evaluate(()=> window.__dbg4.section('info')); await sleep(800);
  const where = await p.evaluate(()=> [document.getElementById('infoRunning').textContent, document.getElementById('infoKept').textContent]);
  ok(/desktop app's own storage \(IndexedDB\)/.test(where[0]) && /desktop app's own storage/.test(where[1]) && !/\?|localhost|browser/.test(where.join(' ')), 'Library info says the desktop app\'s own storage, not a browser (' + where.join(' | ') + ')');
  await p.evaluate(()=> document.getElementById('settingsClose')?.click()); await sleep(300);
  // A shell with a lower bridge number than the page needs: it says so.
  await p.evaluate(()=> localStorage.setItem('__bridge', '0'));
  await p.reload({waitUntil:'networkidle0'}); await sleep(1500);
  const old = await p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
  ok(/newer desktop app/.test(old), 'a shell offering less than the page needs: "Please download the newer desktop app"');
  await clickText(p, '.modal button', '^OK$'); await p.evaluate(()=> localStorage.removeItem('__bridge')); await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
  ok(!/newer desktop app/.test(await p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '')), 'and not when it offers enough');
  // Feedback in the desktop app (1.4.187): offered, and sent to 37player.com.
  await p.evaluate(()=> document.getElementById('btnHelp').click()); await sleep(400);
  ok(await p.evaluate(()=> !!document.getElementById('helpFeedback')), 'Help has Send feedback… in the desktop app');
  await p.evaluate(()=> document.querySelectorAll('#helpPage [data-close], #helpClose').forEach(x=> x.click())); await sleep(200);
  // Page updates (1.4.182): a shell that has them.
  const calls = ()=> p.evaluate(()=> JSON.parse(sessionStorage.getItem('__calls') || '[]'));
  ok(!(await calls()).some(c=> /^p37_page/.test(c)), 'a shell without page updates: no page-update calls');
  await p.evaluate(()=>{ localStorage.setItem('__pages', '1'); localStorage.setItem('__pageInfo', JSON.stringify({running: '1.4.182', ready: '9.9.001', reverted: {from: '9.9.000', to: '1.4.182'}})); sessionStorage.removeItem('__calls'); });
  await p.reload({waitUntil:'networkidle0'}); await sleep(2500);
  const version = await p.evaluate(()=> document.querySelector('meta[name="app-version"]').content);
  ok((await calls()).includes('p37_page_ok ' + version), 'it tells the shell it started (p37_page_ok ' + version + ')');
  const toast = await p.evaluate(()=> document.getElementById('toast')?.textContent || '');
  ok(/9\.9\.000 didn't start properly/.test(toast) && /1\.4\.182/.test(toast), 'a page the shell put aside: it says so (' + toast.slice(0, 70) + ')');
  ok(await p.evaluate(()=> document.getElementById('appVersion').classList.contains('has-update') && /Update now/.test(document.getElementById('appVersion').textContent)), 'a newer page waiting: "Update now" under the version');
  await p.evaluate(()=> window.__listeners['p37-page-ready'] && window.__listeners['p37-page-ready']({payload: '9.9.002'})); await sleep(200);
  ok(await p.evaluate(()=> /9\.9\.002/.test(document.getElementById('appVersion').title)), 'one downloaded while open: the same ("p37-page-ready")');
  // Check for updates.
  const check = async (answer)=>{
    await p.evaluate((a)=> localStorage.setItem('__pageCheck', JSON.stringify(a)), answer);
    await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); window.__dbg4.section('about'); }); await sleep(400);
    await p.evaluate(()=> document.getElementById('checkUpdates').click()); await sleep(700);
    return modalText(p);
  };
  let m = await check({status: 'needs-app', version: '9.9.003'});
  ok(/9\.9\.003/.test(m) && /newer desktop app/.test(m) && /keeps working/.test(m), 'Check for updates, the newest needing a newer app: says so (' + m.replace(/\n+/g, ' | ').slice(0, 80) + ')');
  await clickText(p, '.modal button', '^OK$'); await sleep(300);
  m = await check({status: 'current', version: version});
  ok(/latest version/.test(m), 'nothing newer: "You have the latest version"');
  await clickText(p, '.modal button', '^OK$'); await sleep(300);
  m = await check({status: 'ready', version: '9.9.004'});
  ok(/9\.9\.004 is available/.test(m), 'a newer page downloaded: offered (' + m.replace(/\n+/g, ' | ').slice(0, 60) + ')');
  await p.evaluate(()=> sessionStorage.removeItem('__calls'));
  const nav = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 20000}).catch(()=>{});
  await clickText(p, '.modal button', '^Update to 9\\.9\\.004$'); await nav; await sleep(1500);
  ok((await calls()).includes('p37_page_switch'), 'Update: the shell switches to it, and the window reloads into it');
  await p.evaluate(()=>{ localStorage.removeItem('__pages'); localStorage.removeItem('__pageInfo'); localStorage.removeItem('__pageCheck'); sessionStorage.removeItem('__calls'); });
  await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
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
