// Switching library while audio is still being sent to the shared library
// (1.4.087): the reload would set off the browser's own "Leave this page?",
// which can't say why. 37 Player asks first, in words; Cancel stays, Switch
// anyway switches without the browser's question.
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width: 1100, height: 850});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  let browserAsked = false; p.on('dialog', d=>{ if(d.type() === 'beforeunload') browserAsked = true; d.accept(); });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
  const skip = async ()=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Start empty$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(500); };
  await skip();
  const first = await p.evaluate(()=> window.__lib.id());
  await Promise.all([p.waitForNavigation({waitUntil: 'networkidle0'}).catch(()=>{}), p.evaluate(()=> window.__lib.create('Second'))]);
  await sleep(800); await skip();
  const second = await p.evaluate(()=> window.__lib.id());
  ok(second !== first, 'a second library, open');
  await p.evaluate(()=> window.__fakeSending());
  p.evaluate((id)=> window.__lib.switchTo(id), first).catch(()=>{});
  for(let i = 0; i < 20 && !(await p.$('#askButtons')); i++) await sleep(250);
  ok(/sending audio to the shared library/.test(await p.evaluate(()=> document.querySelector('.modal')?.innerText || '')), 'while audio is being sent, switching says so');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(400);
  ok(await p.evaluate(()=> window.__lib.id()) === second, 'Cancel stays');
  p.evaluate((id)=> window.__lib.switchTo(id), first).catch(()=>{});
  for(let i = 0; i < 20 && !(await p.$('#askButtons')); i++) await sleep(250);
  await Promise.all([p.waitForNavigation({waitUntil: 'networkidle0', timeout: 8000}).catch(()=>{}), clickText(p, '.modal button', '^Switch anyway$')]);
  await sleep(800);
  ok(await p.evaluate(()=> window.__lib.id()) === first, 'Switch anyway switches');
  ok(!browserAsked, 'without the browser\'s own "Leave this page?"');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
