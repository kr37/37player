// Choices carried into an iPhone's Home Screen app (2.5.051; kr37, 19 Nov
// 2026: someone setting up on an iPhone was asked the language again there).
// A Safari tab on an iPhone (emulated): Italian chosen, Try it out, joined to
// a shared library as "Rz iPhone"; Install reloads it with the choices in its
// address and points its manifest at manifest.php with them; the guide is
// back after the reload; manifest.php puts checked choices in its start
// address and drops the rest. Then the Home Screen app, fresh storage, opened
// at that address: no language question (Italian), "Join it here too?", Join
// joins the same shared library under the same name, the choices leave its
// address, and a second start asks nothing.
//   node carry.js "$(./new-library.sh)"
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html', CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const heading = p=> p.evaluate(()=> document.getElementById('modalBackdrop')?.classList.contains('show') ? (document.querySelector('.modal h3')?.textContent || '') : '');
async function open(b, {standalone, url}){
  const ctx = await b.createBrowserContext(), p = await ctx.newPage();
  await p.setViewport({width: 390, height: 844, hasTouch: true, isMobile: true});
  await p.setUserAgent(IPHONE_UA);
  await p.evaluateOnNewDocument((o)=>{
    Object.defineProperty(navigator, 'maxTouchPoints', {get: ()=> 5});
    if(o.standalone) Object.defineProperty(navigator, 'standalone', {get: ()=> true});
    window.__noAutoConverter = true; window.__welcomeOn = true; window.__noDailyPrompt = true;
  }, {standalone});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.dismiss());
  await p.goto(url || APP, {waitUntil: 'networkidle0'}); await sleep(900);
  return {ctx, p};
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  // ---- The Safari tab
  const {p} = await open(b, {});
  ok(/language/i.test(await heading(p)), 'the tab asks the language first (' + await heading(p) + ')');
  await clickText(p, '.modal button', '^Italiano$'); await sleep(700);
  const welcome = await p.evaluate(()=> [...document.querySelectorAll('.modal button')].map(x=> x.textContent.trim()));
  await p.evaluate(()=> document.querySelectorAll('.modal .modal-actions button')[0].click()); await sleep(700); // Try it out (the first of the two)
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=> x.click())); await sleep(300);
  const joined = await p.evaluate(async(u, c)=> { const r = await window.__dbg3.join(u, c, 'Rz iPhone', {}); return !!(r && r.ok); }, URL_SYNC, CODE);
  await sleep(1500);
  ok(joined && await p.evaluate(()=> window.__dbg.getRoot().settings.language) === 'it', 'set up: Italian, tried out, joined as "Rz iPhone" (' + welcome.join(' / ') + ')');
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const nav = p.waitForNavigation({waitUntil: 'networkidle0', timeout: 20000}).catch(()=>{});
  await p.evaluate(()=> document.getElementById('btnInstall').click());
  await nav; await sleep(4000);
  const tab = await p.evaluate(()=> ({search: location.search, manifest: document.querySelector('link[rel="manifest"]').href, guide: !!document.querySelector('.modal.heads-up .heads-up-steps'), home: /Home Screen|Schermata Home|schermata/i.test(document.querySelector('.modal')?.innerText || '')}));
  const q = new URLSearchParams(tab.search);
  ok(q.get('lang') === 'it' && q.get('sk') === 's' && q.get('sc') === CODE && q.get('su') === URL_SYNC && q.get('sd') === 'Rz iPhone', 'Install: the tab reloads with its choices in the address (' + tab.search.slice(0, 90) + '…)');
  ok(tab.manifest.includes('/manifest.php?') && tab.manifest.endsWith(tab.search), 'and its manifest is manifest.php with the same ones');
  ok(tab.guide, 'the guide is open again after the reload' + (tab.home ? ', at the Home Screen steps' : ''));
  // Install again: the address already says it all, so no second reload.
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close], #sgClose').forEach(x=> x.click())); await sleep(300);
  await p.evaluate(()=>{ window.__reloaded = false; window.addEventListener('beforeunload', ()=>{ window.__reloaded = true; }); document.getElementById('btnInstall').click(); }); await sleep(1500);
  ok(await p.evaluate(()=> !window.__reloaded && !!document.querySelector('.modal.heads-up')), 'Install again with nothing changed: the guide opens without reloading');
  // ---- manifest.php (from the PHP server, which serves the repository)
  const man = async (query)=> (await (await fetch('http://127.0.0.1:8870/manifest.php' + query)).json());
  const m1 = await man(tab.search + '&evil=1');
  const s1 = new URLSearchParams(m1.start_url.split('?')[1] || '');
  ok(m1.id === './37-player.html' && m1.name === '37 Player' && Array.isArray(m1.file_handlers) && m1.start_url.startsWith('./37-player.html?'), "manifest.php: the website's manifest, id unchanged, the start address carrying choices");
  ok(s1.get('lang') === 'it' && s1.get('sc') === CODE && s1.get('sd') === 'Rz iPhone' && !s1.has('evil') && !s1.has('su'), 'only the checked ones: an unknown one dropped, and a server that isn\'t https (' + m1.start_url.slice(0, 80) + '…)');
  const m2 = await man('?lang=xyz&sk=g&sf=bad%20id&sd=Phone');
  ok(m2.start_url === './37-player.html', 'nothing valid: the plain start address (' + m2.start_url + ')');
  const m3 = await man('?lang=fr&sk=g&sf=1AbC_d-9&sd=Pixel&sn=KMC%20Texas');
  ok(m3.start_url === './37-player.html?lang=fr&sk=g&sf=1AbC_d-9&sd=Pixel&sn=KMC%20Texas', 'Google Drive: its folder, the device and the name (' + m3.start_url + ')');
  // ---- The Home Screen app: its own storage, opened at the tab's address
  const app = await open(b, {standalone: true, url: APP + tab.search});
  const a = app.p;
  const h1 = await heading(a);
  ok(!/language|lingua/i.test(h1) && /condivisa/i.test(h1), 'the Home Screen app: no language question; it asks, in Italian, to join (' + h1 + ')');
  ok(await a.evaluate(()=> new URLSearchParams(location.search).toString()) === '', 'the choices leave its address');
  await a.evaluate(()=> document.querySelector('.modal .btn.primary').click());
  for(let i = 0; i < 60; i++){ // the join's own dialogs (the size to confirm), in Italian
    const cfg = await a.evaluate(()=> window.__dbg.getRoot().settings.sharedLibrary || null);
    if(cfg && cfg.code) break;
    await a.evaluate(()=>{ const x = document.querySelector('.modal-backdrop.show .modal .btn.primary'); if(x && !/condivisa\?/i.test(document.querySelector('.modal h3')?.textContent || '')) x.click(); });
    await sleep(300);
  }
  await sleep(1000);
  const cfg = await a.evaluate(()=> { const s = window.__dbg.getRoot().settings; return {code: s.sharedLibrary && s.sharedLibrary.code, device: s.sharedLibrary && s.sharedLibrary.deviceName, lang: s.language}; });
  ok(cfg.code === CODE && cfg.device === 'Rz iPhone' && cfg.lang === 'it', 'Join: the same shared library, as "Rz iPhone", in Italian (' + JSON.stringify(cfg) + ')');
  // A second start (the icon still has the address): nothing asked.
  await a.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  await a.goto(APP + tab.search, {waitUntil: 'networkidle0'}); await sleep(4000);
  const h2 = await heading(a);
  ok(!/condivisa\?|language|lingua/i.test(h2), 'a second start from the icon asks nothing again (' + (h2 || 'no dialog') + ')');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
