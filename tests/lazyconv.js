// The converter reads a file of the desktop app's from the disk as it goes
// (2.2.039; Gen Rinzin's 8 GB Mac mini, 11 Nov 2026: converting big WAVs
// one after another, WebKit's Networking process held 4–6 GB, the inputs
// read whole into Blobs, and macOS restarted itself). The page runs as the
// desktop app with the stand-in shell (fake-shell.js), whose addresses
// (__p37FileUrl) are blob: URLs that answer Range requests, as p37lib://
// does. Checked:
//  - a WAV kept on the "disk" converts to an MP3 of the same length, and the
//    page itself never reads it (no fs_read of it: the worker reads it by
//    its address, a block at a time);
//  - the playback log says the converter reads files from the disk;
//  - where the address can't be read that way, it reads the file whole
//    first, as before, says so in the log, and still converts.
//   node lazyconv.js      (www/ffmpeg/ holds ffmpeg.wasm, as for conv3.js)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 300000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__diskBlobMin = 1048576; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await p.evaluate(()=> window.__disk.kind()) === 'desktop', 'the page runs as the desktop app');
  await p.evaluate(()=> window.__pieces.getConverter());

  // A 9 MB WAV (about 50 s of a tone, stereo 44.1 kHz) on the "disk": more than two of the worker's 4 MB blocks.
  const made = await p.evaluate(async()=>{
    const rate = 44100, secs = 51, n = rate * secs, data = new Int16Array(n * 2);
    for(let i = 0; i < n; i++){ const v = Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000 * (1 + 0.5 * Math.sin(i / rate))); data[2 * i] = v; data[2 * i + 1] = v; }
    const hdr = new DataView(new ArrayBuffer(44)), w = (o, s)=>{ for(let i = 0; i < s.length; i++) hdr.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); hdr.setUint32(4, 36 + data.byteLength, true); w(8, 'WAVE'); w(12, 'fmt '); hdr.setUint32(16, 16, true); hdr.setUint16(20, 1, true); hdr.setUint16(22, 2, true);
    hdr.setUint32(24, rate, true); hdr.setUint32(28, rate * 4, true); hdr.setUint16(32, 4, true); hdr.setUint16(34, 16, true); w(36, 'data'); hdr.setUint32(40, data.byteLength, true);
    const bytes = new Uint8Array(await new Blob([hdr.buffer, data.buffer]).arrayBuffer());
    const inv = window.__TAURI_INTERNALS__.invoke;
    await inv('fs_root_default', {id: 'lz', name: 'Lazy'});
    await inv('fs_write', bytes, {headers: {'p37-root': encodeURIComponent('lz'), 'p37-path': encodeURIComponent('talk.wav')}});
    return {size: bytes.length, secs};
  });
  const conv = async (label)=> p.evaluate(async()=>{
    const {DiskBlob} = window.__disk, L = window.__lazy;
    const st = await window.__TAURI_INTERNALS__.invoke('fs_stat', {root: 'lz', path: 'talk.wav'});
    const d = new DiskBlob('lz', 'talk.wav', st.size, 'audio/wav', 'talk.wav', Date.now(), 0); d.whole = true;
    window.__fakeShellPaths.length = 0;
    const t = performance.now();
    await L.start();
    const out = await L.convert(d, 'talk.wav', null);
    const ms = performance.now() - t;
    const reads = window.__fakeShellPaths.filter(x=> x === 'fs_read talk.wav').length;
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const buf = await ctx.decodeAudioData(await out.blob.arrayBuffer());
    return {reads, mp3: out.blob.size, type: out.blob.type, duration: Math.round(buf.duration * 10) / 10, ms: Math.round(ms), off: L.off(), log: window.__log().join('\n')};
  });

  // 1. By its address.
  const a = await conv();
  ok(a.reads === 0 && !a.off, 'converting a file on the disk: the page never reads it (fs_read of it: ' + a.reads + '), the worker does');
  ok(Math.abs(a.duration - made.secs) < 0.3 && a.mp3 > 100000 && /mpeg/.test(a.type), 'and it comes out as an MP3 of the same length (' + made.size + ' bytes in, ' + a.mp3 + ' out, ' + a.duration + ' s, ' + a.ms + ' ms)');
  ok(/the converter reads files from the disk as it goes/.test(a.log), 'the playback log says so');

  // 2. An address this webview can't read that way: the file read whole first, as before.
  const bad = await p.evaluate(()=>{ window.__lazy.stop(); window.__p37FileUrl = async ()=> 'http://127.0.0.1:1/nothing-here'; return true; });
  const c = await conv();
  ok(c.reads > 0 && c.off, 'when the address can\'t be read, the file is read whole first, as before (fs_read of it: ' + c.reads + ')');
  ok(Math.abs(c.duration - made.secs) < 0.3, 'and it still converts (' + c.duration + ' s)');
  ok(/can't read files from the disk as it goes here/.test(c.log), 'and the log says why (' + (c.log.split('\n').filter(l=> /disk as it goes/.test(l)).pop() || '').slice(0, 160) + ')');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
