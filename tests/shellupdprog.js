// The shell's update download with progress and Cancel (2.7.011, shell
// 2.7.7; the audit's fix 15, H): "Updating…" shows how much has come, Cancel
// stops the download, a download that stalls says so instead of staying up
// for good, and an older shell shows no progress or Cancel. Through the stand-in shell.
//   node shellupdprog.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
async function open(b, opts){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=>{ p.__alert = d.message(); await d.accept(); });
  await p.evaluateOnNewDocument((shell, opts)=>{ window.__noAutoConverter = true; window.__shellUpdateDelay = 2500; window.__fakeShellUpdates = {version: '2.7.7', current: '2.7.6', notes: null}; window.__fakeShellUpdateProgress = opts.progress; window.__fakeUpdateStalls = opts.stalls; (0, eval)(shell); }, SHELL, opts);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  for(let i = 0; i < 30; i++){ await sleep(200); if(/new version of the desktop app/i.test(await modal(p))) break; }
  await clickText(p, '.modal button', '^Update and restart$');
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  // Progress, then installing.
  let p = await open(b, {progress: true});
  await sleep(1200);
  let m = await modal(p);
  ok(/\d+(\.\d+)? MB of 6(\.0)? MB/.test(m) && /Cancel/.test(m), 'Updating… shows how much has come, with Cancel (' + m.replace(/\n/g, ' | ').slice(0, 140) + ')');
  await sleep(2500);
  m = await modal(p);
  ok(/Installing… 37 Player restarts by itself/.test(m) && !/Cancel/.test(m), 'once it\'s all here: installing, no Cancel');
  ok((await p.evaluate(()=> window.__fakeShellInstalled || 0)) === 1, 'and it installs');
  await p.close();
  // Cancel.
  p = await open(b, {progress: true});
  await sleep(800);
  await clickText(p, '.modal button', '^Cancel$');
  await sleep(1000);
  ok(!/Downloading and installing/.test(await modal(p)) && !p.__alert, 'Cancel stops it, quietly (' + (p.__alert || '') + ')');
  ok(!(await p.evaluate(()=> window.__fakeShellInstalled || 0)), 'nothing installed');
  ok(/the desktop app's update was cancelled/.test(await p.evaluate(()=> window.__log().join('\n'))), 'and the log says so');
  await p.close();
  // A download that stalls.
  p = await open(b, {progress: true, stalls: true});
  for(let i = 0; i < 30 && !p.__alert; i++) await sleep(200);
  ok(/nothing arrived for 60 s/.test(p.__alert || ''), 'a download that stalls says so (' + (p.__alert || 'nothing said') + ')');
  ok(!/Downloading and installing/.test(await modal(p)), 'and Updating… is gone');
  await p.close();
  // An older shell: as before.
  p = await open(b, {progress: false});
  await sleep(500);
  m = await modal(p);
  ok(/Downloading and installing/.test(m) && !/Cancel/.test(m), 'an older shell: no progress or Cancel, as before');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
