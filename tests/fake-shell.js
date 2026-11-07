// A stand-in for the desktop app's shell (desktop/src-tauri), for running the
// page as the desktop app with bridge 2 in Chrome: STORE=desktop python3
// make-debug-copy.py puts this at the top of the test copy's <head>.
// Folders live in the browser's private file system (OPFS) under
// "fake-shell/", each root a folder there; roots.json is a file beside them.
// device.json is kept in localStorage under "__fakeDevice" (a test that
// empties storage the way CCleaner would keeps the keys starting "__").
// Commands: fs_* (files.rs), p37_shell_info, p37_device_get/put, the page
// update commands (no updates), p37_quit.
(function(){
  if(window.__TAURI_INTERNALS__) return; // put in twice (a test that brings its own, run with STORE=desktop)
  window.__p37Bridge = 2;
  // Every file read where it lies (a DiskBlob), however small, so the tests
  // find each place that needs a real Blob (DISK_BLOB_MIN; FILES-DESIGN).
  if(window.__diskBlobMin == null) window.__diskBlobMin = 0;
  try{ window.__p37Device = JSON.parse(localStorage.getItem('__fakeDevice') || 'null'); }catch(e){ window.__p37Device = null; }
  const top = async ()=> (await navigator.storage.getDirectory()).getDirectoryHandle('fake-shell', {create: true});
  const readRoots = async ()=>{ try{ return JSON.parse(await (await (await (await top()).getFileHandle('roots.json')).getFile()).text()); }catch(e){ return {}; } };
  const writeRoots = async (r)=>{ const w = await (await (await top()).getFileHandle('roots.json', {create: true})).createWritable(); await w.write(JSON.stringify(r)); await w.close(); };
  const parts = (p)=> (p || '').split('/').filter(Boolean);
  const checkRel = (p)=>{ for(const x of parts(p)) if(x === '..' || x === '.') throw new Error('outside the folder: ' + p); };
  const baseOf = async (root)=>{ const r = await readRoots(); if(!(root in r)) throw new Error('not a folder on the list: ' + root); let d = await top(); for(const x of parts(r[root])) d = await d.getDirectoryHandle(x, {create: true}); return d; };
  const dirOf = async (root, path, create)=>{ checkRel(path); let d = await baseOf(root); for(const x of parts(path)) d = await d.getDirectoryHandle(x, {create}); return d; };
  const split = (path)=>{ const p = parts(path); return {dir: p.slice(0, -1).join('/'), name: p[p.length - 1]}; };
  const statOf = async (root, path)=>{
    if(!parts(path).length) return {name: root, kind: 'directory', size: 0, modified: 0};
    const {dir, name} = split(path); let d; try{ d = await dirOf(root, dir, false); }catch(e){ return null; }
    try{ const f = await (await d.getFileHandle(name)).getFile(); return {name, kind: 'file', size: f.size, modified: f.lastModified}; }catch(e){}
    try{ await d.getDirectoryHandle(name); return {name, kind: 'directory', size: 0, modified: 0}; }catch(e){}
    return null;
  };
  const fileOf = async (root, path)=>{ const {dir, name} = split(path); return (await (await dirOf(root, dir, false)).getFileHandle(name)).getFile(); };
  const writeFile = async (root, path, data, adding)=>{ const {dir, name} = split(path); const d = await dirOf(root, dir, true); const fh = await d.getFileHandle(name, {create: true}); const w = await fh.createWritable({keepExistingData: !!adding}); if(adding) await w.seek((await fh.getFile()).size); await w.write(data); await w.close(); };
  const folderName = (n)=> (n || '').replace(/[\/\\:*?"<>|]/g, '-').trim() || 'My library';
  window.__fakeShellCalls = [];
  const invoke = async (cmd, args, opts)=>{
    window.__fakeShellCalls.push(cmd);
    args = args || {};
    switch(cmd){
      case 'p37_shell_info': return {version: '2.0.000', bridge: 2, pages: false, device: true};
      case 'p37_device_get': return JSON.parse(localStorage.getItem('__fakeDevice') || '{}');
      case 'p37_device_put': localStorage.setItem('__fakeDevice', JSON.stringify(args.values || {})); return null;
      case 'p37_page_info': return {running: '', bundled: '', ready: null, reverted: null, channel: 'test', enabled: false};
      case 'p37_page_ok': case 'p37_quit': return null;
      case 'fs_roots': return readRoots();
      case 'fs_root_default': {
        const r = await readRoots(), base = 'Music/37 Player Libraries/' + folderName(args.name);
        let p = base, n = 2; const taken = new Set(Object.values(r));
        while(taken.has(p)) p = base + ' (' + (n++) + ')';
        r[args.id] = p; await writeRoots(r); await dirOf(args.id, '', true); return p;
      }
      case 'fs_root_forget': { const r = await readRoots(); delete r[args.id]; await writeRoots(r); return null; }
      case 'fs_write': { const root = decodeURIComponent(opts.headers['p37-root']), path = decodeURIComponent(opts.headers['p37-path']); checkRel(path); await writeFile(root, path, args, opts.headers['p37-append'] === '1'); window.__fakeShellWrites = (window.__fakeShellWrites || 0) + 1; window.__fakeShellBiggestWrite = Math.max(window.__fakeShellBiggestWrite || 0, args.byteLength || args.length || 0); return null; }
      case 'fs_stat': return statOf(args.root, args.path);
      case 'fs_mkdir': await dirOf(args.root, args.path, true); return null;
      case 'fs_list': { const d = await dirOf(args.root, args.path, false), out = []; for await (const [n] of d.entries()){ const st = await statOf(args.root, args.path ? args.path + '/' + n : n); if(st) out.push(st); } return out.sort((a, b)=> a.name < b.name ? -1 : 1); }
      case 'fs_read': { const f = await fileOf(args.root, args.path); const s = args.start || 0, e = args.end == null ? f.size : Math.min(args.end, f.size); return f.slice(s, e).arrayBuffer(); }
      case 'fs_remove': { if(!(await statOf(args.root, args.path))) return false; const {dir, name} = split(args.path); await (await dirOf(args.root, dir, false)).removeEntry(name, {recursive: !!args.recursive}); return true; }
      case 'fs_rename': case 'fs_copy': {
        const toRoot = args.toRoot || args.to_root || args.root;
        if(cmd === 'fs_copy' && !args.replace && await statOf(toRoot, args.to)) throw new Error('already there: ' + args.to);
        await writeFile(toRoot, args.to, await fileOf(args.root, args.from));
        if(cmd === 'fs_rename'){ const a = split(args.from); await (await dirOf(args.root, a.dir, false)).removeEntry(a.name); }
        return null;
      }
    }
    throw new Error('no such command in the stand-in shell: ' + cmd);
  };
  window.__TAURI_INTERNALS__ = {invoke};
  window.__TAURI__ = {core: {invoke, convertFileSrc: (path, scheme)=> scheme + '://localhost/' + path}, event: {listen: async ()=> ()=>{}}};
  // Reading a file by address (p37lib://localhost/<root>/<path>), as the
  // shell serves it: the stand-in hands the page the file itself.
  window.__p37FileUrl = async (root, path)=> URL.createObjectURL(await fileOf(root, path));
  window.__fakeShell = {readRoots, fileOf, statOf};
})();
