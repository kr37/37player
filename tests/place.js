// Reloads keep the look and the place: the theme is on the page before the
// app starts (no dark flash on a light theme); Settings' section, Help's topic
// and the tab come back after a refresh or a library switch; a PIN is still asked.
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(200); };
async function reloading(p, fn){ const nav = p.waitForNavigation({waitUntil:'networkidle0', timeout: 20000}); await p.evaluate(fn).catch(()=>{}); await nav; await sleep(1200); }
const where = p=> p.evaluate(()=> ({mode: document.querySelector('.mode-tab.active')?.dataset.mode || '', settings: document.querySelector('#settingsNav .settings-nav-item.active')?.textContent || '', help: document.querySelector('#helpTopicsList .active, #helpTopicsList [aria-current]')?.textContent || (document.getElementById('helpPage') ? 'open' : ''), modal: document.querySelector('.modal-backdrop.show .modal h3')?.textContent || ''}));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  // What the page looks like the moment its HTML is in, before the app has run.
  await p.evaluateOnNewDocument(()=>{ document.addEventListener('DOMContentLoaded', ()=>{ window.__earlyClass = document.body.className; window.__earlyBg = getComputedStyle(document.body).backgroundColor; }); });
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  await settle(p);

  await p.evaluate(()=>{ window.__dbg.disp('light', false); return window.__dbg.saveState(); });
  await reloading(p, ()=> location.reload());
  const early = await p.evaluate(()=> [window.__earlyClass, window.__earlyBg]);
  ok(/theme-light/.test(early[0]) && early[1] === 'rgb(246, 243, 236)', 'light theme is on the page before the app starts (' + early.join(' / ') + ')');

  // Settings → Switch libraries, then a refresh
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400);
  await p.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> /Switch libraries/.test(e.textContent)).click()); await sleep(300);
  await reloading(p, ()=> location.reload());
  let w = await where(p);
  ok(w.settings === 'Switch libraries', 'refresh: back in Settings → Switch libraries (' + JSON.stringify(w) + ')');

  // ... and after switching to another library from there
  await reloading(p, ()=> window.__lib.create('Second'));
  await settle(p);
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400);
  await p.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> /Switch libraries/.test(e.textContent)).click()); await sleep(300);
  await reloading(p, ()=> [...document.querySelectorAll('.library-row:not(.current) [data-act=open]')][0].click());
  w = await where(p);
  ok(w.settings === 'Switch libraries', 'library switch: back in Settings → Switch libraries (' + JSON.stringify(w) + ')');
  ok(/theme-light/.test(await p.evaluate(()=> window.__earlyClass)), 'and no dark flash on the switch either');

  // Help, from Playing
  await p.evaluate(()=>{ document.getElementById('settingsClose').click(); window.__dbg.setMode('playing'); }); await sleep(300);
  await p.evaluate(()=> document.getElementById('btnHelp').click()); await sleep(300);
  const topic = await p.evaluate(()=>{ const items = [...document.querySelectorAll('#helpTopicsList > *')]; const it = items.find(e=> /Shared library/.test(e.textContent)); it.click(); return it.textContent; }); await sleep(300);
  const shown = await p.evaluate(()=> document.querySelector('#helpTopicBody h2, #helpTopicBody h1')?.textContent || '');
  await reloading(p, ()=> location.reload());
  const shown2 = await p.evaluate(()=> document.getElementById('helpPage') ? (document.querySelector('#helpTopicBody h2, #helpTopicBody h1')?.textContent || '') : '');
  ok(!!shown2 && shown2 === shown, 'refresh: back in Help on the same topic (' + topic + ' → ' + shown2 + ')');

  // With a PIN, Edit Playlists asks for it again
  await p.evaluate(()=>{ document.getElementById('helpClose').click(); const r = window.__dbg.getRoot(); r.settings.pin = '1234'; window.__dbg.setMode('editing'); return window.__dbg.saveState(); }); await sleep(300);
  await reloading(p, ()=> location.reload());
  w = await where(p);
  ok(/PIN/.test(w.modal), 'with a PIN, the refresh asks for it before going back to Edit Playlists (' + JSON.stringify(w) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
