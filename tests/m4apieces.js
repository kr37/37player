// AAC in an .m4a read a piece at a time (1.4.108): long Zoom recordings got
// a flat stand-in waveform and no loudness. Here the pieces' waveform and
// loudness are checked against the whole file decoded at once.
//   node m4apieces.js     (servers from serve.sh; www/m4a/ from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
// WebKit or Firefox (engines/adapter.js), not Chrome.
const OTHER_ENGINE = !!process.env.ENGINE && process.env.ENGINE !== 'chromium';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 180000});
  const p = await b.newPage();
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  if(OTHER_ENGINE) await p.evaluateOnNewDocument(()=>{ window.__otherEngine = true; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const [file, rate, ch] of [['/m4a/zoom.m4a', 32000, 1], ['/m4a/fast.m4a', 44100, 2], ['/conv/teaching.mp4', 44100, 1]]){
    const r = await p.evaluate(async(file)=>{
      const blob = await (await fetch(file)).blob();
      const a = await window.__pieces.m4a(blob);
      const w = await window.__pieces.sameWay(blob);
      const standIn = x=> x.every(v=> v === x[0]);
      // Peaks compared bucket by bucket, as fractions of the loudest.
      const ma = Math.max(...a.peaks), mw = Math.max(...w.peaks);
      // The last tenth of a second on its own (end): engines differ on the
      // AAC encoder's padding there (2112 samples of priming, and the frame's rest).
      // In WebKit and Firefox the first 0.5 s too (the decoder's priming: Firefox, 1.3% at 0.3 s).
      const endFrom = Math.floor(a.peaks.length * (1 - 0.1 / w.duration)), startTo = window.__otherEngine ? Math.ceil(a.peaks.length * 0.5 / w.duration) : 0;
      let worst = 0, at = -1, end = 0; for(let i = 0; i < a.peaks.length; i++){ const d = Math.abs(a.peaks[i] / ma - w.peaks[i] / mw); if(i >= endFrom || i < startTo){ end = Math.max(end, d); continue; } if(d > worst){ worst = d; at = i; } }
      return {n: a.peaks.length, flat: standIn(a.peaks), worst, at, end, la: a.loudness && a.loudness.i, lw: w.loudness && w.loudness.i, da: a.duration, dw: w.duration, ch: a.channels};
    }, file);
    console.log(file, JSON.stringify(r));
    ok(r.n === 720 && !r.flat, file + ': a real waveform from the pieces');
    // Chrome: within 0.5% everywhere. WebKit and Firefox decode a piece a
    // little differently at its edges (0.55–0.76% seen): within 1%, the end aside.
    const tol = OTHER_ENGINE ? 0.01 : 0.005;
    ok(r.worst < tol && (OTHER_ENGINE || r.end < tol), file + ': matches the whole file\'s, within ' + (tol * 100) + '% (' + r.worst.toFixed(4) + ' at ' + r.at + (OTHER_ENGINE ? '; the first 0.5 s and the last 0.1 s ' : '; the last 0.1 s ') + r.end.toFixed(4) + (OTHER_ENGINE ? ', not counted in ' + process.env.ENGINE : '') + ')');
    ok(r.la != null && Math.abs(r.la - r.lw) < 0.1, file + ': loudness within 0.1 LU (' + r.la + ' vs ' + r.lw + ')');
    ok(Math.abs(r.da - r.dw) < 0.1, file + ': same length (' + r.da.toFixed(2) + ' vs ' + r.dw.toFixed(2) + ')');
  }
  // analyzeInPieces sends an .m4a here (what a long one goes through on import, Check library and the background).
  const via = await p.evaluate(async()=>{ const r = await window.__pieces.any(await (await fetch('/m4a/zoom.m4a')).blob(), 'mp4'); return r.loudness && r.loudness.i; });
  ok(via === -30.5, 'analyzeInPieces reads an .m4a this way');
  // Apple Lossless isn't AAC: refused, so the caller keeps the stand-in.
  const alac = await p.evaluate(async()=>{ try{ await window.__pieces.m4a(await (await fetch('/conv/lossless.m4a')).blob()); return 'read'; }catch(err){ return err.message; } });
  ok(/not AAC/.test(alac), 'Apple Lossless is refused: ' + alac);
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
