// Converting tracks that can't be played, automatically after an import:
// the converter is fetched without asking, WMA and Apple Lossless become MP3
// in place (same track, same playlist, mark gone), "Keep the originals?" is
// asked once for the run, a kept original is what a portable export takes,
// and it can be discarded later in Library cleanup. Through a shared library
// the other device gets the MP3s. A conversion stops when playback starts
// and is done again after.
//   node conv3.js CODE    (servers from serve.sh; www/ffmpeg/ holds ffmpeg.wasm,
//                          www/conv/ the files from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function device(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = [{id:'pl1', kind:'playlist', name:'Powa', items:[]}]; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return; await sleep(200); } };
const waitConverted = async (p, ms)=>{ for(let k=0; k<ms/250; k++){ const s = await p.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) return true; await sleep(250); } return false; };
const waitFor = async (p, fn, ms)=>{ for(let k=0; k<ms/250; k++){ if(await p.evaluate(fn)) return true; await sleep(250); } return false; };
const tracks = p=> p.evaluate(()=> window.__dbg.getRoot().library.map(t=>({id:t.id, name:t.name, file:t.filename, d:Math.round(t.duration||0), nc:t.needsConvert||'', orig: t.original ? t.original.filename : ''})));
const stored = (p, key)=> p.evaluate(async(key)=>{ const r = await new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess=()=>{ const g=q.result.transaction('audio').objectStore('audio').get(key); g.onsuccess=()=>res(g.result); }; }); if(!r) return null; const h = new Uint8Array(await r.blob.slice(0,3).arrayBuffer()); return String.fromCharCode(...h); }, key);
const isMp3 = h=> h === 'ID3' || (h && h.charCodeAt(0) === 0xFF);
const import_ = (p, names)=> p.evaluate(async(names)=>{
  for(const n of names){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n, {type: n.endsWith('.mp3') ? 'audio/mpeg' : ''})], window.__dbg.getRoot().tree[0], null, true); }
}, names);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'], protocolTimeout: 120000});
  const A = await device(b, 'A');
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  ok(!(await A.evaluate(()=> window.__conv.stored())), 'the converter isn\'t on A yet');

  // An import with two files this browser can't play: converted without asking.
  await import_(A, ['ok.mp3','talk.wma','lossless.m4a']);
  ok(await waitFor(A, ()=> /Keep the originals\?/.test(document.querySelector('.modal')?.innerText || ''), 120000), 'the run ends with "Keep the originals?"');
  const ask = await A.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  console.log('asked:', JSON.stringify(ask));
  ok(/2 files were converted to MP3/.test(ask) && /talk\.wma → talk\.mp3/.test(ask), 'it says which files were converted');
  ok(await A.evaluate(()=> window.__conv.stored()), 'the converter was fetched without a question');
  await clickText(A, '.modal button', '^Keep$'); await sleep(300);
  const after = await tracks(A);
  console.log('A:', JSON.stringify(after));
  const talk = after.find(t=> /^talk/.test(t.file)), alac = after.find(t=> /^lossless/.test(t.file));
  ok(talk && talk.file === 'talk.mp3' && !talk.nc && talk.d === 3 && talk.orig === 'talk.wma', 'the WMA is talk.mp3 now, unmarked, its original kept');
  ok(alac && alac.file === 'lossless.mp3' && !alac.nc && alac.orig === 'lossless.m4a', 'the Apple Lossless file is lossless.mp3, its original kept');
  ok(isMp3(await stored(A, talk.id)), 'the track\'s stored file is an MP3');
  ok((await stored(A, 'orig:' + talk.id)) === '0&²', 'the original WMA is kept beside it');
  ok(await A.evaluate(()=> window.__dbg.getRoot().tree[0].items.length) === 3, 'the playlist still has all three');
  const entries = await A.evaluate(async(id)=> (await window.__conv.musicEntries([id])).zipEntries.map(e=> e.name), talk.id);
  console.log('export:', JSON.stringify(entries));
  ok(entries.length === 1 && /\.wma$/.test(entries[0]), 'a portable export takes the kept original');

  // B gets the MP3s through sync; the original stays on A.
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A); await sleep(1500); await waitIdle(A);
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B);
  for(let k=0; k<40; k++){ if(!(await B.evaluate(()=> Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length))) break; await sleep(500); }
  const bt = (await tracks(B)).find(t=> t.id === talk.id);
  console.log('B:', JSON.stringify(bt));
  ok(bt && bt.file === 'talk.mp3' && !bt.nc && !bt.orig, 'on B the track is talk.mp3, unmarked, with no original');
  ok(isMp3(await stored(B, talk.id)), 'B has the MP3 itself');
  // Only the converted files were sent, never the WMA or Apple Lossless originals.
  {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, 'syncdata', CODE.split(' ')[0], 'audio');
    const heads = fs.existsSync(dir) ? fs.readdirSync(dir).map(f=> fs.readFileSync(path.join(dir, f)).subarray(0, 12)) : [];
    const wma = heads.filter(h=> h[0] === 0x30 && h[1] === 0x26 && h[2] === 0xB2 && h[3] === 0x75).length;
    const m4a = heads.filter(h=> h.subarray(4, 8).toString('latin1') === 'ftyp').length;
    console.log('server audio files:', heads.length, 'WMA:', wma, 'MP4/M4A:', m4a);
    ok(heads.length >= 3 && wma === 0 && m4a === 0, 'the server got only MP3s, never the originals');
  }

  // Library cleanup: discard the kept originals.
  await A.evaluate(()=> window.__dbg4.settings()); await sleep(400);
  await clickText(A, '.settings-nav-item', '^Library cleanup$'); await sleep(800);
  const note = await A.evaluate(()=> document.getElementById('originalsNote')?.innerText || '');
  ok(/Originals of converted tracks kept for export: 2/.test(note), 'Library cleanup says 2 originals are kept');
  await clickText(A, '#originalsNote button', '^Discard them$'); await sleep(800);
  ok(!(await stored(A, 'orig:' + talk.id)) && !(await tracks(A)).some(t=> t.orig), 'Discard them removes them');
  await A.evaluate(()=> document.querySelector('#settingsClose')?.click()); await sleep(300);

  // Playback stops a conversion, which is done again after.
  // "Only when not playing" (a computer's default is now "Any time")
  await A.evaluate(()=>{ window.__dbg.getRoot().settings.standardizeOnlyWhenIdle = true; });
  await import_(A, ['playme.mp3']);
  await import_(A, ['longtalk.wma']);
  const longId = await A.evaluate(()=> window.__dbg.getRoot().library.find(t=> t.filename === 'longtalk.wma' || t.filename === 'longtalk.mp3').id);
  ok(await waitFor(A, ()=> window.__conv.state().worker, 30000), 'the long WMA starts converting by itself');
  const playItem = await A.evaluate(()=>{ const r = window.__dbg.getRoot(); const t = r.library.find(t=> t.filename === 'playme.mp3'); return r.tree[0].items.find(it=> it.refId === t.id).id; });
  await A.evaluate((id)=>{ window.__play(id); }, playItem); await sleep(2500);
  const s2 = await A.evaluate(()=> ({st: window.__conv.state(), playing: !window.__st().paused}));
  console.log('while playing:', JSON.stringify(s2));
  ok(s2.playing && !s2.st.worker && s2.st.queue.length === 1 && /once nothing is playing/.test(s2.st.bar || ''), 'playback stops the conversion, which waits');
  await A.evaluate(()=>{ window.__pause(); }); await sleep(500);
  ok(await waitFor(A, ()=> /Keep the originals\?/.test(document.querySelector('.modal')?.innerText || ''), 300000), 'after the pause it converts again, and asks about the original');
  await clickText(A, '.modal button', '^Discard$'); await sleep(500);
  const lt = (await tracks(A)).find(t=> t.id === longId);
  console.log('long:', JSON.stringify(lt));
  ok(lt && lt.file === 'longtalk.mp3' && !lt.nc && Math.abs(lt.d - 1500) <= 1, 'the 25-minute WMA is an MP3 of the same length');
  ok(!lt.orig && !(await stored(A, 'orig:' + longId)), 'Discard drops its original');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
