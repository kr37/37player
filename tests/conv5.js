// The library's format settings (Settings → File format): a WAV imported
// under the default "Reduce uncompressed audio" becomes an MP3; under "Don't
// touch my files" it stays, while a WMA is still converted and its original
// kept without asking; "Choose the rules" with a custom AAC format shows what
// it would convert and converts it on request; FLAC asks first; and the
// settings travel through a shared library to the other device.
//   node conv5.js CODE     (servers from serve.sh; www/ffmpeg/ and www/conv/ from make-fixtures.sh)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function device(b, name){
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = [{id:'pl1', kind:'playlist', name:'Session', items:[]}]; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return; await sleep(200); } };
const waitFor = async (p, fn, ms)=>{ for(let k=0; k<ms/250; k++){ if(await p.evaluate(fn)) return true; await sleep(250); } return false; };
const waitConverted = async (p, ms)=>{ await sleep(800); return waitFor(p, ()=>{ const s = window.__conv.state(); return !s.running && !s.queue.length; }, ms); };
const tracks = p=> p.evaluate(()=> window.__dbg.getRoot().library.map(t=>({id:t.id, file:t.filename, nc:t.needsConvert||'', orig: t.original ? t.original.filename : ''})));
const import_ = (p, names)=> p.evaluate(async(names)=>{
  for(const n of names){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], window.__dbg.getRoot().tree[0], null, true); }
}, names);
const openFormat = async (p)=>{ await p.evaluate(()=> window.__dbg4.settings()); await sleep(400); await clickText(p, '.settings-nav-item', '^File format$'); await sleep(600); };
const closeSettings = p=> p.evaluate(()=> document.querySelector('#settingsClose')?.click());
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 120000});
  const A = await device(b, 'A');
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  const pol0 = await A.evaluate(()=> window.__conv.policy());
  ok(pol0.preset === 'standard' && pol0.when === 'reduce', 'by default: Standard (MP3 192k), Reduce uncompressed audio');

  // The default: a WAV becomes an MP3 as it comes in.
  await import_(A, ['tone.wav']);
  ok(await waitFor(A, ()=> /Keep the originals\?/.test(document.querySelector('.modal')?.innerText || ''), 60000), 'the WAV is converted, and the originals question asked');
  ok(/converted to MP3 192k/.test(await A.evaluate(()=> document.querySelector('.modal')?.innerText || '')), 'it names the format: MP3 192k');
  await clickText(A, '.modal button', '^Discard$'); await sleep(300);
  ok((await tracks(A)).some(t=> t.file === 'tone.mp3' && !t.orig), 'tone.wav is tone.mp3 now, its original discarded');

  // The page, and "Don't touch my files".
  await openFormat(A);
  const page = await A.evaluate(()=> document.getElementById('settingsContent')?.innerText || '');
  ok(/Preferred format/.test(page) && /Don't touch my files/.test(page) && /Reduce uncompressed audio/.test(page) && /Choose the rules/.test(page), 'the File format page has the preferred format and the three choices');
  ok(/shared library/.test(page), 'it says the settings belong to the shared library');
  await A.evaluate(()=>{ const r = document.querySelector('input[name=fmtWhen][value=untouched]'); r.checked = true; r.dispatchEvent(new Event('change', {bubbles:true})); }); await sleep(500);
  ok((await A.evaluate(()=> window.__conv.policy())).when === 'untouched', 'Don\'t touch my files is saved');
  await closeSettings(A); await sleep(300);
  await import_(A, ['tone2.wav', 'talk.wma']);
  ok(await waitConverted(A, 60000), 'the conversions finish');
  await sleep(500);
  const t2 = await tracks(A);
  console.log('A:', JSON.stringify(t2));
  ok(t2.some(t=> t.file === 'tone2.wav'), 'under Don\'t touch my files the WAV stays a WAV');
  ok(t2.some(t=> t.file === 'talk.mp3' && t.orig === 'talk.wma'), 'the WMA is still converted, its original kept');
  ok(!/Keep the originals\?/.test(await A.evaluate(()=> document.querySelector('.modal')?.innerText || '')), 'without asking about the original');

  // FLAC asks first; Cancel keeps things as they were.
  await openFormat(A);
  await A.evaluate(()=>{ const s = document.getElementById('fmtPreset'); s.value = 'lossless'; s.dispatchEvent(new Event('change', {bubbles:true})); }); await sleep(500);
  const flac = await A.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/Not recommended/.test(flac) && /Use FLAC/.test(flac), 'choosing FLAC asks first: "Not recommended"');
  await clickText(A, '.modal button', '^Cancel$'); await sleep(600);
  ok((await A.evaluate(()=> window.__conv.policy())).preset === 'standard', 'Cancel leaves the preferred format as it was');

  // Choose the rules, with a custom AAC format: what it would do, and doing it.
  await openFormat(A);
  await A.evaluate(()=>{
    const fire = el=> el.dispatchEvent(new Event('change', {bubbles:true}));
    const s = document.getElementById('fmtPreset'); s.value = 'custom'; fire(s);
    const f = document.getElementById('fmtFormat'); f.value = 'aac'; fire(f);
    const r = document.querySelector('input[name=fmtWhen][value=rules]'); r.checked = true; fire(r);
  }); await sleep(800);
  const pol = await A.evaluate(()=> window.__conv.policy());
  console.log('policy:', JSON.stringify(pol));
  ok(pol.preset === 'custom' && pol.custom.format === 'aac' && pol.when === 'rules', 'custom AAC and Choose the rules are saved');
  await A.screenshot({path: 'shots/conv5-format.png'});
  const effect = await A.evaluate(()=> document.getElementById('fmtEffect')?.innerText || '');
  console.log('effect:', JSON.stringify(effect));
  ok(/1 tracks already in the library would be converted to AAC 192k/.test(effect), 'it says what the rules would convert (the WAV)');
  await clickText(A, '#fmtEffect button', '^Convert them now$'); await sleep(500);
  await clickText(A, '.modal button', '^Convert them now$');
  ok(await waitFor(A, ()=> /Keep the originals\?/.test(document.querySelector('.modal')?.innerText || ''), 60000), 'they\'re converted, and the originals question asked');
  await clickText(A, '.modal button', '^Discard$'); await sleep(300);
  ok((await tracks(A)).some(t=> t.file === 'tone2.m4a'), 'tone2.wav is tone2.m4a now');

  // B gets the settings through the shared library.
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A); await sleep(1500); await waitIdle(A);
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B);
  const bpol = await B.evaluate(()=> window.__conv.policy());
  console.log('B policy:', JSON.stringify(bpol));
  ok(bpol.preset === 'custom' && bpol.custom.format === 'aac' && bpol.when === 'rules', 'B has the same settings');
  // …and a change on B comes back to A.
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.formatPolicy = Object.assign({}, r.formatPolicy, {when: 'reduce'}); await window.__dbg.saveState(); });
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B); await sleep(1000);
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A);
  ok((await A.evaluate(()=> window.__conv.policy())).when === 'reduce', 'a change made on B reaches A');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
