// The service worker's two copies of the app (sw.js, 1.4.090–091): a
// refresh opens the last version that started properly on this device
// whenever what the server sends can't be trusted: an error page (the
// droplet's site partition unmounted gave "Page not found" at IKRC, 25 Oct
// 2026), no answer, no server, a cut-off file, or a version that doesn't
// start (the watchdog; shortened to 4 s here). A broken version stays
// refused; a different, working one is taken. Runs its own small server
// (port 8862), told what to answer.
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const APP = fs.readFileSync(path.join(__dirname, '..', '37-player.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'));
const version = (html, v)=> html.replace(/<meta name="app-version" content="[^"]+">/, `<meta name="app-version" content="${v}">`);
const A = version(APP, '9.9.001');
const B_BROKEN = version(APP, '9.9.002').replace('(async function init(){', '(async function init(){ throw new Error("a broken update");');
const C = version(APP, '9.9.003');
let mode = 'ok', page = A;
const server = http.createServer((req, res)=>{
  const p = req.url.split('?')[0];
  if(p === '/sw.js'){ res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache'}); return res.end(SW); }
  if(p === '/37-player.html'){
    if(mode === '404'){ res.writeHead(404, {'Content-Type': 'text/html'}); return res.end('<h1>Page not found</h1>'); }
    if(mode === '500'){ res.writeHead(500, {'Content-Type': 'text/html'}); return res.end('<h1>Server error</h1>'); }
    if(mode === 'slow') return; // never answers
    const body = mode === 'cut' ? page.slice(0, Math.floor(page.length * 0.6)) : page;
    res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-cache'}); return res.end(body);
  }
  res.writeHead(404); res.end('');
});
(async()=>{
  await new Promise(r=> server.listen(8862, r));
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage();
  await p.evaluateOnNewDocument(()=>{ window.__37watchdogMs = 4000; });
  p.on('dialog', d=> d.accept());
  await p.goto('http://localhost:8862/37-player.html', {waitUntil: 'load'});
  for(let i = 0; i < 40 && !(await p.evaluate(()=> !!navigator.serviceWorker.controller)); i++){ await sleep(250); if(i === 12) await p.reload({waitUntil: 'load'}); }
  ok(await p.evaluate(()=> !!navigator.serviceWorker.controller), 'the service worker looks after the page');
  await p.reload({waitUntil: 'load'}); await sleep(1500); // A starts and says "up": the good copy
  const shown = ()=> p.evaluate(()=> /Page not found|Server error/.test(document.body.innerText) ? 'error page' : ((document.querySelector('meta[name="app-version"]') || {}).content || 'nothing'));
  const up = ()=> p.evaluate(()=> !!window.__37up);
  ok(await shown() === '9.9.001' && await up(), 'version 9.9.001 opens and says it\'s up');
  for(const m of ['404', '500']){
    mode = m;
    await p.reload({waitUntil: 'load'}).catch(()=>{});
    ok(await shown() === '9.9.001', 'the server answers ' + m + ': the saved copy opens (' + await shown() + ')');
  }
  mode = 'slow';
  let t0 = Date.now();
  await p.reload({waitUntil: 'load', timeout: 30000}).catch(()=>{});
  ok(await shown() === '9.9.001' && Date.now() - t0 < 15000, 'the server doesn\'t answer: the saved copy opens after ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  mode = 'cut'; page = C;
  await p.reload({waitUntil: 'load'}).catch(()=>{});
  ok(await shown() === '9.9.001', 'a cut-off file (no end-of-file line): the saved copy opens');
  // A complete version that doesn't start: back to the good one, and why.
  mode = 'ok'; page = B_BROKEN;
  await p.reload({waitUntil: 'load'}).catch(()=>{});
  { const sv = await shown(), u = await up(); ok(sv === '9.9.002' && !u, 'a broken version arrives, and doesn\'t start (' + sv + ', up ' + u + ')'); }
  let back = false;
  for(let i = 0; i < 40 && !back; i++){ await sleep(250); back = await shown().catch(()=> '') === '9.9.001'; }
  ok(back, 'after the watchdog, the page reloads into the last version that started');
  await sleep(2500);
  const toast = await p.evaluate(()=> (document.getElementById('toast') || {}).textContent || '');
  ok(/9\.9\.002 didn't start properly/.test(toast) && /9\.9\.001/.test(toast), 'and says so: "' + toast + '"');
  await p.reload({waitUntil: 'load'}); await sleep(800);
  ok(await shown() === '9.9.001', 'the broken version stays refused on later refreshes');
  page = C;
  await p.reload({waitUntil: 'load'}); await sleep(1500);
  { const sv = await shown(), u = await up(); ok(sv === '9.9.003' && u, 'a different, working version is taken (' + sv + ', up ' + u + ')'); }
  page = B_BROKEN; mode = '404';
  await p.reload({waitUntil: 'load'}).catch(()=>{});
  ok(await shown() === '9.9.003', 'and is the saved copy from then on');
  mode = 'ok'; page = C;
  await new Promise(r=> server.close(r)); server.closeAllConnections && server.closeAllConnections();
  await p.reload({waitUntil: 'load'}).catch(()=>{});
  ok(await shown() === '9.9.003', 'the server down altogether: the saved copy opens');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
