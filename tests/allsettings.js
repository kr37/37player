// Settings → All settings: every setting in a table, grouped by whose it is
// (this device, this library, the shared library), simple ones changeable
// right there with the same effect as in the Display menu, the others with
// a link to their own page.
//   node allsettings.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const row = (p, name)=> p.evaluate((name)=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === name); return tr ? {value: tr.children[1].innerText.trim(), about: tr.children[2].innerText.trim(), sel: !!tr.querySelector('select'), sw: !!tr.querySelector('input[type=checkbox]')} : null; }, name);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width: 1300, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
  for(const x of ['^English$', '^Start a library on this device$','^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> window.__dbg4.settings()); await sleep(400);
  await clickText(p, '#settingsNav .settings-nav-item', '^All settings$'); await sleep(500);
  const groups = await p.evaluate(()=> [...document.querySelectorAll('.all-settings tr.all-group')].map(r=> r.textContent));
  ok(groups.join('|') === 'This device|This library', 'grouped by whose setting it is: ' + groups.join(' | '));
  const n = await p.evaluate(()=> document.querySelectorAll('.all-settings tbody tr:not(.all-group)').length);
  ok(n >= 18, 'every setting has a row (' + n + ')');
  await p.screenshot({path: 'shots/allsettings.png', fullPage: false});
  // theme, changed here, as from the Display menu
  let r = await row(p, 'Theme');
  ok(r && r.sel && /Dark|Light|Auto/.test(r.value), 'Theme can be changed here: ' + (r && r.value));
  await p.evaluate(()=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === 'Theme'); const s = tr.querySelector('select'); s.value = [...s.options].find(o=> o.textContent === 'Light').value; s.dispatchEvent(new Event('change')); }); await sleep(300);
  ok(await p.evaluate(()=> window.__dbg.getRoot().settings.theme) === 'light', 'and the theme is now light');
  // a switch
  await p.evaluate(()=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === 'Wrap long titles'); const c = tr.querySelector('input[type=checkbox]'); c.checked = true; c.dispatchEvent(new Event('change')); }); await sleep(300);
  ok(await p.evaluate(()=> !!window.__dbg.getRoot().settings.wrapNames && document.body.classList.contains('wrap-names')), 'Wrap long titles, switched on here, takes effect');
  // a library setting with a choice
  await p.evaluate(()=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === 'Even out loudness'); const s = tr.querySelector('select'); s.value = [...s.options].find(o=> o.textContent === 'Album by album').value; s.dispatchEvent(new Event('change')); }); await sleep(300);
  ok(await p.evaluate(()=> window.__dbg.getRoot().settings.levelMode) === 'album', 'Even out loudness: Album by album');
  // the language: everything follows
  await p.evaluate(()=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === 'Language'); const s = tr.querySelector('select'); s.value = 'es'; s.dispatchEvent(new Event('change')); }); await sleep(600);
  ok(await p.evaluate(()=> document.querySelector('.settings-h2')?.textContent) === 'Todos los ajustes', 'Language changed here: the page itself is in Spanish now');
  await p.evaluate(()=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === 'Idioma'); const s = tr.querySelector('select'); s.value = 'en'; s.dispatchEvent(new Event('change')); }); await sleep(600);
  // the PIN: a link to its page
  r = await row(p, 'PIN');
  ok(r && !r.sel && !r.sw && r.value === 'Not set' && /Change in PIN/.test(r.about), 'PIN: shown, changed on its own page: ' + JSON.stringify(r));
  await p.evaluate(()=>{ const tr = [...document.querySelectorAll('.all-settings tbody tr')].find(r=> r.querySelector('.all-name')?.textContent === 'PIN'); tr.querySelector('a').click(); }); await sleep(500);
  ok(await p.evaluate(()=> document.querySelector('#settingsNav .active')?.textContent) === 'PIN', 'and the link opens it');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
