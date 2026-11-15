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
      T('lone', 'A talk on its own', 'Gen Rinzin', 'Talks', 1), T('osg', 'Offering to the Spiritual Guide 1', 'Tharpa', 'OSG', 1)];
    r.tree = [{id: 'fD', kind: 'folder', name: 'Daily', children: [{id: 'plM', kind: 'playlist', name: 'Morning', items: [{id: 'e1', kind: 'track', refId: 'pm'}, {id: 'e2', kind: 'silence', seconds: 300, name: 'Silence 5 min'}, {id: 'e3', kind: 'track', refId: 'dp'}]},
        {id: 'plW', kind: 'playlist', name: 'Weekend', items: [{id: 'w1', kind: 'track', refId: 'pm'}]}]},
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
  await p.evaluate(()=> document.querySelector('input[name="bbShow"][value="chg"]').click()); await sleep(300);
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
  ok(a.some(x=> /^Not in a playlist$/.test(x)) && a.some(x=> /^A talk on its own deleted Gen Rinzin · Talks$/.test(x)), 'Not in a playlist: the deleted talk');
  await p.evaluate(()=> document.getElementById('bbQ').value = 'Track'); await p.evaluate(()=> document.getElementById('bbQ').dispatchEvent(new Event('input'))); await sleep(300);
  a = await colA(p);
  ok(a.some(x=> /^Receiving Blessings/.test(x)), 'searching "Track" finds Receiving Blessings by its old name');
  await p.evaluate(()=>{ const q = document.getElementById('bbQ'); q.value = 'Evening'; q.dispatchEvent(new Event('input')); }); await sleep(300);
  a = await colA(p);
  ok(a.some(x=> /^Receiving Blessings/.test(x)) && a.some(x=> /^The Liberating Prayer/.test(x)), 'searching a playlist\'s name shows all its tracks, changed or not');
  await p.evaluate(()=>{ const q = document.getElementById('bbQ'); q.value = ''; q.dispatchEvent(new Event('input')); }); await sleep(200);
  await p.evaluate(()=> document.querySelector('[data-trby="al"]').click()); await sleep(400);
  a = await colA(p);
  console.log('tracks by album:', JSON.stringify(a));
  ok(a.some(x=> /^Tharpa Daily prayers$/.test(x)) && a.some(x=> /^Gen Rinzin Talks$/.test(x)), 'By album: the artist small above the album');
  await p.evaluate(()=> document.querySelector('input[name="bbView"][value="flat"]').click()); await sleep(400);
  a = await colA(p);
  ok(a.some(x=> /^Track08 now “Receiving Blessings” Tharpa · Daily prayers$/.test(x)) && a.some(x=> /^Receiving Blessings Tharpa · Daily prayers$/.test(x)), 'Flat list: both names, the old one saying what it\'s called now');
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
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
