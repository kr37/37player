// History → Bring back tracks or playlists (2.5.018), on sync.php: finding a
// playlist or track (by folder, flat list, by playlist, by album, search,
// Changes or Everything), its earlier states, Now beside Earlier, and
// bringing back: replacing a playlist, a copy, a deleted playlist, a
// replaced track, a deleted track.
//   node bringback.js "$(./new-library.sh)"     (needs serve.sh's two servers)
const puppeteer = require('puppeteer-core');
const path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const CODE = process.argv[2], URL_SYNC = 'http://127.0.0.1:8870/sync.php', SHOTS = path.join(__dirname, 'shots');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } };
const waitIdle = async (p)=>{ for(let k=0;k<600;k++){ const s = await p.evaluate(()=>({st: window.__dbg3.status().state, tr: window.__dbg3.status().transfer})); if(s.st!=='syncing' && !s.tr) return s; await sleep(200); } return 'timeout'; };
const sync = async p=>{ await p.evaluate(()=> window.__dbg3.sync()); await sleep(500); await waitIdle(p); };
const edit = (p, src)=> p.evaluate(async (src)=>{ const r = window.__dbg.getRoot(); (new Function('r', src))(r); await window.__dbg.saveState(); }, src);
const colA = p=> p.evaluate(()=> [...document.querySelectorAll('#bbA .bb-it, #bbA .bb-sec')].map(e=> e.innerText.replace(/\s+/g, ' ').trim()));
const colC = p=> p.evaluate(()=> [...document.querySelectorAll('#bbC .bb-it')].map(e=> e.innerText.replace(/\s+/g, ' ').trim()));
const cmp = p=> p.evaluate(()=>{ const c = [...document.querySelectorAll('#bbBD .bb-cell')].map(e=> e.innerText.replace(/\s+/g, ' ').trim()); const rows = []; for(let i = 0; i < c.length; i += 2) rows.push(c[i] + ' | ' + c[i + 1]); return rows; });
const pick = async (p, re)=>{ const okk = await p.evaluate((src)=>{ const el = [...document.querySelectorAll('#bbA [data-id]')].find(e=> new RegExp(src).test(e.innerText.replace(/\s+/g, ' ').trim())); if(el){ el.click(); return true; } return false; }, re); for(let i = 0; i < 50; i++){ await sleep(150); if(!(await p.evaluate(()=> /Looking through/.test((document.getElementById('bbC') || {}).innerText || '')))) break; } await sleep(200); return okk; };
const openBring = async p=>{ await p.evaluate(()=> window.__hist.open()); for(let i=0;i<80;i++){ await sleep(250); if(await p.$('.hist-tabs')) break; } await p.evaluate(()=> document.querySelector('.hist-tabs [data-tab="bring"]').click()); for(let i=0;i<60;i++){ await sleep(200); if(await p.$('#bbA')) break; } await sleep(300); };
const tree = p=> p.evaluate(()=>{ const out = []; (function w(ns, d){ ns.forEach(n=>{ out.push(' '.repeat(d) + n.name + (n.items ? ': ' + n.items.map(it=> it.kind === 'track' ? (window.__dbg.getRoot().library.find(t=> t.id === it.refId) || {name: '?' + it.refId}).name : it.kind + ' ' + (it.name || '')).join(', ') : '')); if(n.children) w(n.children, d + 1); }); })(window.__dbg.getRoot().tree, 0); return out; });
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox'], protocolTimeout: 300000});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width:1500,height:1000});
  p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot(); delete r.settings.starterPlaylistId;
    const T = (id, name, artist, album, n)=> ({id, name, artist, album, trackNo: n, duration: 60, filename: id + '.mp3', fileSize: 2000000, audioRev: 1});
    r.library = [T('pm', 'Prayers for Meditation', 'Tharpa', 'Daily prayers', 1), T('cl', 'Meditation: clarity of mind', 'Tharpa', 'Daily prayers', 2), T('dp', 'Dedication prayers', 'Tharpa', 'Daily prayers', 3),
      T('t8', 'Track08', 'Tharpa', 'Daily prayers', 8), T('gf', 'Guru Founder', 'Tharpa', 'Heart Jewel', 1), T('lp', 'The Liberating Prayer', 'Tharpa', 'Heart Jewel', 2),
      T('lone', 'A talk on its own', 'kr37', 'Talks', 1), T('osg', 'Offering to the Spiritual Guide 1', 'Tharpa', 'OSG', 1)];
    r.tree = [{id: 'fD', kind: 'folder', name: 'Daily', children: [{id: 'plM', kind: 'playlist', name: 'Morning', items: [{id: 'e1', kind: 'track', refId: 'pm'}, {id: 'e2', kind: 'silence', seconds: 300, name: 'Silence 5 min'}, {id: 'e3', kind: 'track', refId: 'dp'}]},
        {id: 'plW', kind: 'playlist', name: 'Weekend', items: [{id: 'w1', kind: 'track', refId: 'pm'}]},
        {id: 'plL', kind: 'playlist', name: 'An Offering of Faith Retreat with a very long name indeed, for the Name Mantra', items: [{id: 'l1', kind: 'track', refId: 'pm'}]}]},
      {id: 'fP', kind: 'folder', name: 'Pujas', children: [{id: 'plH', kind: 'playlist', name: 'Heart Jewel', items: [{id: 'h1', kind: 'track', refId: 'gf'}, {id: 'h2', kind: 'track', refId: 'lp'}]}]},
      {id: 'plE', kind: 'playlist', name: 'Evening', items: [{id: 'v1', kind: 'track', refId: 't8'}, {id: 'v2', kind: 'track', refId: 'lp'}]}];
    await window.__dbg.saveState();
  });
  await p.evaluate((c,u)=> window.__dbg3.join(u,c,'Laptop'), CODE, URL_SYNC); await waitIdle(p); await sleep(1200); await waitIdle(p);
  await sync(p);
  // The changes
  await edit(p, "const m = r.tree.find(n=> n.id==='fD').children.find(n=> n.id==='plM'); m.name = 'Morning prayers'; m.items.find(i=> i.id==='e2').name = 'Settling 5 min'; m.items.splice(2, 0, {id: 'e4', kind: 'track', refId: 'osg'});"); await sync(p);
  await edit(p, "r.library.find(t=> t.id==='t8').name = 'Receiving Blessings';"); await sync(p);
  await edit(p, "r.tree.find(n=> n.id==='fP').children = []; r.library = r.library.filter(t=> t.id !== 'gf');"); await sync(p);
  await edit(p, "r.library = r.library.filter(t=> t.id !== 'lone');"); await sync(p);
  await edit(p, "r.library.forEach(t=>{ t.loudness = {i: -17, p: -1}; t.audioFrom = 'Mac mini'; }); r.tree[0].children.find(n=> n.id==='plW').needsAttention = false;"); await sync(p);
  // New artwork, twice: the second change shows both covers (2.5.022)
  const art = c=> p.evaluate(async c=>{ const cv = document.createElement('canvas'); cv.width = cv.height = 8; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 8, 8); const blob = await new Promise(r=> cv.toBlob(r, 'image/png')); await window.__idbPut('artwork', {id: 'osg', blob}); window.__dbg.getRoot().library.find(t=> t.id === 'osg').hasArtwork = true; await window.__dbg.saveState(); }, c);
  await art('#c00'); await sync(p); await art('#00c'); await sync(p);
  await openBring(p);
  ok(await p.evaluate(()=> document.querySelector('.hist-body').classList.contains('hist-bring') && getComputedStyle(document.querySelector('.hist-side')).display === 'none'), 'Bring back: no list of versions on the left');
  ok(await p.evaluate(()=> /^Bring back since /.test(document.querySelector('.bb-title').textContent)), 'the title says how far back: ' + await p.evaluate(()=> document.querySelector('.bb-title').textContent));
  let a = await colA(p);
  console.log('playlists, by folder, changes:', JSON.stringify(a));
  ok(a.some(x=> /^Daily$/.test(x)) && a.some(x=> /^Morning prayers$/.test(x)) && a.some(x=> /^Heart Jewel deleted$/.test(x)) && !a.some(x=> /Weekend|Evening/.test(x)), 'Changes: the folders, Morning prayers, and Heart Jewel deleted where it was; not the unchanged playlists');
  await p.evaluate(()=> document.querySelector('input[name="bbShow"][value="all"]').click()); await sleep(300);
  a = await colA(p);
  ok(a.some(x=> /^Weekend$/.test(x)) || a.some(x=> /^Daily$/.test(x)), 'Everything adds the unchanged ones');
  ok(a.some(x=> /^Evening$/.test(x)), 'including Evening at the top level');
  // A long name stays on its own line, at its own indent; changed items are bold, unchanged plain
  const lay = await p.evaluate(()=>{ const it = [...document.querySelectorAll('#bbA [data-id]')].find(e=> /An Offering of Faith/.test(e.innerText)); const ch = [...document.querySelectorAll('#bbA [data-id]')].find(e=> /^Morning prayers/.test(e.innerText)); if(!it) return 'missing'; const n = it.querySelector('.bb-name').getBoundingClientRect(), sp = it.querySelector('.bb-chev-space').getBoundingClientRect(); return {sameLine: Math.abs(n.top - sp.top) < 6, after: n.left >= sp.right - 1, dimW: getComputedStyle(it.querySelector('.bb-name')).fontWeight, chW: getComputedStyle(ch.querySelector('.bb-name')).fontWeight}; });
  await p.screenshot({path: path.join(SHOTS, 'bringback-5.png'), clip: {x: 0, y: 60, width: 1500, height: 520}});
  ok(lay.sameLine && lay.after, 'a long name stays beside its icon, at its indent (' + JSON.stringify(lay) + ')');
  ok(lay.chW === '700' && lay.dimW === '400', 'Everything: changed items bold, unchanged plain');
  ok(await p.evaluate(()=> getComputedStyle(document.querySelector('.bb-top')).position === 'sticky'), 'the Bring back since… line stays put');
  await p.evaluate(()=> document.querySelector('input[name="bbShow"][value="chg"]').click()); await sleep(300);
  a = await colA(p);
  ok(!a.some(x=> /Weekend|An Offering/.test(x)), 'Changes: what 37 Player did by itself (loudness, where recordings came from, "needs attention") is not listed');
  // Morning prayers: its earlier state
  await pick(p, '^Morning prayers$');
  let c = await colC(p), rows = await cmp(p);
  console.log('Morning:', JSON.stringify(c), JSON.stringify(rows));
  ok(c.length === 1, 'one earlier state of Morning prayers');
  ok(rows[0].startsWith('Now Morning prayers') && /Morning$/.test(rows[0]), 'its names, now and then');
  ok(rows.some(r=> /^Settling 5 min renamed \| Silence 5 min$/.test(r)), 'the renamed silence on one line');
  ok(rows.some(r=> /^Offering to the Spiritual Guide 1 \| $/.test(r)), 'the entry added since, with a blank beside it');
  await p.screenshot({path: path.join(SHOTS, 'bringback-1.png')});
  // A copy
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="copy"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  let tr = await tree(p);
  console.log('after copy:', JSON.stringify(tr));
  ok(tr.some(x=> /^ Morning prayers: /.test(x)) && tr.some(x=> /^ Morning \(.+\): Prayers for Meditation, silence Silence 5 min, Dedication prayers$/.test(x)), 'Bring back as a copy: "Morning (date)" beside the current one, as it was');
  // Replace
  await openBring(p);
  await pick(p, '^Morning prayers$');
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="replace"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  tr = await tree(p);
  ok(tr.some(x=> /^ Morning: Prayers for Meditation, silence Silence 5 min, Dedication prayers$/.test(x)) && !tr.some(x=> /Morning prayers/.test(x)), 'Replace the current playlist: Morning is as it was');
  // A deleted playlist, and the deleted track it needs
  await openBring(p);
  await pick(p, '^Heart Jewel deleted$');
  rows = await cmp(p);
  ok(/^Now Deleted \|/.test(rows[0]) && rows.some(r=> /^ \| Guru Founder$/.test(r)), 'Heart Jewel: Now says Deleted; the earlier side has its entries');
  ok(await p.evaluate(()=> !!document.querySelector('#bbBD [data-bb="back"]') && !document.querySelector('#bbBD [data-bb="copy"]')), 'one button: Bring back');
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="back"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  tr = await tree(p);
  ok(tr.some(x=> /^Pujas$/.test(x)) && tr.some(x=> /^ Heart Jewel: Guru Founder, The Liberating Prayer$/.test(x)), 'Heart Jewel is back in Pujas, with Guru Founder brought back too');
  // Tracks: by playlist, by album, flat, search
  await openBring(p);
  await p.evaluate(()=> document.querySelector('[data-kind="tr"]').click()); await sleep(400);
  a = await colA(p);
  console.log('tracks by playlist:', JSON.stringify(a));
  ok(a.some(x=> /^Evening$/.test(x)) && a.some(x=> /^Receiving Blessings Tharpa · Daily prayers$/.test(x)), 'Tracks by playlist: Evening, with Receiving Blessings in it');
  ok(a.some(x=> /^Not in a playlist$/.test(x)) && a.some(x=> /^A talk on its own deleted kr37 · Talks$/.test(x)), 'Not in a playlist: the deleted talk');
  await p.evaluate(()=> document.getElementById('bbQ').value = 'Track'); await p.evaluate(()=> document.getElementById('bbQ').dispatchEvent(new Event('input'))); await sleep(300);
  a = await colA(p);
  ok(a.some(x=> /^Receiving Blessings/.test(x)), 'searching "Track" finds Receiving Blessings by its old name');
  await p.evaluate(()=>{ const q = document.getElementById('bbQ'); q.value = 'Evening'; q.dispatchEvent(new Event('input')); }); await sleep(300);
  a = await colA(p);
  ok(a.some(x=> /^Receiving Blessings/.test(x)) && a.some(x=> /^The Liberating Prayer/.test(x)), 'searching a playlist\'s name shows all its tracks, changed or not');
  await p.evaluate(()=>{ const q = document.getElementById('bbQ'); q.value = ''; q.dispatchEvent(new Event('input')); }); await sleep(200);
  await p.evaluate(()=> document.querySelector('[data-trby="al"]').click()); await sleep(400);
  await p.screenshot({path: path.join(SHOTS, 'bringback-4.png'), clip: {x: 0, y: 140, width: 1500, height: 330}});
  a = await colA(p);
  console.log('tracks by album:', JSON.stringify(a));
  ok(a.some(x=> /^Tharpa Daily prayers$/.test(x)) && a.some(x=> /^kr37 Talks$/.test(x)), 'By album: the artist small above the album');
  const talks = ()=> p.evaluate(()=> [...document.querySelectorAll('#bbA [data-id]')].some(e=> /^A talk on its own/.test(e.innerText)));
  const before = await talks();
  await p.evaluate(()=> [...document.querySelectorAll('#bbA [data-grp]')].find(e=> /Talks/.test(e.innerText)).click()); await sleep(300);
  const shut = await talks();
  await p.evaluate(()=> [...document.querySelectorAll('#bbA [data-grp]')].find(e=> /Talks/.test(e.innerText)).click()); await sleep(300);
  ok(before && !shut && await talks(), 'By album: an album\'s chevron closes and opens it');
  await p.evaluate(()=> document.querySelector('input[name="bbView"][value="flat"]').click()); await sleep(400);
  a = await colA(p);
  ok(a.some(x=> /^Track08 now “Receiving Blessings” Tharpa · Daily prayers$/.test(x)) && a.some(x=> /^Receiving Blessings Tharpa · Daily prayers$/.test(x)), 'Flat list: both names, the old one saying what it\'s called now');
  // Wrap off: the artist and album stay on one line too, and the chosen row stays where it was on the screen
  await pick(p, '^Offering to the Spiritual Guide 1');
  const artOk = async ()=>{ for(let i = 0; i < 40; i++){ const r = await p.evaluate(()=> [...document.querySelectorAll('#bbBD img.bb-art')].map(i=> i.complete ? i.naturalWidth : 0)); if(r.length === 2 && r.every(w=> w === 8)) return true; await sleep(150); } return false; };
  ok(/different artwork/.test(await p.evaluate(()=> document.getElementById('bbBD').innerText)) && await artOk(), 'different artwork: the cover now and the earlier one, side by side');
  await p.screenshot({path: path.join(SHOTS, 'bringback-6.png')});
  const topOf = ()=> p.evaluate(()=> document.querySelector('#bbA .bb-it.sel').getBoundingClientRect().top);
  const t0 = await topOf();
  await p.evaluate(()=> document.querySelector('#bbBar button').click()); await sleep(200);
  const subWs = await p.evaluate(()=> getComputedStyle(document.querySelector('#bbA [data-k="t"] .bb-sub')).whiteSpace);
  ok(subWs === 'nowrap' && Math.abs(await topOf() - t0) < 2, 'Wrap off: the artist and album on one line (' + subWs + '); the chosen track stays put');
  await p.evaluate(()=> document.querySelector('#bbBar button').click()); await sleep(200);
  // Replace a track (its name back)
  await pick(p, '^Track08');
  rows = await cmp(p);
  ok(rows[0].startsWith('Now Receiving Blessings') && /Track08$/.test(rows[0]) && await p.evaluate(()=> /Replace the current track/.test(document.querySelector('#bbBD [data-bb="replace"]').textContent)), 'Track08: both names, and Replace the current track');
  await p.screenshot({path: path.join(SHOTS, 'bringback-2.png')});
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="replace"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.find(t=> t.id === 't8').name) === 'Track08', 'the track has its old name back');
  // A deleted track
  await openBring(p);
  await p.evaluate(()=> document.querySelector('[data-kind="tr"]').click()); await sleep(400);
  await pick(p, '^A talk on its own');
  ok(await p.evaluate(()=> /downloaded again \(2 MB\)/.test(document.getElementById('bbBD').innerText)), 'a deleted track: Bring back, and how much comes down again');
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="back"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  ok(await p.evaluate(()=> !!window.__dbg.getRoot().library.find(t=> t.id === 'lone')), 'the talk is back in the library');
  // An unchanged playlist, under Everything
  await openBring(p);
  await p.evaluate(()=> document.querySelector('input[name="bbShow"][value="all"]').click()); await sleep(300);
  await pick(p, '^Weekend$');
  ok(/Always the same since/.test((await colC(p)).join() + await p.evaluate(()=> document.getElementById('bbC').innerText)), 'an unchanged playlist: Always the same since …');
  await p.screenshot({path: path.join(SHOTS, 'bringback-3.png')});
  // A playlist only moved out of its folder: listed, with where it was; Replace puts it back (2.5.025)
  await p.evaluate(()=> document.getElementById('histClose').click()); await sleep(300);
  await edit(p, "const d = r.tree.find(n=> n.id==='fD'); const w = d.children.find(n=> n.id==='plW'); d.children = d.children.filter(n=> n !== w); r.tree.push(w);"); await sync(p);
  await openBring(p);
  await pick(p, '^Weekend$');
  rows = await cmp(p);
  console.log('Weekend moved:', JSON.stringify(rows));
  ok(rows.some(r=> /^At the top level \| In the folder “Daily”$/.test(r)), 'a playlist moved out of its folder: where it is and where it was');
  ok(await p.evaluate(()=> document.querySelector('#bbBD .bb-head:nth-of-type(3) .bb-h').textContent !== 'Previous versions'), 'the box is headed by the time, not "Previous versions"');
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="replace"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  ok(await p.evaluate(()=> !!window.__dbg.getRoot().tree.find(n=> n.id==='fD').children.find(n=> n.id==='plW')), 'Replace puts it back in Daily');
  // Moved out, and then its folder deleted: Replace brings the folder back too (2.5.026)
  await edit(p, "r.tree.push({id: 'fG', kind: 'folder', name: 'Guru Yoga Retreat', children: [{id: 'plG', kind: 'playlist', name: 'GarageBand', items: [{id: 'g1', kind: 'track', refId: 'pm'}]}]});"); await sync(p);
  await edit(p, "const g = r.tree.find(n=> n.id==='fG'); r.tree.push(g.children[0]); r.tree = r.tree.filter(n=> n.id !== 'fG');"); await sync(p);
  await openBring(p);
  await pick(p, '^GarageBand$');
  rows = await cmp(p);
  ok(rows.some(r=> /^At the top level \| In the folder “Guru Yoga Retreat”$/.test(r)), 'its folder deleted since: still says where it was');
  await p.evaluate(()=> document.querySelector('#bbBD [data-bb="replace"]').click()); for(let i=0;i<60;i++){ await sleep(250); if(!(await p.$('#historyPage'))) break; } await waitIdle(p); await sleep(800);
  tr = await tree(p);
  ok(tr.some(x=> /^Guru Yoga Retreat$/.test(x)) && tr.some(x=> /^ GarageBand: Prayers for Meditation$/.test(x)) && !tr.some(x=> /^GarageBand/.test(x)), 'Replace brings the folder back, with the playlist in it (' + JSON.stringify(tr) + ')');
  // Several hundred tracks: column A scrolls by itself, and an arrow goes back to the top (2.5.023)
  await p.evaluate(()=>{ const c = document.getElementById('histClose'); if(c) c.click(); }); await sleep(300);
  await edit(p, "for(let i = 0; i < 400; i++) r.library.push({id: 'many' + i, name: 'Many ' + String(i).padStart(3, '0'), artist: 'Tharpa', album: 'Many', trackNo: i + 1, duration: 60, filename: 'm' + i + '.mp3', fileSize: 1000, audioRev: 1});"); await sync(p);
  await openBring(p);
  await p.evaluate(()=> document.querySelector('[data-kind="tr"]').click()); await sleep(400);
  await p.evaluate(()=> document.querySelector('input[name="bbView"][value="flat"]').click()); await sleep(300);
  await p.evaluate(()=> document.querySelector('input[name="bbShow"][value="all"]').click()); await sleep(400);
  const sc = await p.evaluate(()=>{ const l = document.getElementById('bbA'), a = document.querySelector('.bb-a').getBoundingClientRect(), m = document.querySelector('#historyPage .hist-main'); return {own: l.scrollHeight > l.clientHeight + 100, edge: Math.abs(l.getBoundingClientRect().right - a.right) < 3, fits: a.bottom <= m.getBoundingClientRect().bottom + 1, upHidden: document.getElementById('bbUp').hidden}; });
  ok(sc.own && sc.edge && sc.fits && sc.upHidden, 'a long list: column A scrolls by itself, its scrollbar at its edge; no arrow at the top (' + JSON.stringify(sc) + ')');
  await p.evaluate(()=> document.getElementById('bbA').scrollTop = 6000); await sleep(300);
  const shown = await p.evaluate(()=> !document.getElementById('bbUp').hidden);
  await p.screenshot({path: path.join(SHOTS, 'bringback-7.png')});
  await pick(p, '^Many 350');
  const kept = await p.evaluate(()=> document.getElementById('bbA').scrollTop > 3000);
  await p.evaluate(()=> document.getElementById('bbUp').click());
  for(let i = 0; i < 30 && await p.evaluate(()=> document.getElementById('bbA').scrollTop > 0); i++) await sleep(150);
  ok(shown && kept && await p.evaluate(()=> document.getElementById('bbA').scrollTop === 0 && document.getElementById('bbUp').hidden), 'scrolled down: the arrow shows; choosing a track keeps the place; the arrow goes back to the top');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
