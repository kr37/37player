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
  // F imports the same files separately (new IDs), plus one track of its own, and a playlist using them
  const F = await device(b,'F');
  await F.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await F.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await F.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await F.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);

  const build = (p, tag)=> p.evaluate(async(tag)=>{ const r=window.__dbg.getRoot();
    const byName = n=> r.library.find(t=>t.name===n).id;
    const lp = byName('Liberating Prayer'), loud = byName('02 loud');
    r.tree = [{id:'cl'+tag, kind:'folder', name:'Classes', order:0, children:[
      {id:'lp'+tag, kind:'playlist', name:'The Liberating Prayer', order:0, items:[{id:'i1'+tag,kind:'track',refId:lp,order:0},{id:'i2'+tag,kind:'silence',seconds:30,order:1}]},
      {id:'su'+tag, kind:'playlist', name:'Sunday', order:1, items: tag==='A' ? [{id:'s1A',kind:'track',refId:lp,order:0}] : [{id:'s1F',kind:'track',refId:loud,order:0}]},
    ].concat(tag==='F' ? [{id:'tuF', kind:'playlist', name:'Tuesday', order:2, items:[{id:'t1F',kind:'track',refId:loud,order:0}]}] : [])}];
    await window.__dbg.saveState(); }, tag);
  await build(A,'A');
  await A.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(A);
  await build(F,'F');
  F.evaluate((c,u)=> window.__dbg3.join(u,c,'Phone'), CODE, URL_SYNC).catch(()=>{});
  await sleep(1500);
  await F.evaluate(()=> window.__radio('^Combine'));
  await sleep(1500); await waitIdle(F); await A.evaluate(()=>window.__dbg3.sync()); await sleep(800); await waitIdle(A);
  const tA = await lib(A), tF = await lib(F);
  console.log('A tree:', tA.tree); console.log('F tree:', tF.tree);
  ok(tA.tree === tF.tree, 'both devices have the same tree');
  ok((tA.tree.match(/f:Classes/g)||[]).length === 1, 'one Classes folder');
  ok((tA.tree.match(/p:The Liberating Prayer\[/g)||[]).length === 1, 'one Liberating Prayer playlist');
  ok(/p:Sunday\[1\]/.test(tA.tree) && /p:Sunday \(Phone\)\[1\]/.test(tA.tree), 'differing Sunday kept beside as (Phone)');
  ok(/p:Tuesday\[1\]/.test(tA.tree), 'phone-only Tuesday added inside Classes');
  const confl = await F.evaluate(()=>window.__dbg3.status().conflicts);
  console.log('conflicts:', confl);
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
