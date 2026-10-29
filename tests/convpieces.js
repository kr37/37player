// Long files in formats 37 Player doesn't read in pieces itself (FLAC in
// Ogg, MP2…) measured through the converter, two minutes at a time
// (1.4.116), checked against the whole file decoded at once.
//   node convpieces.js     (servers from serve.sh; www/ffmpeg/ and www/longfmt/ as for morepieces.js)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 600000});
  const p = await b.newPage();
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  ok(await p.evaluate(async()=>{ await window.__pieces.getConverter(); return true; }), 'converter on the device');
  for(const file of (process.argv[2] ? [process.argv[2]] : ['flac.oga', 'x.mp2'])){
    const r = await p.evaluate(async(file)=>{
      const blob = await (await fetch('/longfmt/' + file)).blob();
      const t0 = performance.now();
      const a = await window.__pieces.conv(blob);
      const secs = (performance.now() - t0) / 1000;
      if(!a) return {err: 'null'};
      // the reference: the whole file (or, where this browser can't decode it, ffmpeg's WAV of it)
      let ref = blob; try{ const rr = await fetch('/longfmt/' + file + '.wav'); if(rr.ok) ref = await rr.blob(); }catch(e){}
      const w = await window.__pieces.sameWay(ref);
      const ma = Math.max(...a.peaks), mw = Math.max(...w.peaks);
      let worst = 0; for(let i = 0; i < a.peaks.length; i++) worst = Math.max(worst, Math.abs(a.peaks[i] / ma - w.peaks[i] / mw));
      return {secs, worst, la: a.loudness && a.loudness.i, lw: w.loudness && w.loudness.i, da: a.duration, dw: w.duration};
    }, file);
    console.log(file, JSON.stringify(r));
    if(r.err){ ok(false, file + ': ' + r.err); continue; }
    ok(r.worst < 0.03, file + ': waveform matches, within 3% (' + r.worst.toFixed(4) + ')');
    ok(r.la != null && Math.abs(r.la - r.lw) < 0.3, file + ': loudness within 0.3 LU (' + r.la + ' vs ' + r.lw + ')');
    ok(Math.abs(r.da - r.dw) < 0.3, file + ': same length (' + r.da.toFixed(2) + ' vs ' + r.dw.toFixed(2) + ')');
  }
  // The import's own path (analyzeAudio): a file this browser plays but won't
  // decode whole gets its waveform from the converter instead of a stand-in.
  if(!process.argv[2]){
    const viaImport = await p.evaluate(async()=>{
      const blob = await (await fetch('/longfmt/flac.oga')).blob();
      const C = window.AudioContext || window.webkitAudioContext, keep = C.prototype.decodeAudioData;
      C.prototype.decodeAudioData = function(){ return Promise.reject(new Error('no')); };
      try{ const a = await window.__pieces.whole(blob); return {flat: a.peaks.every(v=> v === 0.15), loud: a.loudness && a.loudness.i}; }
      finally{ C.prototype.decodeAudioData = keep; }
    });
    console.log('via import:', JSON.stringify(viaImport));
    ok(!viaImport.flat && viaImport.loud != null, 'import: plays but won\'t decode → measured through the converter');
  }
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
