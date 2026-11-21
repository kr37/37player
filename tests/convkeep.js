// Every file playable everywhere (2.5.060, kr37: 37 Player is first a player
// for Centers' pujas and retreats). The recommended setting converts any kind
// but MP3 and M4A (AAC); Choose the rules has an editable list of kinds left
// as they are (the preferred format's own always among them), and an older
// library's two checkboxes become that list; FLAC is no longer offered (kept
// for a library that chose it, but Standard in a shared one); "highest
// quality for lossless files" is an option, off; an import into a library
// set to Don't touch my files asks (Convert / Leave, "from now on", "don't
// ask again"); a library about to be shared offers converting first; a kept
// original's readable path is under originals/.
//   node convkeep.js     (servers from serve.sh; www/ffmpeg/ and www/conv/ as for conv3.js)
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
  const setPolicy = (pol)=> p.evaluate(async(pol)=>{ window.__dbg.getRoot().formatPolicy = pol; await window.__dbg.saveState(); }, pol);
  const lib = ()=> p.evaluate(()=> window.__dbg.getRoot().library.map(t=> ({id: t.id, filename: t.filename, fileType: t.fileType})));
  const waitQueue = async ()=>{ for(let i = 0; i < 240; i++){ const s = await p.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) return; await sleep(250); } };
  const modalText = ()=> p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  const closeModals = ()=> p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()));
  const importNamed = (names)=> p.evaluate(async(names)=>{
    for(const n of names){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], window.__dbg.getRoot().tree[0], null, true); }
  }, names);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Session', items:[]}]; await window.__dbg.saveState(); });

  // 1. The rules, without importing: hand-made tracks of each kind.
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot();
    for(const [id, fn] of [['tMp3', 'a.mp3'], ['tM4a', 'b.m4a'], ['tWav', 'c.wav'], ['tFlac', 'd.flac'], ['tWebm', 'e.webm'], ['tWma', 'f.wma'], ['tNone', '']]) r.library.push({id, name: id, filename: fn, duration: 10, fileSize: 160000});
    await window.__dbg.saveState();
  });
  const matches = ()=> p.evaluate(()=> ['tMp3','tM4a','tWav','tFlac','tWebm','tWma','tNone'].filter(id=> window.__conv.matches(id)));
  await setPolicy(null);
  let pol = await p.evaluate(()=> window.__keep.policy());
  ok(pol.when === 'reduce' && pol.preset === 'standard' && !pol.losslessHigh, 'by default: the recommended setting, Standard, lossless at Standard too');
  ok(JSON.stringify(await matches()) === JSON.stringify(['tWav','tFlac','tWebm','tWma']), 'the recommended setting converts all but MP3 and M4A (and a track of no known kind): ' + JSON.stringify(await matches()));
  await setPolicy({preset: 'standard', when: 'untouched'});
  ok((await matches()).length === 0, 'Don\'t touch my files: nothing');
  await setPolicy({preset: 'standard', when: 'rules', rules: {uncompressed: true, types: false}});
  pol = await p.evaluate(()=> window.__keep.policy());
  ok(JSON.stringify(pol.rules.keep) === JSON.stringify(['mp3','m4a','flac','opus','ogg','webm','other']), 'an older library\'s rules become the keep list they meant: ' + JSON.stringify(pol.rules.keep));
  ok(JSON.stringify(await matches()) === JSON.stringify(['tWav']), '… so only the WAV converts, as before: ' + JSON.stringify(await matches()));
  await setPolicy({preset: 'apple', when: 'rules', rules: {keep: ['mp3', 'wav']}});
  ok(JSON.stringify(await matches()) === JSON.stringify(['tFlac','tWebm','tWma']), 'the preferred format\'s own kind is always kept (AAC: M4A): ' + JSON.stringify(await matches()));
  await setPolicy({preset: 'lossless', when: 'reduce'});
  ok((await p.evaluate(()=> window.__keep.target())).format === 'flac', 'a library that chose FLAC keeps it');
  await p.evaluate(()=> window.__keep.setJoining(true));
  ok((await p.evaluate(()=> window.__keep.target())).format === 'mp3', '… but a shared one (or one becoming shared) converts to Standard');
  await setPolicy({preset: 'standard', when: 'untouched'});
  ok(JSON.stringify(await matches()) === JSON.stringify(['tWav','tFlac','tWebm','tWma']), 'a shared library converts kinds not every device plays, whatever the settings');
  await p.evaluate(()=> window.__keep.setJoining(false));
  // Lossless at the highest quality: only when asked, only for lossless codecs.
  await setPolicy({preset: 'standard', when: 'reduce'});
  ok((await p.evaluate(()=> window.__keep.lossless({codec: 'pcm_s16le'}))).kbps === 192, 'lossless at Standard unless asked');
  await setPolicy({preset: 'standard', when: 'reduce', losslessHigh: true});
  ok((await p.evaluate(()=> window.__keep.lossless({codec: 'pcm_s16le'}))).kbps === 320 && (await p.evaluate(()=> window.__keep.lossless({codec: 'flac'}))).kbps === 320, 'asked: a WAV or FLAC at MP3 320k');
  ok((await p.evaluate(()=> window.__keep.lossless({codec: 'opus'}))).kbps === 192, '… an Opus file still at 192k');
  await setPolicy({preset: 'apple', when: 'reduce', losslessHigh: true});
  ok((await p.evaluate(()=> window.__keep.lossless({codec: 'alac'}))).kbps === 256, '… AAC at 256k');
  // Kept originals' readable path.
  ok(await p.evaluate(()=>{ const r = window.__dbg.getRoot(); const tr = r.library.find(t=> t.id === 'tFlac'); tr.artist = 'Tharpa'; tr.album = 'Festival'; tr.trackNo = 3; return window.__keep.recPath('orig:tFlac') === 'originals/Tharpa/Festival/03 tFlac' && window.__keep.recPath('tFlac') === 'music/Tharpa/Festival/03 tFlac'; }), 'a kept original goes under originals/, as the track is under music/');

  // 2. The File conversion page.
  await setPolicy({preset: 'standard', when: 'rules', rules: {keep: ['mp3', 'm4a']}});
  await p.evaluate(()=> window.__dbg4.settings()); await sleep(400); await clickText(p, '.settings-nav-item', '^File conversion$'); await sleep(600);
  const page = await p.evaluate(()=> document.body.innerText);
  ok(/Make every file playable everywhere \(recommended\)/.test(page), 'the recommended setting\'s new name');
  ok(!/Lossless: FLAC/.test(await p.evaluate(()=> document.getElementById('fmtPreset')?.innerHTML || '')), 'FLAC isn\'t offered');
  const keepBoxes = await p.evaluate(()=> [...document.querySelectorAll('[data-keep]')].map(c=> c.dataset.keep + (c.checked ? '+' : '-') + (c.disabled ? '!' : '')));
  ok(JSON.stringify(keepBoxes) === JSON.stringify(['mp3+!','m4a+','wav-','aiff-','flac-','opus-','ogg-','webm-','other-']), 'the keep list: MP3 (the preferred format, fixed) and M4A ticked: ' + JSON.stringify(keepBoxes));
  await p.evaluate(()=> document.querySelector('[data-keep="flac"]').click()); await sleep(400);
  ok(JSON.stringify((await p.evaluate(()=> window.__keep.policy())).rules.keep) === JSON.stringify(['mp3','m4a','flac']), 'ticking FLAC keeps it (and MP3, the preferred format\'s, stays kept if that changes): ' + JSON.stringify((await p.evaluate(()=> window.__keep.policy())).rules.keep));
  ok(!(await p.evaluate(()=> window.__conv.matches('tFlac'))), '… and the FLAC track is left');
  await p.evaluate(()=> document.getElementById('fmtLosslessHigh').click()); await sleep(400);
  ok((await p.evaluate(()=> window.__keep.policy())).losslessHigh === true, 'the lossless option saves');
  await p.evaluate(()=> window.__dbg.setMode('playing')); await sleep(300);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = r.library.filter(t=> !/^t/.test(t.id)); await window.__dbg.saveState(); });

  // 3. An import into Don't touch my files asks; Convert with "from now on".
  await setPolicy({preset: 'standard', when: 'untouched'});
  await importNamed(['festival.mp3', 'ok.mp3']);
  let txt = '';
  for(let i = 0; i < 40; i++){ txt = await modalText(); if(/may not play on every device/.test(txt)) break; await sleep(250); }
  ok(/One of the files just added/.test(txt) && /festival/.test(txt) && /WEBM/.test(txt) && !/\bok\b/.test(txt), 'the import asks about the WebM only: ' + JSON.stringify(txt.split('\n').slice(0, 3)));
  await p.evaluate(()=> document.getElementById('keptKindsAlways').click());
  await p.evaluate(()=> document.getElementById('keptKindsGo').click());
  for(let i = 0; i < 40; i++){ if(await clickText(p, '.modal button', '^Download and convert$')) break; if((await p.evaluate(()=> window.__conv.state())).queue.length) break; await sleep(250); }
  await waitQueue(); await sleep(500);
  let L = await lib();
  ok(L.find(t=> /festival/.test(t.filename)).fileType === 'mp3', 'Convert: the WebM is now MP3');
  ok((await p.evaluate(()=> window.__keep.policy())).when === 'reduce', '"from now on" switched to the recommended setting');
  await closeModals();
  // 4. Don't ask again.
  await setPolicy({preset: 'standard', when: 'untouched'});
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; await window.__dbg.saveState(); });
  await importNamed(['festival.mp3']);
  for(let i = 0; i < 40; i++){ if(/may not play/.test(await modalText())) break; await sleep(250); }
  await p.evaluate(()=> document.getElementById('keptKindsNoAsk').click());
  await p.evaluate(()=> document.getElementById('keptKindsLeave').click()); await sleep(300);
  ok((await lib())[0].fileType === 'webm' && (await p.evaluate(()=> window.__keep.policy())).noAsk && (await p.evaluate(()=> window.__keep.policy())).when === 'untouched', 'Leave, with "don\'t ask again": left as it is, setting kept, noted');
  await importNamed(['festival.mp3']); await sleep(1500);
  ok(!/may not play/.test(await modalText()), '… and the next import doesn\'t ask');
  await closeModals();

  // 5. Becoming shared: the check offers converting first.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = r.library.slice(0, 1); await window.__dbg.saveState(); });
  const id0 = (await lib())[0].id;
  let done = p.evaluate(()=> window.__keep.shareCheck({tracks: []}).then(()=> 'done'));
  for(let i = 0; i < 40; i++){ if(/may not play on every device/.test(await modalText())) break; await sleep(250); }
  txt = await modalText();
  ok(/One track here/.test(txt) && /Convert, then share/.test(txt) && /Share as they are/.test(txt), 'the sharing check asks: ' + JSON.stringify(txt.split('\n')[0]));
  await clickText(p, '.modal button', '^Share as they are$');
  ok(await done === 'done' && (await lib())[0].fileType === 'webm', '"Share as they are" goes on, leaving it');
  done = p.evaluate(()=> window.__keep.shareCheck({tracks: []}).then(()=> 'done'));
  for(let i = 0; i < 40; i++){ if(/may not play on every device/.test(await modalText())) break; await sleep(250); }
  await clickText(p, '.modal button', '^Convert, then share$');
  ok(await done === 'done', '"Convert, then share" waits for the conversion');
  ok((await lib()).find(t=> t.id === id0).fileType === 'mp3', '… which is done by then');
  ok(await p.evaluate(()=> window.__keep.target().format === 'mp3'), 'after the check, nothing left set as if shared');
  done = p.evaluate(()=> window.__keep.shareCheck({tracks: [{id: 'x'}]}).then(()=> 'done'));
  ok(await done === 'done' && !/may not play/.test(await modalText()), 'nothing of that kind: no question');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
