// The welcome on first start, for each kind of device and browser: Chrome on
// a computer (backup folder), Firefox (better in Chrome or Edge), Brave
// (folder access flag), Safari on an iPad (Home Screen first; Safari anyway
// is possible but asks again), the iPad Home Screen app (manual backups),
// Android Chrome (Install). Also: import dialogs say "files" for files.
//   node welcome.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modal = p=> p.evaluate(()=> document.querySelector('.modal') && document.getElementById('backdrop')?.classList.contains('show') !== false ? (document.querySelector('.modal').innerText || '') : '');
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const FF_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
async function open(b, name, {ua, noFolder, touch, standalone, brave, install, viewport} = {}){
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport(viewport || {width: 1200, height: 900, hasTouch: !!touch, isMobile: !!touch});
  if(ua) await p.setUserAgent(ua);
  await p.evaluateOnNewDocument((o)=>{
    if(o.noFolder) delete window.showDirectoryPicker;
    if(o.touch) Object.defineProperty(navigator, 'maxTouchPoints', {get: ()=> 5});
    if(o.standalone) Object.defineProperty(navigator, 'standalone', {get: ()=> true});
    if(o.brave) Object.defineProperty(navigator, 'brave', {get: ()=> ({isBrave: ()=> Promise.resolve(true)})});
    if(o.install) window.addEventListener('load', ()=> setTimeout(()=>{ const e = new Event('beforeinstallprompt'); e.prompt = ()=>{ window.__prompted = true; return Promise.resolve(); }; e.userChoice = Promise.resolve({outcome: 'accepted'}); window.dispatchEvent(e); }, 0));
    window.__noAutoConverter = true;
  }, {noFolder, touch, standalone, brave, install});
  p.on('pageerror', e=> console.log(name, 'PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(700);
  await clickText(p, '.modal button', '^English$'); await sleep(500);
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  // ---- Chrome on a computer
  let p = await open(b, 'chrome');
  let m = await modal(p);
  ok(/First, a backup folder/.test(m) && /Choose backup folder/.test(m), 'Chrome: asks for a backup folder');
  ok(!/37-player\.html|copy of 37 Player itself|Chrome or Edge/.test(m), 'Chrome: says nothing about a local copy or other browsers');
  ok(/How does that work\?/.test(m), 'Chrome: "How does that work?" is there, folded away');
  await p.evaluate(()=> document.querySelector('.setup-how').open = true);
  await p.screenshot({path: 'shots/welcome-chrome.png'});
  ok(/A browser's own storage/.test(await modal(p)), 'and opens to the three places things are kept');
  await clickText(p, '.modal button', '^Skip for now$'); await sleep(400);
  ok(/Add audio|audio/i.test(await modal(p)), 'Skip goes on to adding audio');
  // import dialog titles: files, not folder
  await clickText(p, '.modal button', '^Finish$'); await sleep(300);
  await p.evaluate(async()=>{ const blob = await (await fetch('/ten.mp3')).blob(); const f = new File([blob], 'ten.mp3', {type: 'audio/mpeg'}); window.__dbg.bulkImportFolder([f]); });
  let titles = [];
  for(let k = 0; k < 60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(h && !titles.includes(h)) titles.push(h); if(/Review/.test(h)){ await clickText(p, '.modal button', '^Import$'); } if(/Import finished/.test(h)) break; await sleep(150); }
  ok(!titles.some(h=> /folder/i.test(h)) && titles.some(h=> /files/i.test(h)), 'importing chosen files says "files": ' + titles.join(' → '));
  const accept = await p.evaluate(()=> IMPORT_ACCEPT_FOR_TEST);
  ok(/video\/\*/.test(accept) && /\.mkv/.test(accept) && /\.ac3/.test(accept) && /\.wma/.test(accept), 'the file picker offers videos and the formats the converter handles');
  await p.close();

  // ---- Firefox
  p = await open(b, 'firefox', {ua: FF_UA, noFolder: true});
  m = await modal(p);
  ok(/works best in Chrome or Edge/.test(m) && /Firefox can't/.test(m), 'Firefox: told Chrome or Edge is better, by name');
  ok(/Copy the address for Chrome or Edge/.test(m) && /Continue in Firefox/.test(m), 'Firefox: copy the address, or continue');
  await p.screenshot({path: 'shots/welcome-firefox.png'});
  await clickText(p, '.modal button', '^Continue in Firefox$'); await sleep(400);
  m = await modal(p);
  ok(/back up automatically/.test(m) && /Always ask you where to save files/.test(m), 'then manual backups, with the download tip');
  await p.close();

  // ---- Brave
  p = await open(b, 'brave', {noFolder: true, brave: true});
  m = await modal(p);
  ok(/brave:\/\/flags/.test(m) && /File System Access API/.test(m) && !/works best in Chrome/.test(m), 'Brave: how to turn on folder access, not "use Chrome"');
  await p.close();

  // ---- iPad, Safari
  const ipad = {ua: IPAD_UA, noFolder: true, touch: true, viewport: {width: 820, height: 1180, hasTouch: true, isMobile: true}};
  p = await open(b, 'ipad', ipad);
  m = await modal(p);
  ok(/add 37 Player to your Home Screen/.test(m) && /Add to Home Screen/.test(m) && /before/.test(m), 'iPad Safari: the Home Screen first, before adding audio');
  ok(!/backup folder|Back up library/.test(m), 'iPad Safari: nothing about backups yet');
  await p.screenshot({path: 'shots/welcome-ipad.png'});
  await clickText(p, '.modal button', '^OK$'); await sleep(300);
  ok(!(await p.evaluate(()=> window.__dbg.getRoot && backupInfoForTest().setupDone)), 'OK leaves setup to do, so it asks again');
  await p.reload({waitUntil: 'networkidle0'}); await sleep(800);
  ok(/Home Screen/.test(await modal(p)), 'and it does ask again on the next start');
  await p.evaluate(()=> document.getElementById('setupAnyway').click()); await sleep(300);
  m = await modal(p);
  ok(/Use 37 Player in Safari\?/.test(m) && /7 days/.test(m), '"Use it in Safari anyway" warns first');
  await clickText(p, '.modal button', '^Go back$'); await sleep(300);
  ok(/Home Screen/.test(await modal(p)), 'Go back returns to the Home Screen steps');
  await p.evaluate(()=> document.getElementById('setupAnyway').click()); await sleep(300);
  await clickText(p, '.modal button', '^Use Safari anyway$'); await sleep(300);
  m = await modal(p);
  ok(/back up automatically/.test(m) && /Files app/.test(m) && /7 days/.test(m), 'Safari anyway: manual backups, the Files app, and the 7-day warning');
  await p.close();

  // ---- iPad Home Screen app
  p = await open(b, 'ipad-home', Object.assign({standalone: true}, ipad));
  m = await modal(p);
  ok(!/Add to Home Screen/.test(m) && /Files app/.test(m) && /keeps your library/.test(m), 'iPad Home Screen app: manual backups in Files, no Home Screen step');
  ok(!/7 days/.test(m), 'and no 7-day warning there');
  await p.screenshot({path: 'shots/welcome-ipad-home.png'});
  await p.close();

  // ---- Android Chrome, with an install prompt
  p = await open(b, 'android', {ua: ANDROID_UA, noFolder: true, touch: true, install: true, viewport: {width: 412, height: 915, hasTouch: true, isMobile: true}});
  m = await modal(p);
  ok(/Install 37 Player as an app/.test(m) && /Downloads/.test(m), 'Android: manual backups, and install as an app');
  await p.screenshot({path: 'shots/welcome-android.png'});
  await clickText(p, '.modal button', '^Install 37 Player$'); await sleep(400);
  ok(await p.evaluate(()=> !!window.__prompted), 'Install opens the browser\'s own install prompt');
  await p.close();

  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
