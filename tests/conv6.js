// Audio from video files, and converting at export:
// - video files dropped on a playlist: "N video files found: take their
//   audio?"; AAC sound is copied out to .m4a, Vorbis becomes the preferred
//   format (MP3), a video with no sound is reported, and the tracks land in
//   the playlist;
// - a portable export with "Convert to the preferred format" makes every
//   file an MP3, while the library keeps its WAV.
//   node conv6.js     (servers from serve.sh; www/ffmpeg/ and www/conv/ from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async (p, fn, ms)=>{ for(let k=0; k<ms/250; k++){ if(await p.evaluate(fn)) return true; await sleep(250); } return false; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 120000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = [{id:'pl1', kind:'playlist', name:'Teachings', items:[]}]; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });

  // Videos dropped on a playlist.
  await p.evaluate(async()=>{
    const files = [];
    for(const n of ['teaching.mp4','clip.mkv','silent.mp4']){ const blob = await (await fetch('/conv/' + n)).blob(); files.push(new File([blob], n, {type: n.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4'})); }
    window.__conv.importFiles(files, window.__dbg.getRoot().tree[0], null, true);
  });
  ok(await waitFor(p, ()=> /3 video file\(s\) found/.test(document.querySelector('.modal')?.innerText || ''), 10000), 'it asks: 3 video files found');
  await clickText(p, '.modal button', '^Take the audio$');
  ok(await waitFor(p, ()=> /No audio could be taken from 1 video/.test(document.querySelector('.modal')?.innerText || ''), 60000), 'the silent video is reported');
  const report = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  console.log('report:', JSON.stringify(report));
  ok(/silent\.mp4 — it has no sound/.test(report), '"silent.mp4 — it has no sound"');
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500);
  const lib = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); return {tracks: r.library.map(t=> ({file: t.filename, d: Math.round(t.duration || 0), nc: t.needsConvert || ''})), items: r.tree[0].items.length}; });
  console.log('library:', JSON.stringify(lib));
  ok(lib.tracks.some(t=> t.file === 'teaching.m4a' && t.d === 6 && !t.nc), 'teaching.mp4 → teaching.m4a (its AAC copied out), 6 s');
  ok(lib.tracks.some(t=> t.file === 'clip.mp3' && t.d === 5 && !t.nc), 'clip.mkv → clip.mp3 (Vorbis to the preferred format), 5 s');
  ok(lib.items === 2, 'both are in the playlist');

  // Export, converted: the library keeps its WAV.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.formatPolicy = {preset: 'standard', when: 'untouched'}; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const blob = await (await fetch('/conv/tone.wav')).blob(); await window.__conv.importFiles([new File([blob], 'tone.wav')], window.__dbg.getRoot().tree[0], null, true); });
  await sleep(800);
  const ids = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> t.id));
  const plain = await p.evaluate(async(ids)=> (await window.__conv.musicEntries(ids, false)).zipEntries.map(e=> e.name.split('/').pop()), ids);
  const conv = await p.evaluate(async(ids)=> (await window.__conv.musicEntries(ids, true)).zipEntries.map(e=> e.name.split('/').pop()), ids);
  console.log('export as stored:', JSON.stringify(plain), ' converted:', JSON.stringify(conv));
  ok(plain.some(n=> /\.wav$/.test(n)) && plain.some(n=> /\.m4a$/.test(n)), 'an ordinary export keeps each file as it is (WAV, M4A)');
  ok(conv.length === 3 && conv.every(n=> /\.mp3$/.test(n)), 'with "Convert to the preferred format", every exported file is an MP3');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.some(t=> t.filename === 'tone.wav')), 'the library still has its WAV');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
