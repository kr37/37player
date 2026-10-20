const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const ctx = await b.createBrowserContext();
  // the new one first, then an old one opened later
  const N = await ctx.newPage(); N.on('pageerror', e=>console.log('N ERR', e.message)); await N.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  const O = await ctx.newPage(); O.on('pageerror', e=>console.log('O ERR', e.message)); await O.goto('http://localhost:8861/old.html',{waitUntil:'networkidle0'}); await sleep(1500);
  const ban = async p=> p.evaluate(()=>{ const e=document.getElementById('newerVersionBanner'); return e ? e.innerText : null; });
  console.log('old window banner:', await ban(O));
  ok(!!(await ban(O)), 'an older window opened later is told, and says so');
  ok(!(await ban(N)), 'the newer window is left alone');
  // the other way round: old open first, new opened later
  const ctx2 = await b.createBrowserContext();
  const O2 = await ctx2.newPage(); await O2.goto('http://localhost:8861/old.html',{waitUntil:'networkidle0'}); await sleep(800);
  const N2 = await ctx2.newPage(); await N2.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(1500);
  ok(!!(await ban(O2)), 'an older window already open is told when the new one opens');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
