// A session put back at a start shows its own playlist (2.7.028; kr37,
// 28 Nov 2026, the iPad, "since the earliest versions"): a different
// playlist kept from before came back as "Viewing a different playlist —
// … is playing", with no overlay. With nothing to put back, the playlist
// last looked at is still the one shown.
//   node restoreview.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__playableCheckMs = 600000; window.__noAutoConverter = true; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  const start = async (sess)=>{
    await p.evaluate(async(sess)=>{
      const r = window.__dbg.getRoot();
      if(!r.tree.some(n=> n.id === 'plR')){
        r.tree.push({id:'plR', kind:'playlist', name:'R', items:[{id:'r1', kind:'silence', seconds:60, name:'Sit down', order:0}]});
        r.tree.push({id:'plJ', kind:'playlist', name:'King of the Dharma', items:[{id:'j1', kind:'silence', seconds:30, name:'Thirty', order:0}]});
      }
      r.session = sess; await window.__dbg.saveState();
    }, sess);
    await p.reload({waitUntil:'networkidle0'}); await sleep(1500);
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
    await p.evaluate(()=> window.__dbg.setMode('playing')); await sleep(500);
    return p.evaluate(()=>({banner: !!document.querySelector('.mismatch-banner'), title: (document.querySelector('.now-playing-title') || {}).textContent || '', viewed: (window.__dbg.getRoot().session || {}).viewedPlaylistId}));
  };
  const a = await start({viewedPlaylistId: 'plJ', currentItemId: 'r1', positionSeconds: 5});
  console.log(JSON.stringify(a));
  ok(!a.banner, 'put back from R while King of the Dharma was last looked at: no "Viewing a different playlist"');
  ok(/^R/.test(a.title.trim()) && a.viewed === 'plR', 'R, the playlist put back, is the one shown');
  const b2 = await start({viewedPlaylistId: 'plJ'});
  console.log(JSON.stringify(b2));
  ok(!b2.banner && /King of the Dharma/.test(b2.title) && b2.viewed === 'plJ', 'nothing put back: the playlist last looked at is still shown');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
