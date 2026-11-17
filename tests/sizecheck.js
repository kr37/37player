// The checks that look at every track don't read every recording (2.5.039).
// In the desktop app, loading a stored recording of 32 MB or less reads it
// whole, so the size check at each start (reconcileFileSizes) and the
// missing-audio check in Library cleanup put the whole library through the
// page. Now they ask the size from the disk, and read one byte to see a
// file is readable. Through the stand-in shell:
// - three tracks with wrong recorded sizes get their files' sizes, with
//   almost nothing read;
// - the missing-audio check finds the one whose file is gone, reading next
//   to nothing.
//   node sizecheck.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('console', m=>{ if(/Track sizes corrected/.test(m.text())) console.log('PAGE:', m.text()); });
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'domcontentloaded'}); await sleep(1500);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  const MB = 1048576;
  await p.evaluate(async(MB)=>{
    const D = window.__disk, R = window.__dbg.getRoot(); R.tree = []; R.library = []; delete R.settings.starterPlaylistId;
    for(let i = 0; i < 4; i++){
      const bytes = new Uint8Array(MB + i); bytes.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]); // "ID3": an MP3 as far as anyone looks
      R.library.push({id: 'sz' + i, name: 'Size ' + i, filename: 's' + i + '.mp3', fileSize: 5, duration: 60, peaks: new Array(100).fill(0.3), addedAt: Date.now()});
      await D.idbPut('audio', {id: 'sz' + i, blob: new File([bytes], 's' + i + '.mp3', {type: 'audio/mpeg'})});
    }
    await window.__dbg.saveState();
  }, MB);
  // Its next start: the size check runs 8 s in.
  await p.reload({waitUntil: 'domcontentloaded'}); await sleep(3000);
  await p.evaluate(()=>{ window.__fakeShellReadBytes = 0; });
  await sleep(9000);
  const r = await p.evaluate(()=> ({sizes: window.__dbg.getRoot().library.map(t=> t.fileSize), read: window.__fakeShellReadBytes}));
  ok(JSON.stringify(r.sizes) === JSON.stringify([MB, MB + 1, MB + 2, MB + 3]), 'the size check at the start gives each track its file\'s size (' + r.sizes.join(', ') + ')');
  ok(r.read < 200000, 'without reading the recordings (' + r.read + ' bytes read; they hold ' + (4 * MB) + ')');
  // One file gone; the missing-audio check in Library cleanup.
  const gone = await p.evaluate(async()=>{
    const raw = await window.__disk.libStore().readRaw('audio', 'sz2'), ph = raw.blob;
    const D = window.__disk, own = D.libStore();
    if(ph.$path){ const at = await own.pathDir(ph.$path, false); await at.dir.removeEntry(at.name); } else await (await own.sub('audio')).removeEntry(ph.$blob);
    window.__fakeShellReadBytes = 0;
    const missing = await window.__disk.tracksWithMissingAudio();
    return {ids: missing.map(t=> t.id), read: window.__fakeShellReadBytes};
  });
  ok(gone.ids.join(',') === 'sz2' && gone.read < 200000, 'the missing-audio check finds the one whose file is gone, reading next to nothing (' + gone.ids.join(',') + '; ' + gone.read + ' bytes read)');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
