// Silence and stops in an export (2.0.002, Gen Rinzin, 7 Nov 2026): MP3s, not
// WAVs, tagged Artist "Silence" and Album "Silence" (stops: "Stops"), filed
// as any track is: music/Silence/Silence/, music/Silence/Stops/. Made without
// an encoder (frames of zeros): they decode as silence of the right length,
// their tags read back, and an import knows them again as silence and stops.
//   node silencemp3.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  const r = await p.evaluate(async()=>{
    const S = window.__sil, out = {};
    const bytes = S.mp3(7, '>>> SILENCE: A gap <<<', 'Silence', 'Silence');
    out.kb = Math.round(bytes.length / 1024);
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const buf = await ctx.decodeAudioData(bytes.slice().buffer);
    out.duration = buf.duration; out.rate = buf.sampleRate; out.channels = buf.numberOfChannels;
    let peak = 0; for(let c = 0; c < buf.numberOfChannels; c++){ const d = buf.getChannelData(c); for(let i = 0; i < d.length; i += 97) peak = Math.max(peak, Math.abs(d[i])); }
    out.peak = peak;
    const tags = await S.tags(new File([bytes], 'SILENCE - A gap.mp3', {type: 'audio/mpeg'}));
    out.tags = tags && [tags.title, tags.artist, tags.album];
    out.minute = Math.round(S.mp3(60, 'x', 'Silence', 'Silence').length / 1024);
    const pl = {id: 'p1', kind: 'playlist', name: 'Retreat', items: [{id: 'a', kind: 'silence', seconds: 60, name: ''}, {id: 'b', kind: 'stop', name: 'Teaching'}, {id: 'c', kind: 'silence', seconds: 5, name: 'A gap'}]};
    const e = S.entries([{ancestorPath: [], playlist: pl}]);
    out.paths = e.zipEntries.map(x=> x.name);
    out.back = e.zipEntries.map(x=> S.recognize(x.name, ''));
    return out;
  });
  ok(Math.abs(r.duration - 7) < 0.05 && r.rate === 44100 && r.channels === 2, 'a 7-second silence decodes at 7 seconds, 44.1 kHz stereo (' + [r.duration, r.rate, r.channels] + ')');
  ok(r.peak === 0, 'and is silent throughout');
  ok(JSON.stringify(r.tags) === JSON.stringify(['>>> SILENCE: A gap <<<', 'Silence', 'Silence']), 'its title, Artist "Silence" and Album "Silence" read back (' + JSON.stringify(r.tags) + ')');
  ok(r.minute > 200 && r.minute < 260, 'a minute of it is about 240 KB (' + r.minute + ' KB; the WAV was about 10 MB)');
  ok(JSON.stringify(r.paths) === JSON.stringify(['music/Silence/Silence/SILENCE - Silence 1 minute.mp3', 'music/Silence/Silence/SILENCE - A gap.mp3', 'music/Silence/Stops/STOP - Teaching.mp3']), 'filed as any track, by artist and album (' + r.paths.join(', ') + ')');
  ok(r.back.map(x=> x && x.kind + ':' + x.name).join('|') === 'silence:Silence 1 minute|silence:A gap|stop:Teaching', 'an import knows them again (' + JSON.stringify(r.back) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
