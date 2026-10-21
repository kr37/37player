// Several libraries on one device: making one, switching, what follows the
// library and what stays with the device, two windows on two libraries,
// deleting, and joining a shared library into a new library.
//   node libs.js "$(./new-library.sh)"
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const alerts = [];
async function page(ctx, name){
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>console.log(name,'PAGE ERROR:', e.message));
  p.on('dialog', d=>{ alerts.push(name+': '+d.message()); d.dismiss(); });
  await p.setRequestInterception(true); p.on('request', r=> r.url().startsWith('http://localhost') || r.url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  return p;
}
const settle = async p=>{ for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(250); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); };
// runs something in the page that reloads it, and waits for the new page
async function reloading(p, fn, arg){
  const nav = p.waitForNavigation({waitUntil:'networkidle0', timeout: 20000});
  p.evaluate(fn, arg).catch(()=>{});
  await nav; await sleep(900);
}
const tree = p=> p.evaluate(()=> window.__dbg.getRoot().tree.map(n=>n.name).join('|'));
const addPlaylist = (p, name)=> p.evaluate(async (name)=>{ const r = window.__dbg.getRoot(); r.tree.push({id:'pl'+Math.random().toString(36).slice(2), kind:'playlist', name, order:r.tree.length, items:[]}); await window.__dbg.saveState(); }, name);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', ...(process.env.CHROME_ARGS||'').split(' ').filter(Boolean)]});
  const ctx = await b.createBrowserContext();
  const A = await page(ctx, 'A');
  await A.goto(APP, {waitUntil:'networkidle0'}); await sleep(800); await settle(A);
  ok(await A.evaluate(()=> window.__lib.id()) === 'main', 'the first library is the original database');
  ok(await A.evaluate(()=> getComputedStyle(document.getElementById('btnLibrary')).display === 'none'), 'with one library, the top bar shows no library name');
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = r.tree.filter(n=> n.name !== 'Classes'); delete r.settings.starterPlaylistId; r.settings.pin = '1234'; window.__dbg.disp('dark', false); await window.__dbg.saveState(); });
  await addPlaylist(A, 'Dharma');
  await A.evaluate(()=> window.__lib.putConverter());

  // ---- a second library
  await reloading(A, ()=> window.__lib.create('Lady Gaga'));
  const idB = await A.evaluate(()=> window.__lib.id());
  ok(idB !== 'main', 'New library opens a library of its own (' + idB + ')');
  const firstModal = await A.evaluate(()=> document.querySelector('.modal') ? document.querySelector('.modal').innerText : '');
  ok(!/Français|Español/.test(firstModal), 'the new library doesn\'t ask for the language again');
  await settle(A);
  ok(await tree(A) === '', 'it starts empty, without the starter prayer (' + await tree(A) + ')');
  const setB = await A.evaluate(()=> ({theme: window.__dbg.getRoot().settings.theme, mc: window.__dbg.getRoot().settings.moreContrast, pin: window.__dbg.getRoot().settings.pin || ''}));
  ok(setB.theme === 'dark' && setB.mc === false, 'display settings come with the device: ' + JSON.stringify(setB));
  ok(setB.pin === '', 'the PIN belongs to the other library');
  ok(await A.evaluate(()=> window.__lib.converter()), 'the converter downloaded in the first library is there in this one');
  await addPlaylist(A, 'Poker Face');
  const top = await A.evaluate(()=>({shown: getComputedStyle(document.getElementById('btnLibrary')).display !== 'none', text: document.getElementById('btnLibrary').textContent, title: document.title}));
  ok(top.shown && top.text === 'Lady Gaga' && /Lady Gaga/.test(top.title), 'the top bar and window title name the open library: ' + JSON.stringify(top));
  await A.evaluate(()=> window.__lib.popover()); await sleep(200);
  const pop = await A.evaluate(()=> document.getElementById('libraryPopover')?.innerText || '');
  ok(/My library/.test(pop) && /Lady Gaga/.test(pop) && /Manage libraries/.test(pop), 'the switcher lists both: ' + pop.replace(/\n/g,' / '));
  await A.screenshot({path:'shots/libs-popover.png'});

  // ---- switching back
  await reloading(A, ()=> [...document.querySelectorAll('#libraryPopover .library-pop-item')].find(b=> /My library/.test(b.textContent)).click());
  ok(await A.evaluate(()=> window.__lib.id()) === 'main' && await tree(A) === 'Dharma', 'switching shows the first library\'s playlists only: ' + await tree(A));
  ok(await A.evaluate(()=> window.__dbg.getRoot().settings.pin) === '1234', 'and its PIN');
  // ---- Settings → Libraries
  await A.evaluate(()=>{ window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); }); await sleep(400);
  await A.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> e.textContent === 'Switch libraries').click()); await sleep(300);
  const sec = await A.evaluate(()=> document.getElementById('settingsBody').innerText);
  ok(/My library[\s\S]*Open now[\s\S]*Lady Gaga[\s\S]*Tracks: 0 · Playlists: 1/.test(sec), 'Settings → Libraries lists them with their sizes');
  await A.screenshot({path:'shots/libs-settings.png'});
  await A.evaluate(()=> document.getElementById('settingsClose').click());

  // ---- two windows, two libraries
  const W = await page(ctx, 'W');
  await W.goto(APP, {waitUntil:'networkidle0'}); await sleep(800); await settle(W);
  ok(await W.evaluate(()=> window.__lib.id()) === 'main', 'a new window opens the library chosen last');
  await reloading(W, (id)=> window.__lib.switchTo(id), idB);
  ok(await W.evaluate(()=> window.__lib.id()) === idB && await tree(W) === 'Poker Face', 'the second window switches on its own');
  await A.reload({waitUntil:'networkidle0'}); await sleep(800);
  ok(await A.evaluate(()=> window.__lib.id()) === 'main', 'and the first window keeps its library across a reload');
  await addPlaylist(A, 'Lamrim');
  await sleep(500);
  ok(await tree(W) === 'Poker Face', 'an edit in one library doesn\'t reach a window on the other');
  // language: device-wide, reaching the other window
  await A.evaluate(async()=>{ window.__dbg.getRoot().settings.language = 'es'; await window.__dbg.saveState(); });
  await sleep(500);
  ok(await W.evaluate(()=> window.__dbg.getRoot().settings.language) === 'es', 'a language change reaches the window on the other library');
  await W.evaluate(async()=>{ await window.__dbg.saveState(); });
  await A.evaluate(async()=>{ window.__dbg.getRoot().settings.language = 'en'; await window.__dbg.saveState(); }); await sleep(400);
  ok(await W.evaluate(()=> window.__dbg.getRoot().settings.language) === 'en', 'and back');

  // ---- deleting the other library while a window has it open
  const navW = W.waitForNavigation({waitUntil:'networkidle0', timeout: 20000});
  await A.evaluate((id)=> window.__lib.del(id), idB);
  await navW; await sleep(900);
  ok(alerts.some(a=> /deleted in another window/.test(a)), 'the window on it is told');
  ok(await W.evaluate(()=> window.__lib.id()) === 'main', 'and opens another library');
  const dbs = await A.evaluate(async()=> (await indexedDB.databases()).map(d=> d.name));
  ok(!dbs.some(n=> n.includes('~' )), 'its database is gone: ' + dbs.join(', '));
  ok(await A.evaluate(()=> getComputedStyle(document.getElementById('btnLibrary')).display === 'none'), 'one library again: no name in the top bar');
  await W.close();

  // ---- joining a shared library into a new library
  if(CODE){
    await reloading(A, (a)=> window.__lib.create('', a), {url: URL_SYNC, code: CODE, device: 'Rak-ma laptop'});
    for(let k=0; k<40; k++){ if(await A.evaluate(()=> !!(window.__dbg.getRoot().settings.sharedLibrary))) break; await clickText(A, '.modal button', '^Join$'); await sleep(250); }
    const j = await A.evaluate(()=>({id: window.__lib.id(), name: window.__lib.name(), cfg: window.__dbg.getRoot().settings.sharedLibrary, tree: window.__dbg.getRoot().tree.length}));
    ok(j.id !== 'main' && j.cfg && j.cfg.code && j.cfg.deviceName === 'Rak-ma laptop', 'New library with a join code joins straight away');
    ok(j.name === 'Test', 'and takes the shared library\'s name: ' + j.name);
    ok(j.tree === 0, 'with nothing combined into it');
    await reloading(A, ()=> window.__lib.switchTo('main'));
    ok(!(await A.evaluate(()=> window.__dbg.getRoot().settings.sharedLibrary)), 'the first library stays unshared');
    // joining from a library that has tracks: offered a new library instead
    await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library.push({id:'fake1', name:'A chant', duration: 10}); window.__dbg.setMode('editing'); document.getElementById('btnSettings').click(); });
    await sleep(400);
    await A.evaluate(()=> [...document.querySelectorAll('#settingsNav .settings-nav-item')].find(e=> /Shared/.test(e.textContent)).click()); await sleep(300);
    await A.evaluate((c)=>{ document.getElementById('shCode').value = c; document.getElementById('shJoin').click(); }, CODE); await sleep(500);
    const ask = await A.evaluate(()=> document.querySelector('.modal') ? document.querySelector('.modal').innerText : '');
    ok(/Join in a new library\?/.test(ask) && /Make a new library for it/.test(ask), 'joining from a library with tracks offers a new library first');
    await A.screenshot({path:'shots/libs-joinnew.png'});
    await clickText(A, '.modal button', '^Cancel$'); await sleep(300);
    ok(!(await A.evaluate(()=> window.__dbg.getRoot().settings.sharedLibrary)), 'Cancel leaves it unjoined');
  } else console.log('(no join code given: joining skipped)');
  console.log(alerts.length ? 'alerts: ' + alerts.join(' | ') : '');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
