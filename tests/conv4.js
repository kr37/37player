// Converting keeps out of the way of playback in ANOTHER window on the same
// computer, and the "Only when nothing is playing" switch (Settings → Library
// standardization) lets it run during playback when turned off.
//   node conv4.js     (servers from serve.sh; www/ffmpeg/ and www/conv/ as for conv3.js)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'], protocolTimeout: 60000});
  const ctx = await b.createBrowserContext();
  const open = async (name)=>{
    const p = await ctx.newPage(); await p.setViewport({width:1200,height:850});
    p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
    p.on('dialog', d=>{ console.log(name,'ALERT:', d.message()); d.dismiss(); });
    await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
    for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
    return p;
  };
  const A = await open('A');
  // A has no converter, so what it imports stays unconverted for B to do.
  await A.setRequestInterception(true); A.on('request', r=> r.url().includes('/ffmpeg/') ? r.abort() : r.continue());
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Session', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await A.evaluate(async()=>{
    for(const n of ['playme.mp3','longtalk.wma','talk.wma']){ const blob = await (await fetch('/conv/' + n)).blob(); await window.__conv.importFiles([new File([blob], n)], window.__dbg.getRoot().tree[0], null, true); document.querySelectorAll('.modal [data-close]').forEach(b=> b.click()); }
  });
  await sleep(500);
  const ids = await A.evaluate(()=>{ const r = window.__dbg.getRoot(); const f = n=> r.library.find(t=> t.filename === n).id; return {play: r.tree[0].items.find(it=> it.refId === f('playme.mp3')).id, long: f('longtalk.wma'), talk: f('talk.wma')}; });
  const B = await open('B');
  ok(await B.evaluate(()=> window.__dbg.getRoot().library.length) === 3, 'the second window has the same library');

  // A plays; B is asked to convert.
  await A.bringToFront(); await A.evaluate((id)=>{ window.__play(id); }, ids.play); await sleep(5000);
  await B.bringToFront(); await B.evaluate((id)=>{ window.__conv.convert([id]); }, ids.talk); await sleep(600);
  await clickText(B, '.modal button', '^Download and convert$');
  await sleep(6000);
  const s1 = await B.evaluate(()=> window.__conv.state());
  console.log('B while A plays:', JSON.stringify(s1));
  ok(!(await A.evaluate(()=> window.__st().paused)), 'A is playing');
  ok(s1.queue.length === 1 && !s1.worker && /once nothing is playing/.test(s1.bar || ''), 'B waits, saying so, because A is playing');
  await A.evaluate(()=>{ window.__pause(); });
  for(let k=0; k<120; k++){ const s = await B.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) break; await sleep(250); }
  const talk = await B.evaluate((id)=> window.__dbg.getRoot().library.find(t=> t.id === id), ids.talk);
  ok(talk.filename === 'talk.mp3' && !talk.needsConvert, 'after A pauses, B converts it');

  // The switch off: B converts while A plays.
  await B.evaluate(async()=>{ window.__dbg.getRoot().settings.standardizeOnlyWhenIdle = false; await window.__dbg.saveState(); });
  await A.bringToFront(); await A.evaluate((id)=>{ window.__play(id); }, ids.play); await sleep(5000);
  await B.evaluate((id)=>{ window.__conv.convert([id]); }, ids.long); await sleep(5000);
  const s2 = await B.evaluate(()=> window.__conv.state());
  console.log('B with the switch off:', JSON.stringify(s2));
  ok(!(await A.evaluate(()=> window.__st().paused)) && s2.worker && /^Converting/.test(s2.bar || ''), 'with "Only when nothing is playing" off, B converts while A plays');
  await B.evaluate(()=> window.__dbg.getRoot().settings.standardizeOnlyWhenIdle = true);
  await sleep(2500);
  const s3 = await B.evaluate(()=> window.__conv.state());
  console.log('B with the switch back on:', JSON.stringify(s3));
  ok(!s3.worker && /once nothing is playing/.test(s3.bar || ''), 'turned back on, B stops and waits again');
  await A.evaluate(()=>{ window.__pause(); });
  for(let k=0; k<600; k++){ const s = await B.evaluate(()=> window.__conv.state()); if(!s.running && !s.queue.length) break; await sleep(250); }
  const lt = await B.evaluate((id)=> window.__dbg.getRoot().library.find(t=> t.id === id), ids.long);
  ok(lt.filename === 'longtalk.mp3', 'and finishes once A pauses');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
