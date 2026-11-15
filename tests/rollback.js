// History → Roll back the library (2.5.007): the library then (column B, in
// a box with the button) beside the library now (column D), row for row,
// only what differs. Drawn here from two documents handed in (window.__hist
// .fake), so the picture can be checked without a shared library; hist.js
// does a real rollback through a server.
const puppeteer = require('puppeteer-core');
const path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const SHOTS = path.join(__dirname, 'shots');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } };
const T = (id, name, artist, album, trackNo, more)=> Object.assign({id, name, artist, album, trackNo, audioRev: 1, filename: id + '.mp3', fileSize: 1000, duration: 60}, more || {});
const it = (id, refId, order)=> ({id, kind: 'track', refId, order});
function docs(){
  const HJ = ['Guru Founder','The Liberating Prayer','Refuge and bodhichitta','Prayer of seven limbs','Offering the mandala','Migtsema prayer','Dedication'];
  const hj = HJ.map((n, i)=> T('hj' + i, n, 'Tharpa', 'Heart Jewel', i + 1));
  const osg = [1,2,3].map(i=> T('osg' + i, 'Offering to the Spiritual Guide ' + i, 'Tharpa', 'Offering to the Spiritual Guide', i));
  const daily = ['Going for refuge','Track08','Dedication','Long life prayer'].map((n, i)=> T('dp' + i, n, 'Tharpa', 'Daily prayers', i + 1));
  const mb = ['Refuge and bodhichitta','Visualization','Mantra recitation'].map((n, i)=> T('mb' + i, n, 'Geshe Kelsang Gyatso', 'Medicine Buddha Prayer', i + 1));
  const pm = ['Going for refuge','Dedication'].map((n, i)=> T('pm' + i, n, 'Geshe Kelsang Gyatso', 'Prayers for Meditation', i + 1));
  const lp = ['The Liberating Prayer','The Liberating Prayer (chanted)'].map((n, i)=> T('lp' + i, n, 'Geshe Kelsang Gyatso', 'The Liberating Prayer', i + 1));
  const other = [T('x1', 'Untouched', 'Someone Else', 'An album', 1)];
  const morning = (extra)=> ({id: 'plM', kind: 'playlist', name: 'Morning', order: 0, items: [it('m1', 'pm0', 0), {id: 'm2', kind: 'silence', seconds: 300, name: extra ? 'Settling 5 min' : 'Silence 5 min', order: 1}, it('m3', 'mb1', 2)].concat(extra ? [it('m4', 'osg1', 3)] : []).concat([{id: 'm5', kind: 'stop', name: 'dedication', order: 4}, it('m6', 'pm1', 5)])});
  const then = {format: 1, tracks: [].concat(hj, daily, mb, pm, lp, other), tree: [
    {id: 'fD', kind: 'folder', name: 'Daily', order: 0, children: [morning(false)]},
    {id: 'fP', kind: 'folder', name: 'Pujas', order: 1, children: [{id: 'plH', kind: 'playlist', name: 'Heart Jewel', order: 0, items: hj.map((x, i)=> it('h' + i, x.id, i))}]},
    {id: 'fF', kind: 'folder', name: 'Festivals', order: 2, children: []},
    {id: 'plQ', kind: 'playlist', name: 'Quiet', order: 3, items: [it('q1', 'x1', 0)]}]};
  const ren = x=> Object.assign({}, x, {artist: 'Venerable Geshe Kelsang Gyatso'});
  const nowDaily = daily.map(x=> x.id === 'dp1' ? Object.assign({}, x, {name: 'Receiving Blessings'}) : x);
  const splits = [T('mbA', 'Going for refuge', 'Venerable Geshe Kelsang Gyatso', 'Medicine Buddha Prayer', 1), T('mbB', 'Generating bodhichitta', 'Venerable Geshe Kelsang Gyatso', 'Medicine Buddha Prayer', 1)];
  const now = {format: 1, tracks: [].concat(osg, nowDaily, mb.map(ren), splits, pm.map(ren), lp.map(ren), other), tree: [
    {id: 'fD', kind: 'folder', name: 'Daily', order: 0, children: [morning(true)]},
    {id: 'fP', kind: 'folder', name: 'Pujas', order: 1, children: []},
    {id: 'fF', kind: 'folder', name: 'Festivals', order: 2, children: [{id: 'plF', kind: 'playlist', name: 'Fall Festival 2026', order: 0, items: [it('f1', 'lp0', 0), it('f2', 'osg1', 1)]}]},
    {id: 'plQ', kind: 'playlist', name: 'Quiet', order: 3, items: [it('q1', 'x1', 0)]}]};
  const day = 864e5, t0 = Date.now();
  const list = [{version: 9, time: t0 - 3600e3, by: 'Temple iPad', what: {ta: 3}}, {version: 8, time: t0 - 3 * 3600e3, by: 'Rz T470', what: {pd: 1, pdn: 'Heart Jewel'}}, {version: 7, time: t0 - day, by: 'Office Mac', what: {td: 7}},
    {version: 6, time: t0 - day - 3600e3, by: 'Temple iPad', what: {pc: 1, pcn: 'Morning'}}, {version: 5, time: t0 - 2 * day, by: 'Rz T470', what: {pa: 1, pan: 'Quiet'}}];
  return {now, then, list};
}
const rowsOf = p=> p.evaluate(()=> [...document.querySelectorAll('.rb-row')].map(r=>{ const c = r.querySelectorAll('.rb-cell'); const tx = e=> e ? e.innerText.replace(/\s+/g,' ').trim() : ''; return {b: tx(c[0]), d: tx(c[1]), cls: r.className, lb: c[0].querySelectorAll('.rb-line').length, ld: c[1] ? c[1].querySelectorAll('.rb-line').length : 0}; }));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1400,height:1500});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  const {now, then, list} = docs();
  await p.evaluate((now, then, list)=> window.__hist.fake(now, then, list, 6), now, then, list); await sleep(400);
  await p.screenshot({path: path.join(SHOTS, 'rollback-1.png')});
  let rows = await rowsOf(p);
  const find = (re, side)=> rows.find(r=> re.test(r[side || 'b']));
  const tabs = await p.evaluate(()=> [...document.querySelectorAll('.hist-tabs .mode-tab')].map(x=> ({k: x.dataset.tab, on: x.classList.contains('active')})));
  ok(tabs.length === 3 && tabs.find(x=> x.on).k === 'roll', 'three tabs, opening on Roll back');
  ok(await p.evaluate(()=> document.querySelectorAll('.hist-point-undone').length === 3 && !!document.querySelector('.hist-undone-line')), 'the three saves above the chosen one are struck through, with the line');
  ok(await p.evaluate(()=>{ const box = document.querySelector('.rb-box').getBoundingClientRect(), go = document.getElementById('rbGo').getBoundingClientRect(); return go.left > box.left && go.right < box.right && go.top > box.top; }), 'Roll back to this sits inside the box of column B');
  ok(find(/^Daily$/) && /^Daily$/.test(find(/^Daily$/).d), 'the folder Daily on both sides');
  const m = find(/^Morning/);
  ok(m && /changed/.test(m.d), 'Morning is marked changed');
  const osg = find(/Offering to the Spiritual Guide 1 added since/, 'd');
  ok(osg && osg.b === '' && osg.lb === 2, 'its added entry: blank on B, with the two lines of Daily and Morning');
  ok(rows.some(r=> /Silence 5 min/.test(r.b) && /Settling 5 min renamed/.test(r.d)), 'the renamed silence shows both names');
  ok(rows.some(r=> /^Going for refuge$/.test(r.b) && /rb-row/.test(r.cls)), 'unchanged entries are shown (grey)');
  const hjp = find(/^Heart Jewel deleted since/);
  ok(hjp && hjp.d === '' && hjp.ld === 1 && await p.evaluate(()=> [...document.querySelectorAll('.rb-sec-tree .rb-row[data-rb]')].some(r=> /Heart Jewel/.test(r.innerText) && r.getAttribute('aria-expanded') === 'false')), 'the deleted playlist: blank on D, closed to start with');
  ok(!find(/^Quiet/) && !rows.some(r=> /Someone Else/.test(r.b + r.d)), 'what did not change is not listed');
  const ar = find(/^Geshe Kelsang Gyatso$/);
  ok(ar && /^Venerable Geshe Kelsang Gyatso renamed$/.test(ar.d), 'the renamed artist: old name and new');
  ok(rows.some(r=> r.b === '' && /^Going for refuge added since$/.test(r.d)) && rows.some(r=> r.b === '' && /^Generating bodhichitta added since$/.test(r.d)), 'the two split tracks under Medicine Buddha Prayer, added since');
  ok(!!find(/^2 albums and 4 tracks unchanged…$/), 'the artist\'s other albums as one line');
  const hja = rows.find(r=> /^Heart Jewel 7 tracks deleted since$/.test(r.b) && /rb-alb/.test(r.cls));
  ok(hja && hja.d === '' && rows.filter(r=> r.d === '' && r.lb === 2 && /^(Guru Founder|The Liberating Prayer|Refuge and bodhichitta|Prayer of seven limbs|Offering the mandala|Migtsema prayer|Dedication)$/.test(r.b)).length === 7, 'the deleted album lists every one of its 7 tracks');
  const oa = rows.find(r=> r.b === '' && /^Offering to the Spiritual Guide 3 tracks added since$/.test(r.d));
  ok(oa && oa.lb === 1, 'across from the added album, B has only the artist\'s line');
  ok(rows.some(r=> /^Track08$/.test(r.b) && /^Receiving Blessings renamed$/.test(r.d)), 'a renamed track');
  ok(rows.some(r=> /^The other track is the same on both sides\.$/.test(r.b) && r.b === r.d) && rows.some(r=> /^The other playlist is the same on both sides\.$/.test(r.b)), 'each section ends by saying the rest is the same on both sides');
  ok(await p.evaluate(()=>{ const h = getComputedStyle(document.querySelector('.rb-sec .rb-cell > span')).backgroundColor; return h === 'rgb(212, 222, 229)' || h === 'rgb(231, 238, 242)' || h === 'rgb(55, 69, 80)'; }), 'Playlists and Tracks have the Table header\'s blue');
  // The question says what it costs the devices
  await p.evaluate(()=> document.getElementById('rbGo').click()); await sleep(300);
  const cost = await p.evaluate(()=> (document.getElementById('rbCost') || {}).innerText || '');
  ok(/7 recordings \(.+\) come back/.test(cost) && /5 recordings \(.+\) leave every device/.test(cost), 'Roll back to this asks, with the recordings that come back and those that leave (' + cost.replace(/\s+/g, ' ') + ')');
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  ok(await p.evaluate(()=> !!document.getElementById('historyPage') && !document.querySelector('.modal-backdrop.show')), 'Cancel closes the question and leaves History as it was');
  // Moving to another save: what was listed stays, in grey once both sides agree
  await p.evaluate((doc)=> window.__hist.point(doc, 7), now); await sleep(300);
  rows = await rowsOf(p);
  ok(rows.some(r=> r.b === 'Offering to the Spiritual Guide 1' && r.d === 'Offering to the Spiritual Guide 1') && rows.some(r=> r.b === 'Heart Jewel' && r.d === '') === false && rows.some(r=> /^Morning$/.test(r.b) && /^Morning$/.test(r.d)), 'at a save where both sides agree, the rows seen before are still there, on both sides');
  ok(await p.evaluate(()=> [...document.querySelectorAll('.rb-row .rb-text')].filter(e=> /Offering to the Spiritual Guide 1|^Morning$/.test(e.textContent)).every(e=> e.classList.contains('rb-un'))), 'and in grey');
  await p.evaluate((doc)=> window.__hist.point(doc, 6), then); await sleep(300);
  rows = await rowsOf(p);
  // A folder whose order changed
  const swapped = JSON.parse(JSON.stringify(now)); swapped.tree[0].order = 1; swapped.tree[1].order = 0;
  await p.evaluate((doc)=> window.__hist.point(doc, 5), swapped); await sleep(300);
  rows = await rowsOf(p);
  const at = rows.findIndex(r=> /^Top level: order then order changed$/.test(r.b) && /^Top level: order now order changed$/.test(r.d));
  ok(at >= 0 && rows[at + 1].b === 'Pujas' && rows[at + 1].d === 'Daily' && rows[at + 2].b === 'Daily' && rows[at + 2].d === 'Pujas', 'an order that changed: everything in the folder, each side in its own order');
  await p.screenshot({path: path.join(SHOTS, 'rollback-7.png')});
  await p.evaluate((now, then, list)=> window.__hist.fake(now, then, list, 6), now, then, list); await sleep(300);
  rows = await rowsOf(p);
  // Opening and the one-way lines
  await p.evaluate(()=> [...document.querySelectorAll('.rb-row[data-rb]')].find(r=> /Heart Jewel/.test(r.innerText) && r.closest('.rb-sec-tree')).click()); await sleep(200);
  rows = await rowsOf(p);
  ok(rows.some(r=> r.b === 'Migtsema prayer' && r.d === '' && r.ld === 1 && r.lb === 2), 'opened, the deleted playlist lists its entries; D keeps only the line of Pujas');
  await p.evaluate(()=> [...document.querySelectorAll('.rb-row[data-rb]')].find(r=> /2 albums and 4 tracks unchanged/.test(r.innerText.replace(/\s+/g,' '))).click()); await sleep(200);
  rows = await rowsOf(p);
  ok(!rows.some(r=> /2 albums and 4 tracks unchanged/.test(r.b)) && rows.some(r=> /^Prayers for Meditation: 2 tracks unchanged…$/.test(r.b)) && rows.some(r=> /^The Liberating Prayer: 2 tracks unchanged…$/.test(r.b)), 'a tap replaces that line with a line per album');
  await p.evaluate(()=> [...document.querySelectorAll('.rb-row[data-rb]')].find(r=> /Prayers for Meditation: 2 tracks unchanged/.test(r.innerText.replace(/\s+/g,' '))).click()); await sleep(200);
  rows = await rowsOf(p);
  ok(rows.some(r=> r.b === 'Prayers for Meditation' && /rb-alb/.test(r.cls)) && !rows.some(r=> /Prayers for Meditation: 2/.test(r.b)), 'and a tap on an album line replaces it with the album and its tracks');
  await p.screenshot({path: path.join(SHOTS, 'rollback-2.png'), fullPage: false});
  // Only what changed
  await p.evaluate(()=> document.querySelector('input[name="rbMode"][value="chg"]').click()); await sleep(200);
  rows = await rowsOf(p);
  ok(rows.some(r=> /^4 unchanged$/.test(r.b)) && !rows.some(r=> r.b === 'Stop: dedication'), 'Only what changed: unchanged entries give way to "4 unchanged"');
  await p.screenshot({path: path.join(SHOTS, 'rollback-3.png')});
  // Wrap
  ok(await p.evaluate(()=> document.querySelector('.rb-grid').classList.contains('rb-wrap')), 'Wrap is on to start with');
  await clickText(p, '#rbBar .tb-btn', 'Wrap'); await sleep(100);
  ok(await p.evaluate(()=> !document.querySelector('.rb-grid').classList.contains('rb-wrap')), 'and the Wrap button turns it off');
  // Another point starts folded again
  await p.evaluate(()=> document.querySelector('.hist-point[data-v="9"]').click()); await sleep(300);
  ok(await p.evaluate(()=> !document.getElementById('rbGo') && !!document.querySelector('.hist-nothing') && !!document.querySelector('.rb-row')), 'the newest save: nothing to roll back, no button, the rows seen still listed');
  // The other tabs
  await p.evaluate(()=> document.querySelector('.hist-tabs [data-tab="bring"]').click()); await sleep(200);
  ok(await p.evaluate(()=> !!document.querySelector('input[name="histMode"]') && !document.querySelector('.hist-point-undone')), 'Bring back: today\'s rows, no struck-through saves');
  await p.evaluate(()=> document.querySelector('.hist-tabs [data-tab="undo"]').click()); await sleep(200);
  ok(await p.evaluate(()=> !!document.querySelector('.hist-soon')), 'Undo on this device: not built yet, and says so');
  // Receive-only: no first tab, no button
  await p.evaluate((now, then, list)=> window.__hist.fake(now, then, list, 6, {kind: 'server', receiveOnly: true}), now, then, list); await sleep(300);
  ok(await p.evaluate(()=> document.querySelectorAll('.hist-tabs .mode-tab').length === 2 && !document.getElementById('rbGo') && /receives updates only/.test(document.querySelector('.rb-foot').innerText)), 'receive-only: two tabs, no button, and why');
  // Narrow
  await p.setViewport({width: 820, height: 1100});
  await p.evaluate((now, then, list)=> window.__hist.fake(now, then, list, 6), now, then, list); await sleep(300);
  ok(await p.evaluate(()=> getComputedStyle(document.querySelector('.hist-tabs .tab-long')).display === 'none'), 'a narrow window has the short tab names');
  await p.screenshot({path: path.join(SHOTS, 'rollback-4.png')});
  await p.setViewport({width:1400,height:1500}); await p.evaluate(()=> window.__dbg.disp('dark', false)); await sleep(300);
  await p.screenshot({path: path.join(SHOTS, 'rollback-5.png')});
  await p.evaluate(()=> window.__dbg.disp('light', false)); await sleep(300);
  await p.screenshot({path: path.join(SHOTS, 'rollback-6.png')});
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
