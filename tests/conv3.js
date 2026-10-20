// Converting tracks that can't be played: "Convert them now" after an import
// asks to download the converter, then turns WMA and Apple Lossless into MP3
// in place (same track, same playlist, mark gone); a conversion waits while
// something plays and is redone after; and through a shared library the
// other device gets the MP3 and loses the mark.
//   node conv3.js CODE    (servers from serve.sh; www/ffmpeg/ holds ffmpeg.wasm,
//                          www/conv/ the files from make-fixtures.sh)
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
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<300;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return; await sleep(200); } };
const waitConverted = async (p, ms)=>{ for(let k=0; k<ms/250; k++){ const s = await p.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) return true; await sleep(250); } return false; };
const tracks = p=> p.evaluate(()=> window.__dbg.getRoot().library.map(t=>({id:t.id, name:t.name, file:t.filename, d:Math.round(t.duration||0), nc:t.needsConvert||'', rev:t.audioRev})));
const storedHead = (p, id)=> p.evaluate(async(id)=>{ const r = await new Promise(res=>{ const q = indexedDB.open('temple-sound-library'); q.onsuccess=()=>{ const g=q.result.transaction('audio').objectStore('audio').get(id); g.onsuccess=()=>res(g.result); }; }); if(!r) return null; const h = new Uint8Array(await r.blob.slice(0,3).arrayBuffer()); return String.fromCharCode(...h); }, id);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'], protocolTimeout: 600000});
  const A = await device(b, 'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = [{id:'pl1', kind:'playlist', name:'Powa', items:[]}]; await window.__dbg.saveState(); });
  await A.evaluate(async()=>{
    const files = [];
    for(const n of ['ok.mp3','talk.wma','lossless.m4a']){ const blob = await (await fetch('/conv/' + n)).blob(); files.push(new File([blob], n, {type: n.endsWith('.mp3') ? 'audio/mpeg' : ''})); }
    window.__conv.importFiles(files, window.__dbg.getRoot().tree[0], null, true);
  });
  for(let k=0; k<60; k++){ await sleep(250); if(await A.evaluate(()=> !!document.getElementById('unplayableConvert'))) break; }
  ok(await A.evaluate(()=> !!document.getElementById('unplayableConvert')), 'the import summary offers "Convert them now"');
  // Join first, so the shared library has the originals and another device too.
  await A.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1000); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  for(let k=0; k<40; k++){ if(!(await B.evaluate(()=> Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length))) break; await sleep(500); }
  const bBefore = await tracks(B);
  ok(bBefore.filter(t=> t.nc).length === 2, 'B sees the WMA and the Apple Lossless file marked');

  // A: Playing → the banner's button → the download question → converted.
  await A.evaluate(()=>{ const el=[...document.querySelectorAll('nav.rail *')].find(e=>e.children.length===0 && e.textContent.trim()==='Powa'); el && el.click(); }); await sleep(1000);
  const banner = await A.evaluate(()=> document.querySelector('.not-here-banner')?.innerText || '');
  console.log('A banner:', JSON.stringify(banner));
  ok(/Convert them now/.test(banner), 'Playing offers "Convert them now"');
  ok(!(await A.evaluate(()=> window.__conv.stored())), 'the converter isn\'t on A yet');
  await clickText(A, '.not-here-banner button', '^Convert them now$'); await sleep(600);
  const ask = await A.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/Download the converter\?/.test(ask), 'it asks before downloading the converter');
  await clickText(A, '.modal button', '^Download and convert$');
  for(let k=0; k<240; k++){ const st = await A.evaluate(()=> window.__conv.state()); if(st.running || st.queue.length) break; await sleep(250); }
  ok(await waitConverted(A, 120000), 'the conversions finish');
  const after = await tracks(A);
  console.log('A:', JSON.stringify(after));
  const talk = after.find(t=> /^talk/.test(t.file)), alac = after.find(t=> /^lossless/.test(t.file));
  ok(talk && talk.file === 'talk.mp3' && !talk.nc && talk.d === 3, 'the WMA is now talk.mp3, 3 s long, unmarked');
  ok(alac && alac.file === 'lossless.mp3' && !alac.nc && alac.d === 3, 'the Apple Lossless file is now lossless.mp3, unmarked');
  const head = await storedHead(A, talk.id);
  ok(head === 'ID3' || (head && head.charCodeAt(0) === 0xFF), 'its stored file is an MP3 (' + JSON.stringify(head) + ')');
  ok(await A.evaluate(()=> window.__dbg.getRoot().tree[0].items.length) === 3, 'the playlist still has all three');
  ok(await A.evaluate(()=> window.__conv.stored()), 'the converter is kept on A');
  await A.evaluate(()=> window.__dbg.render()); await sleep(500);
  ok(!(await A.evaluate(()=> document.querySelector('.not-here-banner')?.innerText || '')), 'Playing no longer says anything can\'t be played');

  // B gets the MP3s through sync.
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A); await sleep(1500); await waitIdle(A);
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B);
  for(let k=0; k<40; k++){ if(!(await B.evaluate(()=> Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length))) break; await sleep(500); }
  const bAfter = await tracks(B);
  console.log('B:', JSON.stringify(bAfter));
  const bt = bAfter.find(t=> t.id === talk.id);
  ok(bt && bt.file === 'talk.mp3' && !bt.nc, 'on B the track is talk.mp3 now, unmarked');
  const bh = await storedHead(B, talk.id);
  ok(bh === 'ID3' || (bh && bh.charCodeAt(0) === 0xFF), 'B has the MP3 itself');

  // Waiting while something plays: a long WMA, and playback started part-way.
  const longId = await A.evaluate(async()=>{
    const r = window.__dbg.getRoot();
    for(const n of ['longtalk.wma','playme.mp3']){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], r.tree[0], null, true); }
    document.querySelector('.modal [data-close]')?.click();
    return r.library.find(t=> t.filename === 'longtalk.wma').id;
  });
  await sleep(500);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()));
  await A.evaluate((id)=> window.__conv.convert([id]), longId);
  await sleep(2500);
  const s1 = await A.evaluate(()=> window.__conv.state());
  console.log('converting:', JSON.stringify(s1));
  ok(s1.running && s1.worker, 'the long WMA is converting');
  const playItem = await A.evaluate(()=>{ const r = window.__dbg.getRoot(); const t = r.library.find(t=> t.filename === 'playme.mp3'); return r.tree[0].items.find(it=> it.refId === t.id).id; });
  await A.evaluate((id)=> window.__play(id), playItem); await sleep(2500);
  const s2 = await A.evaluate(()=> ({st: window.__conv.state(), playing: !window.__st().paused}));
  console.log('while playing:', JSON.stringify(s2));
  ok(s2.playing && !s2.st.worker && s2.st.queue.length === 1 && /once nothing is playing/.test(s2.st.bar || ''), 'playback stops the conversion, which waits');
  await A.evaluate(()=> window.__pause()); await sleep(500);
  ok(await waitConverted(A, 300000), 'after the pause it converts again and finishes');
  const lt = (await tracks(A)).find(t=> t.id === longId);
  console.log('long:', JSON.stringify(lt));
  ok(lt && lt.file === 'longtalk.mp3' && !lt.nc && Math.abs(lt.d - 1500) <= 1, 'the 25-minute WMA is an MP3 of the same length');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
