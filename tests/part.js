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

  const names = P=> P.evaluate(()=>{ const out=[]; (function w(a){ a.forEach(n=>{ out.push(n.name+(n.items?'['+n.items.length+']':'')); if(n.children) w(n.children); }); })(window.__dbg.getRoot().tree); return out.join(',') + ' | ' + window.__dbg.getRoot().library.map(t=>t.name).sort().join(','); });
  const syncNow = async P=>{ await P.evaluate(()=>window.__dbg3.sync()); await sleep(1200); await waitIdle(P); };
  console.log('A:', await names(A));
  const B = await device(b,'B');
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC).catch(()=>{});
  // the wrapper clicks "Join" — beat it to "Only what I choose"
  for(let k=0;k<40;k++){ const done = await B.evaluate(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>b.textContent.trim()==='Only what I choose'); if(b){ b.click(); return true; } return false; }); if(done) break; await sleep(50); }
  await sleep(3000);
  console.log('B after join:', await names(B), ' review open:', await B.evaluate(()=>!!document.getElementById('reviewPage')));
  ok(!(await names(B)).includes('One') && await B.evaluate(()=>!!document.querySelector('#reviewPage.choose-page')), 'partial join: nothing arrives, What\'s on this device opens');
  // the rest of this test goes through Review changes, which still offers what's not here
  await B.evaluate(()=> document.getElementById('chClose').click()); await sleep(300);
  await B.evaluate(()=>window.__dbg3.review()); await sleep(1500);
  const lowerRows = await B.evaluate(()=>[...document.querySelectorAll('#reviewPage .rv-lower')].map(r=>r.innerText.replace(/\s+/g,' ').trim()));
  console.log('lower:', JSON.stringify(lowerRows));
  await B.screenshot({path:'shots/part-1.png'});
  // take "One"
  await B.evaluate(()=>{ const r=[...document.querySelectorAll('#reviewPage .rv-lower')].find(r=>/^One/.test(r.querySelector('.rv-title').textContent)); r.querySelector('.rv-arrow').click(); }); await sleep(300);
  console.log('footer:', await B.evaluate(()=>document.querySelector('.rv-summary').textContent));
  await B.evaluate(()=> document.getElementById('rvGo').click()); await sleep(3000); await waitIdle(B);
  console.log('B after take:', await names(B));
  ok(/One\[1\]/.test(await names(B)) && !(await names(B)).includes('Two'), 'took One only');
  ok(await B.evaluate(()=> Object.keys(window.__dbg3.pending().audio).length)===0, 'its audio arrived');
  // A: add the other track to One, and make a new playlist Three
  await A.evaluate(async()=>{ const r=window.__dbg.getRoot(); const one=r.tree.find(n=>n.name==='One'); const other=r.library.find(t=>!one.items.some(i=>i.refId===t.id)); one.items.push({id:'xx1',kind:'track',refId:other.id,order:5}); r.tree.push({id:'p3',kind:'playlist',name:'Three',order:9,items:[]}); await window.__dbg.saveState(); });
  await syncNow(A); await syncNow(B);
  console.log('B after A edits:', await names(B));
  ok(/One\[2\]/.test(await names(B)) && !(await names(B)).includes('Three'), 'new track in One arrives; new playlist Three does not');
  const badge = await B.evaluate(()=>{ const b=document.getElementById('btnSharedReview'); return b.style.display!=='none' ? b.textContent : ''; });
  ok(/1 new in the shared library/.test(badge), 'badge: '+badge);
  // B: own playlist Mine
  await B.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.tree.push({id:'mine',kind:'playlist',name:'Mine',order:9,items:[]}); await window.__dbg.saveState(); });
  await syncNow(B); await syncNow(A);
  ok((await names(A)).includes('Mine'), 'B\'s own playlist reaches A');
  // delete dialog on B: Edit Playlists, delete Mine via its ✕
  await B.evaluate(()=>{ [...document.querySelectorAll('.mode-tab')].find(b=>/Edit Playlists/.test(b.textContent))?.click(); }); await sleep(600);
  await B.evaluate(()=>{ const row=[...document.querySelectorAll('#editorColA .playlist-row')].find(r=>r.textContent.includes('Mine')); row.click(); }); await sleep(400);
  await B.evaluate(()=>{ const row=[...document.querySelectorAll('#editorColA .playlist-row')].find(r=>r.textContent.includes('Mine')); row.querySelector('[data-act="delete"]').click(); }); await sleep(400);
  const dlg = await B.evaluate(()=>[...document.querySelectorAll('.modal button')].map(b=>b.textContent.trim()));
  console.log('delete dialog buttons:', dlg.join(' | '));
  ok(dlg.includes('Remove from this device') && dlg.includes('Delete everywhere'), 'three-way delete');
  await B.screenshot({path:'shots/part-2.png'});
  await B.evaluate(()=>{ [...document.querySelectorAll('.modal button')].find(b=>b.textContent.trim()==='Delete everywhere').click(); }); await sleep(500);
  await syncNow(B); await syncNow(A);
  ok(!(await names(A)).includes('Mine'), 'Delete everywhere: gone from A');
  // remove One from this device only
  await B.evaluate(()=>{ const row=[...document.querySelectorAll('#editorColA .playlist-row')].find(r=>r.textContent.includes('One')); row.click(); }); await sleep(400);
  await B.evaluate(()=>{ const row=[...document.querySelectorAll('#editorColA .playlist-row')].find(r=>r.textContent.includes('One')); row.querySelector('[data-act="delete"]').click(); }); await sleep(400);
  await B.evaluate(()=>{ [...document.querySelectorAll('.modal button')].find(b=>b.textContent.trim()==='Remove from this device').click(); }); await sleep(1200);
  console.log('B after remove:', await names(B));
  ok(!(await names(B)).includes('One') && !/Liberating|loud/.test((await names(B)).split('|')[1]), 'One and its tracks gone from B');
  await syncNow(B); await syncNow(A);
  ok(/One\[2\]/.test(await names(A)), 'A still has One: '+await names(A));
  await syncNow(B);
  ok(!(await names(B)).includes('One'), 'and it does not come back to B');

  // take One back, then delete one of its tracks from the Library: offered "with One"
  await B.evaluate(()=>window.__dbg3.review()); await sleep(1500);
  await B.evaluate(()=>{ const r=[...document.querySelectorAll('#reviewPage .rv-lower')].find(r=>/^One/.test(r.querySelector('.rv-title').textContent)); r.querySelector('.rv-arrow').click(); }); await sleep(300);
  await B.evaluate(()=> document.getElementById('rvGo').click()); await sleep(3000); await waitIdle(B);
  console.log('B has One again:', await names(B));
  await B.evaluate(()=>{ [...document.querySelectorAll('.mode-tab')].find(b=>/Library/.test(b.textContent))?.click(); }); await sleep(700);
  await B.evaluate(()=>{ const row=[...document.querySelectorAll('#libColTracks .lib-row')].find(r=>r.textContent.includes('Liberating')); row.querySelector('[data-act="delete"]').click(); }); await sleep(500);
  const dlg2 = await B.evaluate(()=>[...document.querySelectorAll('.modal button')].map(b=>b.textContent.trim()));
  console.log('track delete buttons:', dlg2.join(' | '));
  ok(dlg2.some(t=>/with “One”/.test(t)), 'offers removing with its playlist');
  await B.screenshot({path:'shots/part-3.png'});
  await B.evaluate(()=>{ [...document.querySelectorAll('.modal button')].find(b=>/with “One”/.test(b.textContent)).click(); }); await sleep(1200);
  console.log('B after:', await names(B));
  ok(!(await names(B)).includes('One') && !/Liberating|loud/.test((await names(B)).split('|')[1]), 'One and its tracks left this device');
  await syncNow(B); await syncNow(A);
  ok(/One\[2\]/.test(await names(A)) && /Liberating/.test(await names(A)), 'shared library kept One and the track: '+await names(A));
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
