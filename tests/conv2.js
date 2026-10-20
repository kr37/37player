// Folder import of a format this browser can't play: the track is kept and
// marked, its playlist keeps its place for it (no "MISSING TRACK" stop), and
// through a shared library another device sees it marked too.
//   node conv2.js CODE     (servers from serve.sh running)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const files = [
  ['M/Chants/ok.mp3', fs.readFileSync('www/conv/ok.mp3').toString('base64')],
  ['M/Chants/talk.wma', fs.readFileSync('www/conv/talk.wma').toString('base64')],
  ['M/Powa.m3u8', Buffer.from('#EXTM3U\nChants/ok.mp3\nChants/talk.wma\n').toString('base64')],
];
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
const waitIdle = async (p)=>{ for(let k=0;k<200;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return; await sleep(200); } };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await device(b, 'A');
  await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500);
  console.log('review:', JSON.stringify((await A.evaluate(()=> document.querySelector('.modal')?.innerText || '')).slice(0, 300)));
  await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(3500);
  const summary = await A.evaluate(()=> [...document.querySelectorAll('.modal')].map(m=>m.innerText).join(' || '));
  console.log('after import:', JSON.stringify(summary.slice(0, 400)));
  ok(/talk\.wma/.test(summary), 'the summary names talk.wma');
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  const st = await A.evaluate(()=>{ const r = window.__dbg.getRoot(); const pl = (function f(n){ for(const x of n){ if(x.kind==='playlist') return x; if(x.children){ const y=f(x.children); if(y) return y; } } })(r.tree);
    return {tracks: r.library.map(t=>[t.filename, t.needsConvert||'']), items: pl ? pl.items.map(it=> it.kind + ':' + (it.kind==='track' ? (r.library.find(t=>t.id===it.refId)||{}).filename : it.name)) : null}; });
  console.log('A:', JSON.stringify(st));
  ok(st.tracks.some(([f, nc])=> f==='talk.wma' && nc==='Windows Media Audio (WMA)'), 'the WMA is a track, marked');
  ok(st.items && st.items.join(',') === 'track:ok.mp3,track:talk.wma', 'the playlist holds both, with no MISSING TRACK stop');

  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A); await sleep(1500); await waitIdle(A);
  const B = await device(b, 'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  for(let k=0; k<40; k++){ const left = await B.evaluate(()=> Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length); if(!left) break; await sleep(500); }
  const bt = await B.evaluate(()=> window.__dbg.getRoot().library.map(t=>[t.filename, t.needsConvert||'', window.__conv.cantPlay(t.id) ? window.__conv.cantPlay(t.id).note : '']));
  console.log('B:', JSON.stringify(bt));
  ok(bt.some(([f, nc, note])=> f==='talk.wma' && nc==='Windows Media Audio (WMA)' && /needs converting/.test(note)), 'on the other device the WMA is marked too, saying it needs converting');
  ok(bt.some(([f, nc, note])=> f==='ok.mp3' && !nc && !note), 'the MP3 isn\'t marked there');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
