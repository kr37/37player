// The page's own errors reach the playback log (2.7.024): on an older WebKit
// (the desktop app on Catalina) dialogs didn't open and saves failed, and only
// the console said why. An error thrown in a handler and a promise rejected
// with no one waiting are logged, each message once a minute, twenty at most.
//   node pageerrorlog.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; window.__playableCheckMs = 600000; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  const errs = ()=> p.evaluate(()=> window.__log().filter(l=> /page error/.test(l)));
  const before = (await errs()).length;
  // An error in an event handler, as a broken dialog's click would throw.
  // Run as the page's own script (code from evaluate() reports as "Script error.").
  const run = (code)=> p.evaluate((code)=>{ const s = document.createElement('script'); s.textContent = code; document.body.appendChild(s); s.remove(); }, code);
  await run("const bt = document.createElement('button'); bt.id = 'boom'; bt.onclick = function(){ null.arrayBuffer(); }; document.body.appendChild(bt);");
  await p.evaluate(()=>{ setTimeout(()=> document.getElementById('boom').click(), 0); });
  await sleep(300);
  let lines = await errs();
  ok(lines.length === before + 1 && /page error \(script\): .*TypeError.*\[line \d+/.test(lines[lines.length - 1]), 'an error thrown in a handler is logged, with its line (' + (lines[lines.length - 1] || 'none') + ')');
  // The same again at once: not logged twice.
  await p.evaluate(()=>{ setTimeout(()=> document.getElementById('boom').click(), 0); }); await sleep(300);
  ok((await errs()).length === before + 1, 'the same message again within a minute is not logged twice');
  // A promise rejected with no one waiting.
  await run("Promise.reject(new TypeError('new Blob(parts).arrayBuffer is not a function'));"); await sleep(300);
  lines = await errs();
  ok(/page error \(promise\): TypeError: new Blob\(parts\)\.arrayBuffer is not a function/.test(lines[lines.length - 1] || ''), 'a rejected promise nobody waits on is logged (' + (lines[lines.length - 1] || 'none') + ')');
  // Many different ones: twenty at most.
  await run("for(let i = 0; i < 40; i++) Promise.reject(new Error('fault ' + i));"); await sleep(500);
  ok((await errs()).length === 20, 'twenty at most in a session (' + (await errs()).length + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
