const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const base = 'www/ovt'; const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push([path.relative(base,f), fs.readFileSync(f).toString('base64')]); } })(base);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
  await p.setRequestInterception(true); p.on('request', r=> r.url().startsWith('http://localhost') || r.url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  return p;
}
const lib = p=> p.evaluate(()=>{ const r=window.__dbg.getRoot(); const pl=[]; (function w(a,d){a.forEach(n=>{ pl.push('  '.repeat(d)+n.kind[0]+':'+n.name+(n.items?'['+n.items.length+']':'')); if(n.children) w(n.children,d+1); });})(r.tree,0); return {tracks: r.library.map(t=>t.name).sort().join('|'), tree: pl.join(' / ')}; });
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr && s.pend===0) return s; await sleep(200); } return 'timeout'; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const CODE = process.argv[2];
  // A seeds the library
  const A = await device(b,'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A);

  let blockPut = true;
  await A.setRequestInterception(true);
  A.removeAllListeners('request');
  A.on('request', r=>{ const u=r.url(); if(!(u.startsWith('http://localhost')||u.startsWith('http://127.0.0.1'))) return r.abort(); if(blockPut && r.method()==='PUT') return r.abort(); r.continue(); });
  const B = await device(b,'B');
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await waitIdle(B);
  console.log('B join dialog:', JSON.stringify(await B.evaluate(()=>window.__joinDialog)));
  // A adds a new track to its first playlist; its upload is blocked
  const plName = await A.evaluate(async()=>{
    const r = window.__dbg.getRoot(); const t0 = r.library[0];
    const blob = await (await fetch('/ovt/' + (t0.filename || ''))).blob().catch(()=>null);
    const nt = Object.assign({}, t0, {id:'newtrk', name:'New Talk'});
    r.library.push(nt);
    await window.__dbg3.put('audio', {id:'newtrk', blob: blob && blob.size > 1000 ? blob : new Blob([new Uint8Array(5000)])});
    const findPl = nodes=>{ for(const n of nodes){ if(n.kind==='playlist') return n; if(n.children){ const x=findPl(n.children); if(x) return x; } } };
    const pl = findPl(r.tree); pl.items.push({id:'ni1', kind:'track', refId:'newtrk', order: 99});
    await window.__dbg.saveState(); return pl.name; });
  console.log('A playlist:', plName, 'audioFrom:', await A.evaluate(()=>window.__dbg.getRoot().library.find(t=>t.id==='newtrk').audioFrom));
  await A.evaluate(()=>window.__dbg3.sync()); await sleep(2500);
  await B.evaluate(()=>window.__dbg3.sync()); await sleep(3000);
  const m = await B.evaluate(()=> window.__dbg3.missing('newtrk'));
  console.log('B missing:', JSON.stringify(m));
  console.log('B detail:', JSON.stringify(await B.evaluate(()=>{ const r=window.__dbg.getRoot(); return r.library.map(t=>[t.id.slice(0,8), t.name, t.audioRev, t.audioFrom, window.__dbg3.missing(t.id)]); })));
  console.log('B pending:', JSON.stringify(await B.evaluate(()=>window.__dbg3.pending())));
  ok(m && m.waiting && m.from==='Laptop', 'B knows the track is waiting for Laptop');
  // show it on Playing
  await B.evaluate((n)=>{ const el=[...document.querySelectorAll('nav.rail *')].find(e=>e.children.length===0 && e.textContent.trim()===n); el && el.click(); }, plName); await sleep(2200);
  const view = await B.evaluate(()=>({banner: document.querySelector('.not-here-banner')?.innerText, row: document.querySelector('#playingTrackList .item-row.not-here')?.innerText}));
  console.log('B view:', JSON.stringify(view));
  console.log('B status (waiting):', await B.evaluate(()=>{ const d=document.createElement('div'); document.body.appendChild(d); window.__dbg3.render(d); const t=d.querySelector('#shStatus').textContent; d.remove(); return t; }));
  ok(view.banner && /can't play yet/.test(view.banner) && /Laptop/.test(view.banner), 'Playing shows the banner');
  ok(view.row && /waiting for Laptop/.test(view.row), 'the row says who it waits for');
  await B.screenshot({path:'shots/miss-b.png'});
  // A's upload gets through
  blockPut = false;
  await A.evaluate(()=>window.__dbg3.sync()); await sleep(3000); await waitIdle(A);
  await B.evaluate(()=>window.__dbg3.sync()); await sleep(3000); await waitIdle(B); await sleep(2000);
  const after = await B.evaluate(()=>({m: window.__dbg3.missing('newtrk'), banner: !!document.querySelector('.not-here-banner')}));
  console.log('B after:', JSON.stringify(after));
  ok(!after.m && !after.banner, 'arrived: marking gone');
  console.log('B status (done):', await B.evaluate(()=>{ const d=document.createElement('div'); document.body.appendChild(d); window.__dbg3.render(d); const t=d.querySelector('#shStatus').textContent; d.remove(); return t; }));
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
