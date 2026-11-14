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
  // A new stand-in starts with the libraries' place chosen (the tests that
  // ask it set __fakeShellNoPlace first).
  const readRoots = async ()=>{ try{ return JSON.parse(await (await (await (await top()).getFileHandle('roots.json')).getFile()).text()); }catch(e){ return window.__fakeShellNoPlace ? {} : {place: 'Music/37 Player Libraries'}; } };
  const writeRoots = async (r)=>{ const w = await (await (await top()).getFileHandle('roots.json', {create: true})).createWritable(); await w.write(JSON.stringify(r)); await w.close(); };
  const parts = (p)=> (p || '').split('/').filter(Boolean);
  const checkRel = (p)=>{ for(const x of parts(p)) if(x === '..' || x === '.') throw new Error('outside the folder: ' + p); };
  const baseOf = async (root)=>{ const r = await readRoots(); if(!(root in r)) throw new Error('not a folder on the list: ' + root); let d = await top(); for(const x of parts(r[root])){ try{ d = await d.getDirectoryHandle(x); }catch(e){ throw new Error('the folder of ' + root + ' is gone'); } } return d; }; // (as files.rs: a root that's gone isn't made again)
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
  const DEFAULT_PLACE = 'Music/37 Player Libraries';
  const pathDir = async (p, create)=>{ try{ let d = await top(); for(const x of parts(p)) d = await d.getDirectoryHandle(x, {create: !!create}); return d; }catch(e){ return null; } };
  const markerOf = async (d)=>{ try{ const m = JSON.parse(await (await (await d.getFileHandle('37 Player library.json')).getFile()).text()); return m && m.format === '37player-library' && /^[A-Za-z0-9_-]{1,40}$/.test(m.id) ? {id: m.id, name: m.name || ''} : null; }catch(e){ return null; } };
  const folderName = (n)=> (n || '').replace(/[\/\\:*?"<>|]/g, '-').trim() || 'My library';
  window.__fakeShellCalls = []; window.__fakeShellPaths = [];
  const invoke = async (cmd, args, opts)=>{
    window.__fakeShellCalls.push(cmd);
    window.__fakeShellPaths.push(cmd + ' ' + ((args && (args.path || args.from)) || '')); // which file, for tests that count reads of one file
    args = args || {};
    switch(cmd){
      case 'p37_shell_info': return {version: '2.0.000', bridge: 2, pages: false, device: true, updates: !!window.__fakeShellUpdates, zoom: !!window.__fakeShellZoom, files_http: window.__fakeFilesHttp || null};
      // The Size setting, by the shell (2.4.000): what it was asked for is kept for the test.
      case 'p37_zoom': if(!window.__fakeShellZoom) throw new Error('unknown command'); (window.__fakeZooms = window.__fakeZooms || []).push(args.scale); return null;
      // The shell updating itself (shellupd.js): window.__fakeShellUpdates = {version, current} or null (none).
      case 'p37_shell_update_check': return window.__fakeShellUpdates ? (window.__fakeShellUpdates.version ? window.__fakeShellUpdates : null) : Promise.reject('not this shell');
      case 'p37_shell_update_install': window.__fakeShellInstalled = (window.__fakeShellInstalled || 0) + 1; return null;
      case 'p37_device_get': return JSON.parse(localStorage.getItem('__fakeDevice') || '{}');
      case 'p37_device_put': localStorage.setItem('__fakeDevice', JSON.stringify(args.values || {})); return null;
      case 'p37_page_info': return {running: '', bundled: '', ready: null, reverted: null, channel: 'test', enabled: false};
      case 'p37_page_ok': case 'p37_quit': return null;
      case 'fs_roots': return readRoots();
      case 'fs_root_default': {
        const r = await readRoots(), base = (r.place || DEFAULT_PLACE) + '/' + folderName(args.name);
        let p = base, n = 2; const taken = new Set(Object.values(r));
        while(taken.has(p) || await pathDir(p)) p = base + ' (' + (n++) + ')';
        await pathDir(p, true); r[args.id] = p; await writeRoots(r); return p;
      }
      // The libraries' place (files.rs, step 4); the system's dialog is
      // window.__fakeShellPick: a path under fake-shell/, or null (cancelled).
      case 'fs_place': { const r = await readRoots(); return {path: r.place || DEFAULT_PLACE, chosen: 'place' in r}; }
      case 'fs_place_default': { const r = await readRoots(); r.place = DEFAULT_PLACE; await writeRoots(r); await pathDir(DEFAULT_PLACE, true); return DEFAULT_PLACE; }
      case 'fs_root_choose': {
        const pick = window.__fakeShellPick; window.__fakeShellPicked = (window.__fakeShellPicked || 0) + 1;
        if(pick == null) return null;
        const r = await readRoots(); r[args.id] = pick; await writeRoots(r); await pathDir(pick, true); return pick;
      }
      // A folder used in place: where, there now, on another drive (Volumes/…).
      case 'fs_root_info': { const r = await readRoots(); if(!(args.id in r)) throw new Error('no folder called ' + args.id + ' on the list'); return {path: r[args.id], present: !!(await pathDir(r[args.id])), other_drive: /^Volumes\//.test(r[args.id])}; }
      // A library's folder follows its name (files.rs renamed_path).
      case 'fs_root_rename': {
        if(!/^lib-/.test(args.id)) throw new Error("only a library's folder");
        const r = await readRoots(), cur = r[args.id];
        if(cur == null) throw new Error('no folder called ' + args.id + ' on the list');
        const segs = parts(cur), base = segs.pop(), parentPath = segs.join('/'), want = folderName(args.name);
        const bare = base.replace(/ \(\d+\)$/, '');
        if(bare === want) return cur;
        // Not beside a copy of the same library that has the name (2.2.041).
        { const other = await pathDir((parentPath ? parentPath + '/' : '') + want), om = other && await markerOf(other); if(om && om.id === args.id.slice(4) && (parentPath ? parentPath + '/' : '') + want !== cur) return cur; }
        let to = (parentPath ? parentPath + '/' : '') + want, n = 2;
        if(base.toLowerCase() !== want.toLowerCase()) while(await pathDir(to)) to = (parentPath ? parentPath + '/' : '') + want + ' (' + (n++) + ')';
        const copy = async (from, into)=>{ for await (const [nm, h] of from.entries()){ if(h.kind === 'directory') await copy(h, await into.getDirectoryHandle(nm, {create: true})); else { const w = await (await into.getFileHandle(nm, {create: true})).createWritable(); await w.write(await h.getFile()); await w.close(); } } };
        const src = await pathDir(cur), parent = await pathDir(parentPath);
        const tmp = await parent.getDirectoryHandle('.renaming', {create: true});
        await copy(src, tmp); await parent.removeEntry(base, {recursive: true});
        await copy(tmp, await pathDir(to, true)); await parent.removeEntry('.renaming', {recursive: true});
        r[args.id] = to; await writeRoots(r); return to;
      }
      case 'fs_root_show': { const r = await readRoots(); if(!(args.id in r)) throw new Error('no folder called ' + args.id + ' on the list'); window.__fakeShellShown = r[args.id]; return null; }
      // files.rs places_to_restore: the library's own record names its folders.
      case 'fs_places_restore': {
        const r = await readRoots(), libId = args.id.replace(/^lib-/, ''), lib = r[args.id];
        let rec = null;
        for(const at of [lib + "/37 Player's own files/state/places.json", lib + '/state/places.json']){ const segs = parts(at), nm = segs.pop(); const d = await pathDir(segs.join('/')); if(d){ try{ rec = JSON.parse(await (await (await d.getFileHandle(nm)).getFile()).text()); break; }catch(e){} } }
        let n = 0;
        for(const e of (rec && rec.value) || []){ if(!String(e.root).startsWith('in-' + libId + '-') || (r[e.root] && await pathDir(r[e.root])) || !(await pathDir(e.label))) continue; r[e.root] = e.label; n++; }
        await writeRoots(r); return n;
      }
      case 'fs_remove_if_empty': {
        const r = await readRoots(); if(!(args.id in r)) throw new Error('no folder called ' + args.id + ' on the list');
        const empty = async d=>{ for await (const [nm, h] of d.entries()){ if(h.kind === 'directory'){ if(!(await empty(h))) return false; } else if(!/^(\.ds_store|thumbs\.db|desktop\.ini|\._.*)$/i.test(nm)) return false; } return true; };
        const d = await pathDir(r[args.id]); if(!d || !(await empty(d))) return false;
        if(!args.dry){ const segs = parts(r[args.id]), nm = segs.pop(); await (await pathDir(segs.join('/'))).removeEntry(nm, {recursive: true}); delete r[args.id]; await writeRoots(r); }
        return true;
      }
      case 'fs_find_libraries': {
        const r = await readRoots(), base = r.place || DEFAULT_PLACE, d = await pathDir(base), out = [];
        if(d) for await (const [n, h] of d.entries()){
          if(h.kind !== 'directory') continue;
          const pth = base + '/' + n, m = await markerOf(h);
          // __fakeReadOnly: folders that can't be saved in; __fakeChanged: when each library record last changed.
          if(m) out.push({id: m.id, name: m.name, path: pth, writable: !(window.__fakeReadOnly || []).includes(pth), changed: (window.__fakeChanged || {})[pth] || 1});
        }
        out.sort((a, b)=> a.path < b.path ? -1 : 1);
        for(const f of out){
          const rid = 'lib-' + f.id; if(rid in r && await pathDir(r[rid])) continue;
          // Of copies: one that can be saved in, then the newest (as files.rs best_copy).
          const best = out.filter(g=> g.id === f.id).reduce((a, g)=> (g.writable - a.writable || g.changed - a.changed) > 0 ? g : a);
          r[rid] = best.path;
        }
        await writeRoots(r); return out;
      }
      case 'fs_root_use_found': {
        const r = await readRoots(), base = r.place || DEFAULT_PLACE;
        if(!String(args.path).startsWith(base + '/') || String(args.path).slice(base.length + 1).includes('/')) throw new Error("not a folder in the libraries' place");
        const d = await pathDir(args.path), m = d && await markerOf(d);
        if(!m || m.id !== args.id) throw new Error("not that library's folder");
        r['lib-' + args.id] = args.path; await writeRoots(r); return null;
      }
      case 'fs_root_choose_library': {
        const pick = window.__fakeShellPick; window.__fakeShellPicked = (window.__fakeShellPicked || 0) + 1;
        if(pick == null) return null;
        const d = await pathDir(pick), m = d && await markerOf(d);
        if(!m) throw new Error('not a library folder');
        const r = await readRoots(); r['lib-' + m.id] = pick; await writeRoots(r); return {id: m.id, name: m.name, path: pick};
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
