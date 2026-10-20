const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--js-flags=--expose-gc']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  const r1 = await p.evaluate(async()=>{ const blob = await (await fetch('ten.mp3')).blob(); const a = await window.__pieces(blob); const w = await window.__lob(blob);
    let diff=0; for(let i=0;i<a.peaks.length;i++) diff=Math.max(diff, Math.abs(a.peaks[i]-w.p[i]));
    return {piecesL: a.loudness, wholeL: w.l, dP: a.duration, dW: w.d, maxPeakDiff: diff.toFixed(3)}; });
  console.log('10 min, pieces vs whole:', JSON.stringify(r1));
  const bad = []; if(r1.piecesL.i !== r1.wholeL.i || +r1.maxPeakDiff > 0.1) bad.push('10 min');
  const t0=Date.now();
  const r2 = await p.evaluate(async()=>{ const blob = await (await fetch('long2h.mp3')).blob(); const a = await window.__an(blob); const pk=a.peaks; return {dur: a.duration, ch: a.channels, L: a.loudness, flat: pk.every(v=>v===pk[0]), min: Math.min(...pk).toFixed(2), max: Math.max(...pk).toFixed(2), mem: performance.memory && Math.round(performance.memory.usedJSHeapSize/1e6)}; });
  console.log('2 h analyzeAudio:', JSON.stringify(r2), ((Date.now()-t0)/1000).toFixed(0)+'s');
  const log = await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.sharedLog')||'[]').slice(-2));
  console.log(log.join('\n'));
  if(r2.flat || !r2.L || r2.L.i == null) bad.push('2 h');
  console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL OK');
  await b.close();
})();
