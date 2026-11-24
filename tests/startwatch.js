// The start's watch (2.7.004; the audit's fix 7, K): it begins before the
// desktop app's first wait on the shell, says which step is waiting (in the
// dialog and the playback log), never covers a question for the person, and
// goes once the start goes on. Through the stand-in shell (__fakeHang).
//   node startwatch.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true;
    try{ window.__fakeHang = JSON.parse(sessionStorage.getItem('hang') || 'null'); }catch(e){}
    (0, eval)(shell);
  }, SHELL);
  // The first start's question waits for the person: never covered.
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  let m = await waitModal(p, /Where should your libraries live/);
  await sleep(10000);
  m = await modalText(p);
  ok(/Where should your libraries live/.test(m) && !/taking long to start|isn't responding/.test(m), 'a question at the start isn\'t covered, however long it waits');
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  ok(!/starting: waiting on/.test(await log(p)), 'a normal start says nothing');
  // The next start: the shell doesn't answer while the libraries are found.
  await p.evaluate(()=> sessionStorage.setItem('hang', JSON.stringify(['fs_roots'])));
  await p.reload({waitUntil: 'domcontentloaded'});
  m = await waitModal(p, /37 Player is taking long to start/, 14000);
  ok(/It's waiting for the desktop app: finding the libraries\./.test(m) && /Try again/.test(m), 'after 8 s: it says which step waits (' + m.replace(/\s+/g, ' ').slice(0, 120) + ')');
  ok(/starting: waiting on finding the libraries \(\d+ s into the start\)/.test(await log(p)), 'and the playback log names it');
  // It answers: the start goes on, the dialog goes.
  await p.evaluate(()=>{ window.__fakeHang = null; sessionStorage.removeItem('hang'); });
  let gone = false; for(let i = 0; i < 40 && !gone; i++){ await sleep(250); gone = !/taking long to start/.test(await modalText(p)); }
  ok(gone, 'once it answers the dialog goes');
  await sleep(1000);
  ok(/starting: done waiting \(\d+ s\)/.test(await log(p)), 'and the log says the start went on');
  ok(await p.evaluate(()=> !!document.getElementById('btnNotSaving')) && !(await p.evaluate(()=> !!document.querySelector('.modal') && /taking long/.test(document.querySelector('.modal').innerText))), 'the library opened');
  // Stuck at a later step: the dialog follows it.
  await p.evaluate(()=> sessionStorage.setItem('hang', JSON.stringify(['fs_places_restore'])));
  await p.reload({waitUntil: 'domcontentloaded'});
  m = await waitModal(p, /37 Player is taking long to start/, 14000);
  ok(/the folders this library uses in place/.test(m), 'another step: named too (' + m.replace(/\s+/g, ' ').slice(0, 120) + ')');
  await p.evaluate(()=>{ window.__fakeHang = null; sessionStorage.removeItem('hang'); });
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
