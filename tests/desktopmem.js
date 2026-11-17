// Less of a recording in memory in the desktop app (2.5.035):
// - waveforms and loudness are made a piece at a time whatever the length
//   (desktopPiecesFirst): no decode is handed the whole file, and the result
//   matches what a browser gets by decoding it whole (MP3, WAV, M4A);
// - sending from the app's folders, pretending to be the Mac (WebKit), reads
//   the recording through once to send it, not once more to check it.
// Through the stand-in shell; the shared library on the test server.
//   node desktopmem.js <code>
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), os = require('os'), {execFileSync} = require('child_process');
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', APP = 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); };
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p37-mem-'));
const ff = (...a)=> execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);
// Longer than one 4 MB analysis piece (a computer's), as MP3 and M4A: 6 minutes at 192 kbps.
const src = d=> ['-f', 'lavfi', '-i', 'sine=f=220:d=' + d + ',volume=0.5', '-f', 'lavfi', '-i', 'anoisesrc=d=' + d + ':a=0.05', '-filter_complex', '[0][1]amix=inputs=2,volume=enable=between(t\\,10\\,70):volume=0.3', '-ac', '2'];
ff(...src(360), '-c:a', 'libmp3lame', '-b:a', '192k', path.join(tmp, 'a.mp3'));
ff(...src(40), '-c:a', 'pcm_s16le', path.join(tmp, 'a.wav'));
ff(...src(360), '-c:a', 'aac', '-b:a', '192k', path.join(tmp, 'a.m4a'));
ff('-f', 'lavfi', '-i', 'sine=f=300:d=95', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '256k', path.join(tmp, 'big.mp3'));
const TYPES = {mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4'};

async function page(b, name, desktop){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=> d.accept());
  p.on('console', async m=>{ if(/piece at a time/.test(m.text())){ const e = m.args()[1] ? await m.args()[1].evaluate(x=> x && (x.stack || x.message || String(x))).catch(()=> '?') : ''; console.log(name, 'PAGE:', m.text(), e); } });
  await p.setRequestInterception(true);
  p.on('request', r=> r.url().startsWith('http://localhost') || r.url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await p.evaluateOnNewDocument((shell, desktop)=>{
    // Every decode, by how many bytes it was handed.
    const proto = (window.BaseAudioContext || window.AudioContext).prototype, orig = proto.decodeAudioData;
    window.__decodes = [];
    proto.decodeAudioData = function(buf, ...rest){ window.__decodes.push(buf.byteLength); return orig.call(this, buf, ...rest); };
    if(desktop){ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__diskBlobMin = 1048576; window.__p37WebKit = true; (0, eval)(shell); }
  }, SHELL, desktop);
  await p.goto(APP, {waitUntil: 'domcontentloaded'}); await sleep(1500);
  if(desktop){ await clickText(p, '.modal button', '^Use this place$'); await sleep(1500); }
  await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const analyze = (p, file)=> p.evaluate(async(b64, name, type)=>{
  window.__decodes = [];
  const bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0));
  const a = await window.__disk.analyzeAudio(new File([bytes], name, {type}));
  return {size: bytes.length, decodes: window.__decodes.slice(), duration: a.duration, peaks: a.peaks, li: a.loudness && a.loudness.i, failed: !!(a.loudness && a.loudness.failed)};
}, fs.readFileSync(path.join(tmp, file)).toString('base64'), file, TYPES[file.split('.').pop()]);
const corr = (x, y)=>{ const n = Math.min(x.length, y.length); let mx = 0, my = 0; for(let i = 0; i < n; i++){ mx += x[i]; my += y[i]; } mx /= n; my /= n; let sxy = 0, sxx = 0, syy = 0; for(let i = 0; i < n; i++){ sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };

(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const W = await page(b, 'browser', false), D = await page(b, 'desktop', true);

  for(const f of ['a.mp3', 'a.wav', 'a.m4a']){
    const w = await analyze(W, f), d = await analyze(D, f);
    ok(w.decodes.some(n=> n >= w.size * 0.9), f + ': the browser decodes it whole, as before (' + w.decodes.length + ' decodes, biggest ' + Math.max(...w.decodes) + ' of ' + w.size + ')');
    ok(Math.max(0, ...d.decodes) < d.size * 0.6, f + ': the desktop app, a piece at a time: no decode handed the whole file (' + d.decodes.length + ' decodes, biggest ' + Math.max(0, ...d.decodes) + ' of ' + d.size + '; a WAV needs none)');
    const c = corr(w.peaks, d.peaks);
    ok(Math.abs(w.duration - d.duration) < 0.15 && c > 0.95 && !d.failed && d.li != null && Math.abs(w.li - d.li) < 1, f + ': and gets the same: ' + d.duration.toFixed(2) + ' s (' + w.duration.toFixed(2) + '), waveform correlation ' + c.toFixed(3) + ', loudness ' + (d.li != null ? d.li.toFixed(1) : d.li) + ' LUFS (' + (w.li != null ? w.li.toFixed(1) : w.li) + ')');
  }

  // Sending a 3 MB recording read where it lies (over the 1 MB this test sets), as the Mac.
  const bytes = fs.readFileSync(path.join(tmp, 'big.mp3'));
  const sent = await D.evaluate(async(b64, c, u)=>{
    const D = window.__disk, R = window.__dbg.getRoot();
    const bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0));
    R.library.push({id: 'bigsend', name: 'Big send', filename: 'big.mp3', fileSize: bytes.length, duration: 95, peaks: new Array(200).fill(0.5), addedAt: Date.now()});
    await D.idbPut('audio', {id: 'bigsend', blob: new File([bytes], 'big.mp3', {type: 'audio/mpeg'})});
    await window.__dbg.saveState();
    const rec = await D.idbGet('audio', 'bigsend');
    window.__fakeShellReadBytes = 0;
    await window.__dbg3.join(u, c, 'Mac');
    return {diskBlob: rec.blob instanceof D.DiskBlob};
  }, bytes.toString('base64'), CODE, URL_SYNC);
  await waitIdle(D); await sleep(2000); await waitIdle(D);
  const after = await D.evaluate(()=> ({read: window.__fakeShellReadBytes, log: (JSON.parse(localStorage.getItem('37player.sharedLog') || '[]')).join('\n')}));
  ok(sent.diskBlob && /Big send/.test(after.log) && !/not sending/.test(after.log), 'the desktop app (as the Mac) sent the recording, read where it lies (' + after.log.split('\n').filter(l=> /Big send|sent|sending/.test(l)).slice(-3).join(' / ') + ')');
  ok(after.read > bytes.length * 0.9 && after.read < bytes.length * 1.5, 'reading it through once to send it, not once more to check it (' + after.read + ' bytes read, file ' + bytes.length + ')');

  fs.rmSync(tmp, {recursive: true, force: true});
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
