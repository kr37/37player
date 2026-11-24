// Closing in the desktop app (2.7.001, shell 2.7.1; the audit's fix 4, F):
// the page answers each close at once (p37_close_seen) and says so at its
// start, with the words for the shell's "isn't responding" dialog; and a
// save before quitting that takes over 10 s asks Wait / Quit anyway, rather
// than holding the app open for ever. Through the stand-in shell.
//   node closeseen.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
const waitFor = async (p, fn, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ if(await p.evaluate(fn).catch(()=> false)) return true; await sleep(200); } return false; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
async function start(b, answers){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell, answers)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__fakeShellCloseSeen = answers;
    (0, eval)(shell);
  }, SHELL, answers);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  let p = await start(b, true);
  let seen = await p.evaluate(()=> window.__fakeCloseSeen || []);
  ok(seen.length >= 1 && seen[0] && seen[0].title === "37 Player isn't responding" && seen[0].quit === 'Quit' && seen[0].wait === 'Wait' && /Quit anyway\?/.test(seen[0].body), 'at its start the page says it answers closes, with the dialog\'s words (' + JSON.stringify(seen[0]) + ')');
  ok(seen[0] && seen[0].ended_title === "37 Player's window keeps stopping" && seen[0].reload === 'Reload' && /three times in two minutes/.test(seen[0].ended_body), 'and the words for "keeps stopping" (shell 2.7.2)');
  // A close: answered at once, saved, quit.
  const n0 = seen.length;
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  ok(await waitFor(p, ()=> (window.__fakeQuits || 0) === 1, 5000), 'a close with nothing under way quits');
  ok((await p.evaluate(()=> (window.__fakeCloseSeen || []).length)) === n0 + 1, 'and the close was answered at once');
  // A save that takes long: asked after 10 s; Wait; the save ends while asking: it quits.
  await p.evaluate(()=>{ window.__fakeQuits = 0; window.__fakeWriteHold = true; });
  await p.evaluate(()=>{ window.__disk.libStore().put('state', {key: 'closeseenProbe', value: Date.now()}).catch(()=>{}); }); // held, so the save waits its turn
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  let m = await waitModal(p, /Saving is taking longer than usual/, 16000);
  ok(/still saving before it quits/.test(m) && /Wait/.test(m) && /Quit anyway/.test(m), 'a save over 10 s asks Wait / Quit anyway (' + m.replace(/\s+/g, ' ').slice(0, 100) + ')');
  ok((await p.evaluate(()=> window.__fakeQuits || 0)) === 0, 'and hasn\'t quit by itself');
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  await sleep(500);
  ok((await p.evaluate(()=> (window.__fakeCloseSeen || []).length)) >= n0 + 3, 'a second close meanwhile is answered too');
  await clickText(p, '.modal button', '^Wait$');
  m = await waitModal(p, /Saving is taking longer than usual/, 16000);
  ok(!!m, 'still saving after another 10 s: asked again');
  await p.evaluate(()=>{ window.__fakeWriteHold = false; });
  ok(await waitFor(p, ()=> (window.__fakeQuits || 0) === 1, 8000), 'the save ends while asking: it quits');
  ok(!/Saving is taking longer/.test(await modalText(p)), 'and the question is closed');
  // Quit anyway.
  await p.evaluate(()=>{ window.__fakeQuits = 0; window.__fakeWriteHold = true; });
  await p.evaluate(()=>{ window.__disk.libStore().put('state', {key: 'closeseenProbe', value: Date.now()}).catch(()=>{}); }); // held, so the save waits its turn
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  await waitModal(p, /Saving is taking longer than usual/, 16000);
  await clickText(p, '.modal button', '^Quit anyway$');
  ok(await waitFor(p, ()=> (window.__fakeQuits || 0) === 1, 5000), 'Quit anyway quits');
  ok(/quitting without waiting for the save/.test(await log(p)), 'and the log says so');
  await p.evaluate(()=>{ window.__fakeWriteHold = false; });
  // An older shell: no p37_close_seen, closing as before.
  p = await start(b, false);
  await p.evaluate(()=> window.__fakeEmit('p37-close-requested'));
  ok(await waitFor(p, ()=> (window.__fakeQuits || 0) === 1, 5000) && !(await p.evaluate(()=> window.__fakeCloseSeen)), 'with an older shell nothing new is called, and a close quits as before');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
