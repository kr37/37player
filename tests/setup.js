// Setting up 37 Player (2.2.023, Gen Rinzin's design): the welcome's Try it
// out / Install, the guide's way for each kind of device, the Install button
// in the top bar, #setup in the address, and the trial's end (the fifth
// import, or two days).
//   node setup.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal').innerText || '') : '');
const waitModal = async (p, re, ms)=>{ for(let i=0; i<(ms||8000)/200; i++){ const t = await modal(p); if(re.test(t)) return t; await sleep(200); } return await modal(p); };
const short = s=> (s || '').replace(/\n+/g, ' | ').slice(0, 150);
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const LINUX_FF = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const LINUX_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
async function open(b, name, {ua, noFolder, touch, standalone, hash, welcome = true, canBecomeApp} = {}){
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({width: 1200, height: 900, hasTouch: !!touch, isMobile: !!touch});
  if(ua) await p.setUserAgent(ua);
  await p.evaluateOnNewDocument((o)=>{
    if(o.noFolder) delete window.showDirectoryPicker;
    if(o.touch) Object.defineProperty(navigator, 'maxTouchPoints', {get: ()=> 5});
    if(o.standalone){ Object.defineProperty(navigator, 'standalone', {get: ()=> true}); const mm = window.matchMedia.bind(window); window.matchMedia = q=> /display-mode: standalone/.test(q) ? {matches: true, addEventListener(){}, removeEventListener(){}} : mm(q); }
    // A tab that can become the installed app later, as Chrome's Install does
    // (the same page moved into the app's window, not reloaded).
    if(o.canBecomeApp){ window.__isApp = false; window.__dmListeners = []; const mm = window.matchMedia.bind(window); window.matchMedia = q=> /display-mode: standalone/.test(q) ? {get matches(){ return window.__isApp; }, addEventListener(t, f){ window.__dmListeners.push(f); }, removeEventListener(){}} : mm(q); }
    window.__noAutoConverter = true;
    if(o.welcome) window.__welcomeOn = true;
    window.__headsUpOn = true; window.__noDailyPrompt = true; // the trial's end is asked like the Heads-up
  }, {noFolder, touch, standalone, welcome, canBecomeApp});
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP + (hash || ''), {waitUntil: 'networkidle0'}); await sleep(700);
  await clickText(p, '.modal button', '^English$'); await sleep(600);
  return p;
}
const importOne = async (p)=>{
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); const f = new File([blob], 'ten-' + Math.random().toString(36).slice(2, 7) + '.mp3', {type: 'audio/mpeg'}); window.__dbg.bulkImportFolder([f]); });
};
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});

  // ---- Windows, Chrome in a tab: Install → the desktop app only.
  let p = await open(b, 'win', {ua: WIN_CHROME});
  let m = await modal(p);
  ok(/Welcome to 37 Player/.test(m) && /Try it out/.test(m) && /Install/.test(m) && !/join \(or create\)/.test(m), 'the welcome asks Try it out or Install (' + short(m) + ')');
  ok(await p.evaluate(()=> document.querySelector('.modal button.primary')?.textContent.trim()) === 'Install', 'Install is the highlighted choice');
  await clickText(p, '.modal button', '^Install$');
  m = await waitModal(p, /Install 37 Player/);
  const dl = await p.evaluate(()=> document.querySelector('.modal a[data-act="download"]')?.href || '');
  ok(/Get the desktop app/.test(m) && /Download for Windows/.test(m) && /37-Player-windows-setup\.exe$/.test(dl), 'Windows: the desktop app, a direct download (' + dl + ')');
  ok(/Windows protected your PC/.test(m) && /Run anyway/.test(m) && /Keep anyway/.test(m) && /black Delete button/.test(m), 'with how to get past the warnings, as Edge shows them');
  ok(await p.evaluate(()=> [...document.querySelectorAll('.modal .heads-up-num')].map(x=> x.innerText.replace(/\s+/g, ' ')).join(',')) === 'Step 1,Step 2', 'steps are labelled "Step 1", "Step 2"…');
  await p.screenshot({path: 'shots/setup-windows.png'});
  ok(!/Keep the library in a folder|Chrome or Edge/.test(m) && /I can't install apps on this computer/.test(m), 'nothing else, but a way out for a computer that can\'t install apps');
  ok(!/Bring this library along/.test(m), 'an empty library: nothing to bring along');
  await clickText(p, '.modal a', "^I can't install apps");
  m = await modal(p);
  ok(/Install 37 Player as an app/.test(m) && /No Install button\?/.test(m) && /Keep the library in a folder/.test(m) && /once 37 Player is installed/.test(m) && /works well for multiple devices/.test(m), 'then: Chrome\'s way, installing first, the folder after (' + short(m) + ')');
  await clickText(p, '.modal button', '^Close$'); await sleep(300);
  ok(!(await modal(p)) && await p.evaluate(()=> getComputedStyle(document.getElementById('btnInstall')).display !== 'none'), 'closed; the Install button is in the top bar');
  await p.evaluate(()=> document.getElementById('btnInstall').click());
  m = await waitModal(p, /Install 37 Player/);
  ok(/Get the desktop app/.test(m), 'the top bar\'s Install opens the same guide');
  await clickText(p, '.modal button', '^Close$'); await sleep(300);
  await p.browserContext().close();

  // ---- Mac, Safari in a tab: Try it out → the Chrome/Edge suggestion with
  // the testing-only line; quiet until the fifth import; then the guide.
  p = await open(b, 'macsafari', {ua: MAC_SAFARI, noFolder: true});
  await clickText(p, '.modal button', '^Try it out$');
  m = await waitModal(p, /Trying it out/);
  ok(/works best in Chrome or Edge/.test(m) && /Safari deletes the library if 7 days pass/.test(m), 'Try it out in Safari: Chrome or Edge suggested, testing only (' + short(m) + ')');
  await clickText(p, '.modal button', '^Try it here$'); await sleep(400);
  const tr = await p.evaluate(()=> backupInfoForTest().trial);
  ok(tr && tr.imports === 0 && !(await modal(p)), 'Try it here: the trial starts');
  for(let i = 0; i < 4; i++){
    await importOne(p);
    for(let k=0; k<40; k++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
    await p.click('#folderImportGo').catch(()=>{});
    for(let k=0; k<80; k++){ await sleep(250); if(await p.evaluate((n)=> window.__dbg.getRoot().library.length >= n && !document.getElementById('bulkImportStatus'), i + 1)) break; }
    await sleep(500); await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  }
  const quiet = await p.evaluate(()=> ({n: window.__dbg.getRoot().library.length, imports: backupInfoForTest().trial.imports, cls: document.getElementById('btnBackup').className}));
  ok(quiet.n >= 1 && quiet.imports === 4 && !/urgent/.test(quiet.cls) && !/Heads up|Done trying/.test(await modal(p)), 'four imports: no questions, the backup button not red (' + JSON.stringify(quiet) + ')');
  await importOne(p);
  m = await waitModal(p, /Done trying it out/);
  ok(/Done trying it out/.test(m) && /Get the desktop app/.test(m) && /Download for Mac/.test(m) && /Control-click/.test(m) && /Open Anyway/.test(m), 'the fifth import: "Done trying it out?", the Mac desktop app and its warning (' + short(m) + ')');
  ok(/Bring this library along/.test(m) && /Save a backup file/.test(m) && /in the desktop app choose Import \/ Export/.test(m), 'and how to bring the library along');
  await clickText(p, '.modal button', '^Close$');
  for(let k=0; k<40; k++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  ok(!!(await p.$('#folderImportGo')), 'closing it, the import goes ahead');
  await p.click('#folderImportGo').catch(()=>{}); await sleep(2500);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await importOne(p); await sleep(1500);
  ok(!/Done trying it out/.test(await modal(p)) && !!backupInfoForTestEnded(await p.evaluate(()=> backupInfoForTest().trial)), 'asked once only');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await p.browserContext().close();

  // ---- Two days into a trial: asked at the start.
  p = await open(b, 'twodays', {ua: LINUX_CHROME});
  await clickText(p, '.modal button', '^Try it out$'); await sleep(500);
  ok(!(await modal(p)), 'Try it out in Chrome: nothing asked');
  await p.evaluate(async()=>{ backupInfoForTest().trial.at = Date.now() - 3 * 86400000; await window.__dbg.saveState(); await saveBackupInfoForTest(); });
  await p.reload({waitUntil: 'networkidle0'});
  m = await waitModal(p, /Done trying it out/, 9000);
  // Linux has the desktop app too (2.2.042): the .deb, and the .rpm.
  ok(/Done trying it out/.test(m) && /Get the desktop app/.test(m) && /Download \.deb/.test(m) && /Download \.rpm/.test(m) && /Ubuntu 22\.04/.test(m), 'two days later, at the start: the guide, the desktop app on Linux (' + short(m) + ')');
  const hrefs = await p.evaluate(()=> [...document.querySelectorAll('.modal a[data-act="download"]')].map(a=> a.getAttribute('href')));
  ok(hrefs.length === 2 && /37-Player-linux-amd64\.deb$/.test(hrefs[0]) && /37-Player-linux-x86_64\.rpm$/.test(hrefs[1]), 'its downloads (' + hrefs.join(' ') + ')');
  await clickText(p, '.modal a', "^I can't install apps on this computer$"); await sleep(400);
  m = await modal(p);
  ok(/Install 37 Player as an app/.test(m) && /Keep the library in a folder/.test(m), 'and Chrome\'s way, if apps can\'t be installed (' + short(m) + ')');
  await clickText(p, '.modal button', '^Close$');
  await p.browserContext().close();

  // ---- Linux, Firefox: Install → Chrome or Edge only.
  p = await open(b, 'linuxff', {ua: LINUX_FF, noFolder: true});
  await clickText(p, '.modal button', '^Install$');
  m = await waitModal(p, /Install 37 Player/);
  ok(/Get the desktop app/.test(m), 'Linux, Firefox: the desktop app first (' + short(m) + ')');
  await clickText(p, '.modal a', "^I can't install apps on this computer$"); await sleep(400);
  m = await modal(p);
  ok(/Open 37 Player in Chrome or Edge/.test(m) && /Get Chrome/.test(m) && /Get Edge/.test(m) && !/desktop app/.test(m) && !/Keep the library in a folder/.test(m), 'Linux, Firefox, apps can\'t be installed: Chrome or Edge only (' + short(m) + ')');
  await p.evaluate(()=> document.querySelector('.modal [data-act="copy"]').click()); await sleep(500);
  m = await modal(p);
  ok(/#setup/.test(m) || /paste it into the address bar/.test(m), 'Copy the address: the guide\'s own address, to carry on there');
  await clickText(p, '.modal a', '^Just try it out here$'); await sleep(400);
  ok(!(await modal(p)) && !!(await p.evaluate(()=> backupInfoForTest().trial)), 'Just try it out here: a trial');
  await p.browserContext().close();

  // ---- iPad, Safari tab: the Home Screen.
  p = await open(b, 'ipad', {ua: MAC_SAFARI, noFolder: true, touch: true});
  await clickText(p, '.modal button', '^Install$');
  m = await waitModal(p, /Install 37 Player/);
  ok(/Home Screen/.test(m) && /choose Install there to finish/.test(m) && !/desktop app|Chrome or Edge/.test(m), 'iPad in Safari: the Home Screen app (' + short(m) + ')');
  await clickText(p, '.modal button', '^Close$');
  await p.browserContext().close();

  // ---- iPad, Home Screen app: straight to the guide; Google Drive or by hand.
  p = await open(b, 'ipadhome', {ua: MAC_SAFARI, noFolder: true, touch: true, standalone: true});
  m = await waitModal(p, /Install 37 Player/);
  ok(!/Try it out/.test(m) && /Keeping it safe/.test(m) && /Do you use Google Drive/.test(m), 'iPad Home Screen app: no welcome question, the guide: keeping it safe (' + short(m) + ')');
  ok(await p.evaluate(()=> getComputedStyle(document.getElementById('btnInstall')).display) === 'none', 'installed: no Install button in the top bar');
  await clickText(p, '.modal button', '^No$'); await sleep(300);
  m = await modal(p);
  ok(/back up by hand/.test(m) && /iCloud Drive/.test(m) && /delete older ones/.test(m), 'No Google Drive: backups by hand, kept few (' + short(m) + ')');
  await clickText(p, '.modal button', '^Close$');
  await p.browserContext().close();

  // ---- Linux, installed Chrome app: the folder step can be done here.
  p = await open(b, 'linuxapp', {ua: LINUX_CHROME, standalone: true});
  m = await waitModal(p, /Install 37 Player/);
  await clickText(p, '.modal a', "^I can't install apps on this computer$"); await sleep(400);
  m = await modal(p);
  const choose = await p.evaluate(()=> !!document.querySelector('.modal [data-act="folder"]'));
  ok(/Keep the library in a folder/.test(m) && !/once 37 Player is installed/.test(m) && choose && !/Install 37 Player as an app/.test(m), 'Linux, installed: the folder step, with Choose where… (' + short(m) + ')');
  await clickText(p, '.modal button', '^Close$');
  await p.browserContext().close();

  // ---- Linux, Chrome: installing moves this very tab into the app's window
  // (2.2.030): the open guide and the top bar follow without a reload.
  p = await open(b, 'becomesapp', {ua: LINUX_CHROME, canBecomeApp: true});
  await p.screenshot({path: 'shots/setup-welcome.png'});
  await clickText(p, '.modal button', '^Install$');
  m = await waitModal(p, /Install 37 Player/);
  await clickText(p, '.modal a', "^I can't install apps on this computer$"); await sleep(400);
  m = await modal(p);
  ok(/Install 37 Player as an app/.test(m) && await p.evaluate(()=> getComputedStyle(document.getElementById('btnInstall')).display !== 'none'), 'in the tab: the Install step, and Install in the top bar');
  await p.evaluate(()=>{ window.__isApp = true; window.__dmListeners.forEach(f=> f({matches: true})); }); await sleep(400);
  m = await modal(p);
  ok(!/Install 37 Player as an app/.test(m) && /Keep the library in a folder/.test(m) && await p.evaluate(()=> !!document.querySelector('.modal [data-act="folder"]')), 'now the app\'s window: the guide redraws without the Install step, the folder step can be done (' + short(m) + ')');
  ok(await p.evaluate(()=> getComputedStyle(document.getElementById('btnInstall')).display) === 'none', 'and Install leaves the top bar');
  await clickText(p, '.modal button', '^Close$');
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.settings.sharedLibrary = {url: 'x', code: 'demo', deviceName: 'T', libraryName: 'Rinzin\'s library', installs: [localStorage.getItem('37player.install')]}; });
  await p.evaluate(()=>{ window.openSetupGuideForTest(); }); await sleep(500);
  await clickText(p, '.modal a', "^I can't install apps on this computer$"); await sleep(400);
  ok(await p.evaluate(()=> getComputedStyle(document.querySelector('.heads-up-step.done .step-n')).fontWeight) >= 700, 'a done step\'s ✓ is bold');
  await p.screenshot({path: 'shots/setup-done.png'});
  await clickText(p, '.modal button', '^Close$');
  await p.browserContext().close();

  // ---- #setup on a library already set up (the home page's Install).
  p = await open(b, 'hash', {ua: WIN_CHROME});
  await clickText(p, '.modal button', '^Try it out$'); await sleep(400);
  await p.goto('about:blank'); await p.goto(APP + '#setup', {waitUntil: 'networkidle0'});
  m = await waitModal(p, /Install 37 Player/, 9000);
  ok(/Get the desktop app/.test(m) && !(await p.evaluate(()=> location.hash)), '#setup opens the guide, and leaves the address');
  await p.browserContext().close();

  // ---- #try at the first run: no question.
  p = await open(b, 'tryhash', {ua: LINUX_CHROME, hash: '#try'});
  await sleep(500);
  ok(!(await modal(p)) && !!(await p.evaluate(()=> backupInfoForTest().trial)), '#try: the trial starts without the question');
  await p.browserContext().close();

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
function backupInfoForTestEnded(tr){ return tr && tr.ended; }
