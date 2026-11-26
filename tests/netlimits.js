// Time limits on the shared library's requests (2.7.009; the audit's fix
// 13, S), through fetchWithLimits against a small server of the test's own:
// an answer that never starts is given up after the small limit; a body
// that stops arriving after the quiet limit; a slow body that keeps coming
// is never cut off for its total time; an upload gets time for its size.
//   node netlimits.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const http = require('http');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const server = http.createServer((req, res)=>{
  const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
  if(req.method === 'OPTIONS'){ res.writeHead(204, cors); return res.end(); }
  if(req.url === '/never') return; // no answer at all
  if(req.url === '/unread'){ res.writeHead(200, Object.assign({'Content-Type': 'application/octet-stream'}, cors)); res.write(Buffer.alloc(1000, 1)); return; } // as /stalls, but nobody reads it
  if(req.url === '/stalls'){ res.writeHead(200, Object.assign({'Content-Type': 'application/octet-stream'}, cors)); res.write(Buffer.alloc(1000, 1)); return; } // a start, then nothing
  if(req.url === '/slow'){ res.writeHead(200, Object.assign({'Content-Type': 'application/octet-stream'}, cors)); let n = 0; const t = setInterval(()=>{ res.write(Buffer.alloc(1000, 2)); if(++n === 6){ clearInterval(t); res.end(); } }, 1000); return; }
  if(req.url === '/upload'){ let got = 0; req.on('data', d=> got += d.length); req.on('end', ()=> setTimeout(()=>{ res.writeHead(200, Object.assign({'Content-Type': 'application/json'}, cors)); res.end(JSON.stringify({got})); }, 4000)); return; }
  res.writeHead(404, cors); res.end();
});
(async()=>{
  await new Promise(r=> server.listen(8879, '127.0.0.1', r));
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{ window.__netSmallMs = 2000; window.__netQuietMs = 2500; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(500);
  const ask = (path, init, read)=> p.evaluate(async(path, init, read)=>{
    const t0 = performance.now();
    try{
      if(init && init.bodySize) init = {method: 'POST', body: new Blob([new Uint8Array(init.bodySize)])};
      const res = await window.__net.fetchWithLimits('http://127.0.0.1:8879' + path, init || {});
      const out = read === 'json' ? JSON.stringify(await res.json()) : (await res.arrayBuffer()).byteLength;
      return {ok: true, out, ms: Math.round(performance.now() - t0)};
    }catch(err){ return {ok: false, error: String(err && err.message || err), name: err && err.name, given: !!(err && err.netGivenUp), ms: Math.round(performance.now() - t0)}; }
  }, path, init, read);
  let r = await ask('/never');
  ok(!r.ok && r.given && /^Failed to fetch \(no answer in 2 s\)$/.test(r.error) && r.ms >= 1900 && r.ms < 4000, 'no answer at all: given up after the small limit, as a network failure (' + JSON.stringify(r) + ')');
  r = await ask('/stalls');
  ok(!r.ok && /Failed to fetch/.test(r.error) && r.ms >= 2400 && r.ms < 5000, 'a body that stops: given up after the quiet limit (' + JSON.stringify(r) + ')');
  ok(/a request was given up \(nothing more for 3 s\): http:\/\/127\.0\.0\.1:8879\/stalls/.test((await p.evaluate(()=> window.__slog())).join('\n')), 'and the shared library\'s log says why');
  r = await ask('/slow');
  ok(r.ok && r.out === 6000 && r.ms > 5000, 'a slow body that keeps coming is never cut off for its total (' + JSON.stringify(r) + ')');
  r = await ask('/upload', {bodySize: 200000}, 'json');
  ok(r.ok && r.out === '{"got":200000}' && r.ms > 3500, 'an upload gets time for its size (' + JSON.stringify(r) + ')');
  r = await ask('/upload', {bodySize: 1000}, 'json');
  ok(!r.ok && /no answer in 2 s/.test(r.error), 'a small request that takes too long is given up (' + JSON.stringify(r) + ')');
  // An answer nobody reads (the caller looks only at its status) isn't given up (2.7.016).
  const st = await p.evaluate(async()=>{ const res = await window.__net.fetchWithLimits('http://127.0.0.1:8879/unread', {}); return res.status; });
  await sleep(4000);
  ok(st === 200 && !/given up[^\n]*\/unread/.test((await p.evaluate(()=> window.__slog())).join('\n')), 'an answer nobody reads isn\'t given up, and isn\'t logged as one');
  // One read slowly: the limit runs only while a read waits.
  r = await p.evaluate(async()=>{ const res = await window.__net.fetchWithLimits('http://127.0.0.1:8879/slow', {}); const rd = res.body.getReader(); let n = 0; for(;;){ const x = await rd.read(); if(x.done) break; n += x.value.length; await new Promise(z=> setTimeout(z, 3000)); } return n; });
  ok(r === 6000, 'an answer read slowly (3 s between reads, longer than the quiet limit) comes whole (' + r + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close(); server.close();
})();
