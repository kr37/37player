// What the desktop app saw that the page can't (shell 2.5.3, 2.5.035):
// its window not answering, and the session before ending unexpectedly,
// go into the playback log; so does a reload of the window, and a big file
// passed whole between the page and the app. Through the stand-in shell.
//   node watchlog.js
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
  // What the shell has to tell at this start: the last session didn't end normally, and a stall.
  await p.evaluateOnNewDocument((shell)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__diskBlobMin = 1048576;
    if(!sessionStorage.getItem('watchOnce')){ sessionStorage.setItem('watchOnce', '1');
      window.__fakeWatch = {stalls: [{at: Date.UTC(2026, 10, 16, 13, 22, 40), ms: 31200, focused: true}, {at: Date.UTC(2026, 10, 16, 13, 30, 0), ms: 4100, focused: false}], page_ended: [Date.UTC(2026, 10, 16, 13, 31, 5)],
        last_session: {started: Date.UTC(2026, 10, 16, 11, 40), alive: Date.UTC(2026, 10, 16, 13, 23, 30), version: '2.5.3', panic: 'called `Option::unwrap()` on a `None` value (src/files.rs:88)'}}; }
    (0, eval)(shell);
  }, SHELL);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  let L = await log(p);
  ok(/37 Player didn't close normally last time \(app 2\.5\.3, last seen running at .+\); it stopped on an error: called `Option::unwrap\(\)` on a `None` value \(src\/files\.rs:88\)/.test(L), 'the last session ending unexpectedly, with the error, is in the playback log');
  ok(/the app's window didn't respond for 31 s, from \S+/.test(L) && /didn't respond for 4 s, from .+ \(in the background\)/.test(L), 'and each time the window didn\'t respond, in front or in the background');
  ok(/the window's page stopped at .+? \(its process crashed or the system ended it, perhaps for memory\); the app reloaded it/.test(L), 'the page\'s process ending (shell 2.7.2) is in the playback log');
  ok(!/this start was a reload/.test(L), 'a fresh start isn\'t called a reload');
  // Asked again 20 s later: nothing new, so nothing more.
  const n1 = (L.match(/didn't respond/g) || []).length;
  await sleep(21000);
  L = await log(p);
  ok((L.match(/didn't respond/g) || []).length === n1 && (L.match(/didn't close normally/g) || []).length === 1, 'each is said once');
  // A big file written through the app is noted.
  await p.evaluate(async()=>{
    const d = await window.__disk.storageOpen(window.__disk.id());
    const N = 20 * 1048576, u = new Uint8Array(N); u[5] = 1;
    await d.put('audio', {id: 'big1', blob: new File([u], 'big.wav', {type: 'audio/wav'})});
  });
  await sleep(500);
  L = await log(p);
  ok(/written through the app: 20 MB, [\d.]+ s/.test(L), 'a 20 MB file written through the app is noted (' + (L.match(/written through the app[^\n]*/) || [''])[0] + ')');
  // The window reloaded.
  await p.reload({waitUntil: 'domcontentloaded'}); await sleep(3000);
  L = await log(p);
  ok(/37 Player opened \(2\.5\.\d+\) —\n?[^\n]*this start was a reload of the window/.test(L) || /this start was a reload of the window/.test(L), 'a reload of the window says so');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
