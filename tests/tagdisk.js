// New details written into a recording of the desktop app's (2.5.035; FLAC, WAV 2.5.038;
// shell 2.5.3): an MP3 or M4A read where it lies isn't read whole into the
// page. Its writer reads the details' bytes only; the new file is new first
// bytes followed by the rest of the old one, which the app copies on disk
// (fs_append_range), and the file isn't read back whole to be checked.
// With an older app, the rest goes through the page piece by piece. The
// files come out playable, with the new details (checked with ffprobe).
// Through the stand-in shell.
//   node tagdisk.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), os = require('os'), {execFileSync} = require('child_process');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return ''; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p37-tagdisk-'));
const ff = (...a)=> execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);
// About 3 MB each (bigger than the 1 MB this test reads files where they lie from).
ff('-f', 'lavfi', '-i', 'sine=f=300:d=95', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '256k', '-metadata', 'title=Old MP3', '-metadata', 'artist=Someone', path.join(tmp, 'long.mp3'));
ff('-f', 'lavfi', '-i', 'sine=f=300:d=95', '-ac', '2', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-metadata', 'title=Old M4A', path.join(tmp, 'long.m4a'));
ff('-f', 'lavfi', '-i', 'anoisesrc=d=30:a=0.3', '-ac', '2', '-c:a', 'flac', '-metadata', 'title=Old FLAC', path.join(tmp, 'long.flac'));
ff('-f', 'lavfi', '-i', 'sine=f=300:d=30', '-ac', '2', '-c:a', 'pcm_s16le', '-metadata', 'title=Old WAV', path.join(tmp, 'long.wav'));
const probe = f=> JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags=title,artist', '-of', 'json', f])).format;
const decodes = f=>{ try{ return execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim() === ''; }catch(e){ return false; } };
const id3End = b=> b.slice(0, 3).toString('latin1') === 'ID3' ? 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + ((b[5] & 0x10) ? 10 : 0) : 0;

(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('console', m=>{ if(/Could not rewrite tags/.test(m.text())) console.log('PAGE:', m.text()); });
  p.on('dialog', async d=> d.accept());
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; window.__diskBlobMin = 1048576; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await sleep(1500);

  // Put a recording into the library, rename it, rewrite its details; give back what happened.
  const run = async (file, type, id, newName, noRanges)=>{
    const b64 = fs.readFileSync(path.join(tmp, file)).toString('base64');
    return p.evaluate(async(b64, file, type, id, newName, noRanges)=>{
      const D = window.__disk, R = window.__dbg.getRoot();
      const bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0));
      R.library.push({id, name: 'Old', artist: 'Someone', filename: file, fileSize: bytes.length, addedAt: Date.now(), fileTags: {name: 'Old', artist: 'Someone', album: null, trackNo: null, art: null}}); // as written at import: the name is then edited
      await D.idbPut('audio', {id, blob: new File([bytes], file, {type})});
      await window.__dbg.saveState();
      const before = await D.idbGet('audio', id);
      const out = {diskBlob: before && before.blob instanceof D.DiskBlob};
      D.shell().append_range = !noRanges;
      window.__fakeShellReadBytes = 0; window.__fakeShellBiggestWrite = 0; window.__fakeRangeCopies = 0;
      const tr = R.library.find(t=> t.id === id); tr.name = newName;
      out.rewrote = await D.rewriteFileTagsIfPossible(id);
      out.read = window.__fakeShellReadBytes; out.biggestWrite = window.__fakeShellBiggestWrite; out.ranges = window.__fakeRangeCopies;
      const after = await D.idbGet('audio', id);
      out.size = after.blob.size; out.fileSize = R.library.find(t=> t.id === id).fileSize;
      const u = new Uint8Array(await after.blob.arrayBuffer()); let s = ''; for(let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      out.b64 = btoa(s);
      out.log = window.__log().join('\n');
      return out;
    }, b64, file, type, id, newName, !!noRanges);
  };
  const check = (label, file, r, newName)=>{
    const orig = fs.readFileSync(path.join(tmp, file)), got = Buffer.from(r.b64, 'base64'), outFile = path.join(tmp, 'out-' + label.replace(/\W+/g, '-') + path.extname(file));
    fs.writeFileSync(outFile, got);
    ok(r.diskBlob && r.rewrote, label + ': the file is read where it lies, and its details were rewritten');
    const pr = probe(outFile), po = probe(path.join(tmp, file));
    ok(pr.tags && pr.tags.title === newName && Math.abs(pr.duration - po.duration) < 0.1 && decodes(outFile), label + ': the new file has the new name, the same length, and plays (' + JSON.stringify(pr) + ')');
    ok(r.size === got.length && r.fileSize === got.length, label + ': the library has its new size (' + r.size + ')');
    return {orig, got};
  };

  // MP3: the new tag, then the audio exactly as it was.
  let r = await run('long.mp3', 'audio/mpeg', 'mp3a', 'New MP3');
  let {orig, got} = check('MP3', 'long.mp3', r, 'New MP3');
  ok(got.subarray(id3End(got)).equals(orig.subarray(id3End(orig))), 'MP3: the audio after the tag is the old file\'s, byte for byte');
  ok(r.ranges === 1 && r.read < 65536 && r.biggestWrite < 65536, 'MP3: the audio was copied on disk, not read into the page (' + r.read + ' bytes read, biggest write ' + r.biggestWrite + ', ' + r.ranges + ' stretch copied)');
  ok(!/read whole into the page/.test(r.log), 'and the playback log has no file read whole');

  // M4A with its index before the audio: the index's offsets move.
  r = await run('long.m4a', 'audio/mp4', 'm4aa', 'New M4A');
  check('M4A', 'long.m4a', r, 'New M4A');
  ok(r.ranges >= 1 && r.ranges <= 2 && r.read < 262144 && r.biggestWrite < 262144, 'M4A: the audio was copied on disk, not read into the page (' + r.read + ' bytes read, biggest write ' + r.biggestWrite + ', ' + r.ranges + ' stretches copied)');

  // FLAC and WAV (2.5.037): their details are blocks or chunks of their own; the sound is copied as it lies.
  for(const [file, type, name] of [['long.flac', 'audio/flac', 'New FLAC'], ['long.wav', 'audio/wav', 'New WAV']]){
    r = await run(file, type, file.replace('.', ''), name);
    check(file.split('.')[1].toUpperCase(), file, r, name);
    ok(r.ranges >= 1 && r.read < 262144 && r.biggestWrite < 262144, file.split('.')[1].toUpperCase() + ': the sound was copied on disk, not read into the page (' + r.read + ' bytes read, biggest write ' + r.biggestWrite + ', ' + r.ranges + ' stretches copied)');
  }

  // An app from before 2.5.3: the same file, through the page piece by piece.
  r = await run('long.mp3', 'audio/mpeg', 'mp3b', 'Older app', true);
  ({orig, got} = check('MP3, older app', 'long.mp3', r, 'Older app'));
  ok(r.ranges === 0 && r.read > 2 * 1048576 && got.subarray(id3End(got)).equals(orig.subarray(id3End(orig))), 'MP3, older app: the rest went through the page, and came out the same (' + r.read + ' bytes read)');

  fs.rmSync(tmp, {recursive: true, force: true});
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
