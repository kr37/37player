// Splitting without decoding (1.4.079): a WAV or MP3 is cut by copying
// bytes at a sample or frame boundary, never decoded whole (a 1.2 GB WAV
// closed 37 Player on the iPad). Checks: no decodeAudioData during the
// split, the parts' lengths and sizes, the WAV samples carry on exactly
// across the cut, both parts play (decode), and on WebKit's path (pieces
// stored on their own, then checked) the same, with no pieces left behind.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const TONE = fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3')).toString('base64'); // 12 s of 440 Hz, stereo 128k (ffmpeg)
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
async function run(b, webkit){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1100,height:900});
  if(webkit) await p.evaluateOnNewDocument(()=>{ window.__p37WebKit = true; window.__pieceBytes = 256 * 1024; }); // several pieces
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  const tag = webkit ? '[webkit] ' : '';
  // A 20 s stereo 16-bit WAV whose samples count up, and the starter MP3.
  await p.evaluate((b64, tone64)=>{
    const rate = 44100, secs = 20, n = rate * secs, data = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s)=> [...s].forEach((c, i)=> data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true);
    data.setUint16(20, 1, true); data.setUint16(22, 2, true); data.setUint32(24, rate, true); data.setUint32(28, rate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true);
    w(36, 'data'); data.setUint32(40, n * 4, true);
    for(let i = 0; i < n; i++){ const v = ((i % 20000) - 10000); data.setInt16(44 + i * 4, v, true); data.setInt16(46 + i * 4, -v, true); }
    const wav = new File([data.buffer], 'count.wav', {type: 'audio/wav'}); Object.defineProperty(wav, 'webkitRelativePath', {value: 'Set/count.wav'});
    const mp3 = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(mp3, 'webkitRelativePath', {value: 'Set/starter.mp3'});
    // A 440 Hz tone, cut mid-wave: without a fade, both cuts would click.
    const tn = rate * 12, td = new DataView(new ArrayBuffer(44 + tn * 2));
    for(let i = 0; i < 44; i++) td.setUint8(i, data.getUint8(i));
    td.setUint32(4, 36 + tn * 2, true); td.setUint16(22, 1, true); td.setUint32(28, rate * 2, true); td.setUint16(32, 2, true); td.setUint32(40, tn * 2, true);
    for(let i = 0; i < tn; i++) td.setInt16(44 + i * 2, Math.round(26000 * Math.sin(2 * Math.PI * 440 * i / rate)), true);
    const tw = new File([td.buffer], 'tonew.wav', {type: 'audio/wav'}); Object.defineProperty(tw, 'webkitRelativePath', {value: 'Set/tonew.wav'});
    const tm = new File([Uint8Array.from(atob(tone64), c=>c.charCodeAt(0))], 'tonem.mp3', {type:'audio/mpeg'}); Object.defineProperty(tm, 'webkitRelativePath', {value: 'Set/tonem.mp3'});
    window.__dbg.bulkImportFolder([wav, mp3, tw, tm]);
  }, STARTER, TONE);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 4 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1500);
  for(const x of ['^OK$','^Close$','^Not now$','^Keep them$']){ await clickText(p,'.modal button',x); await sleep(300); }

  const res = await p.evaluate(async ()=>{
    let decodes = 0;
    const orig = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function(...a){ decodes++; return orig.apply(this, a); };
    const lib = window.__dbg.getRoot().library;
    const wav = lib.find(x=> /count/.test(x.filename)), mp3 = lib.find(x=> /starter/.test(x.filename));
    const F = (n)=> ({name: n, artist: '', album: '', trackNo: null});
    const w = await window.__split(wav, 7, F('w1'), F('w2'), ()=>{});
    const m = await window.__split(mp3, 50, F('m1'), F('m2'), ()=>{});
    const during = decodes;
    BaseAudioContext.prototype.decodeAudioData = orig;
    const blobOf = id=> window.__dmg.get(id);
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const dec = async id=> ctx.decodeAudioData(await (await blobOf(id)).arrayBuffer());
    const w1 = await blobOf(w.track1.id), w2 = await blobOf(w.track2.id);
    const F15 = Math.round(44100 * 0.005); // the fade's length
    const s1 = new DataView(await w1.slice(w1.size - 4 * (F15 + 1), w1.size - 4 * F15).arrayBuffer()).getInt16(0, true);
    const s2 = new DataView(await w2.slice(44 + 4 * F15, 48 + 4 * F15).arrayBuffer()).getInt16(0, true);
    const e1 = new DataView(await w1.slice(w1.size - 4).arrayBuffer()).getInt16(0, true);
    const e2 = new DataView(await w2.slice(44, 48).arrayBuffer()).getInt16(0, true);
    const cut = 7 * 44100;
    // The tones: the biggest jump between neighbouring samples, and the
    // level, within 20 ms of each cut, against the tone's own.
    const toneW = lib.find(x=> /tonew/.test(x.filename)), toneM = lib.find(x=> /tonem/.test(x.filename));
    const tw = await window.__split(toneW, 5.0031, F('tw1'), F('tw2'), ()=>{});
    const tm = await window.__split(toneM, 5.0031, F('tm1'), F('tm2'), ()=>{});
    const edge = async (id, atEnd)=>{ const b = await dec(id), c = b.getChannelData(0), n = Math.round(b.sampleRate * 0.02);
      const from = atEnd ? c.length - n : 0, to = atEnd ? c.length : n; let jump = 0, lvl = 0;
      for(let i = from + 1; i < to; i++){ jump = Math.max(jump, Math.abs(c[i] - c[i-1])); }
      const tip = atEnd ? c.subarray(c.length - Math.round(b.sampleRate * 0.0002)) : c.subarray(0, Math.round(b.sampleRate * 0.0002));
      for(const v of tip) lvl = Math.max(lvl, Math.abs(v));
      let mid = 0; const m0 = Math.floor(c.length / 2); for(let i = m0 + 1; i < m0 + 2000; i++) mid = Math.max(mid, Math.abs(c[i] - c[i-1]));
      return {jump, lvl, mid}; };
    const tone = {w1: await edge(tw.track1.id, true), w2: await edge(tw.track2.id, false), m1: await edge(tm.track1.id, true), m2: await edge(tm.track2.id, false)};
    const keys = await new Promise(r=>{ const rq = indexedDB.open('temple-sound-library'); rq.onsuccess = ()=>{ const g = rq.result.transaction('state').objectStore('state').getAllKeys(); g.onsuccess = ()=> r(g.result.filter(k=> String(k).startsWith('splitpart:'))); }; });
    const d = {w1: (await dec(w.track1.id)).duration, w2: (await dec(w.track2.id)).duration, m1: (await dec(m.track1.id)).duration, m2: (await dec(m.track2.id)).duration};
    const mp3Src = await blobOf(mp3.id);
    return {during, d, tone, e1, e2, w1size: w1.size, w2size: w2.size, s1, s2, expect1: ((cut - 1) % 20000) - 10000, expect2: (cut % 20000) - 10000,
      tracks: {w1: w.track1.duration, w2: w.track2.duration, m1: m.track1.duration, m2: m.track2.duration, mp3: mp3.duration},
      msizes: (await blobOf(m.track1.id)).size + (await blobOf(m.track2.id)).size, mp3size: mp3Src.size, peaks: w.track1.peaks.length, leftover: keys.length};
  });
  ok(res.during === 0, tag + 'nothing was decoded to split (' + res.during + ')');
  ok(Math.abs(res.tracks.w1 - 7) < 1e-6 && Math.abs(res.tracks.w2 - 13) < 1e-6, tag + 'WAV parts are 7 s and 13 s');
  ok(res.w1size === 44 + 7 * 44100 * 4 && res.w2size === 44 + 13 * 44100 * 4, tag + 'with a 44-byte header and exactly their samples');
  ok(res.s1 === ((7 * 44100 - Math.round(44100 * 0.005) - 1) % 20000) - 10000 && res.s2 === ((7 * 44100 + Math.round(44100 * 0.005)) % 20000) - 10000, tag + 'outside the fade, the samples are exactly the source\'s');
  ok(Math.abs(res.e1) <= 2 && Math.abs(res.e2) <= 2, tag + 'at the cut itself, the WAV fades to silence (' + res.e1 + ', ' + res.e2 + ')');
  for(const k of ['w1', 'w2', 'm1', 'm2']){
    const e = res.tone[k], what = (k[0] === 'w' ? 'WAV' : 'MP3') + ' tone, ' + (k[1] === '1' ? 'end of part 1' : 'start of part 2');
    ok(e.jump <= e.mid * 1.2 && e.lvl < 0.02, tag + what + ': no click (biggest step ' + e.jump.toFixed(4) + ' vs the tone\'s ' + e.mid.toFixed(4) + ', level at the cut ' + e.lvl.toFixed(4) + ')');
  }
  ok(Math.abs(res.d.w1 - 7) < 0.01 && Math.abs(res.d.w2 - 13) < 0.01, tag + 'both WAV parts decode to their lengths');
  ok(Math.abs(res.tracks.m1 - 50) < 0.05 && Math.abs(res.tracks.m1 + res.tracks.m2 - res.tracks.mp3) < 0.2, tag + 'MP3 cut at a frame by 50 s: ' + res.tracks.m1.toFixed(3) + ' + ' + res.tracks.m2.toFixed(3) + ' of ' + res.tracks.mp3.toFixed(3));
  ok(Math.abs(res.d.m1 - res.tracks.m1) < 0.1 && Math.abs(res.d.m2 - res.tracks.m2) < 0.1, tag + 'both MP3 parts decode to about their lengths (' + res.d.m1.toFixed(2) + ', ' + res.d.m2.toFixed(2) + ')');
  ok(res.msizes <= res.mp3size && res.mp3size - res.msizes < 64 * 1024, tag + 'the MP3 parts are the file\'s frames (without its tag)');
  ok(res.peaks === 720 || res.peaks > 100, tag + 'each part has a waveform from the source');
  ok(res.leftover === 0, tag + 'no pieces left behind');
  await ctx.close();
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  await run(b, false);
  await run(b, true);
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
