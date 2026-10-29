// Check library also reads again a track that has only the flat stand-in
// waveform (one that played but couldn't be read through when it came in),
// and says so when it still can't make one (1.4.107).
//   node checkwave.js     (servers from serve.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 60000});
  const p = await b.newPage(); await p.setViewport({width:1200,height:850});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  const settle = async ()=>{ for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); };
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle();
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Session', items:[]}]; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{
    for(const n of ['ok.mp3','playme.mp3']){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], window.__dbg.getRoot().tree[0], null, true); document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()); }
  });
  await sleep(800);
  const lib = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> ({id: t.id, real: !window.__check.standIn(t.peaks)})));
  ok(lib.length === 2 && lib.every(t=> t.real), 'two tracks with real waveforms');
  // The first gets the stand-in (as a track that couldn't be read through
  // would have), with loudness and all else in place, so only that is wrong.
  await p.evaluate(async()=>{ const t = window.__dbg.getRoot().library[0]; t.peaks = new Array(720).fill(0.15); t.peaksTried = 'x'; await window.__dbg.saveState(); });
  await p.evaluate(()=> window.__check.run());
  for(let k=0; k<80; k++){ if(await p.$('.modal h3')) break; await sleep(250); }
  const msg = await p.evaluate(()=> document.querySelector('.modal') ? document.querySelector('.modal').innerText.replace(/\s+/g,' ') : '');
  console.log('summary:', msg);
  ok(await p.evaluate(()=> !window.__check.standIn(window.__dbg.getRoot().library[0].peaks)), 'Check library made its waveform');
  ok(/Tracks fixed: 1/.test(msg), 'and counts it as fixed');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click())); await sleep(300);
  // One it can't read through: the browser's decoder refuses it (as for a
  // file it can play but not decode whole), so the stand-in stays.
  await p.evaluate(async()=>{
    const t = window.__dbg.getRoot().library[1]; t.peaks = new Array(720).fill(0.15); await window.__dbg.saveState();
    const C = window.AudioContext || window.webkitAudioContext;
    C.prototype.decodeAudioData = function(){ return Promise.reject(new Error('no')); };
  });
  await p.evaluate(()=> window.__check.run());
  for(let k=0; k<80; k++){ if(await p.$('.modal h3')) break; await sleep(250); }
  const msg2 = await p.evaluate(()=> document.querySelector('.modal') ? document.querySelector('.modal').innerText.replace(/\s+/g,' ') : '');
  console.log('summary:', msg2);
  ok(/Tracks that play but still have no waveform: 1\./.test(msg2), 'says the one it still can\'t draw');
  ok(!/Tracks fixed/.test(msg2), 'and doesn\'t count it as fixed');
  ok(await p.evaluate(()=> window.__check.standIn(window.__dbg.getRoot().library[1].peaks) && !window.__check.standIn(window.__dbg.getRoot().library[0].peaks)), 'the first keeps its real waveform');
  const item = await p.evaluate(()=> { const li = document.querySelector('.modal .chk-nowave li'); return li ? li.innerText.replace(/\s+/g,' ') : ''; });
  const name = await p.evaluate(()=> window.__dbg.getRoot().library[1].name);
  console.log('listed:', item);
  ok(item.includes(name) && /MP3/.test(item) && /couldn't decode/.test(item), 'names the track, its format and why');
  await p.evaluate(()=> document.getElementById('chkShowNoWave').click()); await new Promise(r=> setTimeout(r, 800));
  ok(await p.evaluate(()=> { const l = document.getElementById('libraryScreen'); return !!(l && l.offsetParent !== null) && !document.querySelector('.modal-backdrop.show'); }), 'Show them in the Library goes to the Library');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
