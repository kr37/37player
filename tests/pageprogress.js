// A downloaded page's start, said as it gets on (2.7.010, shell 2.7.6; the
// audit's fix 14, G): each step and each call to the shell that comes back
// counts, at most every 2 s, until the library has loaded; then nothing
// more. A start stuck at one step says nothing; the stuck message at the
// app's steps no longer counts the page as started. Through the stand-in shell.
//   node pageprogress.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__fakeShellPages = true; window.__fakeShellPageProgress = true;
    try{ window.__fakeHang = JSON.parse(sessionStorage.getItem('hang') || 'null'); }catch(e){}
    (0, eval)(shell);
  }, SHELL);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  // A second start, watched from the beginning.
  await p.reload({waitUntil: 'domcontentloaded'});
  await sleep(6000);
  let r = await p.evaluate(()=> ({progress: (window.__fakeProgress || []).slice(), ok: (window.__fakePageOk || []).slice()}));
  ok(r.progress.length >= 1, 'the start says it\'s getting on (' + r.progress.length + ' times)');
  ok(r.ok.length >= 1, 'and that it started, once the library loaded');
  ok(r.progress.every((t, i)=> i === 0 || t - r.progress[i - 1] >= 1900), 'at most every 2 s');
  ok(r.progress.every(t=> t <= r.ok[0] + 50), 'nothing after it started');
  const n = r.progress.length;
  await sleep(4000);
  ok((await p.evaluate(()=> (window.__fakeProgress || []).length)) === n, 'and nothing more later');
  // Stuck at one of the app's steps: no progress while stuck, and the stuck message doesn't count it as started.
  await p.evaluate(()=> sessionStorage.setItem('hang', JSON.stringify(['fs_roots'])));
  await p.reload({waitUntil: 'domcontentloaded'});
  await waitModal(p, /37 Player is taking long to start/, 14000);
  const before = await p.evaluate(()=> (window.__fakeProgress || []).length);
  await sleep(5000);
  r = await p.evaluate(()=> ({progress: (window.__fakeProgress || []).length, ok: (window.__fakePageOk || []).length}));
  ok(r.progress === before, 'stuck at a step: no progress said (' + before + ' → ' + r.progress + ')');
  ok(r.ok === 0, 'and the stuck message doesn\'t count the page as started');
  await p.evaluate(()=>{ window.__fakeHang = null; sessionStorage.removeItem('hang'); });
  let started = false; for(let i = 0; i < 40 && !started; i++){ await sleep(250); started = (await p.evaluate(()=> (window.__fakePageOk || []).length)) > 0; }
  ok(started, 'once it answers, the start goes on and says it started');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
