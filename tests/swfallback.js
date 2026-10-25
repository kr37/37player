// The saved copy of the app (sw.js, 1.4.090): a refresh opens it not only
// when there's no connection, but also when the server answers with an
// error instead of the page (the droplet's site partition unmounted gave
// "Page not found" at IKRC, 25 Oct 2026), or takes too long to answer.
// Runs its own small server (port 8862) that can be told how to answer.
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const APP = fs.readFileSync(path.join(__dirname, '..', '37-player.html'));
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'));
let mode = 'ok';
const server = http.createServer((req, res)=>{
  const p = req.url.split('?')[0];
  if(p === '/sw.js'){ res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache'}); return res.end(SW); }
  if(p === '/37-player.html'){
    if(mode === '404'){ res.writeHead(404, {'Content-Type': 'text/html'}); return res.end('<h1>Page not found</h1>'); }
    if(mode === '500'){ res.writeHead(500, {'Content-Type': 'text/html'}); return res.end('<h1>Server error</h1>'); }
    if(mode === 'slow') return; // never answers
    res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-cache'}); return res.end(APP);
  }
  res.writeHead(404); res.end('');
});
(async()=>{
  await new Promise(r=> server.listen(8862, r));
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage();
  await p.goto('http://localhost:8862/37-player.html', {waitUntil: 'load'});
  for(let i = 0; i < 40 && !(await p.evaluate(()=> !!navigator.serviceWorker.controller)); i++){ await sleep(250); if(i === 12) await p.reload({waitUntil: 'load'}); }
  ok(await p.evaluate(()=> !!navigator.serviceWorker.controller), 'the service worker looks after the page');
  await sleep(500);
  const isApp = ()=> p.evaluate(()=> !!document.querySelector('meta[name="app-version"]') && !/Page not found|Server error/.test(document.body.innerText));
  for(const m of ['404', '500']){
    mode = m;
    await p.reload({waitUntil: 'load'}).catch(()=>{});
    ok(await isApp(), 'the server answers ' + m + ': the saved app opens instead');
  }
  mode = 'slow';
  const t0 = Date.now();
  await p.reload({waitUntil: 'load', timeout: 30000}).catch(()=>{});
  const secs = (Date.now() - t0) / 1000;
  ok(await isApp() && secs < 15, 'the server doesn\'t answer: the saved app opens after ' + secs.toFixed(1) + ' s');
  mode = 'ok';
  await p.reload({waitUntil: 'load'});
  ok(await isApp(), 'the server back: the page from the server');
  await new Promise(r=> server.close(r)); server.closeAllConnections && server.closeAllConnections();
  await p.reload({waitUntil: 'load'}).catch(()=>{});
  ok(await isApp(), 'the server down altogether: the saved app opens (as before)');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
