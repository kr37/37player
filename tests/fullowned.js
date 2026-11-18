// A full device during a shared-library sync (2.5.044; kr37, 18 Nov 2026: his
// 64 GB iPad, its library bigger than its free space). When files are still to
// come here, the sync's message says this device is full and that the shared
// library's sync is probably what filled it, with how many files are left, and
// the Settings status offers "What's on this device…" (the fullOwn flag). The
// flag is only as old as the state it was set with: a later state without it
// clears it. Checked here through the page's own functions (debug-hooks.js).
//   node fullowned.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.accept());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(1500);
  const r = await p.evaluate(()=>{
    const full = new DOMException('no space left on device', 'QuotaExceededError');
    const out = {};
    __shf.st().arriving = 3; out.withFiles = __shf.text(full);
    __shf.st().arriving = 0; out.noFiles = __shf.text(full);
    __shf.set({state: 'error', message: 'x', fullOwn: true}); out.set = !!__shf.st().fullOwn;
    __shf.set({state: 'idle'}); out.cleared = !__shf.st().fullOwn;
    __shf.set({state: 'error', message: 'y'}); out.kept = !__shf.st().fullOwn; // a new error without the flag: off
    out.plainText = out.noFiles === __shf.text(full);
    return out;
  });
  ok(/3 /.test(r.withFiles) && /probably/.test(r.withFiles) && /What's on this device/.test(r.withFiles), 'with files still to come: says the device is full, that sync is probably why, how many are left, and where to go (' + r.withFiles.slice(0, 90) + '…)');
  ok(!/probably/.test(r.noFiles), 'with nothing to come: the plain full-device message, as before');
  ok(r.set && r.cleared && r.kept, 'the fullOwn flag is set with its error, and cleared by a state that doesn\'t set it (' + JSON.stringify(r) + ')');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
