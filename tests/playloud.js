// Loudness on Playing (1.4.128): the By album / Off / By track choice on the
// bar, the Loudness switch showing each track's adjustment in whole dB, a
// track's own volume always shown in bold, and Library's albums with what
// By album does to them.
//   node playloud.js        (needs only the http server of serve.sh)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', ...(process.env.CHROME_ARGS||'').split(' ').filter(Boolean)]});
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$']){ await clickText(p,'.modal button',x); await sleep(300); }
  // the starter track, measured
  let L = null;
  for(let i = 0; i < 80 && L == null; i++){ await sleep(250); L = await p.evaluate(()=>{ const t = window.__dbg.getRoot().library[0]; return t && t.loudness && t.loudness.i != null ? t.loudness.i : null; }); }
  ok(L != null, 'the starter track has its loudness measured: ' + L);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.settings.levelMode = 'off'; r.settings.levelKind = 'album'; await window.__dbg.saveState(); window.__dbg.renderPlayer ? window.__dbg.renderPlayer() : null; });
  const bar = ()=> p.evaluate(()=> [...document.querySelectorAll('.ctx-bar .tb-btn, .ctx-bar .tb-sep')].filter(e=> e.offsetParent !== null).map(e=> e.classList.contains('tb-sep') ? '|' : e.textContent.trim() + (e.classList.contains('on') ? '*' : '')).join(' '));
  await clickText(p, '.tab, button', '^Playing$'); await sleep(300);
  let txt = await bar();
  ok(/Wrap.*Album.*Loudness.*\|.*By album.*Off\*.*By track.*\|.*Playback/.test(txt), 'the bar: display switches, a line, By album / Off / By track (Off on), a line, Playback: ' + txt);
  ok(!(await p.evaluate(()=> document.querySelector('#playingTrackList .tloud'))), 'nothing in the rows while Loudness is off and no track has its own volume');

  await clickText(p, '.ctx-bar .tb-btn', '^By track$'); await sleep(300);
  ok(await p.evaluate(()=> window.__dbg.getRoot().settings.levelMode) === 'track', 'By track turns evening out on, track by track');
  await clickText(p, '.ctx-bar .tb-btn', '^Loudness$'); await sleep(300);
  let cell = await p.evaluate(()=>{ const c = document.querySelector('#playingTrackList .tloud'); return c ? {text: c.textContent, title: c.title} : null; });
  const want = Math.round(-18 - L), wantTxt = want > 0 ? '+' + want : want < 0 ? '−' + (-want) : '0';
  ok(cell && cell.text === wantTxt, 'Loudness shows the track\'s adjustment in whole dB: ' + JSON.stringify(cell) + ' (want ' + wantTxt + ')');
  await clickText(p, '.ctx-bar .tb-btn', '^Off$'); await sleep(300);
  cell = await p.evaluate(()=> document.querySelector('#playingTrackList .tloud')?.textContent);
  ok(cell === '0', 'Off: 0 (' + cell + ')');
  ok(await p.evaluate(()=> window.__dbg.getRoot().settings.levelKind) === 'track', 'Off remembers the kind for Settings');

  // the track's own volume: bold, shown with Loudness off too
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library[0].volumeDb = -2.4; await window.__dbg.saveState(); });
  await clickText(p, '.ctx-bar .tb-btn', '^By album$'); await sleep(300);
  cell = await p.evaluate(()=>{ const c = document.querySelector('#playingTrackList .tloud'); return c ? {even: c.querySelector('.tl-even')?.textContent, own: c.querySelector('b.tl-own')?.textContent} : null; });
  ok(cell && cell.even === wantTxt && cell.own === '−2', 'By album with a track\'s own volume: the evening-out part and the own part in bold: ' + JSON.stringify(cell));
  await p.screenshot({path: 'shots/playloud.png'});
  await clickText(p, '.ctx-bar .tb-btn', '^Loudness$'); await sleep(300);
  cell = await p.evaluate(()=>{ const c = document.querySelector('#playingTrackList .tloud'); return c ? {even: !!c.querySelector('.tl-even'), own: c.querySelector('b.tl-own')?.textContent} : null; });
  ok(cell && !cell.even && cell.own === '−2', 'Loudness off: the own volume still shows, alone: ' + JSON.stringify(cell));

  // Library: albums with what By album does
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.settings.showLoudness = true; await window.__dbg.saveState(); });
  await clickText(p, '.tab, button', '^Library$'); await sleep(600);
  const alb = await p.evaluate(()=> document.querySelector('#libColAlbums .lib-row-album .lloud')?.textContent);
  ok(alb === wantTxt + ' dB', 'Library\'s albums show the By album change with Loudness on: ' + alb);
  await p.screenshot({path: 'shots/playloud-lib.png'});
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
