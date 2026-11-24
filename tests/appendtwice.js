// Appends that can't land twice (2.7.008, shell 2.7.5; the audit's fix 12,
// B): a big file is written in pieces into "<name>.p37part"; each append
// says the file's size before it; a piece that already landed and came
// again is refused, and the writing goes on (the first kept); an older
// shell that took a piece twice is caught by the size check before the
// rename and the file is written again; the shell's leftovers tidy runs
// with the library's. Through the stand-in shell.
//   node appendtwice.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
async function start(b, appendAt){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell, appendAt)=>{ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__diskBlobMin = 1048576; window.__fakeShellAppendAt = appendAt; (0, eval)(shell); }, SHELL, appendAt);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  return p;
}
// A 20 MB file (three pieces) in and back out, compared byte for byte.
const roundTrip = (p, id)=> p.evaluate(async(id)=>{
  const d = await window.__disk.storageOpen(window.__disk.id());
  const N = 20 * 1048576, u = new Uint8Array(N); for(let i = 0; i < N; i += 4096) u[i] = (i / 4096) & 255; u[N - 1] = 7;
  try{ await d.put('audio', {id, blob: new File([u], id + '.wav', {type: 'audio/wav'})}); }catch(err){ return {error: String(err && err.message || err)}; }
  const r = await d.get('audio', id); const back = new Uint8Array(await r.blob.arrayBuffer());
  let same = back.length === N; for(let i = 0; same && i < N; i += 4096) if(back[i] !== u[i]) same = false;
  return {same: same && back[N - 1] === 7, size: back.length};
}, id);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});
  let p = await start(b, true);
  let r = await roundTrip(p, 'plain');
  ok(r.same && r.size === 20 * 1048576, 'a 20 MB file in pieces goes in and comes back the same');
  // The second piece lands, then comes again (as after Tauri's switch): refused, the first kept.
  await p.evaluate(()=>{ window.__fakeLandTwice = 1; });
  r = await roundTrip(p, 'twice');
  ok(r.same && r.size === 20 * 1048576, 'a piece that came twice: refused, the file still right (' + JSON.stringify(r) + ')');
  ok(/a piece came twice; the first was kept/.test(await log(p)), 'and the log says so');
  ok(!/written again from the start/.test(await log(p)), 'without writing it all again');
  // The shell's leftovers tidy, with the library's own (20 s after opening).
  await sleep(21000);
  ok((await p.evaluate(()=> window.__fakeTidied || 0)) >= 1, 'the leftovers tidy runs with the library\'s');
  // An older shell takes a piece twice: the size check before the rename catches it.
  p = await start(b, false);
  await p.evaluate(()=>{ window.__fakeDoubleAppend = 1; });
  r = await roundTrip(p, 'older');
  ok(r.same && r.size === 20 * 1048576, 'an older shell that took a piece twice: caught, written again, right (' + JSON.stringify(r) + ')');
  ok(/the file written is \d+ bytes, not 20971520: a piece is missing or came twice; written again from the start/.test(await log(p)), 'and the log says so');
  ok(!(await p.evaluate(()=> window.__fakeTidied)), 'an older shell has no leftovers tidy to call');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
