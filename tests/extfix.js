// Recordings kept under the extension their content calls for (2.5.048).
// Standardize's Opus/WebM files (no name, typed "audio/webm;codecs=opus")
// were kept as ".mp3", which the Mac's desktop app wouldn't play (kr37,
// 19 Nov 2026). Checked in the files store, in the browser's private file
// system and through the desktop app's handles (as readnames.js): a new
// recording gets its extension from what's inside; a known name that agrees
// is kept; content it can't tell keeps its name's or type's; a later change
// of details keeps the extension. (Recordings kept as ".mp3" before aren't
// renamed: kr37 would rather not carry one-time fixes.)
//   node extfix.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message)); p.on('console', m=>{ if(m.type() === 'error') console.log('console:', m.text()); });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  // The desktop app's shell, answered from the same private folders (as in readnames.js).
  await p.evaluate(()=>{
    const top = ()=> navigator.storage.getDirectory();
    const dirOf = async (root, path, create)=>{ let d = await (await top()).getDirectoryHandle(root, {create: true}); for(const part of (path ? path.split('/') : [])) d = await d.getDirectoryHandle(part, {create}); return d; };
    const split = (path)=>{ const parts = path.split('/'); return {dir: parts.slice(0, -1).join('/'), name: parts[parts.length - 1]}; };
    const statOf = async (root, path)=>{ if(!path) return {name: root, kind: 'directory', size: 0, modified: 0}; const {dir, name} = split(path); let d; try{ d = await dirOf(root, dir, false); }catch(e){ return null; }
      for await (const [n, h] of d.entries()) if(n === name){ if(h.kind === 'directory') return {name, kind: 'directory', size: 0, modified: 0}; const f = await h.getFile(); return {name, kind: 'file', size: f.size, modified: f.lastModified}; } return null; };
    window.__TAURI_INTERNALS__ = {invoke: async (cmd, args, opts)=>{
      if(cmd === 'fs_write'){ const root = decodeURIComponent(opts.headers['p37-root']), path = decodeURIComponent(opts.headers['p37-path']); const {dir, name} = split(path); const d = await dirOf(root, dir, true); const w = await (await d.getFileHandle(name, {create: true})).createWritable(); await w.write(args); await w.close(); return null; }
      const {root, path} = args;
      if(cmd === 'fs_stat') return statOf(root, path);
      if(cmd === 'fs_mkdir'){ await dirOf(root, path, true); return null; }
      if(cmd === 'fs_list'){ const d = await dirOf(root, path, false); const out = []; for await (const [n] of d.entries()) out.push(await statOf(root, path ? path + '/' + n : n)); return out.sort((a, b)=> a.name < b.name ? -1 : 1); }
      if(cmd === 'fs_read'){ const {dir, name} = split(path); const f = await (await (await dirOf(root, dir, false)).getFileHandle(name)).getFile(); return (args.start != null ? f.slice(args.start, args.end != null ? args.end : undefined) : f).arrayBuffer(); }
      if(cmd === 'fs_remove'){ if(!(await statOf(root, path))) return false; const {dir, name} = split(path); await (await dirOf(root, dir, false)).removeEntry(name, {recursive: !!args.recursive}); return true; }
      if(cmd === 'fs_rename'){ const a = split(args.from), b = split(args.to); const f = await (await (await dirOf(root, a.dir, false)).getFileHandle(a.name)).getFile(); const d = await dirOf(args.toRoot || root, b.dir, true); const w = await (await d.getFileHandle(b.name, {create: true})).createWritable(); await w.write(f); await w.close(); await (await dirOf(root, a.dir, false)).removeEntry(a.name); return null; }
      throw new Error('no such command: ' + cmd);
    }};
  });
  for(const mode of ['browser', 'desktop']){
    const r = await p.evaluate(async(mode)=>{
      const D = mode === 'desktop', name = 'extfix-' + mode;
      const top = await navigator.storage.getDirectory();
      await top.removeEntry(name, {recursive: true}).catch(()=>{});
      const tree = async ()=>{ const res = []; const walk = async (d, pre)=>{ for await (const [k, h] of d.entries()){ if(h.kind === 'directory') await walk(h, pre + k + '/'); else res.push(pre + k); } }; await walk(await top.getDirectoryHandle(name), ''); return res.sort(); };
      const paths = {w: 'Zoom/Festival/01 Talk', n: 'Tharpa/Prayers/02 Named', m: 'Tharpa/Prayers/03 Real mp3', j: 'Odd/Thing/04 Unknown', a: 'Odd/Thing/05 Aiff'};
      const st = (D ? window.__fs.makeNamedDesktop : window.__fs.makeNamed)(name, paths);
      const webm = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, ...new Array(60).fill(7)]);
      const ftyp = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20, ...new Array(40).fill(1)]);
      const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, ...new Array(40).fill(0)]);
      const aiff = new Uint8Array([...'FORM'].map(c=> c.charCodeAt(0)).concat([0, 0, 0, 40], [...'AIFF'].map(c=> c.charCodeAt(0)), new Array(40).fill(2)));
      await st.put('audio', {id: 'w', blob: new Blob([webm], {type: 'audio/webm;codecs=opus'}), rev: 1}); // as Standardize's recorder gives it
      await st.put('audio', {id: 'n', blob: new File([ftyp], 'downloaded.mp3', {type: 'audio/mpeg'}), rev: 1}); // a name that lies
      await st.put('audio', {id: 'm', blob: new Blob([id3], {type: 'audio/mpeg'}), rev: 1});
      await st.put('audio', {id: 'j', blob: new Blob(['not audio at all'], {type: 'audio/mpeg'}), rev: 1});
      await st.put('audio', {id: 'a', blob: new File([aiff], 'Take 5.aif', {type: 'audio/aiff'}), rev: 1});
      const out = {t1: await tree()};
      // A recording whose details then change keeps its corrected extension.
      paths.w = 'Zoom/Festival/01 Talk, Italian';
      out.typeW = (await st.get('audio', 'w')).blob.type;
      out.renamed = await st.renameRecordings();
      out.t5 = await tree();
      return out;
    }, mode);
    const M = '[' + mode + '] ', has = (t, x)=> t.includes(x);
    ok(has(r.t1, 'Zoom/Festival/01 Talk.webm'), M + "the recorder's WebM (no name, typed audio/webm;codecs=opus) is kept as .webm, not .mp3");
    ok(has(r.t1, 'Tharpa/Prayers/02 Named.m4a'), M + 'an M4A named .mp3 is kept as .m4a');
    ok(has(r.t1, 'Tharpa/Prayers/03 Real mp3.mp3'), M + 'an MP3 stays .mp3');
    ok(has(r.t1, 'Odd/Thing/04 Unknown.mp3'), M + "content it can't tell keeps its type's extension");
    ok(has(r.t1, 'Odd/Thing/05 Aiff.aif'), M + 'an AIFF named .aif keeps .aif (agrees with its content)');
    ok(String(r.typeW).startsWith('audio/webm'), M + "the WebM's record keeps its type: " + r.typeW);
    ok(r.renamed === 1 && has(r.t5, 'Zoom/Festival/01 Talk, Italian.webm'), M + 'a later change of details keeps the extension');
  }
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
