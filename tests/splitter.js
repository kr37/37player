// The splitter (1.4.086): many cuts, each piece kept or left out, and in
// the right format; the cut lands where it was heard; the pieces keep the
// original's loudness and volume and get waveforms of their own; opened from
// column B, the playlist entry can become the pieces, and Undo takes it all
// back at once. Also the page itself: the cursor and marks by keyboard.
// The signal (made here): 10 s of low noise, a near-silent gap from 3.0 to
// 3.4 s, and loud 10 ms clicks starting exactly at 2.000, 5.000 and 7.500 s,
// as WAV, MP3, M4A (AAC) and FLAC.
//   node splitter.js CODE      (servers from serve.sh; www/ffmpeg/ from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const SHOTS = path.join(__dirname, 'shots');

function makeSignal(){
  const dir = path.join(__dirname, 'www', 'splt');
  fs.mkdirSync(dir, {recursive: true});
  const rate = 44100, n = rate * 10, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let seed = 12345; const rnd = ()=>{ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
  const clicks = [2.0, 5.0, 7.5].map(s=> Math.round(s * rate)), clickLen = Math.round(rate * 0.01);
  for(let i = 0; i < n; i++){
    const t = i / rate;
    let v = rnd() * (t >= 3.0 && t < 3.4 ? 0.0005 : 0.03);
    for(const c of clicks) if(i >= c && i < c + clickLen) v = 0.9 * Math.sin(2 * Math.PI * 2000 * (i - c) / rate + Math.PI / 2);
    const s = Math.round(v * 32767);
    buf.writeInt16LE(s, 44 + i * 4); buf.writeInt16LE(s, 46 + i * 4);
  }
  fs.writeFileSync(path.join(dir, 'sig.wav'), buf);
  const ff = (...a)=> execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, 'sig.wav'), ...a]);
  ff('-c:a', 'libmp3lame', '-b:a', '128k', path.join(dir, 'sig.mp3'));
  ff('-c:a', 'aac', '-b:a', '128k', path.join(dir, 'sig.m4a'));
  ff('-c:a', 'flac', path.join(dir, 'sig.flac'));
}

(async()=>{
  makeSignal();
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.setViewport({width: 1200, height: 900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  const dialogs = []; p.on('dialog', d=>{ dialogs.push(d.message()); d.accept(); });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  // Files kept as imported, and the converter on this device.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.formatPolicy = Object.assign({}, r.formatPolicy, {when: 'untouched'}); await window.__dbg.saveState(); await window.__splitter.ensure(); });
  ok(await p.evaluate(()=> window.__conv.stored()), 'the converter is on this device');
  await p.evaluate(async()=>{
    const files = [];
    for(const n of ['sig.wav', 'sig.mp3', 'sig.m4a', 'sig.flac']){
      const bl = await (await fetch('splt/' + n)).blob();
      const f = new File([bl], n, {type: bl.type}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Sig/' + n}); files.push(f);
    }
    window.__dbg.bulkImportFolder(files);
  });
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.filter(x=> /^sig\./.test(x.filename)).length >= 4 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(2500); // loudness measured in the background
  for(const x of ['^OK$','^Close$','^Not now$','^Keep them$']){ await clickText(p,'.modal button',x); await sleep(300); }
  for(let i=0; i<40; i++){ if(await p.evaluate(()=> window.__dbg.getRoot().library.filter(x=> /^sig\./.test(x.filename)).every(x=> x.loudness && x.loudness.i != null))) break; await sleep(500); }
  const ids = await p.evaluate(()=>{ const o = {}; window.__dbg.getRoot().library.forEach(x=>{ const m = x.filename.match(/^sig\.(\w+)$/); if(m) o[m[1]] = x.id; }); return o; });
  ok(Object.keys(ids).length === 4, 'the four test files are in the library (' + Object.keys(ids).join(', ') + ')');

  // ---- The detailed waveform lines up with what's heard
  const fine = await p.evaluate(async (ids)=>{
    const out = {};
    for(const k of Object.keys(ids)){
      const f = await window.__splitter.fineOf(ids[k]);
      if(!f){ out[k] = null; continue; }
      const loud = (a, b)=>{ let best = -1, at = 0; for(let i = Math.floor(a / f.step); i < Math.ceil(b / f.step); i++) if(f.max[i] > best){ best = f.max[i]; at = i; } return at * f.step; };
      // where the click begins: the first bucket past half the loudest
      const onset = (a, b)=>{ const top = f.max[Math.round(loud(a, b) / f.step)]; for(let i = Math.floor(a / f.step); i < Math.ceil(b / f.step); i++) if(f.max[i] > top / 2) return i * f.step; return -1; };
      out[k] = {n: f.n, step: f.step, c2: onset(1.9, 2.1), c5: onset(4.9, 5.1), c75: onset(7.4, 7.6), quiet: window.__splitter.quiet(f, 3.6, 0, 10)};
    }
    out.off = await window.__splitter.offset(ids.mp3);
    return out;
  }, ids);
  for(const k of ['wav', 'mp3', 'm4a', 'flac']){
    const f = fine[k];
    if(!f){ ok(false, k + ': a detailed waveform'); continue; }
    const tol = k === 'wav' || k === 'flac' ? 0.0051 : 0.0101;
    ok(Math.abs(f.c2 - 2) <= tol && Math.abs(f.c5 - 5) <= tol && Math.abs(f.c75 - 7.5) <= tol, k + ': the detailed waveform\'s clicks are where they\'re heard (' + [f.c2, f.c5, f.c75].map(x=> x.toFixed(3)).join(', ') + ')');
    ok(f.quiet >= 3.0 && f.quiet <= 3.4, k + ': "find the quiet" from 3.6 s lands in the quiet gap (' + f.quiet.toFixed(3) + ')');
  }
  ok(fine.off > 0.02 && fine.off < 0.04, 'the MP3\'s gapless offset is read from its header (' + (fine.off * 1000).toFixed(1) + ' ms)');

  // ---- Splitting each format, three cuts, the second piece left out
  const split = (key, fileIdKey)=> p.evaluate(async (id, key)=>{
    const lib = window.__dbg.getRoot().library, src = lib.find(x=> x.id === id);
    src.volumeDb = 3; await window.__dbg.saveState();
    const F = n=> ({name: key + n, artist: 'Art', album: 'Alb', trackNo: n});
    const fine = await window.__splitter.fineOf(id);
    const r = await window.__splitter.into(src, [1.9, 4.9, 7.4], [F(1), null, F(3), F(4)], {fine});
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const clickIn = async tr=>{ const bl = await window.__dmg.get(tr.id); const buf = await ctx.decodeAudioData(await bl.arrayBuffer()); const c = buf.getChannelData(0); for(let i = 0; i < c.length; i++) if(Math.abs(c[i]) > 0.5) return {at: i / buf.sampleRate, len: buf.duration}; return {at: -1, len: buf.duration}; };
    const out = {kept: r.map(x=> x ? x.name : null), files: r.filter(Boolean).map(x=> x.filename), durs: r.filter(Boolean).map(x=> x.duration),
      loud: r.filter(Boolean).map(x=> x.loudness && x.loudness.i), srcLoud: src.loudness && src.loudness.i, vol: r.filter(Boolean).map(x=> x.volumeDb),
      peaks: r.filter(Boolean).map(x=> ({n: x.peaks.length, flat: x.peaks.every(v=> v === x.peaks[0]), top: x.peaks.indexOf(Math.max(...x.peaks))})),
      clicks: []};
    for(const tr of r.filter(Boolean)) out.clicks.push(await clickIn(tr));
    out.srcSame = lib.includes(src) && src.filename === 'sig.' + key;
    return out;
  }, ids[fileIdKey || key], key);

  const wav = await split('wav');
  ok(JSON.stringify(wav.kept) === JSON.stringify(['wav1', null, 'wav3', 'wav4']), 'WAV: pieces 1, 3 and 4 made, piece 2 left out');
  ok(wav.files.every(f=> /\.wav$/.test(f)), 'WAV, "Don\'t touch my files": the pieces stay WAV (' + wav.files.join(', ') + ')');
  ok(Math.abs(wav.durs[0] - 1.9) < 1e-6 && Math.abs(wav.durs[1] - 2.5) < 1e-6 && Math.abs(wav.durs[2] - 2.6) < 1e-6, 'WAV: exactly 1.9, 2.5 and 2.6 s (' + wav.durs.map(x=> x.toFixed(4)).join(', ') + ')');
  ok(Math.abs(wav.clicks[1].at - 0.1) < 0.0005 && Math.abs(wav.clicks[2].at - 0.1) < 0.0005, 'WAV: the clicks at 5.0 and 7.5 s are 0.1 s into pieces cut at 4.9 and 7.4 (' + wav.clicks.map(c=> c.at.toFixed(4)).join(', ') + ')');
  ok(wav.loud.every(v=> v === wav.srcLoud), 'WAV: every piece keeps the original\'s loudness (' + wav.srcLoud + ' LUFS)');
  ok(wav.vol.every(v=> v === 3), 'WAV: and its volume (+3 dB)');
  ok(wav.peaks.every(x=> x.n === 720 && !x.flat), 'WAV: each piece has a waveform of its own');
  ok(Math.abs(wav.peaks[1].top / 720 * 2.5 - 0.1) < 0.02, 'WAV: piece 3\'s waveform peaks at its click (bucket ' + wav.peaks[1].top + ')');
  ok(wav.srcSame, 'WAV: the original is untouched and still in the library');

  const mp3 = await split('mp3');
  ok(mp3.files.every(f=> /\.mp3$/.test(f)), 'MP3: the pieces stay MP3, frames copied (' + mp3.files.join(', ') + ')');
  ok(Math.abs(mp3.clicks[1].at - 0.1) <= 0.016 && Math.abs(mp3.clicks[2].at - 0.1) <= 0.016, 'MP3: a cut heard at 4.9 s is 0.1 s before the click, within half a frame, with the gapless offset allowed for (' + mp3.clicks.map(c=> c.at.toFixed(4)).join(', ') + ')');
  ok(mp3.loud.every(v=> v === mp3.srcLoud) && mp3.peaks.every(x=> !x.flat), 'MP3: original loudness, own waveforms');

  const m4a = await split('m4a');
  ok(m4a.files.every(f=> /\.m4a$/.test(f)), 'M4A: the pieces stay M4A, the sound copied by the converter (' + m4a.files.join(', ') + ')');
  ok(Math.abs(m4a.clicks[1].at - 0.1) <= 0.03 && Math.abs(m4a.clicks[2].at - 0.1) <= 0.03, 'M4A: clicks about 0.1 s in (' + m4a.clicks.map(c=> c.at.toFixed(4)).join(', ') + ')');
  ok(Math.abs(m4a.clicks[1].len - 2.5) < 0.06, 'M4A: piece 3 is about 2.5 s (' + m4a.clicks[1].len.toFixed(3) + ')');

  const flac = await split('flac');
  ok(flac.files.every(f=> /\.flac$/.test(f)), 'FLAC: the pieces stay FLAC (' + flac.files.join(', ') + ')');
  ok(Math.abs(flac.clicks[1].at - 0.1) < 0.001 && Math.abs(flac.clicks[1].len - 2.5) < 0.001, 'FLAC: written again losslessly, cut to the sample (' + flac.clicks[1].at.toFixed(4) + ', ' + flac.clicks[1].len.toFixed(4) + ' s)');

  // A WAV the settings would convert: straight to the preferred format.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.formatPolicy = Object.assign({}, r.formatPolicy, {when: 'reduce', preset: 'standard'}); await window.__dbg.saveState(); });
  const before = dialogs.length;
  const conv = await split('wavconv', 'wav');
  ok(conv.files.every(f=> /\.mp3$/.test(f)), 'WAV under "make big files smaller": the pieces are MP3 straight away (' + conv.files.join(', ') + ')');
  ok(Math.abs(conv.clicks[1].at - 0.1) <= 0.004 && Math.abs(conv.clicks[2].at - 0.1) <= 0.004, 'and cut to the sample before encoding (' + conv.clicks.map(c=> c.at.toFixed(4)).join(', ') + ')');
  await sleep(1000);
  ok(!(await p.$('.modal')) || !/Keep the originals/i.test(await p.evaluate(()=> document.querySelector('.modal')?.innerText || '')), 'no "Keep the originals?" question: nothing was converted twice');
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.formatPolicy = Object.assign({}, r.formatPolicy, {when: 'untouched'}); await window.__dbg.saveState(); });

  // ---- From column B: the entry becomes the pieces; Undo takes it all back
  const setup = await p.evaluate(async (id)=>{
    const r = window.__dbg.getRoot(), uid = ()=> Math.random().toString(36).slice(2);
    const other = r.library.find(x=> x.filename === 'sig.mp3');
    const e1 = uid(), e2 = uid(), e3 = uid();
    const p1 = {id: uid(), kind: 'playlist', name: 'Session', order: 0, items: [{id: e1, kind: 'track', refId: id, order: 0}, {id: e2, kind: 'track', refId: other.id, order: 1}]};
    const p2 = {id: uid(), kind: 'playlist', name: 'Other', order: 1, items: [{id: e3, kind: 'track', refId: id, order: 0}]};
    r.tree.push(p1, p2); await window.__dbg.saveState();
    await new Promise(res=> setTimeout(res, 1500)); // its own step in Undo
    return {p1: p1.id, p2: p2.id, e1, other: other.id, lib: r.library.length};
  }, ids.wav);
  await p.evaluate(()=>{ window.__dbg.setMode('editing'); });
  await p.evaluate((id)=> window.__dbg.editPl(id), setup.p1); await sleep(600);
  await p.evaluate(()=> document.querySelector('#editorColB .item-row [data-act="edit"]').click()); await sleep(600);
  ok(!!(await p.$('#editSplit')), 'the track\'s ✎ dialog has Split…');
  await p.click('#editSplit');
  for(let i = 0; i < 40 && !(await p.evaluate(()=> !!(window.__splitter.state() && window.__splitter.state().fine))); i++) await sleep(250);
  ok(await p.evaluate(()=> !!document.getElementById('splitPage') && !!window.__splitter.state().fine), 'the splitter opens, and has its detailed waveform');
  ok(await p.evaluate(()=> /^Split “sig/.test(document.getElementById('spTitle').textContent)), 'with the track\'s name as its title');
  // Keyboard: Home, → three times (10 ms each), Shift+→ (100 ms).
  await p.focus('#spZoom');
  await p.keyboard.press('Home');
  for(let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
  await p.keyboard.down('Shift'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Shift');
  ok(Math.abs(await p.evaluate(()=> window.__splitter.state().cursor) - 0.13) < 1e-9, '→ moves the cursor 10 ms, Shift+→ 100 ms (now ' + (await p.evaluate(()=> window.__splitter.state().cursor)).toFixed(3) + ' s)');
  await p.evaluate(()=> window.__splitter.cursor(4.9));
  await p.keyboard.press('m');
  ok(JSON.stringify(await p.evaluate(()=> window.__splitter.state().marks.map(m=> +m.toFixed(4)))) === '[4.9]', 'M puts a mark exactly at the cursor (paused: not snapped)');
  await p.keyboard.press('ArrowLeft');
  ok(Math.abs(await p.evaluate(()=> window.__splitter.state().marks[0]) - 4.89) < 1e-9, '← moves the selected mark 10 ms');
  await p.keyboard.press('ArrowRight');
  await p.evaluate(()=> window.__splitter.cursor(7.4));
  await p.keyboard.press('Enter');
  ok(JSON.stringify(await p.evaluate(()=> window.__splitter.state().marks.map(m=> +m.toFixed(4)))) === '[4.9,7.4]', 'Enter puts a second mark');
  await p.keyboard.press('Delete');
  ok((await p.evaluate(()=> window.__splitter.state().marks.length)) === 1, 'Delete removes the selected mark');
  await p.evaluate(()=> window.__splitter.cursor(7.4)); await p.keyboard.press('m');
  ok((await p.evaluate(()=> document.querySelectorAll('#spPieces tbody tr').length)) === 3, 'three pieces in the table');
  ok(/part 1/.test(await p.evaluate(()=> document.querySelector('#spPieces tr[data-k="0"] [data-f="name"]').value)), 'pieces are named "… - part n" to begin with');
  await p.click('#spPieces tr[data-k="1"] [data-f="keep"]');
  ok(/part 2/.test(await p.evaluate(()=> document.querySelector('#spPieces tr[data-k="2"] [data-f="name"]').value)), 'leaving piece 2 out renumbers the last as part 2');
  await p.click('#spPieces tr[data-k="0"] [data-f="name"]', {clickCount: 3}); await p.keyboard.type('Opening prayers');
  ok(/2 kept, 1 left out/.test(await p.evaluate(()=> document.getElementById('spSummary').textContent)), 'the summary says what will be kept');
  ok(/stays WAV/.test(await p.evaluate(()=> document.getElementById('spSummary').textContent)), 'and that the pieces stay WAV');
  ok((await p.evaluate(()=> document.getElementById('spGo').textContent)) === 'Split into 2 tracks', 'the button says "Split into 2 tracks"');
  // Space plays the splitter's own player, not 37 Player's.
  await p.focus('#spZoom'); await p.evaluate(()=> window.__splitter.cursor(1.0));
  await p.keyboard.press(' '); await sleep(700);
  const playing = await p.evaluate(()=> ({sp: !document.getElementById('spAudio').paused, t: document.getElementById('spAudio').currentTime, main: window.__aud().paused}));
  ok(playing.sp && playing.t > 1.1 && playing.main, 'Space plays from the cursor in the splitter (' + playing.t.toFixed(2) + ' s), and the main player stays quiet');
  await p.keyboard.press(' '); await sleep(200);
  // "Up to here": stops on the cursor and leaves it there.
  await p.evaluate(()=> window.__splitter.cursor(4.0));
  await p.keyboard.press(','); await sleep(2600);
  const hear = await p.evaluate(()=> ({paused: document.getElementById('spAudio').paused, cur: window.__splitter.state().cursor}));
  ok(hear.paused && Math.abs(hear.cur - 4.0) < 1e-6, '"Up to here" plays the two seconds before the cursor and stops on it');
  await p.evaluate(()=> window.__dbg.disp('dark', false)); await sleep(300);
  await p.screenshot({path: path.join(SHOTS, 'splitter-dark.png')});
  await p.evaluate(()=> window.__dbg.disp('light', false)); await sleep(300);
  await p.evaluate(()=> window.__splitter.cursor(4.95)); await p.evaluate(()=>{ const s = window.__splitter.state(); s.view.span = 1; s.view.start = 4.5; }); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowDown');
  await p.screenshot({path: path.join(SHOTS, 'splitter-light.png')});
  await p.evaluate(()=> window.__dbg.disp('dark', false)); await sleep(300);
  // Split → "And in the playlist?" → Do it now (Put the 2 pieces in its place).
  await p.click('#spGo'); await sleep(500);
  ok(/And in the playlist/.test(await p.evaluate(()=> document.querySelector('.modal')?.innerText || '')), 'Split asks about the playlist entry');
  ok(await p.evaluate(()=> document.querySelector('.modal input[type=radio]:checked')?.closest('label').textContent.includes('Put the 2 pieces in its place')), 'putting the pieces in its place is chosen to begin with');
  await clickText(p, '.modal button', '^Do it now$');
  for(let i = 0; i < 60 && await p.evaluate(()=> window.__splitter.busy()); i++) await sleep(250);
  await sleep(500);
  const after = await p.evaluate((s)=>{
    const r = window.__dbg.getRoot(), name = id=> (r.library.find(x=> x.id === id) || {}).name;
    const p1 = window.__splitter.find(s.p1).node, p2 = window.__splitter.find(s.p2).node;
    return {p1: p1.items.map(x=> name(x.refId)), p2: p2.items.map(x=> name(x.refId)), lib: r.library.length, open: !!document.getElementById('splitPage'), undo: window.__undo.stacks()};
  }, setup);
  ok(!after.open, 'the splitter closes');
  ok(JSON.stringify(after.p1) === JSON.stringify(['Opening prayers', 'sig - part 2', 'sig']), 'in the playlist, the entry is now the two pieces, in order (' + after.p1.join(' | ') + ')');
  ok(JSON.stringify(after.p2) === JSON.stringify(['sig']), 'the other playlist keeps the original');
  ok(after.lib === setup.lib + 2, 'two tracks added to the library, the original kept');
  await p.evaluate(()=> window.__undo.undo()); await sleep(800);
  const undone = await p.evaluate((s)=>{
    const r = window.__dbg.getRoot(), name = id=> (r.library.find(x=> x.id === id) || {}).name;
    return {p1: window.__splitter.find(s.p1).node.items.map(x=> name(x.refId)), lib: r.library.length};
  }, setup);
  ok(JSON.stringify(undone.p1) === JSON.stringify(['sig', 'sig']) && undone.lib === setup.lib, 'one Undo takes the split back: the entry and the library as they were (' + undone.p1.join(' | ') + ')');

  // ---- Narrow screen
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(300);
  await p.setViewport({width: 400, height: 800}); await sleep(300);
  await p.evaluate((id)=> window.__splitter.open(window.__dbg.getRoot().library.find(x=> x.id === id), {at: 5}), ids.mp3); await sleep(1500);
  const narrow = await p.evaluate(()=> ({w: document.documentElement.scrollWidth, page: document.getElementById('splitPage').getBoundingClientRect().width}));
  ok(narrow.w <= 401, 'at phone width the page doesn\'t scroll sideways (' + narrow.w + ' px)');
  await p.screenshot({path: path.join(SHOTS, 'splitter-narrow.png')});
  dialogs.length = 0;
  await p.evaluate(()=> window.__splitter.cursor(5.5)); await p.focus('#spZoom'); await p.keyboard.press('m');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await sleep(300);
  ok(dialogs.some(d=> /Leave the splitter/.test(d)) && !(await p.$('#splitPage')), 'Escape asks before leaving with marks, then closes');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
