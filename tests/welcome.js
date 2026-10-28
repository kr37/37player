// The first run and the Heads-up (1.4.092). The first run asks only the
// language and whether to join a shared library; ▶, Import / Export and the
// display button glow until clicked. The first import brings the Heads-up,
// with what applies on this device: Chrome (automatic backups, a shared
// library), Firefox (Chrome or Edge, backing up by hand), Safari on an iPad
// (the Home Screen first; "Are you sure?"; a quick job), Android (Install).
// Then: the backup button is red as soon as there's something to back up,
// nothing asks on leaving Edit Playlists or Library, the once-a-day prompt,
// a sync that doesn't finish, and libraries from before never see the
// Heads-up. Also: import dialogs say "files" for files.
//   node welcome.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal').innerText || '') : '');
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const FF_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
async function open(b, name, {ua, noFolder, touch, standalone, install, viewport, daily} = {}){
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport(viewport || {width: 1200, height: 900, hasTouch: !!touch, isMobile: !!touch});
  if(ua) await p.setUserAgent(ua);
  await p.evaluateOnNewDocument((o)=>{
    if(o.noFolder) delete window.showDirectoryPicker;
    if(o.touch) Object.defineProperty(navigator, 'maxTouchPoints', {get: ()=> 5});
    if(o.standalone) Object.defineProperty(navigator, 'standalone', {get: ()=> true});
    if(o.install) window.addEventListener('load', ()=> setTimeout(()=>{ const e = new Event('beforeinstallprompt'); e.prompt = ()=>{ window.__prompted = true; return Promise.resolve(); }; e.userChoice = Promise.resolve({outcome: 'accepted'}); window.dispatchEvent(e); }, 0));
    window.__noAutoConverter = true;
    window.__headsUpOn = true; // the hooks leave the Heads-up and the daily prompt on
    if(!o.daily) window.__noDailyPrompt = true;
  }, {noFolder, touch, standalone, install, daily});
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  await clickText(p, '.modal button', '^English$'); await sleep(500);
  return p;
}
const importOne = (p, name)=> p.evaluate(async(name)=>{ const blob = await (await fetch('/ten.mp3')).blob(); const f = new File([blob], name || 'ten.mp3', {type: 'audio/mpeg'}); window.__dbg.bulkImportFolder([f]); }, name);
// Goes through an import's own dialogs to the end; returns the titles seen.
async function finishImport(p){
  const titles = [];
  for(let k = 0; k < 80; k++){
    const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || '');
    if(h && !titles.includes(h)) titles.push(h);
    if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$');
    if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=> x.click())); break; }
    await sleep(150);
  }
  await sleep(400);
  return titles;
}
const libCount = p=> p.evaluate(()=> window.__dbg.getRoot().library.length);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  // ---- Chrome on a computer
  let p = await open(b, 'chrome');
  let m = await modal(p);
  ok(/join \(or create\) a shared library at this time\?/.test(m) && /No, just start/.test(m) && /Yes, join or create one/.test(m), 'the welcome asks only whether to join a shared library');
  ok(!/backup|browser|Home Screen/i.test(m), 'and nothing about backups, browsers or the Home Screen');
  await p.screenshot({path: 'shots/welcome-chrome.png'});
  await clickText(p, '.modal button', '^No, just start$'); await sleep(500);
  ok(!(await modal(p)) && await p.evaluate(()=> backupInfoForTest().setupDone), 'No, just start: that\'s the whole first run');
  ok(await p.evaluate(()=> document.body.dataset.glow) === 'play import display', '▶, Import (the Library tab, then Import / Export) and the display button glow: ' + await p.evaluate(()=> document.body.dataset.glow));
  await p.evaluate(()=> document.getElementById('btnDisplaySettings').click()); await sleep(300);
  await p.keyboard.press('Escape'); await sleep(200);
  ok(await p.evaluate(()=> document.body.dataset.glow) === 'play import', 'clicking one stops its glow, the others go on');
  await p.reload({waitUntil: 'networkidle0'}); await sleep(800);
  ok(await p.evaluate(()=> document.body.dataset.glow) === 'play import' && !(await modal(p)), 'after a reload: still glowing, no welcome again');
  const anim = id=> p.evaluate(id=>{ const el = document.getElementById(id); return el && el.offsetParent ? getComputedStyle(el).animationName : 'hidden'; }, id);
  ok(await anim('tabLibrary') === 'firstGlow', 'on Playing, the Library tab glows (the way to Import)');
  // The big ▶ Play, with a playlist chosen and nothing queued.
  await p.evaluate(()=>{ const r = window.__dbg.getRoot(); const pl = r.tree.find(n=> n.kind === 'playlist') || (r.tree.find(n=> n.children) || {children: []}).children.find(n=> n.kind === 'playlist'); if(pl) document.querySelector('[data-id="' + pl.id + '"]')?.click(); }); await sleep(300);
  const big = await anim('btnStartPlaylist');
  ok(big === 'firstGlow' || big === 'hidden', 'the big ▶ Play glows too, while ▶ does (' + big + ')');
  await p.evaluate(()=>{ window.__dbg.setMode('library'); }); await sleep(300);
  ok(await anim('tabLibrary') !== 'firstGlow' && await anim('btnImportExport') === 'firstGlow', 'in Library: the tab stops, Import / Export glows');
  // The first import: the Heads-up.
  await importOne(p); await sleep(800);
  m = await modal(p);
  ok(/Heads up!/.test(m) && /starting to build your library/.test(m), 'the first import: Heads up!');
  ok(/Turn on automatic backups, or join a shared library/.test(m) && /Choose backup folder/.test(m) && /Join a shared library/.test(m), 'Chrome: automatic backups or a shared library, each with its button');
  ok(!/Home Screen|Chrome or Edge instead/.test(m), 'Chrome: nothing about the Home Screen or other browsers');
  await p.screenshot({path: 'shots/welcome-headsup-chrome.png'});
  await clickText(p, '.modal button', '^Import now$');
  const titles = await finishImport(p);
  ok(await libCount(p) === 1, 'Import now carries on with the import');
  ok(!titles.some(h=> /folder/i.test(h)) && titles.some(h=> /files/i.test(h)), 'importing chosen files says "files": ' + titles.join(' → '));
  const accept = await p.evaluate(()=> IMPORT_ACCEPT_FOR_TEST);
  ok(/video\/\*/.test(accept) && /\.mkv/.test(accept) && /\.ac3/.test(accept) && /\.wma/.test(accept), 'the file picker offers videos and the formats the converter handles');
  await sleep(800);
  ok(await p.evaluate(()=> document.getElementById('btnBackup').className) === 'backup-indicator urgent', 'the backup button is red straight away: ' + await p.evaluate(()=> document.getElementById('btnBackup').className));
  await importOne(p, 'ten2.mp3'); await sleep(800);
  ok(!/Heads up!/.test(await modal(p)), 'the next import: no Heads-up');
  await finishImport(p);
  // Leaving for Playing: nothing asks.
  await p.evaluate(()=> document.querySelector('.mode-tab[data-mode="playing"]').click()); await sleep(600);
  ok(!(await modal(p)) && await p.evaluate(()=> document.querySelector('.mode-tab.active').dataset.mode) === 'playing', 'going to Playing with changes not backed up: nothing asks');
  await p.close();

  // ---- Firefox
  p = await open(b, 'firefox', {ua: FF_UA, noFolder: true});
  await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
  await importOne(p); await sleep(800);
  m = await modal(p);
  ok(/Use Chrome or Edge instead/.test(m) && /Firefox can't/.test(m) && /Copy the address for Chrome or Edge/.test(m), 'Firefox: Chrome or Edge instead, with Copy the address');
  ok(/back up by hand/.test(m) && /Back up library/.test(m) && !/Choose backup folder/.test(m), 'and joining or backing up by hand (no folder)');
  await p.screenshot({path: 'shots/welcome-headsup-firefox.png'});
  await clickText(p, '.modal button', '^Cancel$'); await sleep(500);
  ok(await libCount(p) === 0 && await p.evaluate(()=> backupInfoForTest().headsUpPending), 'Cancel: nothing imported, and the Heads-up comes again next time');
  await p.close();

  // ---- iPad, Safari
  const ipad = {ua: IPAD_UA, noFolder: true, touch: true, viewport: {width: 820, height: 1180, hasTouch: true, isMobile: true}};
  p = await open(b, 'ipad', ipad);
  m = await modal(p);
  ok(/join \(or create\) a shared library/.test(m) && !/Home Screen/.test(m), 'iPad Safari: the welcome too asks only about joining, not the Home Screen');
  await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
  await importOne(p); await sleep(800);
  m = await modal(p);
  ok(/Add 37 Player to your Home Screen, then import there/.test(m) && /Add to Home Screen/.test(m) && /7 days/.test(m), 'iPad Safari: the Home Screen first, with the steps');
  ok(/I'll do that first/.test(m) && /Import here anyway/.test(m), 'with "I\'ll do that first" and "Import here anyway"');
  await p.screenshot({path: 'shots/welcome-headsup-ipad.png'});
  await clickText(p, '.modal button', '^Import here anyway$'); await sleep(400);
  m = await modal(p);
  ok(/Are you sure\?/.test(m) && /takes a few seconds/.test(m) && /quick job/.test(m), '"Are you sure?", with the quick-job choice');
  await clickText(p, '.modal button', '^Go back$'); await sleep(400);
  ok(/Heads up!/.test(await modal(p)), 'Go back returns to the Heads-up');
  await clickText(p, '.modal button', '^Import here anyway$'); await sleep(400);
  await clickText(p, '.modal button', "^I'm only using it for a quick job$");
  await finishImport(p);
  ok(await libCount(p) === 1 && await p.evaluate(()=> !!backupInfoForTest().quickJob), 'a quick job: the import goes ahead, and it\'s remembered');
  await sleep(600);
  ok(await p.evaluate(()=> document.getElementById('btnBackup').className) === 'backup-indicator warn', 'and the backup button is only amber: ' + await p.evaluate(()=> document.getElementById('btnBackup').className));
  await p.close();

  // ---- iPad Home Screen app: nothing about the Home Screen
  p = await open(b, 'ipad-home', Object.assign({standalone: true}, ipad));
  await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
  await importOne(p); await sleep(800);
  m = await modal(p);
  ok(/Heads up!/.test(m) && !/Home Screen/.test(m) && /back up by hand/.test(m), 'iPad Home Screen app: no Home Screen step, just joining or backing up');
  await p.close();

  // ---- Android Chrome, with an install prompt
  p = await open(b, 'android', {ua: ANDROID_UA, noFolder: true, touch: true, install: true, viewport: {width: 412, height: 915, hasTouch: true, isMobile: true}});
  await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
  await importOne(p); await sleep(800);
  m = await modal(p);
  ok(/Install 37 Player\./.test(m) && /Install 37 Player$/m.test(m), 'Android: Install, with its button');
  await p.screenshot({path: 'shots/welcome-headsup-android.png'});
  await clickText(p, '.modal button', '^Install 37 Player$'); await sleep(500);
  ok(await p.evaluate(()=> !!window.__prompted), 'Install opens the browser\'s own install prompt');
  ok(/✓/.test(await modal(p)), 'and the step is ticked');
  await p.close();

  // ---- A library from before: no Heads-up; the daily prompt; a sync that doesn't finish
  p = await open(b, 'daily', {daily: true});
  await clickText(p, '.modal button', '^No, just start$'); await sleep(400);
  await p.evaluate(async()=>{ const bi = backupInfoForTest(); delete bi.headsUpPending; await window.__dbg.saveState(); });
  await importOne(p); await sleep(800);
  ok(!/Heads up!/.test(await modal(p)), 'a library from before this version: no Heads-up');
  await finishImport(p);
  await p.evaluate(()=> window.__dbg.setMode('playing')); await sleep(300);
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(1500);
  m = await modal(p);
  ok(/Time for a backup/.test(m) && /never been backed up/.test(m) && /Turn on automatic backups/.test(m) && /Not today/.test(m), 'the first time today on Library: "Time for a backup"');
  await clickText(p, '.modal button', '^Not today$'); await sleep(300);
  await p.evaluate(()=> window.__dbg.setMode('playing')); await sleep(300);
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(1500);
  ok(!(await modal(p)), 'and not again the same day');
  // Joined, with something waiting to be sent for four days.
  await p.evaluate(()=>{
    window.__moved.setShared({url: 'http://127.0.0.1:1/sync.php', code: 'x y', deviceName: 'Test'});
    localStorage.setItem('37player.syncPendingSince.' + window.__lib.id(), String(Date.now() - 4 * 86400000));
    window.__starter.update();
  });
  await sleep(300);
  ok(await p.evaluate(()=> document.getElementById('btnBackup').textContent) === "Sync isn't finishing", 'joined, with something unsent for days: "Sync isn\'t finishing" (' + await p.evaluate(()=> document.getElementById('btnBackup').textContent) + ')');
  await p.evaluate(()=> document.getElementById('btnBackup').click()); await sleep(400);
  m = await modal(p);
  ok(/Sync doesn't seem to be finishing/.test(m) && /only on this device/.test(m), 'tapping it says what\'s wrong and what to do');
  await p.close();

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
