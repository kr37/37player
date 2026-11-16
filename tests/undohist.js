// History for a library that isn't shared (2.5.011): this device's undo
// steps are the list, with "Before these changes" under the oldest;
// choosing one shows the library then beside the library now, and Undo
// back to this takes the steps above it back (Redo returns them). Also:
// Undo asks before taking back a change more than two hours old, and a
// long press or right-click on Undo opens History. Needs only the page server.
const puppeteer = require('puppeteer-core');
const path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const SHOTS = path.join(__dirname, 'shots');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } };
const edit = (p, fn)=> p.evaluate(async (src)=>{ const r = window.__dbg.getRoot(); (new Function('r', src))(r); await window.__dbg.saveState(); }, fn);
const names = p=> p.evaluate(()=>{ const out = []; (function w(ns){ ns.forEach(n=>{ out.push(n.name); if(n.children) w(n.children); }); })(window.__dbg.getRoot().tree); return out.join(','); });
const stacks = p=> p.evaluate(()=> window.__undo.stacks());
const openHist = async p=>{ await p.evaluate(()=> window.__hist.open()); for(let i=0;i<40;i++){ await sleep(150); if(await p.$('.hist-point, .hist-body > p')) break; } await sleep(200); };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1400,height:1100});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree = []; r.library = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); window.__undo.rebase(); });
  await p.evaluate(()=> window.__dbg.setMode('editing')); await sleep(1800);
  const base = (await stacks(p)).undo;
  await openHist(p);
  ok(base > 0 ? !!(await p.$('.hist-point')) : await p.evaluate(()=> /Nothing to undo yet/.test(document.querySelector('.hist-body').innerText)), 'History opens for a library that isn\'t shared (' + base + ' steps to begin with)');
  await p.evaluate(()=> document.getElementById('histClose').click()); await sleep(200);
  // three steps
  await edit(p, "r.tree.push({id:'f1', kind:'folder', name:'Daily', children:[{id:'p1', kind:'playlist', name:'Morning', items:[]}]});"); await sleep(1500);
  await edit(p, "r.tree[r.tree.length-1].children[0].name='Morning prayers';"); await sleep(1500);
  await edit(p, "r.tree.push({id:'p2', kind:'playlist', name:'Evening', items:[]});"); await sleep(1500);
  let s = await stacks(p);
  ok(s.undo === base + 3, 'three changes made three undo steps (' + s.undo + ')');
  await openHist(p);
  let pts = await p.evaluate(()=> [...document.querySelectorAll('.hist-point')].map(x=> ({v: +x.dataset.v, text: x.innerText.replace(/\s+/g,' ').trim(), on: x.classList.contains('on')})));
  console.log('points:', JSON.stringify(pts));
  ok(pts.length === base + 4 && /Before these changes/.test(pts[pts.length - 1].text) && /Now/i.test(pts[0].text), 'History lists this device\'s steps, newest first and marked Now, with Before these changes last');
  ok(await p.evaluate(()=> !document.querySelector('.hist-tabs') && /Undo keeps the last 30 changes/.test(document.querySelector('.hist-older').textContent) && /changes Undo has kept/.test(document.querySelector('.hist-sub').textContent)), 'a library that isn\'t shared has no tabs, and the list says what Undo keeps');
  ok(pts[1].on && await p.evaluate(()=> /Undo back to this/.test(document.getElementById('rbGo').textContent)), 'the step below the newest is chosen, and the button is Undo back to this');
  let rows = await p.evaluate(()=> [...document.querySelectorAll('.rb-row')].map(r=> r.innerText.replace(/\s+/g,' ').trim()));
  ok(rows.some(r=> /Evening added since/.test(r)) && !rows.some(r=> /renamed/.test(r)), 'that point: only the newest change shows (Evening added since)');
  // the middle step: two changes to take back
  await p.evaluate((v)=> document.querySelector('.hist-point[data-v="' + v + '"]').click(), pts[2].v); await sleep(400);
  rows = await p.evaluate(()=> [...document.querySelectorAll('.rb-row')].map(r=> r.innerText.replace(/\s+/g,' ').trim()));
  ok(rows.some(r=> /Evening added since/.test(r)) && rows.some(r=> /^Morning Morning prayers renamed$/.test(r)) && await p.evaluate(()=> document.querySelectorAll('.hist-point-undone').length === 2), 'one further back: the rename and the new playlist, two steps struck through');
  await p.screenshot({path: path.join(SHOTS, 'undohist-1.png')});
  await p.evaluate(()=> document.getElementById('rbGo').click()); await sleep(1500);
  s = await stacks(p);
  ok(!(await p.$('#historyPage')) && await names(p) === 'Daily,Morning' && s.undo === base + 1 && s.redo === 2, 'Undo back to this: History closes, two steps undone (' + await names(p) + '), and they are in Redo');
  await p.evaluate(()=> window.__undo.redo()); await sleep(800);
  ok(await names(p) === 'Daily,Morning prayers', 'Redo brings back the older of the two first (' + await names(p) + ')');
  await p.evaluate(()=> window.__undo.redo()); await sleep(800);
  ok(await names(p) === 'Daily,Morning prayers,Evening', 'and then the newer');
  // Before these changes: everything
  await openHist(p);
  await p.evaluate(()=> document.querySelector('.hist-point[data-v="-1000000"]').click()); await sleep(400);
  await p.evaluate(()=> document.getElementById('rbGo').click()); await sleep(1800);
  s = await stacks(p);
  ok(s.undo === 0 && (await names(p)).indexOf('Daily') < 0, 'Before these changes takes every step back');
  for(let i = 0; i < s.redo; i++){ await p.evaluate(()=> window.__undo.redo()); await sleep(600); }
  ok(await names(p) === 'Daily,Morning prayers,Evening', 'and Redo returns them all');
  // More than two hours old: Undo asks
  await p.evaluate(()=> window.__undo.age(3 * 3600 * 1000));
  await p.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(400);
  const q = await p.evaluate(()=> ({on: document.querySelector('.modal-backdrop').classList.contains('show'), text: document.querySelector('.modal').innerText.replace(/\s+/g,' '), btns: [...document.querySelectorAll('.modal button')].map(x=> x.textContent.trim())}));
  console.log('asks:', JSON.stringify(q));
  ok(q.on && /more than 2 hours ago/.test(q.text) && q.btns.join('|') === 'Undo it|Cancel|View detailed history', 'Undo of a change over two hours old asks: Undo it, Cancel, View detailed history');
  await p.screenshot({path: path.join(SHOTS, 'undohist-2.png')});
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  ok(await names(p) === 'Daily,Morning prayers,Evening', 'Cancel undoes nothing');
  await p.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(400);
  await clickText(p, '.modal button', '^View detailed history$'); await sleep(900);
  ok(!!(await p.$('#historyPage')) && await names(p) === 'Daily,Morning prayers,Evening', 'View detailed history opens History, and undoes nothing');
  await p.evaluate(()=> document.getElementById('histClose').click()); await sleep(300);
  await p.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(400);
  await clickText(p, '.modal button', '^Undo it$'); await sleep(900);
  ok(await names(p) === 'Daily,Morning prayers', 'Undo it undoes the change');
  await p.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(900);
  ok(await names(p) === 'Daily,Morning' && !(await p.evaluate(()=> document.querySelector('.modal-backdrop').classList.contains('show'))), 'and the next undo in the run doesn\'t ask again');
  await edit(p, "r.tree.push({id:'p3', kind:'playlist', name:'Noon', items:[]});"); await sleep(1500);
  await p.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(800);
  ok((await names(p)).indexOf('Noon') < 0 && !(await p.evaluate(()=> document.querySelector('.modal-backdrop').classList.contains('show'))), 'a change just made is undone without a question');
  await p.evaluate(()=> document.getElementById('btnUndo').click()); await sleep(500);
  ok(await p.evaluate(()=> document.querySelector('.modal-backdrop').classList.contains('show')), 'but after a new change, an old one asks again');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  // A long press, and a right-click
  const before = await names(p);
  await p.evaluate(()=>{ const u = document.getElementById('btnUndo'); u.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); }); await sleep(900);
  ok(!!(await p.$('#historyPage')), 'a long press on Undo opens History');
  await p.evaluate(()=>{ const u = document.getElementById('btnUndo'); u.dispatchEvent(new PointerEvent('pointerup', {bubbles: true})); }); await sleep(300);
  await p.evaluate(()=> document.getElementById('histClose').click()); await sleep(300);
  ok(await names(p) === before, 'and undoes nothing');
  await p.evaluate(()=> document.getElementById('btnUndo').dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))); await sleep(900);
  ok(!!(await p.$('#historyPage')), 'a right-click on Undo opens History too');
  ok(await p.evaluate(()=> /Hold, or right-click, for the history/.test(document.getElementById('btnUndo').title)), 'and the button\'s tooltip says so');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
