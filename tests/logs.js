// Getting a log off a device (1.4.077): Copy all puts the whole log on the
// clipboard with a header saying which version, device and browser it came
// from and how to read it; Share… (Save as a file where the browser can't
// share files) gives the same text as a dated .txt. Both logs: playback
// (Settings → Playback) and sync (Settings → Shared library).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), os = require('os');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2];
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const ctx = b.defaultBrowserContext();
  await ctx.overridePermissions('http://localhost:8861', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const p = await b.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'p37logs-'));
  const cdp = await p.createCDPSession(); await cdp.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: dl});
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$','^OK$','^Close$']){ await clickText(p,'.modal button',x); await sleep(300); }

  // Playback log
  await p.evaluate(()=>{ window.__dbg4.settings(); window.__dbg4.section('playback'); }); await sleep(500);
  await p.evaluate(()=>{ const d = document.getElementById('playLog').closest('details'); d.open = true; });
  ok(await p.evaluate(()=> !!document.querySelector('[data-log="play"] [data-log-act="copy"]')), 'playback log has Copy all');
  await p.click('[data-log="play"] [data-log-act="copy"]'); await sleep(600);
  let clip = await p.evaluate(()=> navigator.clipboard.readText());
  ok(/^37 Player playback log\n/.test(clip), 'the copied text starts with its header');
  ok(/Version: \d+\.\d+\.\d+/.test(clip) && /Browser: /.test(clip) && /Storage: /.test(clip), 'with version, browser and storage');
  ok(/How to read it:/.test(clip) && /NOTES\.md/.test(clip), 'with how to read it and where to read more');
  ok(/— 37 Player opened \(/.test(clip.split('----')[1] || ''), 'and the log lines after the header');
  ok(await p.evaluate(()=> document.querySelector('[data-log="play"] [data-log-act="copy"]').textContent) === 'Copied ✓', 'the button says Copied ✓');

  // Share… falls back to Save as a file in headless Chrome (no file sharing)
  const shareLabel = await p.evaluate(()=> document.querySelector('[data-log="play"] [data-log-act="share"]').textContent);
  console.log('  share button:', shareLabel);
  await p.click('[data-log="play"] [data-log-act="share"]');
  let f = null; for(let i=0;i<40 && !f;i++){ await sleep(200); f = fs.readdirSync(dl).find(n=> /^37player-playback-log-.*\.txt$/.test(n)); }
  ok(!!f, 'Save as a file writes 37player-playback-log-….txt (' + f + ')');
  if(f) ok(/^37 Player playback log\n/.test(fs.readFileSync(path.join(dl, f), 'utf8')), 'with the same header');

  // Sync log, once joined
  if(CODE){
    await p.evaluate(()=> window.__radio && window.__radio('Combine'));
    const j = p.evaluate((c)=> window.__dbg3.join('http://127.0.0.1:8870/sync.php', c, 'Test laptop'), CODE).catch(e=> console.log('join:', e.message));
    for(let i=0;i<20;i++){ await sleep(300); await p.evaluate(()=> window.__radio && window.__radio('Combine')); await clickText(p,'.modal button','^(Continue|Do it now)$'); }
    await j; await sleep(1500);
    await p.evaluate(()=>{ window.__dbg4.settings(); window.__dbg4.section('shared'); }); await sleep(600);
    const has = await p.evaluate(()=> !!document.querySelector('[data-log="sync"] [data-log-act="copy"]'));
    ok(has, 'sync log has Copy all');
    if(has){
      await p.evaluate(()=>{ const more = document.getElementById('shMore'); if(more) more.open = true; document.getElementById('shLog').closest('details').open = true; });
      await p.click('[data-log="sync"] [data-log-act="copy"]'); await sleep(600);
      clip = await p.evaluate(()=> navigator.clipboard.readText());
      if(process.env.SHOW) console.log(clip.split('----')[0] + '----\n' + clip.split('----')[1].split('\n').slice(1,6).join('\n'));
      ok(/^37 Player sync log\n/.test(clip) && /Device: Test laptop/.test(clip) && /Shared library: “/.test(clip), 'the sync log names the device and the shared library');
    }
  }
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
