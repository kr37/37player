const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const base = 'www/ovt'; const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push([path.relative(base,f), fs.readFileSync(f).toString('base64')]); } })(base);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage(); await p.evaluateOnNewDocument(()=>{ window.__ah = {}; const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (k,f)=>{ window.__ah[k]=f; o(k,f); }; }); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  await sleep(2500); await p.evaluate(()=>{ const b=[...document.querySelectorAll('.modal .btn.primary')].pop(); b && b.click(); }); await sleep(4000);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(800);
  // playlist: track A, silence 2s, track B, track A again
  const ids = await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(); const lib = r.library;
    const pl = {id:'plx', kind:'playlist', name:'Flight', items:[
      {id:'i1', kind:'track', refId: lib[0].id, order:0},
      {id:'i2', kind:'silence', seconds:2, order:1},
      {id:'i3', kind:'track', refId: lib[1].id, order:2},
      {id:'i4', kind:'track', refId: lib[0].id, order:3}]};
    r.tree.push(pl); await window.__dbg.saveState(); return lib.map(t=>[t.name, t.duration]); });
  console.log('tracks', JSON.stringify(ids));
  const MODE = process.env.MODE || 'standard';
  await p.evaluate(async(m)=>{ window.__dbg.getRoot().settings.offscreenMode = m; await window.__dbg.saveState(); }, MODE);
  await p.click('body'); await sleep(300);
  // the app goes off screen
  await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>true, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>'hidden', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(()=> window.__play('i1')); await sleep(800);
  await p.evaluate(()=> document.getElementById('audioEl').pause()); await sleep(1200);
  let r = await p.evaluate(()=>window.__st()); ok(!r.paused, 'a pause nobody asked for, right after starting: resumed');
  await sleep(4500);
  await p.evaluate(()=> document.getElementById('audioEl').pause()); await sleep(800);
  r = await p.evaluate(()=>window.__st()); ok(r.paused, 'a later one (phone call) is left alone');
  await p.evaluate(()=> window.__play('i1')); await sleep(800);
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = Math.max(0, a.duration - 1); });
  const seen = []; let sawBridge=false, sawKA=false;
  for(let k=0;k<60;k++){ const s = await p.evaluate(()=>window.__st()); seen.push(s.cur + (s.paused?'':'▶') + (s.bridge?'B':'') + (s.ka?'K':'') + (s.sil?'S':'') + ':' + s.ms); if(s.bridge) sawBridge=true; if(s.cur==='i3' && !s.paused) break; await sleep(150); }
  console.log(seen.filter((x,i)=>x!==seen[i-1]).join(' | '));
  ok(sawBridge, 'bridge used across track→silence→track');
  await sleep(1600);
  let s = await p.evaluate(()=>window.__st()); console.log(JSON.stringify(s));
  ok(s.cur==='i3' && !s.paused && !s.bridge && s.ka && s.hold, 'next track plays, loop held while off screen');
  // pause during a silence from the lock screen ends the loop
  await p.evaluate(()=> window.__play('i2')); await sleep(600);
  await p.evaluate(()=> window.__ah.pause()); await sleep(400);
  { const z = await p.evaluate(()=>window.__st()); ok(!z.sil && !z.ka && !z.hold, 'silence paused off screen: loop off'); }
  await p.evaluate(()=> window.__play('i3')); await sleep(800);
  // straight track→track
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = Math.max(0, a.duration - 0.8); });
  const seen2=[]; for(let k=0;k<40;k++){ const s = await p.evaluate(()=>window.__st()); seen2.push(s.cur + (s.paused?'':'▶') + (s.bridge?'B':'') + (s.ka?'K':'') + ':' + s.ms); if(s.cur==='i4' && !s.paused && !s.bridge) break; await sleep(150); }
  console.log(seen2.filter((x,i)=>x!==seen2[i-1]).join(' | '));
  s = await p.evaluate(()=>window.__st());
  ok(s.cur==='i4' && !s.paused && s.ka, 'track→track off screen, loop held');
  ok(!seen2.some(x=>/:paused/.test(x)), 'lock screen never showed paused in between');
  // end of playlist
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = Math.max(0, a.duration - 0.5); }); await sleep(2500);
  s = await p.evaluate(()=>window.__st()); console.log(JSON.stringify(s));
  ok(s.paused && !s.bridge && !s.ka, 'end of playlist: everything stopped');
  console.log('state at end', JSON.stringify(await p.evaluate(()=>window.__st())));
  // on screen: no bridge
  await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>false, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>'visible', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(()=> window.__play('i3')); await sleep(600);
  await p.evaluate(()=>{ const a=document.getElementById('audioEl'); a.currentTime = Math.max(0, a.duration - 0.5); }); 
  let nb=false; for(let k=0;k<20;k++){ const s=await p.evaluate(()=>window.__st()); if(s.bridge) nb=true; await sleep(150); }
  ok(!nb, 'on screen: no bridge');
  { const z = await p.evaluate(()=>window.__st()); ok(!z.ka && !z.hold, 'on screen: loop off'); }
  await p.evaluate(()=> window.__play('i1')); await sleep(800);
  await p.evaluate(()=> window.__ah.play()); await sleep(300);
  ok(!(await p.evaluate(()=>window.__st())).paused, 'a stray play while playing does not pause');
  await p.evaluate(()=> window.__ah.pause()); await sleep(300);
  ok((await p.evaluate(()=>window.__st())).paused, 'pause pauses');
  await p.evaluate(()=> window.__ah.pause()); await sleep(300);
  ok((await p.evaluate(()=>window.__st())).paused, 'a second pause stays paused');
  await p.evaluate(()=> window.__ah.play()); await sleep(500);
  ok(!(await p.evaluate(()=>window.__st())).paused, 'play resumes');
  await p.evaluate(()=> window.__dbg4.settings()); await sleep(500);
  await clickText(p, '.settings-nav *, nav *', '^Playback$'); await sleep(600);
  console.log('settings log present:', await p.evaluate(()=> !!document.getElementById('playLog') && document.getElementById('playLog').textContent.split('\n').length));
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
