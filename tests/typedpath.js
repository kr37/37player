// A recording whose content and extension disagree is played from an
// address ending in "/.p37type.<ext>" (page 2.5.050, shell 2.5.6): WebKit on
// the Mac chooses its player from the address's extension, so a WebM named
// ".mp3" went to Apple's player, which can't play WebM (kr37's MacBook,
// 19 Nov 2026). Runs the page as the desktop app with the stand-in shell
// (fake-shell.js), told it takes the tail (__fakeShellTypedPath): the WebM
// named .mp3 gets "/.p37type.webm" and its bytes come back whole through it;
// a real MP3 and a WebM named .webm get no tail.
//   node typedpath.js
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
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__diskBlobMin = 1000; window.__fakeShellTypedPath = true; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await p.evaluate(()=> window.__disk.kind()) === 'desktop', 'the page runs as the desktop app (bridge 2)');
  const r = await p.evaluate(async()=>{
    const {idbPut, idbGet, audioObjectUrl} = window.__disk;
    const pad = (head)=>{ const u = new Uint8Array(5000); u.set(head); for(let i = head.length; i < u.length; i++) u[i] = i & 255; return u; };
    const webm = pad([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01]);
    const mp3 = pad([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
    await idbPut('audio', {id: 'tpw', blob: new File([webm], 'Talk.mp3', {type: 'audio/mpeg'}), rev: 1}); // a WebM kept as .mp3, as before 2.5.048
    await idbPut('audio', {id: 'tpm', blob: new File([mp3], 'Song.mp3', {type: 'audio/mpeg'}), rev: 1});
    await idbPut('audio', {id: 'tpk', blob: new File([webm], 'Tharpa.webm', {type: 'audio/webm'}), rev: 1});
    const out = {};
    for(const id of ['tpw', 'tpm', 'tpk']){
      const rec = await idbGet('audio', id);
      window.__fileUrlPaths.length = 0;
      const url = await audioObjectUrl(rec.blob);
      const asked = window.__fileUrlPaths[0] || '';
      const back = new Uint8Array(await (await fetch(url)).arrayBuffer());
      out[id] = {disk: !!rec.blob.p37path, stored: rec.blob.p37path, asked, same: back.length === 5000 && back[0] === (id === 'tpm' ? 0x49 : 0x1A) && back[4999] === (4999 & 255)};
    }
    return out;
  });
  ok(r.tpw.disk && /\.mp3$/.test(r.tpw.stored), 'set up: the WebM is kept on disk as .mp3 (' + r.tpw.stored + ')');
  ok(r.tpw.asked === r.tpw.stored + '/.p37type.webm', 'its address ends in /.p37type.webm (' + r.tpw.asked.split('/').pop() + ')');
  ok(r.tpw.same, 'and the shell, taking the tail off, serves its bytes whole');
  ok(r.tpm.asked === r.tpm.stored && r.tpm.same, 'a real MP3 named .mp3: no tail');
  ok(r.tpk.asked === r.tpk.stored && /\.webm$/.test(r.tpk.stored) && r.tpk.same, 'a WebM named .webm: no tail');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
