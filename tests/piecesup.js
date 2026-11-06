// Sending a big recording in pieces (1.4.187): Safari on the Mac mini
// couldn't send 1.35 GB in one request. Pieces are made small here
// (window.__pieceUpMin / __pieceUpBytes) so a 1.3 MB track goes in 21.
// Checks: it goes up in pieces (PUT …&at=N&total=T), the server puts them
// together byte for byte with nothing left behind; one piece lost on the way
// is sent again and the upload carries on; small files still go whole.
//   node piecesup.js "<join code>"
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sleep = ms=> new Promise(r=> setTimeout(r, ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const LIB = CODE.split(' ')[0], DATA = path.join(__dirname, 'syncdata', LIB);
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3'));
const TONE = fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3'));
const waitIdle = async (p)=>{ for(let k=0;k<400;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer, pend: Object.keys((window.__dbg3.pending()||{audio:{}}).audio).length})); if(s.st!=='syncing' && !s.tr) return s; await sleep(250); } return 'timeout'; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  await p.evaluateOnNewDocument(()=>{ window.__pieceUpMin = 300000; window.__pieceUpBytes = 65536; window.__noAutoConverter = true; });
  // Watch the uploads; lose the 6th piece once (the connection drops).
  const puts = []; let dropped = false;
  await p.setRequestInterception(true);
  p.on('request', r=>{
    const u = r.url();
    if(!(u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'))) return r.abort();
    if(r.method() === 'PUT' && /op=file/.test(u) && /kind=audio/.test(u)){
      const at = (u.match(/[?&]at=(\d+)/) || [])[1];
      puts.push(at === undefined ? 'whole' : Number(at));
      if(at !== undefined && Number(at) === 5 * 65536 && !dropped){ dropped = true; return r.abort('connectionreset'); }
    }
    r.continue();
  });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate((a, c)=>{
    const mk = (b64, name)=>{ const f = new File([Uint8Array.from(atob(b64), x=>x.charCodeAt(0))], name, {type:'audio/mpeg'}); Object.defineProperty(f, 'webkitRelativePath', {value: 'Set/' + name}); return f; };
    window.__dbg.bulkImportFolder([mk(a, 'big.mp3'), mk(c, 'small.mp3')]);
  }, STARTER.toString('base64'), TONE.toString('base64'));
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length === 2 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.evaluate((c, u)=> window.__dbg3.join(u, c, 'Mac mini'), CODE, URL_SYNC);
  await waitIdle(p); await sleep(1500); await waitIdle(p);
  // What the page stored, and what the server now has.
  const tracks = await p.evaluate(async()=> Promise.all(window.__dbg.getRoot().library.map(async t=>{
    const blob = await window.__dmg.get(t.id);
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b=> b.toString(16).padStart(2, '0')).join('');
    return {id: t.id, rev: t.audioRev, name: t.filename, size: blob.size, sha};
  })));
  const big = tracks.find(t=> t.size > 300000), small = tracks.find(t=> t.size <= 300000);
  const pieces = puts.filter(x=> typeof x === 'number');
  ok(big && pieces.length >= Math.ceil(big.size / 65536) && pieces[0] === 0, 'the big one went up in pieces (' + pieces.length + ' requests for ' + (big && Math.ceil(big.size / 65536)) + ' pieces)');
  ok(dropped && pieces.filter(x=> x === 5 * 65536).length === 2, 'the lost piece was sent again, and it carried on');
  ok(puts.includes('whole'), 'a small one still goes whole');
  const onServer = (t)=>{ const f = path.join(DATA, 'audio', t.id + '.' + (t.rev || '0')); return fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null; };
  ok(big && onServer(big) === big.sha, 'the server put it together byte for byte');
  ok(small && onServer(small) === small.sha, 'and the small one too');
  const left = fs.readdirSync(path.join(DATA, 'audio')).filter(n=> /\.(part|partlock|tmp)$/.test(n));
  ok(left.length === 0, 'nothing left half-sent on the server (' + left.join(', ') + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
