// A converter that stops answering (2.7.003; the audit's fix 6, R): a
// question that hears nothing for a while is given up, the queue goes on,
// that file is tried once more at the next start, and only a second time
// is it said it couldn't be converted. The worker's questions are swallowed
// to stand for a stuck ffmpeg (window.__swallowConvert).
//   node convstall.js     (servers from serve.sh running; needs www/conv and www/ffmpeg)
const puppeteer = require('puppeteer-core');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const waitFor = async(p, fn, ms)=>{ for(let t=0; t<ms; t+=250){ if(await p.evaluate(fn).catch(()=>false)) return true; await sleep(250); } return false; };
const log = (p)=> p.evaluate(()=> window.__log().join('\n'));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 120000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
  await p.evaluateOnNewDocument(()=>{
    window.__converterSilentMs = 4000; window.__convertResumeMs = 3000;
    window.__swallowConvert = sessionStorage.getItem('swallow') !== 'no';
    const W = window.Worker;
    window.Worker = function(url, opts){
      const w = new W(url, opts), post = w.postMessage.bind(w);
      w.postMessage = (m, tr)=>{ if(window.__swallowConvert && m && m.type !== 'load' && m.type !== 'probe' && m.outName) return; return post(m, tr); };
      return w;
    };
  });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = [{id:'pl1', kind:'playlist', name:'Conv', items:[]}]; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.evaluate(async()=>{ const js = await (await fetch('/ffmpeg/ffmpeg-core.js')).blob(), wasm = await (await fetch('/ffmpeg/ffmpeg-core.wasm')).blob(); await window.__conv.put(js, wasm, '0.12.10-nosimd'); });
  // Two WMAs: the first's conversion never answers.
  await p.evaluate(async()=>{
    const blob = await (await fetch('/conv/talk.wma')).blob();
    window.__impDone = false;
    window.__conv.importFiles([new File([blob], 'stuck.wma'), new File([blob], 'second.wma')], window.__dbg.getRoot().tree[0], null, true).then(()=> window.__impDone = true, e=> window.__impDone = 'error ' + e.message);
  });
  ok(await waitFor(p, ()=> /stopped answering in the converter: going on with the rest, and trying it once more at the next start/.test(window.__log().join('\n')), 60000), 'a conversion that hears nothing is given up, and the queue goes on');
  ok(await waitFor(p, ()=> (window.__log().join('\n').match(/stopped answering in the converter/g) || []).length >= 2, 60000), 'the second file too (everything is swallowed)');
  ok(await waitFor(p, ()=> !document.querySelector('.modal') || !/couldn't be converted/.test(document.querySelector('.modal').innerText), 2000), 'neither is said to have failed yet');
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.filter(t=> t.needsConvert).length === 2), 'both stay as they were, waiting');
  // The next start: tried once more, stuck again: now it's said.
  await p.reload({waitUntil: 'networkidle0'});
  ok(await waitFor(p, ()=> /converting again 2 files that stopped answering last time/.test(window.__log().join('\n')), 20000), 'at the next start they\'re tried once more');
  ok(await waitFor(p, ()=> /couldn't be converted/.test(document.querySelector('.modal')?.innerText || ''), 60000), 'stuck again: now they couldn\'t be converted');
  const m = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
  ok(/stuck(\.wma)? — the converter stopped answering/.test(m) || /— the converter stopped answering/.test(m), 'with the reason (' + m.replace(/\s+/g, ' ').slice(0, 160) + ')');
  ok(/stopped answering in the converter again: not converted/.test(await log(p)), 'and the log says so');
  await clickText(p, '.modal button', '^OK$');
  // A third start: nothing is tried by itself.
  const again = (await log(p)).match(/converting again/g).length;
  await p.reload({waitUntil: 'networkidle0'}); await sleep(6000);
  ok(((await log(p)).match(/converting again/g) || []).length === again, 'after that, not tried again by itself');
  // Once more, letting it answer: from Library cleanup's way in, it converts.
  await p.evaluate(()=>{ window.__swallowConvert = false; });
  await p.evaluate(()=> window.__conv.convert(window.__dbg.getRoot().library.filter(t=> t.needsConvert).map(t=> t.id)));
  ok(await waitFor(p, ()=> window.__dbg.getRoot().library.filter(t=> !t.needsConvert && /\.mp3$/.test(t.filename || '')).length === 2, 90000), 'when the converter answers, they convert');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
