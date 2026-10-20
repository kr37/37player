// Files this browser can't play: kept at import and marked, not thrown away;
// AIFF dropped on a playlist comes in as WAV; a playlist file posing as audio
// is still left out; Playing says how many can't play; Library cleanup's
// "Check again" repairs an AIFF that an old import left at 0:00.
//   node conv.js     (servers from serve.sh running; needs www/conv from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Powa', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });

  // Dropped onto a playlist, as from a file manager.
  await p.evaluate(async()=>{
    const names = ['ok.mp3','talk.wma','lossless.m4a','song.aiff','ima.aif','notaudio.mp3'];
    const files = [];
    for(const n of names){ const blob = await (await fetch('/conv/' + n)).blob(); files.push(new File([blob], n, {type: n.endsWith('.mp3') ? 'audio/mpeg' : ''})); }
    const pl = window.__dbg.getRoot().tree[0];
    window.__importDone = false;
    window.__conv.importFiles(files, pl, null, true).then(()=> window.__importDone = true, e=>{ window.__importDone = 'error ' + e.message; });
  });
  for(let k=0; k<100 && !(await p.evaluate(()=>window.__importDone)); k++) await sleep(200);
  ok(await p.evaluate(()=>window.__importDone) === true, 'import finished');
  const modal = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  console.log('summary:', JSON.stringify(modal));
  ok(/can't be played here/.test(modal), 'the summary says some files can\'t be played here');
  ok(/talk\.wma \(Windows Media Audio \(WMA\)\)/.test(modal), 'the summary names the WMA file and its format');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);

  const lib = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=>({name:t.name, file:t.filename, d:t.duration, nc:t.needsConvert})));
  console.log('library:', JSON.stringify(lib));
  const by = f=> lib.find(t=> t.file === f);
  ok(lib.length === 5, 'five tracks kept (the playlist file left out)');
  ok(!lib.some(t=> /notaudio/.test(t.file)), 'the playlist file posing as an MP3 isn\'t a track');
  ok(by('ok.mp3') && by('ok.mp3').d > 2.5 && !by('ok.mp3').nc, 'the MP3 plays and isn\'t marked');
  ok(by('song.wav') && by('song.wav').d > 2.5 && !by('song.wav').nc, 'the AIFF dropped on a playlist came in as WAV');
  ok(by('talk.wma') && by('talk.wma').nc === 'Windows Media Audio (WMA)', 'the WMA is kept and marked as WMA');
  ok(by('ima.aif') && /^AIFF-C/.test(by('ima.aif').nc || ''), 'the compressed AIFF is kept and marked as AIFF-C');
  const alac = by('lossless.m4a');
  ok(alac && (alac.d > 0 ? !alac.nc : alac.nc === 'Apple Lossless (ALAC)'), 'Apple Lossless: marked if this browser can\'t play it (' + (alac && alac.d > 0 ? 'plays here' : 'can\'t play here') + ')');
  const marked = lib.filter(t=> t.nc).length;
  ok(await p.evaluate(()=> window.__dbg.getRoot().tree[0].items.length) === 5, 'all five are in the playlist');
  ok(await p.evaluate(()=> window.__dbg3 && true) && await p.evaluate(()=> typeof window.__dbg.getRoot().library.find(t=>t.needsConvert)) === 'object', 'needsConvert is on the track');

  // Playing: the banner and the marked rows.
  await p.evaluate(()=>{ const el=[...document.querySelectorAll('nav.rail *')].find(e=>e.children.length===0 && e.textContent.trim()==='Powa'); el && el.click(); }); await sleep(1200);
  const view = await p.evaluate(()=>({banner: [...document.querySelectorAll('.not-here-banner')].map(e=>e.innerText).join(' | '), rows: [...document.querySelectorAll('#playingTrackList .item-row.not-here')].map(e=>e.innerText.replace(/\s+/g,' '))}));
  await p.screenshot({path: 'shots/conv-playing.png'});
  console.log('Playing:', JSON.stringify(view));
  ok(new RegExp(marked + ' tracks in this playlist can\'t be played').test(view.banner), 'Playing says ' + marked + ' tracks can\'t be played');
  ok(view.rows.length === marked, 'each of them is marked in the list');
  ok(view.rows.some(r=> /Windows Media Audio \(WMA\) needs converting first/.test(r)), 'the WMA row says what needs converting');

  // Pressing play on one: not loaded, said plainly, with Convert.
  const wmaItem = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); const t = r.library.find(t=> t.filename === 'talk.wma'); return r.tree[0].items.find(it=> it.refId === t.id).id; });
  await p.evaluate((id)=> window.__play(id), wmaItem); await sleep(800);
  const dlg = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  const st = await p.evaluate(()=> window.__st());
  console.log('play pressed:', JSON.stringify(dlg), JSON.stringify({cur: st.cur, paused: st.paused}));
  ok(/This track can't be played/.test(dlg) && /Windows Media Audio \(WMA\) needs converting first/.test(dlg) && /Convert it now/.test(dlg), 'pressing play on the WMA says it can\'t be played, offering Convert it now');
  ok(st.cur !== wmaItem && st.paused, 'nothing was loaded, and nothing counts as playing');
  ok(!/Nothing else/.test(dlg), 'the dialog doesn\'t carry the confusing "nothing else changed" line');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);

  // The Library tab's player: the same dialog instead of loading it.
  const wmaId = await p.evaluate(()=> window.__dbg.getRoot().library.find(t=> t.filename === 'talk.wma').id);
  await p.evaluate((id)=> window.__conv.libPreview(id), wmaId); await sleep(500);
  const dlg2 = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/This track can't be played/.test(dlg2) && /Convert it now/.test(dlg2), 'the Library player offers "Convert it now" for it');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);

  // The playlist overlay (another playlist looked at while one plays): marked too.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pl2', kind:'playlist', name:'Other', items:[]}); await window.__dbg.saveState(); });
  await p.evaluate(()=> window.__conv.overlay('pl1')); await sleep(600);
  const ov = await p.evaluate(()=>{ const w = document.getElementById('plOverlayWrap'); return w ? {banner: w.querySelector('.not-here-banner')?.innerText || '', rows: w.querySelectorAll('.item-row.not-here').length, name: w.querySelector('.plov-track-name')?.innerText || ''} : null; });
  console.log('overlay:', JSON.stringify(ov));
  ok(ov && /tracks in this playlist can't be played/.test(ov.banner) && /Convert them now/.test(ov.banner), 'the overlay says how many can\'t be played, with Convert them now');
  ok(ov && ov.rows === marked, 'the overlay marks each of them');
  await p.screenshot({path: 'shots/conv-overlay.png'});
  await p.evaluate(()=> document.querySelector('#plOverlayWrap .plov-close')?.click()); await sleep(300);

  // An old import: an AIFF stored as it was, at 0:00, never marked.
  await p.evaluate(async()=>{
    const blob = await (await fetch('/conv/song.aiff')).blob();
    const r = window.__dbg.getRoot();
    r.library.push({id:'oldaiff', name:'Old Powa Prayer', artist:'', album:'', duration:0, peaks:[], filename:'Old Powa Prayer.aif', fileSize: blob.size});
    await window.__dbg3.put('audio', {id:'oldaiff', blob});
    r.tree[0].items.push({id:'oi1', kind:'track', refId:'oldaiff', order: 99});
    await window.__dbg.saveState();
  });
  ok(/Library cleanup can check it again/.test((await p.evaluate(()=> window.__conv.cantPlay('oldaiff')))?.note || ''), 'an old 0:00 track points to Library cleanup');

  // Library cleanup: Check again.
  await p.evaluate(()=> window.__dbg4.settings()); await sleep(400);
  await clickText(p, '.settings-nav-item', '^Library cleanup$'); await sleep(800);
  await p.screenshot({path: 'shots/conv-cleanup.png'});
  const sec = await p.evaluate(()=> document.getElementById('settingsContent')?.innerText || '');
  ok(/Tracks that can't be played/.test(sec), 'the cleanup section is called "Tracks that can\'t be played"');
  ok(/Old Powa Prayer/.test(sec) && /talk/.test(sec), 'it lists the old track and the WMA');
  ok(await clickText(p, '#zeroList button', '^Check again$'), 'Check again is there');
  for(let k=0; k<60; k++){ await sleep(250); if(/Checked:/.test(await p.evaluate(()=> document.getElementById('zeroRecheckNote')?.innerText || ''))) break; }
  const res = await p.evaluate(()=> document.getElementById('zeroRecheckNote')?.innerText || '');
  console.log('result:', JSON.stringify(res));
  ok(new RegExp('Checked: 1 now play, ' + marked + ' still can\'t').test(res), 'the result: the old AIFF plays now, the rest still can\'t');
  const old = await p.evaluate(()=>{ const t = window.__dbg.getRoot().library.find(t=>t.id==='oldaiff'); return {d:t.duration, f:t.filename, nc:t.needsConvert, peaks: (t.peaks||[]).length}; });
  console.log('old track now:', JSON.stringify(old));
  ok(old.d > 2.5 && old.f === 'Old Powa Prayer.wav' && !old.nc && old.peaks > 100, 'the old AIFF is now a WAV with a length and a waveform');
  const stored = await p.evaluate(async()=>{ const r = await new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess=()=>{ const tx=q.result.transaction('audio'); const g=tx.objectStore('audio').get('oldaiff'); g.onsuccess=()=>res(g.result); }; }); const h = new Uint8Array(await r.blob.slice(0,4).arrayBuffer()); return String.fromCharCode(...h); });
  ok(stored === 'RIFF', 'its stored audio is the WAV now');
  const sec2 = await p.evaluate(()=> document.getElementById('settingsContent')?.innerText || '');
  ok(!/Old Powa Prayer/.test(sec2), 'it\'s no longer listed');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
