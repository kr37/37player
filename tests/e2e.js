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
  // ---- device A with a library
  const A = await device(b,'A');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await A.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await A.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(1000);
  const libA0 = await lib(A); console.log('A library:', JSON.stringify(libA0));
  // join via the Settings UI
  await A.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(500);
  await A.evaluate(()=>[...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=>/Shared/.test(e.textContent)).click()); await sleep(300);
  await A.screenshot({path:'shots/e2e-join.png'});
  await A.evaluate(()=> document.getElementById('shJoinOrCreate').click()); await sleep(300);
  await A.evaluate(()=>{ document.querySelector('input[name=sjWhere][value=server]').click(); document.getElementById('sjNext').click(); }); await sleep(300);
  await A.evaluate((c,u)=>{ document.getElementById('sjCode').value=c; document.getElementById('sjDevice').value='Gompa laptop'; document.getElementById('sjUrl').value=u; document.getElementById('sjGo').click(); }, CODE, URL_SYNC);
  await sleep(1200);
  const askE = await A.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/is empty so far/.test(askE) && (await A.evaluate(()=> window.__radioChecked())).startsWith('Join from'), 'an empty shared library: joining from this library is suggested, to fill it: ' + JSON.stringify(askE.slice(0, 140)));
  ok(await A.evaluate(()=> window.__radio('^Join from')), 'a library with tracks is asked first: a new library, or join from this one');
  await sleep(1500); await A.screenshot({path:'shots/e2e-joindlg.png'}); await clickText(A,'.modal button','^Join$');
  await sleep(1500); console.log('A wait:', JSON.stringify(await waitIdle(A)));
  await A.screenshot({path:'shots/e2e-joined.png'});
  const st = await A.evaluate(()=>window.__dbg3.status()); ok(st.version===1, 'A pushed version 1 (got '+st.version+')');
  // ---- device B, fresh
  const B = await device(b,'B');
  await B.evaluate((c,u)=> window.__dbg3.join(u,c,'iPad'), CODE, URL_SYNC); await sleep(500);
  console.log('B wait:', JSON.stringify(await waitIdle(B)));
  const libB = await lib(B); ok(libB.tracks===libA0.tracks, 'B has A\'s tracks'); ok(libB.tree===libA0.tree, 'B has A\'s playlists: '+libB.tree);
  const blobs = await B.evaluate(async()=>{ const r=window.__dbg.getRoot(); const out=[]; for(const t of r.library){ const req = indexedDB.open('temple-sound-library'); const db = await new Promise(res=>{ req.onsuccess=()=>res(req.result); }); const got = await new Promise(res=>{ const g=db.transaction('audio').objectStore('audio').get(t.id); g.onsuccess=()=>res(g.result); }); out.push(!!(got && got.blob && got.blob.size)); db.close(); } return out; });
  ok(blobs.length && blobs.every(x=>x), 'B downloaded every audio file ('+blobs.length+')');
  ok(await B.evaluate(()=> window.__dbg.getRoot().library.every(t=>t.peaks && t.peaks.length)), 'B has waveforms');
  // ---- B renames a track and adds a playlist; A picks it up
  await B.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.library[0].name='Renamed on iPad'; r.tree.push({id:'pB', kind:'playlist', name:'From iPad', order:99, items:[{id:'iB1',kind:'silence',seconds:5,name:'gap',order:0}]}); await window.__dbg.saveState(); });
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B);
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A);
  const libA1 = await lib(A); ok(libA1.tracks.includes('Renamed on iPad') && libA1.tree.includes('From iPad'), 'A got B\'s changes');
  // ---- both edit the same playlist's contents -> both kept on the second to sync
  await A.evaluate(async()=>{ const r=window.__dbg.getRoot(); const pl=r.tree.find(n=>n.id==='pB'); pl.items.push({id:'iA2',kind:'silence',seconds:9,name:'A gap',order:1}); await window.__dbg.saveState(); });
  await B.evaluate(async()=>{ const r=window.__dbg.getRoot(); const pl=r.tree.find(n=>n.id==='pB'); pl.items[0].seconds=60; await window.__dbg.saveState(); });
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A);
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B);
  const libB2 = await lib(B); ok(libB2.tree.includes('From iPad (iPad)'), 'conflict kept both on B: '+libB2.tree);
  ok((await B.evaluate(()=>window.__dbg3.status().conflicts)).length===1, 'B reports the conflict');
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A);
  const libA2 = await lib(A); ok(libA2.tree===libB2.tree && libA2.tracks===libB2.tracks, 'A and B agree after conflict');
  // ---- A frees a track from its playlists and deletes it; B loses it
  const victim = await A.evaluate(async()=>{ const r=window.__dbg.getRoot(); const t=r.library.find(x=>x.name==='02 loud') || r.library.find(x=>x.name==='Renamed on iPad'); (function w(a){a.forEach(n=>{ if(n.items) n.items=n.items.filter(i=>i.refId!==t.id); if(n.children) w(n.children); });})(r.tree); r.library=r.library.filter(x=>x!==t); await window.__dbg.saveState(); return t.name; });
  await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A); await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B);
  ok(!(await lib(B)).tracks.split('|').includes(victim), 'deletion reached B ('+victim+')');
  // ---- B replaces a track's audio (as Standardize or Replace audio would) -> A gets the new file
  const rep = await B.evaluate(async()=>{ const r=window.__dbg.getRoot(); const t=r.library[0]; const before=t.audioRev; const blob=new Blob([new Uint8Array(12345).fill(7)],{type:'audio/wav'}); await window.__dbg3.put('audio',{id:t.id, blob}); await window.__dbg.saveState(); return {id:t.id, before, after:t.audioRev}; });
  ok(rep.before!==rep.after, 'replacing audio bumped its revision');
  await B.evaluate(()=>window.__dbg3.sync()); await waitIdle(B); await A.evaluate(()=>window.__dbg3.sync()); await waitIdle(A);
  const aSize = await A.evaluate(async(id)=>{ const req = indexedDB.open('temple-sound-library'); const db = await new Promise(res=>{ req.onsuccess=()=>res(req.result); }); const got = await new Promise(res=>{ const g=db.transaction('audio').objectStore('audio').get(id); g.onsuccess=()=>res(g.result); }); db.close(); return got.blob.size; }, rep.id);
  ok(aSize===12345, 'A downloaded the replaced audio (size '+aSize+')');
  ok((await A.evaluate((id)=>window.__dbg.getRoot().library.find(t=>t.id===id).audioRev, rep.id))===rep.after, 'A has the new revision');
  // ---- details first: D joins a NEW library while A-like device E is still uploading slowly
  const E = await device(b,'E');
  await E.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await E.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await E.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await E.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);
  const cdpE = await E.target().createCDPSession(); await cdpE.send('Network.enable');
  await cdpE.send('Network.emulateNetworkConditions', {offline:false, latency:50, downloadThroughput: 5e6, uploadThroughput: 40*1024}); // ~40 KB/s up
  const CODE2 = process.argv[3];
  const tJoin = Date.now();
  E.evaluate((c,u)=> window.__dbg3.join(u,c,'Slow laptop'), CODE2, URL_SYNC);
  await sleep(4000);
  const ver = await E.evaluate(()=>window.__dbg3.status().version);
  ok(ver===1, 'library details saved first (version '+ver+' after '+((Date.now()-tJoin)/1000).toFixed(1)+'s, audio still uploading)');
  const D = await device(b,'D');
  await D.evaluate((c,u)=> window.__dbg3.join(u,c,'Phone'), CODE2, URL_SYNC); await sleep(3000);
  const libD = await lib(D), libE = await lib(E);
  ok(libD.tree===libE.tree && libD.tracks===libE.tracks, 'D sees the playlists and tracks straight away');
  const arriving = await D.evaluate(()=>window.__dbg3.status().arriving);
  ok(arriving>0, 'D reports files still on their way ('+arriving+')');
  await cdpE.send('Network.emulateNetworkConditions', {offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1});
  const w = await waitIdle(D);
  ok(w!=='timeout' && (await D.evaluate(()=>window.__dbg3.status().arriving))===0, 'D got all the audio once it arrived');
  // ---- receive-only device C replaces its local edits
  const C = await device(b,'C');
  await C.evaluate((c,u)=> window.__dbg3.join(u,c,'Room 2'), CODE, URL_SYNC); await waitIdle(C);
  await C.evaluate(async()=>{ window.__dbg.getRoot().settings.sharedLibrary.receiveOnly = true; const r=window.__dbg.getRoot(); r.library[0].name='Local edit on C'; await window.__dbg.saveState(); });
  await C.evaluate(()=>window.__dbg3.sync()); await waitIdle(C);
  ok(!(await lib(C)).tracks.includes('Local edit on C') && (await lib(C)).tree===(await lib(B)).tree, 'receive-only device reverts to shared');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
