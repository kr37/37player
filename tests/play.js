const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const base = 'www/ovt'; const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push([path.relative(base,f), fs.readFileSync(f).toString('base64')]); } })(base);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
let delayMs = 0, fileReqs = [];
async function device(b, name, watch){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  await p.setRequestInterception(true);
  p.on('request', r=>{ const u=r.url(); if(!(u.startsWith('http://localhost')||u.startsWith('http://127.0.0.1'))) return r.abort();
    if(watch && /op=file/.test(u) && /newtrk/.test(u) && r.method()==='GET'){ fileReqs.push(Date.now()); return setTimeout(()=>r.continue(), delayMs); }
    r.continue(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  return p;
}
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return s; await sleep(200); } return 'timeout'; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const CODE = process.argv[2];
  const A = await device(b,'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  const B = await device(b,'B', true);
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'Phone'), CODE, URL_SYNC); await waitIdle(B);
  // A adds a track and sends it
  await A.evaluate(async()=>{
    const r = window.__dbg.getRoot(); const t0 = r.library[0];
    const rec = await new Promise(res=>{ const q=indexedDB.open('temple-sound-library'); q.onsuccess=()=>{ try{ const g=q.result.transaction('audio').objectStore('audio').get(t0.id); g.onsuccess=()=>res(g.result); g.onerror=()=>res(null);}catch(e){res(null);} }; q.onerror=()=>res(null); });
    const nt = Object.assign({}, t0, {id:'newtrk', name:'Bad Romance'}); r.library.push(nt);
    await window.__dbg3.put('audio', {id:'newtrk', blob: rec ? rec.blob : new Blob([new Uint8Array(5000)])});
    const findPl = nodes=>{ for(const n of nodes){ if(n.kind==='playlist') return n; if(n.children){ const x=findPl(n.children); if(x) return x; } } };
    findPl(r.tree).items.push({id:'ni1', kind:'track', refId:'newtrk', order: 99});
    await window.__dbg.saveState(); });
  await A.evaluate(()=>window.__dbg3.sync()); await sleep(2500); await waitIdle(A);
  // B: downloads are slow (10 s each). Press play on it four times.
  delayMs = 10000;
  await B.evaluate(()=>window.__dbg3.sync()); await sleep(2500);
  console.log('B lib:', JSON.stringify(await B.evaluate(()=>window.__dbg.getRoot().library.map(t=>t.id+':'+t.name))), 'pend', JSON.stringify(await B.evaluate(()=>window.__dbg3.pending())));
  console.log('B modal:', await B.evaluate(()=>document.querySelector('.modal')?.innerText));
  const itemId = 'ni1';
  const t0 = Date.now();
  for(let i=0;i<4;i++){ B.evaluate(id=>window.__play(id), itemId); await sleep(700); }
  await sleep(3000);
  const dlg = await B.evaluate(()=> document.getElementById('audioMissingBody')?.textContent);
  console.log('dialog:', dlg, ' modals:', await B.evaluate(()=>document.querySelectorAll('.modal').length));
  ok(dlg && /on its way to this device/.test(dlg), 'a play press waits a few seconds, then says it is on its way');
  await B.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click()));
  await sleep(14000);
  console.log('file requests for it:', fileReqs.length);
  ok(fileReqs.length === 1, 'downloaded once');
  const a1 = await B.evaluate(()=>window.__aud());
  console.log('player after arrival:', JSON.stringify(a1));
  ok(a1.paused && a1.t === 0, 'did not start by itself after arriving');
  ok(!(await B.evaluate(()=>window.__dbg3.missing('newtrk'))), 'no longer missing');
  // Now play it: plays, no restarts
  await B.evaluate(id=>window.__play(id), itemId); await sleep(3000);
  const a2 = await B.evaluate(()=>window.__aud());
  await sleep(2000);
  const a3 = await B.evaluate(()=>window.__aud());
  console.log('playing:', JSON.stringify(a2), JSON.stringify(a3));
  ok(!a3.paused && a3.t > a2.t, 'plays straight through');
  const log = await B.evaluate(()=> (window.__dbg3.status().log || []).join('\n')).catch(()=> '');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
