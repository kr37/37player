// Tauri's switch to its slower route (2.7.000, shell 2.7.0; the audit's
// fix 3, A): after one failed request every later one goes through the
// webview's message route, where a write's bytes are a list of numbers and a
// read's answer comes back as one. Through the stand-in shell:
//  - with shell 2.7.0 (slow_route), saves go on; a file read back is the
//    same bytes (not the text "82,73,…"); it's logged once;
//  - the window offers to restart only when nothing plays; Not now waits;
//    Restart now reloads;
//  - with an older shell the write is refused and the offer says changes
//    can't be saved until then.
//   node slowroute.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
async function start(b, newShell){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell, newShell)=>{
    window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__diskBlobMin = 1048576;
    window.__fakeShellSlowRoute = newShell;
    (0, eval)(shell);
  }, SHELL, newShell);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);
  return p;
}
// A file written and read back through the library's store.
const roundTrip = (p, id, n)=> p.evaluate(async(id, n)=>{
  const d = await window.__disk.storageOpen(window.__disk.id());
  const u = new Uint8Array(n); for(let i = 0; i < n; i++) u[i] = (i * 7 + 3) & 255;
  try{ await d.put('audio', {id, blob: new File([u], id + '.wav', {type: 'audio/wav'})}); }catch(err){ return {error: String(err && err.message || err)}; }
  const r = await d.get('audio', id); if(!r || !r.blob) return {error: 'not read back'};
  const back = new Uint8Array(await r.blob.arrayBuffer());
  let same = back.length === n; for(let i = 0; same && i < n; i++) if(back[i] !== u[i]) same = false;
  return {same, size: back.length};
}, id, n);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  // ---- Shell 2.7.0
  let p = await start(b, true);
  let r = await roundTrip(p, 'before', 3000);
  ok(r.same, 'before the switch: a file goes in and comes back the same');
  // Something plays: the switch is noticed, but nothing is offered meanwhile.
  await p.evaluate(()=>{
    const sr = 8000, n = sr * 30, b = new ArrayBuffer(44 + n), v = new DataView(b);
    const w = (o, s)=> [...s].forEach((c, i)=> v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for(let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = document.getElementById('audioEl'); a.src = URL.createObjectURL(new Blob([b], {type: 'audio/wav'})); return a.play();
  });
  await sleep(500);
  await p.evaluate(()=>{ window.__fakeSlowRoute = true; });
  r = await roundTrip(p, 'after', 5000);
  ok(r.same, 'after the switch: saving goes on, and a file read back is the same bytes (' + JSON.stringify(r) + ')');
  await roundTrip(p, 'again', 100);
  let L = await log(p);
  ok((L.match(/Tauri's slower route \(noticed on fs_(write|read)\): saves go on, more slowly, until the window restarts/g) || []).length === 1, 'it\'s logged once, saying saves go on');
  await sleep(7000);
  ok(!/window should restart/.test(await modalText(p)), 'nothing is offered while something plays');
  await p.evaluate(()=> document.getElementById('audioEl').pause());
  let m = await waitModal(p, /37 Player's window should restart/, 8000);
  ok(/It takes a moment, and the playlist's place is kept/.test(m) && !/can't be saved/.test(m), 'once nothing plays, the restart is offered (' + m.replace(/\s+/g, ' ').slice(0, 120) + ')');
  await clickText(p, '.modal button', '^Not now$');
  await sleep(7000);
  ok(!/window should restart/.test(await modalText(p)), 'Not now: not asked again at once');
  ok(/the window's restart was put off/.test(await log(p)), 'and that is logged');
  // Asked again later (the wait shortened), and Restart now reloads.
  await p.evaluate(()=> window.__dbgIpcAskSoon && window.__dbgIpcAskSoon());
  await p.evaluate(()=> sessionStorage.setItem('slowrouteMark', '1'));
  m = await waitModal(p, /37 Player's window should restart/, 8000);
  if(m){
    const nav = p.waitForNavigation({timeout: 20000}).then(()=> true, ()=> false);
    await clickText(p, '.modal button', '^Restart now$');
    ok(await nav, 'Restart now reloads the window');
  } else ok(false, 'asked again after the wait');
  // ---- An older shell
  p = await start(b, false);
  await p.evaluate(()=>{ window.__fakeSlowRoute = true; });
  r = await roundTrip(p, 'old', 1000);
  ok(r.error && /must be the body/.test(r.error), 'an older shell refuses the write (' + JSON.stringify(r) + ')');
  L = await log(p);
  ok(/Tauri's slower route \(noticed on fs_write\): this app \(2\.0\.000\) can't save that way, so saves fail until the window restarts/.test(L), 'logged: saves fail until the window restarts');
  m = await waitModal(p, /37 Player's window should restart/, 10000);
  ok(/Until it does, changes can't be saved/.test(m), 'the offer says changes can\'t be saved until then');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
