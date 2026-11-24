// A save that runs long (2.7.002; the audit's fix 5, P): at 30 s the log
// says what it's waiting on and the top bar shows "Still saving" in amber,
// red at 2 minutes; closing asks first meanwhile; it's never treated as
// failed; when it ends the log says so and the bar clears. Through the
// stand-in shell, its writes held (__fakeWriteHold).
//   node saveslow.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
const bar = (p)=> p.evaluate(()=>{ const b = document.getElementById('btnNotSaving'); return {shown: b.style.display !== 'none', text: b.textContent, cls: b.className, title: b.title}; });
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__fakeShellCloseSeen = true; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(2000);
  ok(!(await bar(p)).shown, 'nothing in the top bar while saves are quick');
  // A save that doesn't finish.
  await p.evaluate(()=>{ window.__fakeWriteHold = true; window.__dbg.saveState(); });
  await sleep(1000);
  await p.evaluate(()=> window.__dbgSaveAged(30000));
  let L = await log(p), B = await bar(p);
  ok(/saving has taken 30 s so far \(waiting on writing the settings and the playback place; the app's fs_write for \d+ s\)/.test(L), 'at 30 s the log says what it waits on (' + (L.match(/saving has taken[^\n]*/) || [''])[0] + ')');
  ok(B.shown && /\bwarn\b/.test(B.cls) && B.text === 'Still saving' && /longer than usual/.test(B.title), 'the top bar says "Still saving" in amber (' + JSON.stringify(B) + ')');
  // Clicking it explains.
  await p.evaluate(()=> document.getElementById('btnNotSaving').click());
  let m = await waitModal(p, /Saving is taking longer than usual/, 3000);
  ok(/has been saving since/.test(m) && /leave it open/.test(m), 'clicked, it explains (' + m.replace(/\s+/g, ' ').slice(0, 110) + ')');
  await clickText(p, '.modal button', '^OK$');
  // Closing asks first.
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  m = await waitModal(p, /Close 37 Player\?/, 3000);
  ok(/saving your last change/.test(m), 'closing asks first, naming the save');
  await clickText(p, '.modal button', '^Keep it open$');
  ok((await p.evaluate(()=> window.__fakeQuits || 0)) === 0, 'Keep it open: still running');
  // Red at 2 minutes, logged once each.
  await p.evaluate(()=> window.__dbgSaveAged(90000));
  L = await log(p); B = await bar(p);
  ok(/saving has taken 2 minutes so far/.test(L) && /\burgent\b/.test(B.cls) && B.text === 'Still saving', 'at 2 minutes: red, and logged');
  await p.evaluate(()=> window.__dbgSaveAged(1000));
  L = await log(p);
  ok((L.match(/saving has taken 30 s/g) || []).length === 1 && (L.match(/saving has taken 2 minutes/g) || []).length === 1, 'each said once');
  ok(!(await p.evaluate(()=> document.getElementById('btnNotSaving').textContent === 'Not saving')), 'never taken for a failed save');
  // The write lands.
  await p.evaluate(()=>{ window.__fakeWriteHold = false; });
  await sleep(1500);
  L = await log(p); B = await bar(p);
  ok(/saving caught up, \d+ s after the save that ran long was asked for/.test(L), 'when it lands the log says so');
  ok(!B.shown, 'and the top bar clears');
  // Closing now: no question about saving.
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  await sleep(1500);
  ok((await p.evaluate(()=> window.__fakeQuits || 0)) === 1, 'and closing quits without asking');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
