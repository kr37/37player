// The desktop app updating itself (2.2.040, shell 2.2.3): the page asks,
// once a start and when nothing would be stopped, and has the shell install
// it after saving; "Not now" until the next start; About's Check for
// updates looks for a newer app first. The stand-in shell (fake-shell.js)
// says whether an update is waiting (window.__fakeShellUpdates) and counts
// installs.
//   node shellupd.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
async function open(b, update){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument((shell, update)=>{ window.__noAutoConverter = true; window.__shellUpdateDelay = 2500; window.__fakeShellUpdates = update; (0, eval)(shell); }, SHELL, update);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});

  // 1. A newer app waiting: asked a moment after starting; Update and restart saves, then installs.
  let p = await open(b, {version: '2.2.4', current: '2.2.3', notes: null});
  let m = '';
  for(let i = 0; i < 30; i++){ await sleep(200); m = await modal(p); if(/new version of the desktop app/i.test(m)) break; }
  ok(/Version 2\.2\.4 of the 37 Player app is ready to install \(this one is 2\.2\.3\)/.test(m) && /Update and restart/.test(m), 'a newer app is offered a moment after starting (' + m.replace(/\n/g, ' | ').slice(0, 120) + ')');
  const before = await p.evaluate(()=> window.__fakeShellCalls.length);
  await clickText(p, '.modal button', '^Update and restart$'); await sleep(800);
  const after = await p.evaluate((n)=> ({installed: window.__fakeShellInstalled || 0, calls: window.__fakeShellCalls.slice(n)}), before);
  ok(after.installed === 1, 'Update and restart has the shell install it (' + after.installed + ')');
  ok(/Downloading and installing the new version/.test(await modal(p)), 'and says it\'s downloading and installing');
  await p.close();

  // 2. Not now: not asked again this start; About's Check for updates offers it again.
  p = await open(b, {version: '2.2.4', current: '2.2.3', notes: null});
  for(let i = 0; i < 30; i++){ await sleep(200); if(/new version of the desktop app/i.test(await modal(p))) break; }
  await clickText(p, '.modal button', '^Not now$'); await sleep(300);
  await sleep(3500);
  ok(!/new version of the desktop app/i.test(await modal(p)), 'Not now: not asked again this start');
  await p.evaluate(()=>{ window.__updates.check(); });
  await sleep(600);
  const again = await modal(p);
  ok(/Version 2\.2\.4 of the 37 Player app/.test(again), 'Check for updates offers it again (' + again.replace(/\n/g, ' | ').slice(0, 80) + ')');
  await clickText(p, '.modal button', '^Not now$'); await sleep(300);
  ok(!(await p.evaluate(()=> window.__fakeShellInstalled || 0)), 'and nothing is installed without asking');
  await p.close();

  // 3. Nothing newer: no question; Check for updates goes on to the page's own check.
  p = await open(b, {version: null});
  await sleep(4000);
  ok(!/new version of the desktop app/i.test(await modal(p)), 'nothing newer: nothing asked');
  await p.evaluate(()=>{ window.__updates.check(); }); await sleep(600);
  const none = await modal(p);
  ok(!/new version of the desktop app/i.test(none) && none.length > 0, 'and Check for updates goes on to the page\'s own check (' + none.replace(/\n/g, ' | ').slice(0, 80) + ')');
  await p.close();

  // 4. A shell that can't update itself (2.2.2 and before): no check at all.
  p = await open(b, null);
  await sleep(4000);
  const calls = await p.evaluate(()=> window.__fakeShellCalls.filter(c=> /update/.test(c)));
  ok(!calls.length && !/new version of the desktop app/i.test(await modal(p)), 'an older shell isn\'t asked (' + calls.join(', ') + ')');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
