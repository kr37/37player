// Copy to another library (1.4.126): Import/Export → Copy to another library,
// into a library open in another window (arrives at once) and into one that
// isn't open (arrives when it's opened); copying again finds what's there.
//   node copylib.js        (needs only the http server of serve.sh)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const alerts = [];
async function page(ctx, name, lib){
  const p = await ctx.newPage(); await p.setViewport({width:1300,height:900});
  p.on('pageerror', e=>{ console.log(name,'PAGE ERROR:', e.message); fails++; });
  p.on('dialog', d=>{ alerts.push(name+': '+d.message()); d.dismiss(); });
  if(lib) await p.evaluateOnNewDocument(id=>{ if(!sessionStorage.getItem('37player.library')) sessionStorage.setItem('37player.library', id); }, lib);
  return p;
}
const settle = async p=>{ for(const x of ['^English$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(250); } await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); };
async function reloading(p, fn, arg){
  const nav = p.waitForNavigation({waitUntil:'networkidle0', timeout: 20000});
  p.evaluate(fn, arg).catch(()=>{});
  await nav; await sleep(900);
}
const R = p=> p.evaluate(()=>{ const r = window.__dbg.getRoot(); return {tree: r.tree, lib: r.library.map(t=> ({id: t.id, name: t.name, addedAt: t.addedAt}))}; });
const names = (nodes, pre='')=> nodes.flatMap(n=> [pre + n.name].concat(n.children ? names(n.children, pre + n.name + '/') : []));
async function copy(p, whatRe, toName){
  await p.evaluate(()=> window.__copyLib.ie()); await sleep(200);
  const row = await p.evaluate(()=> !!document.getElementById('ieCopyLib'));
  await p.evaluate(()=> document.getElementById('ieCopyLib').click()); await sleep(200);
  const st = await p.evaluate((whatRe, toName)=>{
    const w = document.getElementById('copyWhat'), to = document.getElementById('copyTo'), go = document.getElementById('copyGo');
    const first = to.options[to.selectedIndex].textContent, disabledFirst = go.disabled;
    const wi = [...w.options].findIndex(o=> new RegExp(whatRe).test(o.textContent)); if(wi >= 0) w.selectedIndex = wi;
    const ti = [...to.options].findIndex(o=> o.textContent === toName); to.selectedIndex = ti; to.dispatchEvent(new Event('change'));
    return {first, disabledFirst, what: wi >= 0 ? w.options[wi].textContent.trim() : null, enabled: !go.disabled, toOptions: [...to.options].map(o=> o.textContent)};
  }, whatRe, toName);
  await p.screenshot({path: 'shots/copylib-dialog.png'});
  await p.evaluate(()=> document.getElementById('copyGo').click());
  let body = '';
  for(let i = 0; i < 50 && !/Copied to/.test(body); i++){ await sleep(200); body = await p.evaluate(()=> document.querySelector('.modal')?.innerText || ''); }
  await clickText(p, '.modal button', '^OK$'); await sleep(300);
  return Object.assign(st, {row, body});
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--autoplay-policy=no-user-gesture-required', ...(process.env.CHROME_ARGS||'').split(' ').filter(Boolean)]});
  const ctx = await b.createBrowserContext();
  const A = await page(ctx, 'A');
  await A.goto(APP, {waitUntil:'networkidle0'}); await sleep(800); await settle(A);
  // the starter track, with its audio
  let starter = null;
  for(let i = 0; i < 40 && !starter; i++){ await sleep(250); starter = await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); const t = r.library[0]; return t && await window.__copyLib.audioIn('main', t.id) ? t.id : null; }); }
  ok(!!starter, 'the first library has the starter track and its audio');
  await A.evaluate(()=> window.__copyLib.ie()); await sleep(200);
  ok(!(await A.evaluate(()=> !!document.getElementById('ieCopyLib'))), 'with one library, Import/Export has no Copy to another library');
  await A.evaluate(()=> document.querySelector('.modal [data-close]')?.click());

  // a second library, "Two", open in A; the first library in B
  await reloading(A, ()=> window.__lib.create('Two')); await settle(A);
  const idTwo = await A.evaluate(()=> window.__lib.id());
  // something of its own in Two: a different playlist called "Acoustic" in a folder "Archive"
  await A.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.push({id: 'twoArchive', kind: 'folder', name: 'Archive', order: 0, children: [{id: 'twoAcoustic', kind: 'playlist', name: 'Acoustic', order: 0, items: []}]}); await window.__dbg.saveState(); });
  const B = await page(ctx, 'B', 'main');
  await B.goto(APP, {waitUntil:'networkidle0'}); await sleep(900); await settle(B);
  ok(await B.evaluate(()=> window.__lib.id()) === 'main', 'B has the first library open');

  // whole library, into Two (open in A): arrives at once
  const c1 = await copy(B, 'Entire library', 'Two');
  ok(c1.row, 'with two libraries, Import/Export offers Copy to another library');
  ok(c1.first === 'Choose a library…' && c1.disabledFirst, 'the library starts at "Choose a library…", Copy greyed out: ' + c1.first);
  ok(c1.toOptions.length === 2 && !c1.toOptions.includes('My library'), 'only the other library is offered: ' + c1.toOptions.join(' | '));
  ok(c1.enabled, 'Copy is enabled once a library is chosen');
  ok(/Tracks: 1\. Playlists: 1\./.test(c1.body), 'done: says what was copied: ' + c1.body.replace(/\n/g, ' / '));
  await sleep(1500);
  let two = await R(A);
  ok(two.lib.some(t=> t.id === starter), 'the track arrived in Two, with the same ID');
  ok(two.lib.find(t=> t.id === starter)?.addedAt > 0, 'Added is stamped there');
  ok(await A.evaluate(id=> window.__copyLib.audioIn(window.__lib.id(), id), starter), 'its audio is in Two\'s storage');
  ok(names(two.tree).join('|') === 'Archive|Archive/Acoustic|Archive/Acoustic (My library)', 'into the folder of the same name; a different playlist of the same name gets the library\'s name: ' + names(two.tree).join('|'));

  // again, after renaming the playlist in the first library, with Two closed
  await B.evaluate(async()=>{ const r = window.__dbg.getRoot(); const pl = r.tree[0].children[0]; pl.name = 'Acoustic prayers'; await window.__dbg.saveState(); });
  await A.close();
  const c2 = await copy(B, 'All playlists', 'Two');
  ok(/Tracks already in that library, left as they are: 1\./.test(c2.body), 'copying again: the track already there is said and left alone: ' + c2.body.replace(/\n/g, ' / '));
  const A2 = await page(ctx, 'A2', idTwo);
  await A2.goto(APP, {waitUntil:'networkidle0'}); await sleep(1500); await settle(A2);
  two = await R(A2);
  ok(two.lib.length === 1, 'still one track in Two: ' + two.lib.length);
  ok(names(two.tree).join('|') === 'Archive|Archive/Acoustic|Archive/Acoustic prayers', 'opening Two brings the copy in: the same playlist updated, not doubled: ' + names(two.tree).join('|'));

  // the copy is one Undo step: undoing it takes the update back
  await A2.evaluate(()=> window.__undo.undo()); await sleep(600);
  two = await R(A2);
  ok(names(two.tree).join('|') === 'Archive|Archive/Acoustic|Archive/Acoustic (My library)', 'Undo takes the copy back in one step: ' + names(two.tree).join('|'));
  // a copy that died part-way (page closed): Two takes its files back when it next opens
  await B.evaluate((lib)=> window.__copyLib.fakeDeadCopy(lib, 'deadtrack'), idTwo);
  ok(await B.evaluate((lib)=> window.__copyLib.audioIn(lib, 'deadtrack'), idTwo), 'a dead copy\'s file is in Two, with its note');
  await A2.reload({waitUntil: 'networkidle0'}); await sleep(1500);
  ok(!(await B.evaluate((lib)=> window.__copyLib.audioIn(lib, 'deadtrack'), idTwo)), 'opening Two takes the dead copy\'s file out');
  ok(!(await B.evaluate((lib)=> window.__copyLib.partialMark(lib), idTwo)), 'and its note');
  ok(await B.evaluate((lib)=> window.__copyLib.audioIn(lib, window.__dbg.getRoot().library[0].id), idTwo), 'the copied track\'s audio stays');
  console.log('alerts:', alerts.length ? alerts.join(' || ') : 'none');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
