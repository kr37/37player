// Readable recording names in the files store (1.4.174; v2, Gen: "integral").
// Checked directly, in the browser's private file system: a recording is kept
// as Artist/Album/01 Title.ext, everything else in "37 Player's own files/";
// a clash gets " (2)"; a change of details moves it (and Undo moves it back),
// copying instead when a player holds it; an older library's recordings move
// out of audio/; an interrupted write is tidied, but nothing 37 Player didn't
// write is ever deleted; a change of capitals only is left alone.
//   node readnames.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('console', m=>{ if(m.type() === 'error') console.log('console:', m.text()); });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  const r = await p.evaluate(async()=>{
    const out = {}, top = await navigator.storage.getDirectory();
    const tree = async (name)=>{ const res = []; const walk = async (d, pre)=>{ for await (const [k, h] of d.entries()){ if(h.kind === 'directory') await walk(h, pre + k + '/'); else res.push(pre + k); } }; await walk(await top.getDirectoryHandle(name), ''); return res.sort(); };
    const ledger = async (name, own)=> JSON.parse(await (await (await (own ? await (await top.getDirectoryHandle(name)).getDirectoryHandle(own) : await top.getDirectoryHandle(name)).getFileHandle('orphans.json')).getFile()).text());
    const OWN = "37 Player's own files";
    out.pathFor = [window.__fs.pathFor({artist: 'Geshe Kelsang', album: 'Heart Jewel', trackNo: 3, name: 'Liberating Prayer'}),
      window.__fs.pathFor({artist: '', album: null, name: 'A/B: c? "d" <e> |f|.'}), window.__fs.pathFor({artist: 'CON', album: 'x'.repeat(100), trackNo: 0, name: ' '})];
    await top.removeEntry('rntest', {recursive: true}).catch(()=>{});
    const paths = {a: 'Tharpa/Prayers/01 Liberating Prayer', b: 'Tharpa/Prayers/01 Liberating Prayer'};
    let held = null;
    const st = window.__fs.makeNamed('rntest', paths, (id)=> id !== held);
    // 1. named, own files apart
    await st.put('audio', {id: 'a', blob: new Blob(['aaa'], {type: 'audio/mpeg'}), rev: 1});
    await st.put('audio', {id: 'b', blob: new Blob(['bbb'], {type: 'audio/mpeg'}), rev: 1});
    await st.put('state', {key: 'root', value: {x: 1}, rev: 1});
    out.t1 = await tree('rntest');
    out.read1 = [await (await st.get('audio', 'a')).blob.text(), await (await st.get('audio', 'b')).blob.text()];
    // 2. details change: moved; Undo: moved back
    paths.a = 'Tharpa/Prayers/01 Liberating Prayer (2026)';
    out.moved2 = await st.renameRecordings();
    out.t2 = await tree('rntest');
    out.read2 = await (await st.get('audio', 'a')).blob.text();
    paths.a = 'Tharpa/Heart Jewel/02 Prayer';
    await st.renameRecordings();
    out.t2b = await tree('rntest');
    paths.a = 'Tharpa/Prayers/01 Liberating Prayer (2026)';
    await st.renameRecordings();
    out.t2c = await tree('rntest');
    // 3. held by a player: copied, the old waits, a File read before still reads
    const before = (await st.get('audio', 'b')).blob;
    held = 'b'; paths.b = 'Tharpa/Prayers/02 Dedication';
    await st.renameRecordings(); held = null;
    out.t3 = await tree('rntest');
    out.read3 = [await (await st.get('audio', 'b')).blob.text(), await before.text().catch(e=> 'unreadable ' + e.name)];
    out.ledger3 = Object.keys(await ledger('rntest', OWN)).sort();
    // 4. re-tagging (a new version, same details): same name, written over
    await st.put('audio', {id: 'b', blob: new Blob(['bbb, re-tagged'], {type: 'audio/mpeg'}), rev: 2});
    out.t4 = await tree('rntest');
    out.read4 = await (await st.get('audio', 'b')).blob.text();
    // 5. capitals only: left alone
    paths.b = 'THARPA/prayers/02 dedication';
    out.moved5 = await st.renameRecordings();
    paths.b = 'Tharpa/Prayers/02 Dedication';
    // 6. tidy: an interrupted write (on the list, no record) goes after its day; files of the person's never do
    const oldDir = await (await (await top.getDirectoryHandle('rntest')).getDirectoryHandle('Tharpa', {create: true})).getDirectoryHandle('Lost', {create: true});
    await (await (await oldDir.getFileHandle('03 Interrupted.mp3', {create: true})).createWritable()).close();
    const mine = await (await (await top.getDirectoryHandle('rntest')).getDirectoryHandle('Tharpa')).getDirectoryHandle('Prayers');
    const wr = await (await mine.getFileHandle('my notes.txt', {create: true})).createWritable(); await wr.write('mine'); await wr.close();
    const L = await ledger('rntest', OWN); L['/Tharpa/Lost/03 Interrupted.mp3'] = 1; for(const k of Object.keys(L)) L[k] = 1; // everything's day is over
    const lw = await (await (await (await top.getDirectoryHandle('rntest')).getDirectoryHandle(OWN)).getFileHandle('orphans.json')).createWritable(); await lw.write(JSON.stringify(L)); await lw.close();
    await st.tidy();
    out.t6 = await tree('rntest');
    out.ledger6 = Object.keys(await ledger('rntest', OWN));
    out.read6 = [await (await st.get('audio', 'a')).blob.text(), await (await st.get('audio', 'b')).blob.text()];
    // 7. deleting a track: its recording waits, then goes, and the empty folders with it
    await st.del('audio', 'a');
    const L7 = await ledger('rntest', OWN); for(const k of Object.keys(L7)) L7[k] = 1;
    const lw7 = await (await (await (await top.getDirectoryHandle('rntest')).getDirectoryHandle(OWN)).getFileHandle('orphans.json')).createWritable(); await lw7.write(JSON.stringify(L7)); await lw7.close();
    await st.tidy();
    out.t7 = await tree('rntest');
    // 8. a library from before (state/ at the top, recordings in audio/): moved out, own files stay
    await top.removeEntry('rnold', {recursive: true}).catch(()=>{});
    const plain = window.__fs.make('rnold');
    await plain.put('state', {key: 'root', value: {}, rev: 1});
    await plain.put('audio', {id: 'c', blob: new Blob(['ccc'], {type: 'audio/mpeg'}), rev: 1});
    out.t8a = await tree('rnold');
    const named = window.__fs.makeNamed('rnold', {c: 'Someone/Something/Old one'});
    out.moved8 = await named.renameRecordings();
    out.t8 = await tree('rnold');
    out.read8 = await (await named.get('audio', 'c')).blob.text();
    return out;
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 3000));
  ok(r.pathFor[0] === 'Geshe Kelsang/Heart Jewel/03 Liberating Prayer', 'a recording\'s path: ' + r.pathFor[0]);
  ok(r.pathFor[1] === 'Unknown Artist/Unknown Album/A-B- c- -d- -e- -f-', 'what folders refuse becomes "-", trailing dots go: ' + r.pathFor[1]);
  ok(/^CON_\//.test(r.pathFor[2]) && r.pathFor[2].split('/')[1].length === 80 && r.pathFor[2].endsWith('/Untitled'), 'Windows device names, long names, empty names: ' + r.pathFor[2]);
  ok(r.t1.includes('Tharpa/Prayers/01 Liberating Prayer.mp3') && r.t1.includes('Tharpa/Prayers/01 Liberating Prayer (2).mp3') && r.t1.some(x=> x.startsWith("37 Player's own files/audio/")) && r.t1.some(x=> x.startsWith("37 Player's own files/state/")) && !r.t1.some(x=> /^(audio|state)\//.test(x)), 'readable names, a clash gets " (2)", own files apart');
  ok(r.read1[0] === 'aaa' && r.read1[1] === 'bbb', 'and they read back');
  ok(r.moved2 === 1 && r.t2.includes('Tharpa/Prayers/01 Liberating Prayer (2026).mp3') && !r.t2.includes('Tharpa/Prayers/01 Liberating Prayer.mp3') && r.read2 === 'aaa', 'a change of details moves the recording');
  ok(r.t2b.includes('Tharpa/Heart Jewel/02 Prayer.mp3') && r.t2c.includes('Tharpa/Prayers/01 Liberating Prayer (2026).mp3') && !r.t2c.some(x=> x.startsWith('Tharpa/Heart Jewel/')), 'to another album and back (Undo), the emptied album folder gone');
  ok(r.t3.includes('Tharpa/Prayers/02 Dedication.mp3') && r.t3.includes('Tharpa/Prayers/01 Liberating Prayer (2).mp3') && r.read3[0] === 'bbb' && r.read3[1] === 'bbb', 'one a player holds is copied, and the player\'s file still reads');
  ok(r.ledger3.includes('/Tharpa/Prayers/01 Liberating Prayer (2).mp3'), 'the old copy waits its day');
  ok(r.t4.includes('Tharpa/Prayers/02 Dedication.mp3') && !r.t4.includes('Tharpa/Prayers/02 Dedication (2).mp3') && r.read4 === 'bbb, re-tagged', 're-tagging keeps the name');
  ok(r.moved5 === 0, 'a change of capitals only is left alone');
  ok(!r.t6.some(x=> x.startsWith('Tharpa/Lost/')) && !r.t6.includes('Tharpa/Prayers/01 Liberating Prayer (2).mp3') && r.t6.includes('Tharpa/Prayers/my notes.txt'), 'tidying: an interrupted write and the old copy go, a file of the person\'s stays');
  ok(r.ledger6.length === 0 && r.read6[0] === 'aaa' && r.read6[1] === 'bbb, re-tagged', 'and recordings in use come off the list, still reading');
  ok(!r.t7.some(x=> x.includes('Liberating Prayer (2026)')) && r.t7.includes('Tharpa/Prayers/my notes.txt'), 'a deleted track\'s recording goes after its day');
  ok(r.t8a.some(x=> /^audio\/c\..*\.mp3$/.test(x)) && r.moved8 === 1 && r.t8.includes('Someone/Something/Old one.mp3') && r.t8.some(x=> x === 'state/root.json') && !r.t8.some(x=> x.startsWith("37 Player's own files")) && r.read8 === 'ccc', 'a library from before: recordings moved out of audio/, its own files where they were');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
