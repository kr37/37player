// Audio files opened with 37 Player ("Open with" on a computer, Share on
// Android): Play it now plays without touching the library; Import imports;
// Play and import imports and plays it. The manifest says which files the
// installed app takes. (The browser's own hand-over, launchQueue and the
// service worker's share POST, can't be driven from here: the files are
// handed in where those would.)
//   node openwith.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal')?.innerText || '') : '');
const give = (p, from, as)=> p.evaluate(async(from, as)=>{ const blob = await (await fetch('/' + from)).blob(); window.__open.take([new File([blob], as, {type: blob.type})]); }, from, as);
async function finishImport(p){
  for(let k=0; k<80; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); return true; } await sleep(200); }
  return false;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1200, height: 900});
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
  // the manifest the installed app reads
  const man = await p.evaluate(async()=>{ const href = document.querySelector('link[rel=manifest]').href; const m = await (await fetch(href)).json(); return {href, id: m.id, fh: m.file_handlers && m.file_handlers[0], st: m.share_target}; });
  ok(/\/manifest\.webmanifest$/.test(man.href) && man.id === './37-player.html', 'on the website the manifest is the real file: ' + man.href);
  ok(man.fh && man.fh.accept['audio/mpeg'].includes('.mp3') && man.fh.accept['audio/wav'].includes('.wav') && man.fh.accept['audio/x-ms-wma'].includes('.wma'), 'it offers 37 Player for audio files (Open with)');
  ok(man.st && man.st.method === 'POST' && man.st.params.files[0].name === 'audio', 'and to Android\'s Share menu');
  // a file opened during the welcome waits for it
  await give(p, 'ten.mp3', 'Opened talk.mp3'); await sleep(800);
  ok(/language|English/i.test(await modal(p)) && !/Open “/.test(await modal(p)), 'a file opened while the welcome is up waits for it');
  await clickText(p, '.modal button', '^English$'); await sleep(300);
  await clickText(p, '.modal button', '^Start a library on this device$'); await sleep(300);
  await clickText(p, '.modal button', '^Skip for now$'); await sleep(300); await clickText(p, '.modal button', '^Finish$'); await sleep(1500);
  let m = await modal(p);
  ok(/Open “Opened talk\.mp3”/.test(m) && /Play it now/.test(m) && /Import/.test(m) && /Play and import/.test(m), 'then asks: Play it now, Import, or Play and import');
  await p.screenshot({path: 'shots/openwith-ask.png'});
  const before = await p.evaluate(()=> window.__dbg.getRoot().library.length);
  // Play it now
  await clickText(p, '.modal button', '^Play it now$'); await sleep(1500);
  const st = await p.evaluate(()=>{ const a = document.getElementById('openedAudio'); return a ? {paused: a.paused, t: a.currentTime, name: document.getElementById('openPlayingName').textContent} : null; });
  ok(st && !st.paused && st.t > 0 && st.name === 'Opened talk.mp3', 'Play it now plays it: ' + JSON.stringify(st));
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === before, 'and the library stays as it was');
  await p.screenshot({path: 'shots/openwith-play.png'});
  await clickText(p, '.modal button', '^Close$'); await sleep(300);
  // Import
  await give(p, 'ten.mp3', 'Opened talk.mp3'); await sleep(500);
  await clickText(p, '.modal button', '^Import$'); await sleep(500);
  ok(await finishImport(p), 'Import goes through the usual import');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === before + 1, 'and the track is in the library');
  // Play and import
  await give(p, 'w_mono48.wav', 'Second talk.wav'); await sleep(500);
  await clickText(p, '.modal button', '^Play and import$'); await sleep(500);
  ok(await finishImport(p), 'Play and import imports');
  await sleep(1500);
  const pv = await p.evaluate(()=>{ const id = window.__open.preview(); const tr = window.__dbg.getRoot().library.find(x=> x.id === id); const a = document.getElementById('libPreviewAudio'); return {name: tr && tr.name, playing: a && !a.paused}; });
  ok(/Second talk/.test(pv.name || '') && pv.playing, 'and then plays it, in the Library: ' + JSON.stringify(pv));
  await p.evaluate(()=>{ const a = document.getElementById('libPreviewAudio'); if(a) a.pause(); });
  // Shared on Android: the service worker has kept the file; the app opens with ?shared
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); const c = await caches.open('37player-share'); await c.put('/__shared/0', new Response(blob, {headers: {'Content-Type': 'audio/mpeg', 'X-Name': encodeURIComponent('From WhatsApp.mp3'), 'X-Modified': '1'}})); });
  await p.goto(APP + '?shared=1', {waitUntil: 'networkidle0'}); await sleep(1500);
  m = await modal(p);
  ok(/Open “From WhatsApp\.mp3”/.test(m), 'a shared file is offered the same way');
  ok(!/shared/.test(p.url()) && !(await p.evaluate(async()=> (await caches.keys()).includes('37player-share'))), 'and the address and the kept copy are cleared');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
