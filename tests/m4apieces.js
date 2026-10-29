// AAC in an .m4a read a piece at a time (1.4.108): long Zoom recordings got
// a flat stand-in waveform and no loudness. Here the pieces' waveform and
// loudness are checked against the whole file decoded at once.
//   node m4apieces.js     (servers from serve.sh; www/m4a/ from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 180000});
  const p = await b.newPage();
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const [file, rate, ch] of [['/m4a/zoom.m4a', 32000, 1], ['/m4a/fast.m4a', 44100, 2], ['/conv/teaching.mp4', 44100, 1]]){
    const r = await p.evaluate(async(file)=>{
      const blob = await (await fetch(file)).blob();
      const a = await window.__pieces.m4a(blob);
      const w = await window.__pieces.sameWay(blob);
      const standIn = x=> x.every(v=> v === x[0]);
      // Peaks compared bucket by bucket, as fractions of the loudest.
      const ma = Math.max(...a.peaks), mw = Math.max(...w.peaks);
      let worst = 0; for(let i = 0; i < a.peaks.length; i++) worst = Math.max(worst, Math.abs(a.peaks[i] / ma - w.peaks[i] / mw));
      return {n: a.peaks.length, flat: standIn(a.peaks), worst, la: a.loudness && a.loudness.i, lw: w.loudness && w.loudness.i, da: a.duration, dw: w.duration, ch: a.channels};
    }, file);
    console.log(file, JSON.stringify(r));
    ok(r.n === 720 && !r.flat, file + ': a real waveform from the pieces');
    ok(r.worst < 0.005, file + ': matches the whole file\'s, within 0.5% (' + r.worst.toFixed(4) + ')');
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
