// The Size setting in the desktop app (2.4.000, shell 2.4.0): the shell
// zooms the webview and the page isn't magnified (WebKitGTK drew the
// page's transform blurred; Gen Rinzin's T470, 13 Nov 2026). A shell that
// can't keeps the page's own way.
//   node shellzoom.js
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const FAKE = fs.readFileSync(__dirname + '/fake-shell.js', 'utf8');
const start = async (b, zoom)=>{
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.accept());
  await p.evaluateOnNewDocument((z)=>{ window.__fakeShellZoom = z; }, zoom);
  await p.evaluateOnNewDocument(FAKE);
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(1000);
  for(const x of ['^English$','^Keep them there$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$','^OK$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500);
  return p;
};
const look = (p)=> p.evaluate(()=> ({css: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), zooms: window.__fakeZooms || [], kept: localStorage.getItem('37player.shellZoom'), set: window.__dbg.getRoot().settings.uiScale}));
const size = async (p, s)=>{ await p.evaluate((s)=>{ document.querySelector('[data-scale="' + s + '"]').click(); }, s); await sleep(400); };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  let p = await start(b, true);
  await size(p, '1.45');
  let s = await look(p);
  ok(s.set === 1.45 && s.css === '1' && s.zooms[s.zooms.length - 1] === 1.45 && s.kept === '1', 'the shell zooms to the chosen size; the page isn\'t magnified (' + JSON.stringify(s) + ')');
  await size(p, '1');
  s = await look(p);
  ok(s.css === '1' && s.zooms[s.zooms.length - 1] === 1, 'and back to the smallest');
  await size(p, '1.3');
  await p.reload({waitUntil:'networkidle0'}); await sleep(1500);
  s = await look(p);
  ok(s.css === '1' && s.zooms.length >= 1 && s.zooms.every(z=> z === 1.3), 'after a restart: zoomed from the start, never magnified (' + JSON.stringify(s) + ')');
  await p.close();
  // A shell without it (before 2.4.0): the page's own way, as before.
  p = await start(b, false);
  await size(p, '1.45');
  s = await look(p);
  ok(s.css === '1.45' && !s.zooms.length && !s.kept, 'an older shell: the page magnifies itself (' + JSON.stringify(s) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
