// Removing a library can also move its folder to the Trash (2.5.032, shell
// 2.5.2; kr37, 16 Nov 2026), through the stand-in shell (fake-shell.js):
//  - Settings → Libraries → Remove from list… offers a third button, "Remove
//    and move its folder to the Trash…", only with a shell that can;
//  - a second question says what goes (playlists, tracks, size) and how
//    stern to be: the only copy (sternest), not all sent to its shared
//    library (stern), all in its shared library or its backup (calm);
//  - Cancel leaves everything; Move to the Trash takes the folder off the
//    disk (to the Trash) and the library off the list.
//   node libtrash.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path');
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
const SHELL = fs.readFileSync(path.join(__dirname, 'fake-shell.js'), 'utf8');
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const modalText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.modal')].filter(m=> m.offsetParent !== null).map(m=> m.innerText).join(' | '));
const waitModal = async (p, re, ms)=>{ for(let i = 0; i < (ms || 15000) / 200; i++){ const tx = await modalText(p).catch(()=> ''); if(re.test(tx)) return tx; await sleep(200); } return await modalText(p).catch(()=> ''); };
const toastText = (p)=> p.evaluate(()=> [...document.querySelectorAll('.toast')].map(t=> t.textContent).join(' | '));
const libDirs = (p)=> p.evaluate(async()=>{ const out = []; try{ let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell'); for(const x of ['Music', '37 Player Libraries']) d = await d.getDirectoryHandle(x); for await (const [n, h] of d.entries()) if(h.kind === 'directory') out.push(n); }catch(e){} return out.sort(); });
const openLibraries = async (p)=>{ await p.evaluate(()=>{ document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()); window.__dbg.setMode('editing'); window.__dbg4.settings(); }); await sleep(300); await p.evaluate(()=> window.__dbg4.section('libraries')); await sleep(800); };
// The row's Remove from list… for the library called name.
const removeRow = (p, name)=> p.evaluate((name)=>{
  // The smallest ancestor holding just this one button is its row.
  const b = [...document.querySelectorAll('button[data-act="delete"]')].find(x=>{ let r = x.parentElement; while(r && r.querySelectorAll('button[data-act="delete"]').length === 1){ if(r.textContent.includes(name)) return true; r = r.parentElement; } return false; });
  if(b) b.click(); return !!b; }, name);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  p.on('dialog', async d=>{ console.log('ALERT:', d.message()); await d.accept(); });
  await p.evaluateOnNewDocument((shell)=>{ window.__noAutoConverter = true; window.__fakeShellNoPlace = true; (0, eval)(shell); }, SHELL);
  await p.goto(APP, {waitUntil: 'domcontentloaded'});
  await waitModal(p, /Where should your libraries live/);
  await clickText(p, '.modal button', '^Use this place$'); await sleep(1500);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  ok(await p.evaluate(()=> !!(window.__trash.shell() || {}).trash), 'the shell says it can use the Trash');
  // Four more libraries, each in its own folder, each a different case.
  await p.evaluate(async()=>{
    const D = window.__disk, reg = D.readLibraryList();
    const mk = async (id, name, opts)=>{
      reg.list.push({id, name}); D.writeLibraryList(reg);
      const tracks = [1, 2, 3].map(i=> ({id: id + 't' + i, name: name + ' ' + i, artist: 'A', album: 'B', trackNo: i, filename: 't' + i + '.wav', fileSize: 1000, duration: 10}));
      const tree = [{id: id + 'f', kind: 'folder', name: 'F', children: [{id: id + 'p1', kind: 'playlist', name: 'P1', items: []}, {id: id + 'p2', kind: 'playlist', name: 'P2', items: []}]}];
      const r = {library: tracks, tree, settings: {libraryName: name}, session: {}};
      const st = D.storageOpen(id);
      await st.put('state', {key: 'libraryInfo', id, name});
      await st.put('state', {key: 'root', value: r});
      if(opts.shared) await st.put('state', {key: 'view', value: {settings: {libraryName: name, sharedLibrary: {url: 'x', code: 'demo', libraryName: 'SKBC Main'}}}});
      if(opts.covered) await st.put('state', {key: 'sharedCovered', fingerprint: window.__trash.fp(r)});
      if(opts.backup) await st.put('state', {key: 'backup', lastBackupAt: Date.UTC(2026, 10, 10), lastFingerprint: opts.backup === 'all' ? window.__trash.fp(r) : 'older'});
      for(const tr of tracks) await st.put('audio', {id: tr.id, blob: new File([new Uint8Array(1000)], tr.filename, {type: 'audio/wav'})});
      st.close();
    };
    await mk('only1', 'Only copy', {});
    await mk('unsent1', 'Not all sent', {shared: true});
    await mk('shared1', 'All shared', {shared: true, covered: true});
    await mk('backed1', 'Backed up', {backup: 'all'});
    await mk('oldbk1', 'Old backup', {backup: 'old'});
  });
  await sleep(1500);
  const facts = await p.evaluate(async()=>{ const o = {}; for(const id of ['only1', 'unsent1', 'shared1', 'backed1', 'oldbk1']) o[id] = await window.__trash.facts(id); return o; });
  ok(facts.only1.tracks === 3 && facts.only1.playlists === 2 && facts.only1.bytes > 3000 && !facts.only1.shared && !facts.only1.backupAt, 'what a library holds, from its own records: 3 tracks, 2 playlists, ' + facts.only1.bytes + ' bytes on disk');
  ok(facts.unsent1.shared === 'SKBC Main' && !facts.unsent1.covered, 'joined, but not all sent when last open');
  ok(facts.shared1.shared === 'SKBC Main' && facts.shared1.covered, 'joined, and all of it in the shared library');
  ok(facts.backed1.backupAll && !facts.oldbk1.backupAll && facts.oldbk1.backupAt, 'a backup with all of it, and one without its latest changes');

  // ---- The only copy: the third button, then the sternest question.
  await openLibraries(p);
  await removeRow(p, 'Only copy');
  let m = await waitModal(p, /from the list\?/);
  ok(/Remove and move its folder to the Trash…/.test(m) && /Remove from the list/.test(m), 'Remove from list… offers "Remove and move its folder to the Trash…" beside "Remove from the list"');
  await clickText(p, '.modal button', '^Remove and move its folder to the Trash…$');
  m = await waitModal(p, /to the Trash\?/);
  ok(/Move “Only copy” to the Trash\?/.test(m) && /2 playlists, 3 tracks/.test(m) && /This is the only copy of this library/.test(m), 'the second question: what goes, and that it\'s the only copy (' + m.replace(/\n+/g, ' / ').slice(0, 260) + ')');
  ok(await p.evaluate(()=> { const e = document.querySelector('.modal .trash-risk'); return !!e && /only copy/.test(e.textContent) && getComputedStyle(e).borderLeftWidth === '4px'; }), 'said in the stern strip');
  ok(await p.evaluate(()=>{ const bs = [...document.querySelectorAll('.modal .ask-buttons button')]; return bs.length === 2 && /Cancel/.test(bs[0].textContent) && /Move to the Trash/.test(bs[1].textContent) && bs[1].classList.contains('danger'); }), 'Cancel first, then a red "Move to the Trash"');
  await (await p.$('.modal')).screenshot({path: 'shots/libtrash-onlycopy.png'});
  await clickText(p, '.modal button', '^Cancel$'); await sleep(600);
  ok((await libDirs(p)).includes('Only copy') && await p.evaluate(()=> window.__disk.readLibraryList().list.some(l=> l.id === 'only1')), 'Cancel: the folder and the library stay');

  // ---- Stern for not all sent; calm for all shared, and for a full backup.
  for(const [name, re, stern, label] of [['Not all sent', /not all of it had reached the shared library “SKBC Main”/, true, 'not all sent: stern'], ['All shared', /Everything in it is also in the shared library “SKBC Main”/, false, 'all in the shared library: calm'], ['Backed up', /Its last backup, .*, has all of it/, false, 'a backup with all of it: calm'], ['Old backup', /doesn't have its latest changes/, true, 'an older backup: stern']]){
    await openLibraries(p); await removeRow(p, name); await waitModal(p, /from the list\?/);
    await clickText(p, '.modal button', '^Remove and move its folder to the Trash…$');
    const mm = await waitModal(p, /to the Trash\?/);
    const strip = await p.evaluate(()=> !!document.querySelector('.modal .trash-risk'));
    ok(re.test(mm) && strip === stern, label + ' (' + mm.replace(/\n+/g, ' / ').slice(0, 200) + ')');
    await clickText(p, '.modal button', '^Cancel$'); await sleep(500);
  }

  // ---- Move to the Trash.
  await openLibraries(p); await removeRow(p, 'Only copy'); await waitModal(p, /from the list\?/);
  await clickText(p, '.modal button', '^Remove and move its folder to the Trash…$'); await waitModal(p, /to the Trash\?/);
  await clickText(p, '.modal button', '^Move to the Trash$'); await sleep(2000);
  const dirs = await libDirs(p), trash = await p.evaluate(()=> window.__fakeTrash || []);
  ok(!dirs.includes('Only copy') && trash.some(x=> /Only copy$/.test(x)), 'Move to the Trash: the folder goes to the Trash (' + JSON.stringify(trash) + '; left: ' + dirs.join(', ') + ')');
  ok(await p.evaluate(()=> !window.__disk.readLibraryList().list.some(l=> l.id === 'only1')), 'and the library leaves the list');
  ok(/“Only copy” was moved to the Trash/.test(await toastText(p)), 'and says so');
  ok(dirs.includes('All shared') && dirs.includes('Not all sent'), 'the other libraries\' folders are untouched');
  // 2.5.056 (report 2026-11-19-184915-2a6a08): the questions opened the
  // removed library's store, which tidied its folder 20 s later and, the
  // folder gone, made a new empty "My library" in its place.
  await sleep(25000);
  const later = await libDirs(p);
  ok(later.length === dirs.length && !later.some(x=> /^My library/.test(x) && !dirs.includes(x)), '25 s later, no new folder in its place (' + later.join(', ') + ')');

  // ---- Remove from the list (forget): its folder stays, and none is made.
  const before = await libDirs(p);
  await openLibraries(p); await removeRow(p, 'Backed up'); await waitModal(p, /from the list\?/);
  await clickText(p, '.modal button', '^Remove from the list$'); await sleep(1500);
  ok(await p.evaluate(()=> !window.__disk.readLibraryList().list.some(l=> l.id === 'backed1')), 'Remove from the list: the library leaves the list');
  await sleep(25000);
  const after = await libDirs(p);
  ok(JSON.stringify(after) === JSON.stringify(before), 'its folder stays, and 25 s later no new one was made (' + after.join(', ') + ')');

  // ---- An older shell (no Trash): no third button.
  await p.evaluate(()=> window.__trash.noTrash());
  await openLibraries(p); await removeRow(p, 'All shared');
  m = await waitModal(p, /from the list\?/);
  ok(!/to the Trash/.test(m) && /Remove from the list/.test(m), 'with a shell before 2.5.2: only Remove from the list');
  await clickText(p, '.modal button', '^Cancel$');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
