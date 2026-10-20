const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  let puts = 0;
  await p.setRequestInterception(true);
  p.on('request', r=>{ const u=r.url(); if(r.method()==='PUT' && /kind=audio/.test(u)){ puts++; return r.respond({status:413, headers:{'Access-Control-Allow-Origin':'*'}, body:'Too large'}); } r.continue(); });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.tree=[]; r.library=[]; delete r.settings.starterPlaylistId; const blob=await (await fetch('ten.mp3')).blob();
    await window.__dbg3.put('audio',{id:'big', blob}); r.library.push({id:'big', name:'Huge WAV', duration:600, peaks:Array.from({length:720},(_, i)=>i%5/5), audioRev:'r1'}); r.tree.push({id:'pl',kind:'playlist',name:'P',items:[{id:'i',kind:'track',refId:'big',order:0}]}); await window.__dbg.saveState(); });
  await p.evaluate((u,c)=> window.__dbg3.join(u,c,'Laptop'), 'http://127.0.0.1:8870/sync.php', process.argv[2]); await sleep(4000);
  const first = puts;
  await p.evaluate(()=> window.__dbg3.sync({force:false})); await sleep(3000);
  await p.evaluate(()=> window.runSharedSyncPlain && 0);
  console.log('PUTs after join:', first, 'after another sync:', puts);
  const st = await p.evaluate(()=>{ const d=document.createElement('div'); document.body.appendChild(d); window.__dbg3.render(d); const t=d.querySelector('#shStatus').textContent; d.remove(); return t; });
  console.log('status:', st);
  ok(/Too big/.test(st) && /Huge WAV/.test(st), 'status says which file is too big');
  const log = await p.evaluate(()=> JSON.parse(localStorage.getItem('37player.sharedLog')||'[]').slice(-4).join('\n')); console.log(log);
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
