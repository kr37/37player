// A full device with files from the shared library still to come here
// (2.5.044; kr37, 18 Nov 2026: his 64 GB iPad on full sync, its library
// bigger than its free space). The not-saving dialog then says 37 Player has
// probably filled the device itself, how many files are still to come, and
// offers What's on this device…; without a shared library, or with nothing
// to come, it's the plain full-device dialog. Settings' status says the same
// when receiving stopped because the device is full, instead of "waiting for
// 3 files from other devices". Checked through the page's own functions
// (debug-hooks.js), with a shared library set for one synchronous moment, so
// nothing tries to reach it.
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
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click())); await sleep(300);
  const r = await p.evaluate(()=>{
    const full = new DOMException('no space left on device', 'QuotaExceededError');
    const settings = window.__dbg.getRoot().settings, had = settings.sharedLibrary;
    const dlg = ()=>{ const m = document.querySelector('.modal-backdrop.show .modal'); const o = {text: m ? m.innerText : '', choose: !!document.getElementById('notSavingChoose')}; document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()); return o; };
    const out = {};
    // No shared library: the plain dialog.
    __shf.pending({audio: {a: 1, b: 1, c: 1}, art: {}});
    __shf.dialog(full); out.alone = dlg();
    try{
      settings.sharedLibrary = {code: 'test', url: 'http://127.0.0.1:9/', deviceName: 'Test'};
      out.toCome = __shf.toCome();
      __shf.dialog(full); out.own = dlg();
      out.syncText = __shf.text(full);
      __shf.pending({audio: {}, art: {}}); __shf.st().arriving = 0;
      __shf.dialog(full); out.none = dlg();
      out.syncNone = __shf.text(full);
      // Settings' status line, receiving stopped by a full device.
      __shf.pending({audio: {a: 1, b: 1, c: 1}, art: {}});
      const holder = document.createElement('div');
      holder.innerHTML = '<p id="shJoined"></p><div class="sh-status-row"><p id="shStatus"></p></div><p id="shConflicts"></p>';
      document.body.appendChild(holder);
      Object.assign(__shf.st(), {state: 'idle', lastSyncAt: Date.now(), arriving: 3, storeFull: true, transfer: null});
      __shf.render(); out.status = document.getElementById('shStatus').textContent;
      __shf.st().storeFull = false;
      __shf.render(); out.statusWaiting = document.getElementById('shStatus').textContent;
      holder.remove(); document.getElementById('shKeepers') && document.getElementById('shKeepers').remove();
    } finally {
      if(had) settings.sharedLibrary = had; else delete settings.sharedLibrary;
      __shf.pending(null); __shf.unfail(); Object.assign(__shf.st(), {arriving: 0, storeFull: false, lastSyncAt: null});
    }
    return out;
  });
  ok(/out of storage space/.test(r.alone.text) && !/probably/.test(r.alone.text) && !r.alone.choose, 'no shared library: the plain full-device dialog (' + r.alone.text.slice(0, 70) + '…)');
  ok(r.toCome === 3, 'files still to come here: ' + r.toCome);
  ok(/probably what filled it/.test(r.own.text) && /3 files/.test(r.own.text) && /iPad Storage/.test(r.own.text) && r.own.choose, 'with files still to come: says 37 Player probably filled it, how many, and offers What\'s on this device… (' + r.own.text.slice(0, 140) + '…)');
  ok(/What's on this device/.test(r.own.text), 'and names the button');
  ok(!/probably/.test(r.none.text) && !r.none.choose, 'nothing to come: the plain dialog');
  ok(/probably what filled it/.test(r.syncText) && /3 files/.test(r.syncText) && !/probably/.test(r.syncNone), 'a sync that fails on a full device says the same, only with files to come');
  ok(/probably what filled it/.test(r.status) && !/waiting for/.test(r.status), 'Settings, receiving stopped by a full device: says why, not "waiting for" (' + r.status + ')');
  ok(/waiting for 3 files/.test(r.statusWaiting), 'otherwise still "waiting for 3 files" (' + r.statusWaiting + ')');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
