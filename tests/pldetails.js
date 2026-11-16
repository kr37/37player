// The Playlist details dialog (✎ on a playlist in Edit Playlists): a notes
// box of a few lines (it took most of the window), with the dialog fields'
// own background, and Enter in the name saves (2.2.038, Gen Rinzin).
//   node pldetails.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  await p.evaluate(async()=>{
    const root = window.__dbg.getRoot();
    root.tree.push({id: 'plx', kind: 'playlist', name: 'Morning', items: [], notes: 'A note'});
    await window.__dbg.saveState();
    window.__dbg.setMode('editing');
  });
  await sleep(800);
  await p.evaluate(()=>{ const row = [...document.querySelectorAll('.playlist-row')].find(r=> /Morning/.test(r.textContent)); row.querySelector('[data-act="rename"]').click(); });
  await sleep(400);
  const box = await p.evaluate(()=>{ const ta = document.getElementById('pdNotes'), nm = document.getElementById('pdName'); return ta && {h: Math.round(ta.getBoundingClientRect().height), win: innerHeight, same: getComputedStyle(ta).backgroundColor === getComputedStyle(nm).backgroundColor, notes: ta.value}; });
  ok(box && box.h < 220 && box.notes === 'A note', 'the notes box is a few lines high (' + (box && box.h) + ' px in a ' + (box && box.win) + ' px window)');
  ok(box && box.same, 'with the same background as the name field');
  await p.evaluate(()=>{ const nm = document.getElementById('pdName'); nm.value = 'Morning practice'; });
  await p.focus('#pdName'); await p.keyboard.press('Enter'); await sleep(500);
  const after = await p.evaluate(()=> ({open: document.getElementById('modalBackdrop')?.classList.contains('show'), name: window.__dbg.getRoot().tree.find(n=> n.id === 'plx').name}));
  ok(!after.open && after.name === 'Morning practice', 'Enter in the name saves and closes (' + JSON.stringify(after) + ')');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
