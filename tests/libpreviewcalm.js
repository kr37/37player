// The Library's preview doesn't refresh the bars at every position update
// (2.7.017): refreshing them re-measures the bars and lays out the whole
// table, four times a second while a preview played (kr37's samples, 26 Nov
// 2026). They're refreshed when its audio loads or changes, so Split and
// the rest still follow it.
//   node libpreviewcalm.js     (needs www/ten.mp3)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; window.__playableCheckMs = 600000; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'P', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); window.__impDone = false; window.__conv.importFiles([new File([blob], 'ten.mp3')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true); });
  ok(await waitFor(p, ()=> window.__impDone === true, 90000), 'a recording imported');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(1500);
  const id = await p.evaluate(()=> window.__dbg.getRoot().library[0].id);
  await p.evaluate((id)=>{ window.__ctxRefreshes = 0; window.__conv.libPreview(id); }, id);
  ok(await waitFor(p, ()=>{ const a = document.getElementById('libPreviewAudio'); return a && a.currentTime > 1; }, 10000), 'the preview plays');
  const atStart = await p.evaluate(()=> window.__ctxRefreshes);
  await sleep(4000);
  const after = await p.evaluate(()=> window.__ctxRefreshes);
  const t = await p.evaluate(()=> document.getElementById('libPreviewAudio').currentTime);
  ok(atStart >= 1, 'the bars were refreshed when its audio loaded (' + atStart + ')');
  ok(after - atStart <= 1 && t > 4, 'and not at its position updates while it plays (' + (after - atStart) + ' more in 4 s; at ' + t.toFixed(1) + ' s)');
  ok(/\d+:\d\d/.test(await p.evaluate(()=> document.getElementById('libTimeCur')?.textContent || '')), 'its time still moves (' + await p.evaluate(()=> document.getElementById('libTimeCur')?.textContent) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
