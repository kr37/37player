// Folder import → "Make a playlist of each folder". Uses tests/www/folderpl
// (made in tests/www by make-fixtures.sh): Pujas/{Heruka,Tara,Teachings/{Intro.mp3,Day 1/}}.
const puppeteer = require('puppeteer-core'); const path = require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const DIR = path.join(__dirname, 'www', 'folderpl', 'Pujas');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);

  const pick = async ()=>{
    const cdp = await p.target().createCDPSession();
    const {root} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#bulkFolderInput'});
    await cdp.send('DOM.setFileInputFiles', {nodeId, files: [DIR]});
    for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) return true; }
    return false;
  };
  const go = async ()=>{
    // Every name the dialog shows while importing ("Importing x.mp3").
    await p.evaluate(()=>{ window.__seen = new Set(); new MutationObserver(()=>{ const el = document.getElementById('bulkImportFile'); if(el && el.textContent) window.__seen.add(el.textContent); }).observe(document.body, {subtree:true, childList:true, characterData:true}); });
    await p.click('#folderImportGo');
    for(let i=0; i<120; i++){ await sleep(250); const done = await p.evaluate(()=> [...document.querySelectorAll('.modal h3')].some(h=> /import/i.test(h.textContent) && !document.getElementById('bulkImportStatus'))); if(done) break; }
    await sleep(500);
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  };
  const shape = ()=> p.evaluate(()=>{
    const r = window.__dbg.getRoot(), name = id=> (r.library.find(t=> t.id===id) || {}).name;
    const walk = a=> (a || []).slice().sort((x, y)=> x.order - y.order).map(n=> n.kind==='folder' ? {f: n.name, c: walk(n.children)} : {p: n.name, i: n.items.slice().sort((x, y)=> x.order - y.order).map(it=> it.kind==='track' ? name(it.refId) : it.kind)});
    return walk(r.tree).filter(n=> n.f==='Pujas');
  });

  ok(await pick(), 'review appears');
  ok(await p.$eval('#reviewFolderPlaylists', el=> el.checked), 'checkbox ticked (no playlist files in the folder)');
  ok(/4 playlists/.test(await p.evaluate(()=> document.querySelector('#reviewFolderPlaylists').parentElement.textContent)), 'note counts 4 playlists');
  await go();
  const s1 = await shape(); console.log(JSON.stringify(s1));
  const want = [{f:'Pujas', c:[
    {p:'Heruka', i:['Prayers','Dedication','Untagged']},
    {p:'Tara', i:['T2','T10']},
    {f:'Teachings', c:[{p:'Teachings', i:['Intro']}, {p:'Day 1', i:['Session']}]},
  ]}];
  ok(JSON.stringify(s1) === JSON.stringify(want), 'folders, names and order as expected');
  const seen = await p.evaluate(()=> [...window.__seen]);
  ok(seen.includes('Importing Tara 10.mp3') && seen.length >= 7, 'the import names each file as it goes (' + seen.length + ' names)');

  // Same folder again: the four show as already here, Replace by default; unticking hides them.
  ok(await pick(), 'review appears again');
  let rows = await p.evaluate(()=> [...document.querySelectorAll('#folderImportPlaylistCollisionsList > div')].filter(r=> r.style.display!=='none').map(r=> r.querySelector('.playlist-collision-name').textContent));
  ok(rows.length === 4 && rows.includes('Pujas → Teachings → Day 1'), 'four clashes listed with their folders: ' + rows.join(' | '));
  await p.click('#reviewFolderPlaylists'); await sleep(200);
  ok(await p.evaluate(()=> document.getElementById('folderImportPlaylistCollisionsBox').style.display === 'none'), 'unticking hides the clash list');
  await p.click('#reviewFolderPlaylists'); await sleep(200);
  await go();
  const s2 = await shape();
  ok(JSON.stringify(s2) === JSON.stringify(want), 'replacing leaves one copy of each, unchanged');

  // Unticked: no playlists made.
  await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.tree.splice(0, r.tree.length, ...r.tree.filter(n=> n.name!=='Pujas')); await window.__dbg.saveState(); });
  ok(await pick(), 'review appears a third time');
  await p.click('#reviewFolderPlaylists'); await sleep(200);
  await go();
  ok((await shape()).length === 0, 'unticked: no playlists');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
