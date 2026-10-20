const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const URL_SYNC='http://127.0.0.1:8870/sync.php', CODE=process.argv[2];
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
async function dev(b,name){ const ctx=await b.createBrowserContext(); const p=await ctx.newPage(); p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); return p; }
const idle = async p=>{ for(let k=0;k<200;k++){ const s=await p.evaluate(()=>({st:window.__dbg3.status().state, tr:window.__dbg3.status().transfer, pend:Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing'&&!s.tr&&s.pend===0) return; await sleep(200);} };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await dev(b,'A');
  await A.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.tree=[]; r.library=[]; delete r.settings.starterPlaylistId; const blob=await (await fetch('ten.mp3')).blob();
    await window.__dbg3.put('audio',{id:'tk', blob}); r.library.push({id:'tk', name:'Ten', duration:600, peaks:new Array(720).fill(0.15), loudness:{i:-31.5,peak:0.04}, audioRev:'r1'}); r.tree.push({id:'pl',kind:'playlist',name:'P',items:[{id:'i',kind:'track',refId:'tk',order:0}]}); await window.__dbg.saveState(); });
  await A.evaluate((u,c)=> window.__dbg3.join(u,c,'Laptop'), URL_SYNC, CODE); await idle(A); await sleep(1500);
  // what the server has for it
  const srv = async()=> A.evaluate(async(u,c)=>{ const r = await fetch(u+'?op=peaks', {method:'POST', headers:{'X-Library': encodeURIComponent(c), 'Content-Type':'application/json'}, body: JSON.stringify({names:['tk.r1']})}); const j = await r.json(); const p=j['tk.r1']; return p ? (p.every(v=>v===p[0]) ? 'flat' : 'real') : 'none'; }, URL_SYNC, CODE);
  ok(await srv()==='none', 'a flat stand-in is not shared');
  // simulate an older device having uploaded a flat one
  await A.evaluate(async(u,c)=>{ await fetch(u+'?op=file&kind=peaks&name=tk.r1', {method:'PUT', headers:{'X-Library': encodeURIComponent(c)}, body: JSON.stringify(new Array(720).fill(0.15))}); }, URL_SYNC, CODE);
  ok(await srv()==='flat', '(an older version had shared a flat one)');
  await A.evaluate(()=> window.__setPeaks('tk')); await A.evaluate(()=> window.__dbg.saveState()); await A.evaluate(()=> window.__dbg3.sync()); await sleep(2500); await idle(A);
  ok(await srv()==='real', 'a device that already has a real waveform replaces the flat one on the server at its next sync');
  console.log('start of long2h.mp3:', await A.evaluate(()=> window.__start('long2h.mp3')), ' ten.mp3:', await A.evaluate(()=> window.__start('ten.mp3')));
  const pc = await A.evaluate(async()=>{ const r = await window.__pieces('ten.mp3'); return {d: r.duration, L: r.loudness.i}; });
  console.log('pieces after header skip:', JSON.stringify(pc));
  ok(Math.abs(pc.d - 600) < 1 && pc.L === -31.5, 'analysis still right with the header frame skipped');
  const B = await dev(b,'B');
  await B.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.tree=[]; r.library=[]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await B.evaluate((u,c)=> window.__dbg3.join(u,c,'iPad'), URL_SYNC, CODE); await idle(B); await sleep(1500);
  await B.evaluate(()=>{ const t = window.__dbg.getRoot().library.find(t=>t.id==='tk'); t.peaks = new Array(720).fill(0.15); });
  await B.evaluate(()=> window.__repair('tk')); await sleep(800);
  ok(!(await B.evaluate(()=> window.__flat('tk'))), 'B gets it');
  console.log('B log:', (await B.evaluate(()=> window.__slog())).join(' | '));
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
