const puppeteer = require('puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.emulate({viewport:{width:820,height:560,isMobile:true,hasTouch:true,deviceScaleFactor:1}, userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile'});
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r=window.__dbg.getRoot(); r.tree.push({id:'pl', kind:'playlist', name:'P', items:[{id:'s1',kind:'stop',name:'Stop for teaching',order:0},{id:'s2',kind:'stop',name:'Stop for meditation',order:1},{id:'s3',kind:'stop',name:'Stop before dedication',order:2}]}); await window.__dbg.saveState(); window.__editStop(r.tree[r.tree.length-1].items[0]); });
  await sleep(400);
  await p.focus('#stopName'); await p.keyboard.press('Backspace'); await p.keyboard.type('x'); await sleep(300);
  await p.evaluate(()=>{ document.getElementById('stopName').value='Stop'; document.getElementById('stopName').dispatchEvent(new Event('input')); }); await sleep(300);
  const geo = await p.evaluate(()=>{ const f=document.getElementById('stopName').getBoundingClientRect(); const l=document.querySelector('.name-suggest'); const r=l.getBoundingClientRect(); return {field:[f.top,f.bottom], list:[r.top,r.bottom], shown:l.style.display, items:l.children.length, inline:l.classList.contains('inline')}; });
  console.log(JSON.stringify(geo));
  console.log(geo.inline && geo.list[0] >= geo.field[1] ? 'ALL OK' : 'FAILED: the list covers the field');
  await p.screenshot({path:'shots/stop-ipad.png'});
  await b.close();
})();
