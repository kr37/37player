// What a track's file really is, and Convert chosen by a person (2.5.059).
// kr37's festival recording was WebM named .mp3: Table's Type said MP3, the
// format rules took it for one, and the Mac mini's desktop app ran its time
// in silence. Now: an import records the kind found inside (track.fileType);
// Check library finds it for a track that came in before, and says how many
// were another kind than their names; Type and the format rules go by it;
// Convert in Table's and Browse's bars converts the chosen tracks whatever
// the format settings say, leaving those already in the preferred format;
// the can't-be-played dialog links to Help: Audio playback problems.
//   node convask.js     (servers from serve.sh; www/ffmpeg/ and www/conv/ as for conv3.js)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 60000});
  const p = await b.newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  const settle = async ()=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click())); };
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle();
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Session', items:[]}]; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{
    for(const n of ['festival.mp3', 'ok.mp3']){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], window.__dbg.getRoot().tree[0], null, true); document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()); }
  });
  await sleep(500);
  const lib = ()=> p.evaluate(()=> window.__dbg.getRoot().library.map(t=> ({id: t.id, filename: t.filename, fileType: t.fileType, needsConvert: t.needsConvert || null})));
  let L = await lib();
  const fest = L.find(t=> /festival/.test(t.filename)), mp3 = L.find(t=> /^ok/.test(t.filename));
  ok(fest && fest.fileType === 'webm' && fest.filename === 'festival.webm', 'an import records what\'s inside: ' + (fest && fest.filename + ' / ' + fest.fileType));
  ok(mp3 && mp3.fileType === 'mp3', 'an MP3 is recorded as one (' + (mp3 && mp3.fileType) + ')');

  // A track that came in before this was recorded: named .mp3, no record.
  await p.evaluate(async(id)=>{ const tr = window.__dbg.getRoot().library.find(t=> t.id === id); tr.filename = 'festival.mp3'; delete tr.fileType; await window.__dbg.saveState(); }, fest.id);
  ok(await p.evaluate((id)=> window.__kind.ext(id), fest.id) === 'mp3', 'without the record, its name says MP3');
  await p.evaluate(()=>{ window.__dbg.getRoot().formatPolicy = {preset: 'standard', when: 'rules', rules: {uncompressed: true, types: true}}; });
  ok(!(await p.evaluate((id)=> window.__conv.matches(id), fest.id)), '… so "less widely playable types" passes it by');
  // Table: the Type column shown.
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(500);
  await p.click('.lib-view-toggle button[data-view="table"]'); await sleep(500);
  await p.click('#libColumnsBtn'); await sleep(300);
  await p.evaluate(()=>{ const c = document.querySelector('#libColsList input[data-key="type"]'); if(!c.checked) c.click(); });
  await p.evaluate(()=> document.querySelector('.modal [data-close]').click()); await sleep(300);
  const typeOf = (id)=> p.evaluate((id)=>{ const i = [...document.querySelectorAll('#libTableWrap th')].findIndex(th=> th.dataset.key === 'type'); const r = document.querySelector(`#libTableWrap tr.lt-row[data-id="${id}"]`); return r ? r.children[i].textContent : null; }, id);
  ok(await typeOf(fest.id) === 'MP3', 'Table\'s Type: MP3, from the name');

  // Check library finds it, and says so.
  await p.evaluate(()=> window.__kind.check());
  for(let i = 0; i < 60; i++){ if(await p.evaluate(()=> /Library checked/.test(document.querySelector('.modal')?.innerText || ''))) break; await sleep(250); }
  const summary = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/another kind than their names say[^\n]*: 1\./.test(summary), 'Check library says one file is another kind than its name: ' + JSON.stringify(summary.split('\n').filter(l=> /kind/.test(l))));
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=> b.click())); await sleep(400);
  L = await lib();
  ok(L.find(t=> t.id === fest.id).fileType === 'webm' && L.find(t=> t.id === fest.id).filename === 'festival.mp3', 'it records WebM, and leaves the name as it is');
  ok(await typeOf(fest.id) === 'WEBM', 'Table\'s Type now says WEBM (' + await typeOf(fest.id) + ')');
  ok(await p.evaluate((id)=> window.__conv.matches(id), fest.id), 'the format rules go by it: "less widely playable types" would convert it');
  await p.evaluate(()=>{ window.__dbg.getRoot().formatPolicy = {preset: 'standard', when: 'untouched'}; });
  ok(!(await p.evaluate((id)=> window.__conv.matches(id), fest.id)), 'with Don\'t touch my files, the settings wouldn\'t');

  // Convert, chosen: both tracks selected; the MP3 is left, the WebM goes.
  // The converting lock is held meanwhile (as another window converting
  // would), so the list waits and can be looked at.
  const mp3Modified = (await p.evaluate((id)=> window.__dbg.getRoot().library.find(t=> t.id === id).fileModified, mp3.id));
  await p.evaluate(()=>{ navigator.locks.request('37player-convert', ()=> new Promise(r=> window.__releaseConvert = r)); }); await sleep(200);
  await p.evaluate((ids)=> window.__kind.select(ids), [fest.id, mp3.id]); await sleep(200);
  const tableBtn = await p.evaluate(()=>{ const b = [...document.querySelectorAll('#libTableView .tb-btn')].find(x=> x.textContent.trim() === 'Convert'); return b ? {disabled: b.disabled, title: b.title} : null; });
  ok(tableBtn && !tableBtn.disabled, 'Table\'s bar has Convert, on with a selection (' + (tableBtn && tableBtn.title) + ')');
  await p.evaluate(()=>{ [...document.querySelectorAll('#libTableView .tb-btn')].find(x=> x.textContent.trim() === 'Convert').click(); });
  for(let i = 0; i < 40; i++){ if(await clickText(p, '.modal button', '^Download and convert$')) break; await sleep(250); }
  await sleep(300);
  const toast = await p.evaluate(()=> document.getElementById('toast')?.textContent || '');
  ok(/One of them is MP3 already/.test(toast), 'the one already MP3 is left, and it says so: ' + toast);
  for(let i = 0; i < 40; i++){ if((await p.evaluate(()=> window.__conv.state())).queue.length) break; await sleep(250); }
  const st0 = await p.evaluate(()=> window.__conv.state());
  ok(JSON.stringify(st0.queue) === JSON.stringify([fest.id]), 'only the WebM is queued (' + JSON.stringify(st0.queue) + ')');
  const rec = await p.evaluate(()=> window.__conv.queueRecord());
  ok(rec && JSON.stringify(rec.asked) === JSON.stringify([fest.id]), 'the list kept for a restart says it was asked for (' + JSON.stringify(rec && rec.asked) + ')');
  await p.evaluate(()=> window.__releaseConvert());
  for(let i = 0; i < 240; i++){ const s = await p.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) break; await sleep(250); }
  await sleep(500);
  L = await lib();
  const f2 = L.find(t=> t.id === fest.id);
  ok(f2.fileType === 'mp3' && f2.filename === 'festival.mp3', 'converted, with Don\'t touch my files set: ' + f2.filename + ' / ' + f2.fileType);
  ok(await p.evaluate((id)=> window.__kind.sniff(id), fest.id) === 'mp3', 'and the stored file is MP3 inside');
  ok(await p.evaluate((id)=> window.__dbg.getRoot().library.find(t=> t.id === id).fileModified, mp3.id) === mp3Modified, 'the MP3 was left as it was');
  ok(await p.evaluate(()=> window.__kind.asked().length === 0), 'the asked-for list is empty once the run is over');
  // Asked again: already MP3, nothing to do.
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=> b.click())); await sleep(300);
  await p.evaluate((ids)=> window.__kind.select(ids), [fest.id]); await sleep(200);
  await p.evaluate(()=>{ [...document.querySelectorAll('#libTableView .tb-btn')].find(x=> x.textContent.trim() === 'Convert').click(); }); await sleep(500);
  ok(/Already MP3/.test(await p.evaluate(()=> document.getElementById('toast')?.textContent || '')), 'asked again: already MP3, nothing to convert');
  ok((await p.evaluate(()=> window.__conv.state())).queue.length === 0, '… and nothing queued');
  // Browse's tracks bar has it too.
  await p.click('.lib-view-toggle button[data-view="browse"]'); await sleep(500);
  ok(await p.evaluate(()=> [...document.querySelectorAll('#libTracksBar .tb-btn')].some(x=> x.textContent.trim() === 'Convert')), 'Browse\'s tracks bar has Convert');

  // The can't-be-played dialog links to Help: Audio playback problems.
  await p.evaluate((id)=>{ window.__dropAudio(id); window.__kind.missing(id); }, mp3.id); await sleep(400);
  ok(await p.evaluate(()=> !!document.getElementById('playbackHelpLink')), 'the can\'t-be-played dialog has the link');
  await p.click('#playbackHelpLink'); await sleep(600);
  ok(await p.evaluate(()=> window.__kind.helpId()) === 'audio-playback-problems', 'it opens Help at Audio playback problems');
  ok(await p.evaluate(()=> /select the tracks that have trouble/i.test(document.body.innerText)), 'the topic is showing');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
