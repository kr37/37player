// The converter's worker (a background thread): loads ffmpeg.wasm and runs one
// conversion at a time. A classic worker, not a module, so older Safari runs
// it too. The input file is never copied into memory: it's mounted read-only
// (WORKERFS) and ffmpeg reads it in place, a piece at a time. Only the output
// is in memory, and it's handed back to the page when finished.
//
// Messages in:  {type:"load", coreURL, wasmURL}
//               {type:"convert", file, args, outName}   (args use /in/<file.name> and /out/<outName>)
//               {type:"probe", file}
// Messages out: {type:"loaded", ms}  {type:"log", message}  {type:"progress", time}
//               {type:"done", ret, out, heap, ms, log}     {type:"error", message}
let core = null;
let logLines = [];
// The wasm memory's present size. Module.HEAPU8 isn't always updated when
// the memory grows, so the Memory object itself is found and asked.
function heapBytes(){
  try{
    for(const v of Object.values(core.asm || core.wasmExports || {})) if(v instanceof WebAssembly.Memory) return v.buffer.byteLength;
  }catch(e){}
  return core && core.HEAPU8 ? core.HEAPU8.byteLength : null;
}
function keepLog(message){
  logLines.push(message);
  if(logLines.length > 400) logLines.splice(0, 200);
}
self.onmessage = async ({data})=>{
  try{
    if(data.type === "load"){
      const began = performance.now();
      importScripts(data.coreURL);
      core = await self.createFFmpegCore({
        // ffmpeg.wasm's own way of telling the core where its .wasm file is.
        mainScriptUrlOrBlob: data.coreURL + "#" + btoa(JSON.stringify({wasmURL: data.wasmURL, workerURL: ""})),
      });
      core.setLogger(({message})=>{ keepLog(message); self.postMessage({type: "log", message}); });
      core.setProgress(({time})=> self.postMessage({type: "progress", time}));
      self.postMessage({type: "loaded", ms: performance.now() - began, heap: heapBytes()});
      return;
    }
    if(!core) throw new Error("The converter isn't loaded yet");
    if(data.type === "convert" || data.type === "probe"){
      const began = performance.now();
      logLines = [];
      try{ core.FS.mkdir("/in"); }catch(e){}
      try{ core.FS.mkdir("/out"); }catch(e){}
      core.FS.mount(core.FS.filesystems.WORKERFS, {files: [data.file]}, "/in");
      let ret, out = null;
      try{
        if(data.type === "probe"){
          core.exec("-hide_banner", "-i", "/in/" + data.file.name);
          ret = core.ret;
          core.reset();
        } else {
          core.exec(...data.args);
          ret = core.ret;
          core.reset();
          if(ret === 0){
            const bytes = core.FS.readFile("/out/" + data.outName);
            out = bytes.buffer.byteLength === bytes.byteLength ? bytes.buffer : bytes.slice().buffer;
          }
          try{ core.FS.unlink("/out/" + data.outName); }catch(e){}
        }
      } finally {
        core.FS.unmount("/in");
      }
      const msg = {type: "done", ret, out, ms: performance.now() - began, heap: heapBytes(), log: logLines.slice(-60)};
      self.postMessage(msg, out ? [out] : []);
    }
  }catch(err){
    self.postMessage({type: "error", message: String(err && err.message || err), log: logLines.slice(-60)});
  }
};
