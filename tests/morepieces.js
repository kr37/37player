// FLAC, Ogg Vorbis, Opus, WebM, Matroska and plain AAC read a piece at a
// time (1.4.114), checked against the whole file decoded at once through
// the same measuring.
//   node morepieces.js     (servers from serve.sh; www/longfmt/ from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 300000});
  const p = await b.newPage();
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  const only = process.argv[2];
  for(const [file, kind] of [['x.flac','flac'], ['x.ogg','ogg'], ['x.opus','ogg'], ['x.webm','webm'], ['x.mka','webm'], ['open.webm','webm'], ['x.aac','aac']]){
    if(only && !file.includes(only)) continue;
    const r = await p.evaluate(async(file, kind)=>{
      const blob = await (await fetch('/longfmt/' + file)).blob();
      let a; try{ a = await window.__pieces.more(blob, kind); }catch(err){ return {err: String(err && err.message || err)}; }
      const w = await window.__pieces.sameWay(blob);
      const ma = Math.max(...a.peaks), mw = Math.max(...w.peaks);
      let worst = 0, at = -1; for(let i = 0; i < a.peaks.length; i++){ const d = Math.abs(a.peaks[i] / ma - w.peaks[i] / mw); if(d > worst){ worst = d; at = i; } }
      return {worst, at, la: a.loudness && a.loudness.i, lw: w.loudness && w.loudness.i, da: a.duration, dw: w.duration};
    }, file, kind);
    console.log(file, JSON.stringify(r));
    if(r.err){ ok(false, file + ': ' + r.err); continue; }
    ok(r.worst < 0.02, file + ': waveform matches the whole file\'s, within 2% (' + r.worst.toFixed(4) + ' at ' + r.at + ')');
    ok(r.la != null && Math.abs(r.la - r.lw) < 0.2, file + ': loudness within 0.2 LU (' + r.la + ' vs ' + r.lw + ')');
    ok(Math.abs(r.da - r.dw) < 0.2, file + ': same length (' + r.da.toFixed(3) + ' vs ' + r.dw.toFixed(3) + ')');
  }
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
