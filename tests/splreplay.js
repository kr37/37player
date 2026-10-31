// The splitter's ▶ for a piece, pressed again (1.4.135): it plays that piece
// again, from its mark, and stops at its end; the last piece stops just
// short of the very end, so the player never counts as "ended". (The bug
// was on an iPad's Safari; this checks the same steps in Chromium.)
//   node splreplay.js        (needs only the http server of serve.sh)
const fs = require('fs'), path = require('path');
const STARTER = path.join(__dirname, 'www', 'libraries', 'starter.mp3');
fs.mkdirSync(path.dirname(STARTER), {recursive: true});
const hadStarter = fs.existsSync(STARTER);
if(!hadStarter) fs.copyFileSync(path.join(__dirname, 'fixtures', 'starter.mp3'), STARTER);
process.on('exit', ()=>{ if(!hadStarter) try{ fs.unlinkSync(STARTER); }catch(e){} });
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$']){ await clickText(p,'.modal button',x); await sleep(300); }
  let id = null; for(let i = 0; i < 40 && !id; i++){ await sleep(250); id = await p.evaluate(()=> (window.__dbg.getRoot().library[0] || {}).id || null); }
  await p.evaluate(id=> window.__splitter.open(window.__dbg.getRoot().library.find(x=> x.id === id), {at: 0}), id);
  for(let i = 0; i < 60; i++){ await sleep(250); if(await p.evaluate(()=> !!(window.__splitter.state() || {}).fine)) break; }
  const dur = await p.evaluate(()=> window.__splitter.state().dur);
  const mark = dur - 3; // the last piece: three seconds
  await p.evaluate(m=> window.__splitter.mark(m), mark); await sleep(200);
  const st = ()=> p.evaluate(()=>{ const a = document.getElementById('spAudio'); return {t: a.currentTime, paused: a.paused, ended: a.ended, cursor: window.__splitter.state().cursor}; });
  for(const round of [1, 2, 3]){
    await p.evaluate(()=> window.__splitter.playPiece(1));
    await sleep(700);
    const mid = await st();
    ok(!mid.paused && mid.t >= mark - 0.05 && mid.t < dur, 'round ' + round + ': the last piece plays from its mark (' + mid.t.toFixed(2) + ', mark ' + mark.toFixed(2) + ')');
    let end = await st();
    for(let i = 0; i < 40 && !end.paused; i++){ await sleep(200); end = await st(); }
    ok(end.paused && !end.ended && end.t > dur - 0.2, 'round ' + round + ': it stops just short of the end, not "ended" (' + JSON.stringify(end) + ')');
  }
  // the first piece, after the last: from 0, stopping at the mark
  await p.evaluate(()=> window.__splitter.playPiece(0)); await sleep(600);
  const first = await st();
  ok(!first.paused && first.t < 1, 'then the first piece plays from the start (' + first.t.toFixed(2) + ')');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
