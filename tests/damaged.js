// Damaged stored files (Safari stored re-tagged files as header + old file +
// old file + tags): Library cleanup → Damaged files finds them and repairs
// them from the old file inside; export leaves a damaged file out and says
// so rather than failing. (This browser stores files properly, so the
// damage is made by hand: a copy like one that travelled through a shared
// library, its size agreeing with its data, found by Safari's pattern.)
//   node damaged.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1200, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); p.__alert = d.message(); d.dismiss(); });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
  await clickText(p, '.modal button', '^English$'); await sleep(300);
  await clickText(p, '.modal button', '^Start a library on this device$'); await sleep(300);
  await clickText(p, '.modal button', '^Skip for now$'); await sleep(300); await clickText(p, '.modal button', '^Finish$'); await sleep(300);
  // Don't touch my files: the WAV stays a WAV (the default would convert it as it comes in)
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.formatPolicy = Object.assign({}, window.__conv.policy(), {when: 'untouched'}); await window.__dbg.saveState(); });
  // a one-second WAV, imported
  await p.evaluate(()=>{
    const n = 44100, buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf), w = (o, s)=> [...s].forEach((c, i)=> dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, 44100, true); dv.setUint32(28, 176400, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for(let i = 0; i < n; i++){ const v = Math.round(Math.sin(i / 20) * 8000); dv.setInt16(44 + i * 4, v, true); dv.setInt16(46 + i * 4, v, true); }
    window.__dbg.bulkImportFolder([new File([buf], 'Self generation 1.wav', {type: 'audio/wav'})]);
  });
  for(let k=0; k<60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
  const id = await p.evaluate(()=> window.__dbg.getRoot().library[0].id);
  const origSize = await p.evaluate(async(id)=> (await window.__wk.stored(id)).size, id);
  // damage it the way Safari did: header + old + old + new tags
  await p.evaluate(async(id)=>{
    const r = window.__dbg.getRoot().library.find(x=> x.id === id); r.artist = 'New Kadampa Tradition'; r.album = 'Quick Path parts';
    const old = new Uint8Array(await (await window.__dmg.get(id)).arrayBuffer());
    const head = old.slice(0, 12), list = new Uint8Array(94); list.set([76, 73, 83, 84]);
    await window.__dbg3.put('audio', {id, blob: new Blob([head, old, old, list], {type: 'audio/wav'})});
  }, id);
  const dsize = await p.evaluate(async(id)=> (await window.__dmg.get(id)).size, id);
  ok(dsize === origSize * 2 + 12 + 94, 'set up: a stored WAV damaged the Safari way (' + origSize + ' → ' + dsize + ')');
  // Library cleanup → Damaged files → Check
  await p.evaluate(()=> window.__dbg4.settings()); await sleep(400);
  await clickText(p, '#settingsNav .settings-nav-item', '^Library cleanup$'); await sleep(500);
  ok(/Reads every stored file through/.test(await p.evaluate(()=> document.getElementById('damagedNote').innerText)), 'Library cleanup has "Damaged files", checked only when asked');
  await clickText(p, '#damagedNote button', '^Check stored files$'); await sleep(1500);
  const note = await p.evaluate(()=> document.getElementById('damagedNote').innerText + ' | ' + document.getElementById('damagedList').innerText);
  ok(/1 stored files are damaged/.test(note) && /Self generation 1/.test(note) && /Repair/.test(note), 'the check finds it: ' + note.replace(/\s+/g, ' ').slice(0, 140));
  await p.evaluate(()=> document.getElementById('cleanupDamaged').scrollIntoView({block: 'start'})); await sleep(200);
  await p.screenshot({path: 'shots/damaged-found.png'});
  // export leaves it out, and says so
  p.__alert = '';
  const exp = await p.evaluate(async(id)=>{ const blob = await window.__dmg.get(id);
    const lying = {size: blob.size - 100, arrayBuffer: ()=> blob.arrayBuffer(), name: 'x'};
    const z = await window.__dmg.zip([{name: 'music/a/b/Self generation 1.wav', blob: lying, trackId: id}, {name: 'playlists/p.m3u8', data: new TextEncoder().encode('#EXTM3U\n')}]);
    return {size: z.size, skipped: window.__dmg.skipped()}; }, id);
  ok(exp.size > 0 && exp.skipped.length === 1 && exp.skipped[0] === 'Self generation 1.wav', 'an export leaves a file whose data disagrees with its size out, and carries on: ' + JSON.stringify(exp));
  // Repair
  await clickText(p, '#damagedList button', '^Repair$'); await sleep(2000);
  ok(/Repaired/.test(await p.evaluate(()=> document.getElementById('damagedList').innerText)), 'Repair says "Repaired"');
  const after = await p.evaluate(async(id)=> ({st: await window.__wk.stored(id), tags: await window.__wk.tags(id), size: window.__dbg.getRoot().library.find(x=> x.id === id).fileSize}), id);
  console.log('after:', JSON.stringify({st: after.st, size: after.size, tags: after.tags && {artist: after.tags.artist, album: after.tags.album}}));
  ok(after.st.size === after.st.read && Math.abs(after.st.size - origSize) < 200 && after.size === after.st.size, 'the old file is back, whole (' + origSize + ' → ' + after.st.size + ')');
  ok(after.tags && after.tags.artist === 'New Kadampa Tradition' && after.tags.album === 'Quick Path parts', 'with the library\'s current details written in');
  const plays = await p.evaluate(async(id)=>{ const blob = await window.__dmg.get(id); try{ const b2 = await new AudioContext().decodeAudioData(await blob.arrayBuffer()); return b2.duration; }catch(e){ return 'error ' + e.message; } }, id);
  ok(Math.abs(plays - 1) < 0.05, 'and it decodes: ' + plays + ' s');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
