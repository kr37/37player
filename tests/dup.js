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
  // F imports the same files separately (new IDs), plus one track of its own, and a playlist using them
  const F = await device(b,'F');
  await F.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await F.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await F.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await F.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);
  const idsA = await A.evaluate(()=>window.__dbg.getRoot().library.map(t=>t.id).sort().join());
  const idsF = await F.evaluate(()=>window.__dbg.getRoot().library.map(t=>t.id).sort().join());
  ok(idsA!==idsF, 'F\'s copies have different IDs');
  await F.evaluate(async()=>{ const r=window.__dbg.getRoot(); const t=r.library[0]; r.tree.push({id:'pF',kind:'playlist',name:'Phone mantras',order:9,items:[{id:'fi1',kind:'track',refId:t.id,order:0}]}); r.library.push(Object.assign({}, t, {id:'mantra1', name:'Mantra 1 (split)', duration:7})); r.tree[r.tree.length-1].items.push({id:'fi2',kind:'track',refId:'mantra1',order:1}); await window.__dbg.saveState(); });
  F.evaluate((c,u)=> window.__dbg3.join(u,c,'Phone'), CODE, URL_SYNC).catch(()=>{});
  await sleep(1500);
  const dlg = await F.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  console.log('preview dialog:\n' + dlg.split('\n').filter(Boolean).join('\n'));
  await clickText(F, '.modal button', '^Combine');
  for(let k=0;k<100;k++){ const v = await F.evaluate(()=>window.__dbg3.status().version); if(v>=2) break; await sleep(200); }
  console.log('F at version', await F.evaluate(()=>window.__dbg3.status().version));
  await waitIdle(F); await A.evaluate(()=>window.__dbg3.sync()); await sleep(500); await waitIdle(A);
  const names = await A.evaluate(()=>window.__dbg.getRoot().library.map(t=>t.name).sort());
  ok(names.filter(n=>n==='Liberating Prayer').length===1 && names.filter(n=>n==='02 loud').length===1, 'no duplicates after combining: '+names.join(' | '));
  ok(names.includes('Mantra 1 (split)'), 'the phone\'s own track was added');
  const pl = await A.evaluate(()=>{ const r=window.__dbg.getRoot(); const p=r.tree.find(n=>n.name==='Phone mantras'); return p ? p.items.map(i=> (r.library.find(t=>t.id===i.refId)||{}).name || 'MISSING').join(',') : null; });
  ok(pl && !pl.includes('MISSING'), 'phone playlist points at the shared copies: '+pl);
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
