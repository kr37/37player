const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  const bad = [];
  for(const f of ['w_s16.wav','w_s24.wav','w_f32.wav','w_u8.wav','w_mono48.wav']){
    const r = await p.evaluate(async(f)=>{ const blob = await (await fetch(f)).blob(); const a = await window.__wav(blob); const w = await window.__lob(blob);
      let diff=0; for(let i=0;i<a.peaks.length;i++) diff=Math.max(diff, Math.abs(a.peaks[i]-w.p[i]));
      return {pieces: a.loudness.i, whole: w.l.i, dur: a.duration.toFixed(2), ch: a.channels, rate: a.sampleRate, peakDiff: diff.toFixed(3)}; }, f);
    console.log(f, JSON.stringify(r)); if(r.pieces !== r.whole || +r.peakDiff > 0.01) bad.push(f);
  }
  const t0=Date.now();
  const r = await p.evaluate(async()=>{ const blob = await (await fetch('w_big.wav')).blob(); const a = await window.__an(blob); const pk=a.peaks; return {dur:a.duration, L:a.loudness, flat: pk.every(v=>v===pk[0]), mem: Math.round(performance.memory.usedJSHeapSize/1e6)}; });
  console.log('635 MB wav via analyzeAudio:', JSON.stringify(r), ((Date.now()-t0)/1000).toFixed(0)+'s');
  console.log((await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.sharedLog')||'[]').slice(-1))).join('\n'));
  if(r.flat || r.L.i == null) bad.push('w_big.wav');
  console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL OK');
  await b.close();
})();
