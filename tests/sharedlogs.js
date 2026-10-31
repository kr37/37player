// Devices' logs in the shared library (1.4.137): each device sends its logs
// after a sync round (at most every half hour), and Send feedback lists the
// other devices' logs, ticked when recent; this device's own copy isn't listed.
//   node sharedlogs.js CODE        (servers from serve.sh)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function device(b, name){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=>{ console.log(name, 'PAGE ERROR:', e.message); fails++; });
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^No, just start$']){ await clickText(p, '.modal button', x); await sleep(300); }
  const r = await p.evaluate((u, c, n)=> window.__dbg3.join(u, c, n, {}), URL_SYNC, CODE, name);
  await sleep(500);
  await p.evaluate(()=> window.__dbg3.sync()); await sleep(1500);
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  try{
    const A = await device(b, 'Gompa iPad'), B = await device(b, 'Office laptop');
    ok(await A.evaluate(()=> !!window.__dbg.getRoot().settings.sharedLibrary) && await B.evaluate(()=> !!window.__dbg.getRoot().settings.sharedLibrary), 'both devices joined');
    // a line in A's playback log, then its logs sent
    await A.evaluate(async()=>{ await window.__logs.send(true); });
    const fromB = await B.evaluate(()=> window.__logs.others());
    ok(fromB.some(o=> o.device === 'Gompa iPad' && o.kind === 'sync'), 'B sees A\'s logs in the shared library: ' + JSON.stringify(fromB.map(o=> o.device + '/' + o.kind)));
    ok(!(await A.evaluate(()=> window.__logs.others())).some(o=> o.device === 'Gompa iPad'), 'A doesn\'t list its own');
    // half an hour between sends, unless forced
    const t0 = await A.evaluate(()=> localStorage.getItem([...Object.keys(localStorage)].find(k=> /logsSentAt/.test(k))));
    await A.evaluate(()=> window.__logs.send()); 
    ok(await A.evaluate(()=> localStorage.getItem([...Object.keys(localStorage)].find(k=> /logsSentAt/.test(k)))) === t0, 'not sent again within half an hour');
    // Send feedback on B lists them, ticked (recent)
    await B.evaluate(()=> window.__logs.feedback()); await sleep(1200);
    const other = await B.evaluate(()=> [...document.querySelectorAll('[data-fb-other]')].map(c=> (c.checked ? '[x] ' : '[ ] ') + c.parentNode.textContent.trim()));
    ok(other.some(x=> /^\[x\] Gompa iPad: (sync|playback) log, /.test(x)), 'B\'s Send feedback lists A\'s logs, ticked: ' + JSON.stringify(other));
    await B.screenshot({path: 'shots/sharedlogs-feedback.png'});
  } finally { await b.close(); }
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
