// The files store (FolderLibraryStore, 1.4.152): the same promises as
// IndexedDB, kept as files. Checked directly, in the browser's private file
// system: records and their files come back as stored; a replaced or
// deleted file stays (a File read before still reads) until its grace is
// over; a file no record uses is found and tidied; the library record is
// written only at the expected revision, and a damaged one is reported;
// odd keys (colons, capitals) round-trip.
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  const r = await p.evaluate(async()=>{
    const out = {};
    const top = await navigator.storage.getDirectory();
    await top.removeEntry('fstest', {recursive: true}).catch(()=>{});
    const st = window.__fs.make('fstest');
    const ls = async (sub)=>{ const d = await (await top.getDirectoryHandle('fstest')).getDirectoryHandle(sub); const n = []; for await (const [k] of d.entries()) n.push(k); return n.sort(); };
    const ledger = async ()=> JSON.parse(await (await (await (await top.getDirectoryHandle('fstest')).getFileHandle('orphans.json')).getFile()).text());
    // 1. audio with its file
    const id = '0bc9cbaa-ea8a-4982-81ff-3df6a21bc6a7';
    await st.put('audio', {id, blob: new Blob(['first version'], {type: 'audio/mpeg'}), rev: 'a1'});
    let rec = await st.get('audio', id);
    out.round = rec.rev === 'a1' && rec.blob.type === 'audio/mpeg' && (await rec.blob.text()) === 'first version';
    out.files1 = await ls('audio');
    // 2. replaced: the old file stays, and a File read before still reads
    const before = rec.blob;
    await st.put('audio', {id, blob: new Blob(['second version'], {type: 'audio/mpeg'}), rev: 'a2'});
    rec = await st.get('audio', id);
    out.replaced = (await rec.blob.text()) === 'second version' && rec.rev === 'a2';
    out.oldStillReads = await before.text().then(t=> t === 'first version', e=> 'error: ' + e.name);
    out.files2 = await ls('audio');
    out.ledger2 = Object.keys(await ledger());
    // 3. state record with nested files and a File's name
    const k = 'undotrash:123:' + id;
    await st.put('state', {key: k, id, audio: {id, blob: new File(['x'], 'Prayer.webm', {type: 'audio/webm', lastModified: 5})}, art: null, n: [1, 2]});
    rec = await st.get('state', k);
    out.nested = rec.audio.blob.name === 'Prayer.webm' && rec.audio.blob.lastModified === 5 && (await rec.audio.blob.text()) === 'x' && rec.art === null && rec.n[1] === 2;
    await st.put('state', {key: 'libraryInfo', name: 'Main'});
    await st.put('state', {key: 'dlpart:' + id + '.r1:0', blob: new Blob(['p'])});
    out.keys = await st.keys('state');
    out.prefix = await st.keys('state', 'undotrash:');
    out.stateFiles = await ls('state');
    // 4. update: read, put and delete in one step
    out.upd = await st.update('state', ['libraryInfo'], ([cur])=> ({put: [{key: 'libraryInfo', name: cur.name + '!'}], del: ['dlpart:' + id + '.r1:0'], result: cur.name}));
    out.afterUpd = [(await st.get('state', 'libraryInfo')).name, await st.get('state', 'dlpart:' + id + '.r1:0')];
    // 5. the library record
    out.w1 = await st.writeRootIfCurrent({library: []}, 0, false);
    out.w2 = await st.writeRootIfCurrent({library: [1]}, 0, false); // stale
    out.w3 = await st.writeRootIfCurrent({library: [2]}, 1, false);
    const sd = await (await top.getDirectoryHandle('fstest')).getDirectoryHandle('state');
    const w = await (await sd.getFileHandle('root.json')).createWritable(); await w.write('{"key":"root","val'); await w.close();
    out.damagedGet = await st.get('state', 'root').then(()=> 'read', e=> e.name);
    out.w4 = await st.writeRootIfCurrent({library: [3]}, 2, false);
    out.w5 = await st.writeRootIfCurrent({library: [3]}, 2, true);
    out.afterForce = (await st.get('state', 'root')).value.library[0];
    // 6. delete, a leftover file, and tidying
    await st.del('audio', id);
    out.deleted = await st.get('audio', id);
    const ad = await (await top.getDirectoryHandle('fstest')).getDirectoryHandle('audio');
    const w2 = await (await ad.getFileHandle('leftover.zz.mp3', {create: true})).createWritable(); await w2.write('?'); await w2.close();
    await st.tidy();
    const l6 = await ledger();
    out.leftoverListed = !!l6['audio/leftover.zz.mp3'];
    out.filesBeforeGrace = await ls('audio');
    // grace over for everything listed
    const old = {}; Object.keys(l6).forEach(p=> old[p] = 1);
    const w3 = await (await (await top.getDirectoryHandle('fstest')).getFileHandle('orphans.json')).createWritable(); await w3.write(JSON.stringify(old)); await w3.close();
    await st.tidy();
    out.filesAfterGrace = await ls('audio');
    out.nestedStill = (await (await st.get('state', k)).audio.blob.text()) === 'x';
    // 7. keys
    out.keyRound = ['root', 'undotrash:1:Ab', 'dlpart:x.y:3', 'Ünï cödé'].every(x=> window.__fs.unkey(window.__fs.keyOf(x)) === x);
    out.keySafe = window.__fs.keyOf('Abc:1.2');
    // 8. clear keeps what's asked
    await st.put('audio', {id: 'two', blob: new Blob(['2'])});
    await st.clear(['libraryInfo']);
    out.cleared = [await st.keys('state'), await st.keys('audio')];
    return out;
  });
  ok(r.round, 'a record and its file come back as stored');
  ok(r.files1.length === 2 && r.files1.some(n=> /^0bc9cbaa-ea8a-4982-81ff-3df6a21bc6a7\.[a-z0-9]+\.mp3$/.test(n)), 'audio is <id>.<tag>.mp3 beside <id>.json (' + r.files1.join(', ') + ')');
  ok(r.replaced, 'a replaced file reads as the new version');
  ok(r.oldStillReads === true, 'a File read before the replacement still reads (' + r.oldStillReads + ')');
  ok(r.files2.length === 3 && r.ledger2.length === 1, 'the old file stays, on the orphans list (' + r.files2.join(', ') + ' | ' + r.ledger2.join(', ') + ')');
  ok(r.nested, 'nested files in a state record, a File\'s name and date, other values: all round-trip');
  ok(JSON.stringify(r.prefix) === JSON.stringify(['undotrash:123:0bc9cbaa-ea8a-4982-81ff-3df6a21bc6a7']) && r.keys.length === 3, 'keys, and keys by prefix (' + r.keys.join(' ; ') + ')');
  ok(r.stateFiles.every(n=> !/[A-Z:]/.test(n)), 'file names have no capitals or colons (' + r.stateFiles.join(', ') + ')');
  ok(r.upd === 'Main' && r.afterUpd[0] === 'Main!' && r.afterUpd[1] == null, 'update reads, writes and deletes in one step (' + JSON.stringify([r.upd, r.afterUpd]) + ')');
  ok(r.w1.ok && r.w1.rev === 1 && !r.w2.ok && r.w3.ok && r.w3.rev === 2, 'the library record is written only at the expected revision (' + JSON.stringify([r.w1, r.w2, r.w3]) + ')');
  ok(r.damagedGet === 'SyntaxError' && r.w4.unreadable && r.w5.ok && r.afterForce === 3, 'a damaged record is reported, not overwritten, until forced (' + JSON.stringify([r.damagedGet, r.w4, r.w5]) + ')');
  ok(r.deleted === undefined, 'a deleted record is gone');
  ok(r.leftoverListed && r.filesBeforeGrace.includes('leftover.zz.mp3'), 'a file no record uses goes on the list, and stays for now');
  ok(r.filesAfterGrace.length === 0, 'once the grace is over, unused files are removed (' + r.filesAfterGrace.join(', ') + ')');
  ok(r.nestedStill, 'files still in use are never removed');
  ok(r.keyRound && r.keySafe === '%0041bc%003a1%002e2', 'keys round-trip through file names (' + r.keySafe + ')');
  ok(JSON.stringify(r.cleared) === JSON.stringify([['libraryInfo'], []]), 'clear keeps only what\'s asked (' + JSON.stringify(r.cleared) + ')');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
