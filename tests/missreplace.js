// A recording that's just missing (2.5.053; kr37, 19 Nov 2026: Library
// cleanup's list of 200+ was hard to find a track in). A track with no audio
// in a library that isn't shared: Library cleanup lists it under "Missing,
// with nothing on its way", with Remove all; its "This track can't be
// played" dialog has Replace file, which opens the file picker for that
// track at once; replacing it with ten.mp3 gives it audio, and the status
// bar said "Reading …" meanwhile; then the group is gone.
//   node missreplace.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const path = require('path');
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library.push({id: 'gone1', name: 'Gone Talk', artist: 'A', album: 'B', duration: 600, peaks: [], fileSize: 1000, filename: 'gone.mp3', addedAt: Date.now()}); await window.__dbg.saveState(); });
  const groups = async ()=>{
    await p.evaluate(()=>{ window.__dbg.setMode('editing'); window.__dbg4.settings(); window.__dbg4.section('cleanup'); }); await sleep(2000);
    const g = await p.evaluate(()=> [...document.querySelectorAll('.missing-group')].map(d=> ({key: d.dataset.group, title: d.querySelector('.sh-more-title').textContent, text: d.innerText, removeAll: !!d.querySelector(':scope > div > .btn.danger'), rowBtn: d.querySelector('[data-act="replace"]')?.textContent || ''})));
    await p.keyboard.press('Escape'); await sleep(400);
    return g;
  };
  const g1 = await groups();
  ok(g1.length === 1 && g1[0].key === 'lost' && /Gone Talk/.test(g1[0].text) && g1[0].removeAll && g1[0].rowBtn === 'Find or replace…', 'Library cleanup: under "Missing, with nothing on its way", with Remove all, its row offering Find or replace… (' + g1.map(x=> x.title).join(' | ') + ')');
  await p.evaluate(()=> window.__disk.showAudioMissing('gone1')); await sleep(300);
  ok(await p.evaluate(()=> !!document.getElementById('missingReplace') && document.getElementById('missingReplace').textContent === 'Find or replace…'), 'its "can\'t be played" dialog has Find or replace… (2.5.054)');
  const [chooser] = await Promise.all([p.waitForFileChooser({timeout: 5000}).catch(()=> null), p.evaluate(()=> document.getElementById('missingReplace').click())]);
  ok(!!chooser, 'Replace file opens the file picker at once');
  let sawReading = false;
  if(chooser){
    const watch = setInterval(async ()=>{ try{ if(/Reading/.test(await p.evaluate(()=> document.getElementById('globalOperationBar')?.innerText || ''))) sawReading = true; }catch(e){} }, 30);
    await chooser.accept([path.join(__dirname, 'www', 'ten.mp3')]);
    for(let i = 0; i < 100 && !(await p.evaluate(()=> !!document.getElementById('replaceConfirmGo'))); i++) await sleep(100);
    clearInterval(watch);
    await p.evaluate(()=> document.getElementById('replaceConfirmGo').click()); await sleep(2500);
  }
  const after = await p.evaluate(async()=>{ const tr = window.__dbg.getRoot().library.find(t=> t.id === 'gone1'); const rec = await window.__disk.idbGet('audio', 'gone1'); return {size: rec && rec.blob ? rec.blob.size : 0, filename: tr.filename, dur: Math.round(tr.duration)}; });
  ok(after.size > 100000 && after.filename === 'ten.mp3' && after.dur === 600, 'replaced: it has audio now (' + JSON.stringify(after) + ')');
  ok(sawReading, 'while it read the file, the status bar said "Reading …"');
  const g2 = await groups();
  ok(!g2.length, 'and nothing is missing any more');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
