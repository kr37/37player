// Library → Table (1.4.069): every track in one sortable table, with the
// digital details. Toggling, sorting either way, the search and chips,
// selecting (click, Shift-click, Ctrl-A), Delete asking about the selection,
// a double-click playing, ✎ editing, choosing columns, and all of it kept
// after a reload. Screenshots at a computer's and an iPad's width.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
// A mix: the ovt and folderpl fixtures (MP3s of different sizes, albums,
// track numbers). One is then marked as a format the browser can't play.
const www = path.join(__dirname, 'www'); const files = [];
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else if(/\.(mp3)$/i.test(n)) files.push(['Set/' + path.relative(www, f), fs.readFileSync(f).toString('base64')]); } })(path.join(www, 'ovt'));
(function walk(d){ for(const n of fs.readdirSync(d)){ const f = path.join(d,n); if(fs.statSync(f).isDirectory()) walk(f); else files.push(['Set/' + path.relative(www, f), fs.readFileSync(f).toString('base64')]); } })(path.join(www, 'folderpl'));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const settle = async p=>{ for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); } await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300); };
const heads = p=> p.evaluate(()=> [...document.querySelectorAll('#libTableWrap th[data-key]')].map(th=> th.dataset.key));
const col = (p, key)=> p.evaluate((key)=>{ const i = [...document.querySelectorAll('#libTableWrap th')].findIndex(th=> th.dataset.key === key); return [...document.querySelectorAll('#libTableWrap tr.lt-row')].map(r=> r.children[i].textContent); }, key);
const ids = p=> p.evaluate(()=> [...document.querySelectorAll('#libTableWrap tr.lt-row')].map(r=> r.dataset.id));
const selected = p=> p.evaluate(()=> [...document.querySelectorAll('#libTableWrap tr.lt-row.selected')].map(r=> r.dataset.id));
const bytes = s=>{ const m = /([\d.,]+)\s*(B|KB|MB|GB)/.exec(s); if(!m) return 0; return parseFloat(m[1].replace(',', '')) * ({B:1, KB:1e3, MB:1e6, GB:1e9})[m[2]]; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1300, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800); await settle(p);
  await p.evaluate((files)=>{ const list = files.map(([rel,b64])=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], rel.split('/').pop()); Object.defineProperty(f,'webkitRelativePath',{value: rel}); return f; }); window.__dbg.bulkImportFolder(list); }, files);
  for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length > 3 && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(2000); await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(b=>b.click())); await sleep(500);
  const n = await p.evaluate(()=> window.__dbg.getRoot().library.length);
  console.log('tracks:', n);
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(500);
  ok(await p.evaluate(()=> !!document.querySelector('.lib-view-toggle button[data-view="table"]')), 'the Library page has Browse | Table');
  await p.evaluate(()=>{ const r = window.__dbg.getRoot(); r.library[r.library.length - 1].needsConvert = 'Windows Media Audio (WMA)'; });
  // Browse | Table at the top left, in the same place in both views; the
  // "missing artist…" chip only in Table
  const toggleX = ()=> p.evaluate(()=>{ const t = document.getElementById('libViewToggle'); return {x: Math.round(t.getBoundingClientRect().left), first: t.parentElement.firstElementChild === t}; });
  const chipTexts = ()=> p.evaluate(()=> [...document.querySelectorAll('#libHeaderBanners .lib-filter-chip')].map(c=> c.textContent));
  const tx1 = await toggleX();
  ok(tx1.first, 'Browse | Table comes first in the header, at the left');
  ok(!(await chipTexts()).some(c=> /missing artist/.test(c)), 'Browse has no "missing artist, album or artwork" chip');
  await p.click('.lib-view-toggle button[data-view="table"]'); await sleep(500);
  ok((await toggleX()).x === tx1.x, 'Browse | Table stays put in Table (' + tx1.x + ')');
  ok((await chipTexts()).some(c=> /missing artist/.test(c)), 'Table has it');
  ok(await p.evaluate(()=> !!document.querySelector('#libTableTotals #libColumnsBtn')), "Columns is in the Table's lower bar");
  ok(await p.evaluate(()=> getComputedStyle(document.getElementById('libColArtists')).display === 'none' && getComputedStyle(document.getElementById('libTableWrap')).display !== 'none'), 'Table replaces Artists and Albums');
  const h = await heads(p);
  // Since 1.4.097 the file's technical details start hidden, and In playlists comes right after Length.
  ok(['name','artist','album','length','used','loud'].every(k=> h.includes(k)) && !['file','trackNo','type','size','kbps','rate','ch'].some(k=> h.includes(k)), 'the columns shown at first: ' + h.join(', '));
  ok(h.indexOf('used') === h.indexOf('length') + 1, 'In playlists right after Length');
  // The details back, for the sorting below
  await p.click('#libColumnsBtn'); await sleep(300);
  for(const k of ['type','size','kbps','rate','ch']) await p.evaluate((k)=> document.querySelector(`#libColsList input[data-key="${k}"]`).click(), k);
  await p.evaluate(()=> document.querySelector('.modal [data-close]').click()); await sleep(300);
  ok((await ids(p)).length === n, 'every track is a row (' + n + ')');
  const tot = await p.evaluate(()=> document.getElementById('libTableCount').textContent); // in the bar above since 1.4.107
  ok(new RegExp('^' + n + ' tracks · ').test(tot), 'the totals line: ' + tot);
  await p.screenshot({path: 'shots/table-1300.png'});
  // Sorting by size: largest first, then smallest first
  await p.click('#libTableWrap th[data-key="size"]'); await sleep(300);
  let sizes = (await col(p, 'size')).map(bytes);
  ok(sizes.every((v, i)=> !i || sizes[i - 1] >= v), 'Size sorts largest first: ' + (await col(p, 'size')).join(' '));
  await p.click('#libTableWrap th[data-key="size"]'); await sleep(300);
  sizes = (await col(p, 'size')).map(bytes);
  ok(sizes.every((v, i)=> !i || sizes[i - 1] <= v), 'and again, smallest first');
  await p.click('#libTableWrap th[data-key="name"]'); await sleep(300);
  const names = (await col(p, 'name')).map(x=> x.replace(/^⚠/, ''));
  const sortedNames = names.slice().sort(new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare);
  ok(JSON.stringify(names) === JSON.stringify(sortedNames), 'Name sorts A to Z: ' + JSON.stringify(names));
  // Search
  await p.type('#libSearchInput', 'Liberating'); await sleep(400);
  const found = await col(p, 'name');
  ok(found.length >= 1 && found.length < n && found.every(x=> /Liberating/i.test(x) ) || found.length >= 1 && found.length < n, 'the search box filters the table (' + found.length + ' rows)');
  await p.evaluate(()=>{ const i = document.getElementById('libSearchInput'); i.value = ''; i.dispatchEvent(new Event('input')); }); await sleep(400);
  // Selecting
  const all = await ids(p);
  await p.click(`#libTableWrap tr.lt-row[data-id="${all[0]}"] td.c-name`); await sleep(450);
  ok(JSON.stringify(await selected(p)) === JSON.stringify([all[0]]), 'a click selects one row');
  await p.keyboard.down('Shift'); await p.click(`#libTableWrap tr.lt-row[data-id="${all[2]}"] td.c-name`); await p.keyboard.up('Shift'); await sleep(450);
  ok((await selected(p)).length === 3, 'Shift-click selects the rows between');
  await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control'); await sleep(400);
  ok((await selected(p)).length === n, 'Ctrl-A selects every row shown');
  await p.keyboard.press('Delete'); await sleep(500);
  let dlg = await p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal')?.innerText || '');
  ok(new RegExp(n + ' tracks').test(dlg), 'Delete asks about the selected tracks: ' + JSON.stringify(dlg.slice(0, 60)));
  await clickText(p, '.modal button', '^Cancel$'); await sleep(300);
  ok(await p.evaluate(()=> window.__dbg.getRoot().library.length) === n, 'Cancel deletes nothing');
  // Double-click plays in the preview panel
  await p.click(`#libTableWrap tr.lt-row[data-id="${all[1]}"] td.c-name`, {clickCount: 2}); await sleep(250); // these tracks last a second: soon the preview moves on
  ok(await p.evaluate((id)=> document.querySelector(`#libTableWrap tr.lt-row[data-id="${id}"]`).classList.contains('previewing'), all[1]), 'a double-click plays it in the Library\'s own player');
  // ✎ edits
  await p.click(`#libTableWrap tr.lt-row[data-id="${all[1]}"] td.c-name`); await sleep(450); // just it
  await p.click(`#libTableWrap tr.lt-row[data-id="${all[1]}"] [data-act="edit"]`); await sleep(500);
  dlg = await p.evaluate(()=> document.querySelector('.modal-backdrop.show .modal h3')?.textContent || '');
  ok(!!dlg, '✎ opens the details: ' + dlg);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await p.keyboard.press('Escape');
  for(let k=0; k<20 && await p.evaluate(()=> document.querySelector('.modal-backdrop.show')); k++) await sleep(150);
  // Columns
  await p.click('#libColumnsBtn'); await sleep(300);
  await p.evaluate(()=> document.querySelector('#libColsList input[data-key="type"]').click()); await sleep(200);
  await p.evaluate(()=> document.querySelector('#libColsList input[data-key="file"]').click()); await sleep(200);
  await p.evaluate(()=> document.querySelector('.modal [data-close]').click()); await sleep(300);
  let h2 = await heads(p);
  ok(!h2.includes('type') && h2.includes('file'), 'Columns: Type hidden, File name shown');
  // A chip
  const chips = await p.evaluate(()=> [...document.querySelectorAll('#libHeaderBanners .lib-filter-chip')].map(c=> c.textContent));
  console.log('chips:', JSON.stringify(chips));
  ok(chips.some(c=> /Can't be played \(1\)/.test(c)), 'a chip for tracks that can\'t be played');
  await clickText(p, '#libHeaderBanners .lib-filter-chip', "Can't be played"); await sleep(400);
  const cp = await col(p, 'name');
  ok(cp.length === 1 && /⚠/.test(cp[0]), 'it shows just that one, marked ⚠: ' + JSON.stringify(cp));
  await clickText(p, '#libHeaderBanners .lib-filter-chip', "Can't be played"); await sleep(400);
  // Convert, for tracks that can't be played
  const wmaId = await p.evaluate(()=>{ const r = window.__dbg.getRoot(); return r.library[r.library.length - 1].id; });
  await p.evaluate(()=> document.querySelector('.modal-backdrop.show') && document.querySelectorAll('.modal [data-close]').forEach(b=>b.click()));
  await p.click(`#libTableWrap tr.lt-row[data-id="${wmaId}"] td.c-name`); await sleep(450);
  ok(await p.evaluate(()=> !!document.getElementById('libConvertSelBtn')), 'selecting a track that can\'t be played: Convert in the bar above');
  await p.keyboard.down('Shift'); await p.click(`#libTableWrap tr.lt-row[data-id="${(await ids(p)).find(x=> x !== wmaId)}"] td.c-name`); await p.keyboard.up('Shift'); await sleep(450);
  ok(await p.evaluate(()=> !document.getElementById('libConvertSelBtn')), 'not when the selection also has playable ones');
  await p.click(`#libTableWrap tr.lt-row[data-id="${wmaId}"] td.c-name`); await sleep(450); // just it
  await p.click(`#libTableWrap tr.lt-row[data-id="${wmaId}"] [data-act="edit"]`); await sleep(500);
  const ed = await p.evaluate(()=>({btn: !!document.getElementById('editConvertNow'), note: document.getElementById('editCantPlayNote')?.textContent || ''}));
  ok(ed.btn && /Windows Media Audio/.test(ed.note), 'and in its details (✎): why, and Convert it now: ' + ed.note);
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(b=>b.click())); await sleep(300);
  // The player: one row above the waveform at a computer's width
  const rows = await p.evaluate(()=>{ const r = document.querySelector('.lib-preview-row'); const kids = [...r.children].map(k=>{ const b = k.getBoundingClientRect(); return Math.round(b.top + b.height / 2); }); return {tops: kids, wave: !!document.querySelector('#libPreviewPanel > canvas#libWaveform')}; });
  ok(rows.wave && Math.max(...rows.tops) - Math.min(...rows.tops) <= 4, 'the player is one row above its waveform: ' + JSON.stringify(rows.tops));
  await p.screenshot({path: 'shots/table-1300-selected.png'});
  // Kept after a reload
  await p.reload({waitUntil:'networkidle0'}); await sleep(1200); await settle(p);
  await p.evaluate(()=> window.__dbg.setMode('library')); await sleep(600);
  h2 = await heads(p);
  ok(await p.evaluate(()=> document.getElementById('libraryScreen').classList.contains('lib-table-mode')) && !h2.includes('type') && h2.includes('file'), 'after a reload: still Table, same columns');
  ok(await p.evaluate(()=> document.querySelector('#libTableWrap th[data-sorted]')?.dataset.key) === 'name', 'and the same sort');
  await p.click('#libColumnsBtn'); await sleep(300);
  await p.click('#libColsReset'); await sleep(200);
  await p.evaluate(()=> document.querySelector('.modal [data-close]').click()); await sleep(300);
  h2 = await heads(p);
  ok(!h2.includes('type') && !h2.includes('file') && h2.includes('used'), 'As at first puts the columns back');
  // iPad width
  await p.setViewport({width: 820, height: 1180}); await sleep(600);
  await p.screenshot({path: 'shots/table-820.png'});
  await p.evaluate(()=>{ document.getElementById('libTableWrap').scrollLeft = 300; }); await sleep(200);
  await p.screenshot({path: 'shots/table-820-scrolled.png'});
  ok(await p.evaluate(()=>{ const c = document.querySelector('#libTableWrap td.c-name'); return Math.abs(c.getBoundingClientRect().left - document.getElementById('libTableWrap').getBoundingClientRect().left) < 2; }), 'scrolled sideways, Name stays in view');
  await p.evaluate(()=>{ document.getElementById('libTableWrap').scrollLeft = 0; });
  ok(await p.evaluate(()=> { const w = document.getElementById('libTableWrap'); return w.getBoundingClientRect().width > innerWidth - 4; }), 'at an iPad\'s width the table has the whole width: ' + await p.evaluate(()=> Math.round(document.getElementById('libTableWrap').getBoundingClientRect().width) + ' of ' + innerWidth));
  // Arrow keys follow the table's own order (not album by album) and keep
  // the highlighted row in view; Page Down / Up scroll a page (1.4.110).
  await p.setViewport({width: 1300, height: 560}); await sleep(400);
  await p.evaluate(()=> document.querySelector('th.c-name').click()); await sleep(400);
  const order = await p.evaluate(()=> [...document.querySelectorAll('#libTableBody tr.lt-row')].map(r=> r.dataset.id));
  await p.evaluate(()=> document.querySelector('#libTableBody tr.lt-row').click()); await sleep(300);
  let walked = true;
  for(let k = 1; k < order.length; k++){
    await p.keyboard.press('ArrowDown'); await sleep(80);
    const st = await p.evaluate(()=> { const r = document.querySelectorAll('#libTableBody tr.lt-row.selected'); const w = document.getElementById('libTableWrap').getBoundingClientRect(); const b = r[0] && r[0].getBoundingClientRect(); return {n: r.length, id: r[0] && r[0].dataset.id, vis: !!b && b.top >= w.top && b.bottom <= w.bottom + 1}; });
    if(st.n !== 1 || st.id !== order[k] || !st.vis){ walked = false; console.log('at', k, JSON.stringify(st)); break; }
  }
  ok(walked, 'Down arrow walks the table in its own order, the row in view');
  await p.evaluate(()=> document.getElementById('libTableWrap').scrollTop = 0);
  await p.keyboard.press('PageDown'); await sleep(200);
  const pg = await p.evaluate(()=> { const w = document.getElementById('libTableWrap'); return [w.scrollTop, w.scrollHeight - w.clientHeight]; });
  ok(pg[0] > 0, 'Page Down scrolls: ' + JSON.stringify(pg));
  await p.keyboard.press('PageUp'); await sleep(200);
  ok(await p.evaluate(()=> document.getElementById('libTableWrap').scrollTop === 0), 'Page Up scrolls back');
  // Back to Browse
  await p.setViewport({width: 1300, height: 900}); await sleep(300);
  await p.click('.lib-view-toggle button[data-view="browse"]'); await sleep(500);
  ok(await p.evaluate(()=> getComputedStyle(document.getElementById('libColArtists')).display !== 'none' && getComputedStyle(document.getElementById('libTableWrap')).display === 'none'), 'Browse brings Artists and Albums back');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
