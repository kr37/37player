// Test hooks, put into a TEST COPY of 37-player.html by make-debug-copy.py
// (never into the real file). Top-level functions in the app aren't on
// `window`, so tests reach them through these.
window.__dbg = {getRoot:()=>root, saveState, bulkImportFolder, setMode:(m)=>{appMode=m; applyAppMode();}, editPl:(id)=>{editingPlaylistId=id; renderEditorScreen();}, render:()=>renderPlayer(), disp:(th,mc)=>{ root.settings.theme=th; root.settings.moreContrast=mc; applyDisplaySettings(); }};
window.__dbg3 = {put: (s,v)=>idbPut(s,v),
  // joins, pressing the last step's "Do it now" itself (the size to confirm,
  // or Everything / Only what I choose), but never answering Use the shared
  // library / Combine / Only what I choose: tests choose that with __radio
  join: async (u,c,n,o)=>{ const pr = joinSharedLibrary(u,c,n,o); const iv = setInterval(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>(b.textContent.trim()==='Do it now' || b.textContent.trim()==='Join') && !/Combine them/.test(b.closest('.modal').innerText)); if(b){ window.__joinDialog = b.closest('.modal').innerText; b.click(); } }, 150); try{ return await pr; } finally { clearInterval(iv); } },
  fetchNow: sharedFetchTracksNow, missing: sharedTrackMissing, review: openSharedReview, rvState: ()=>sharedReviewState,
  sync: (o)=>runSharedSync(Object.assign({force:true},o||{})), status: ()=>sharedStatus, pending: ()=>sharedPending,
  leave: leaveSharedLibrary, render: renderSharedSection, awake: sharedAwakeStart, awakeOn: ()=>!!sharedAwake};
window.__dbg4 = {settings: openSettingsPage, help: openHelpPage, section: goToSettingsSection};
window.__rv = {rows: syncReviewRows, classify: (r,m)=>syncClassifyPartial(r,m,new Set()), def: syncDefaultChoice, set: (st)=>{ const page=document.createElement("div"); page.id="reviewPage"; page.className="settings-page rv-page"; placeOverlayPage(page, closeSharedReview); page.innerHTML='<div class="rv-scroll" id="rvScroll"></div><div class="rv-foot" id="rvFoot"></div>'; document.body.appendChild(page); sharedReviewState=st; renderSharedReview(); }};
window.__aa = {analyze: analyzeAudio};
// files this browser can't play (conv.js)
window.__conv = {importFiles, recheck: recheckStoredAudio, cantPlay: trackCantPlay, describe: describeFormatProblem,
  convert: (ids)=>convertTracks(ids), state: ()=>({queue: convertQueue.slice(), running: convertRunning, worker: !!converterWorker, bar: activeOperation && activeOperation.text}), stored: ()=>converterStored().then(r=>!!r), libPreview: (id)=>playLibraryPreview(id), overlay: (id)=>openPlaylistOverlay(id),
  musicEntries: (ids, convert)=>buildMusicEntries(new Set(ids), null, {convert: !!convert}), dropOriginal: (id)=>dropKeptOriginal(findLibraryTrack(id)), policy: ()=>formatPolicy(), matches: (id)=>trackMatchesPolicy(findLibraryTrack(id))};
// No quiet converter download 20 s after opening, unless a test asks for it.
window.__noAutoConverter = true;
// playback
window.__play = (id)=>playItem(id);
window.__pause = ()=> togglePlay();
window.__aud = ()=>({src: audioEl.src, paused: audioEl.paused, t: audioEl.currentTime});
window.__st = ()=>({src: audioEl.src, paused: audioEl.paused, t: audioEl.currentTime, d: audioEl.duration,
  bridge: playBridge, ka: silentKeepAliveEl ? !silentKeepAliveEl.paused : null, sil: silenceState.active, cur: currentItemId,
  ms: navigator.mediaSession && navigator.mediaSession.playbackState, hold: loopHold, stopHold, pauseHold,
  title: navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title,
  artist: navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.artist});
window.__log = ()=>playLogLines.slice();
window.__editStop = (it)=> openEditStopItem(it);
// screen-off syncing
window.__aw = ()=> !!sharedAwake;
window.__awk = ()=>{ sharedAwakeStart(); renderSharedAwakeRow(); };
window.__awkState = ()=> !!sharedAwake;
window.__srv = ()=> sharedServerVersion;
// analysis, waveforms, versions
window.__an = analyzeAudio;
window.__wav = analyzeWavInPieces;
window.__pieces = async (u)=> analyzeMp3InPieces(typeof u === "string" ? await (await fetch(u)).blob() : u);
window.__start = async (u)=> mp3AudioStart(await (await fetch(u)).blob());
window.__lob = async (b)=>{ const c=new OfflineAudioContext(1,1,44100); const buf=await c.decodeAudioData(await b.arrayBuffer()); return {l: await loudnessOfBuffer(buf), p: await computePeaksAsync(buf.getChannelData(0), PEAK_BUCKETS), d: buf.duration}; };
window.__repair = (id)=> repairStandInPeaks(findLibraryTrack(id));
window.__flat = (id)=> isStandInPeaks(findLibraryTrack(id).peaks);
window.__setPeaks = (id)=>{ findLibraryTrack(id).peaks = Array.from({length:720}, (_, i)=> (i%7)/7); };
window.__slog = ()=> sharedLogLines.slice(-3);
window.__ver = versionFromHtml;
// libraries on one device (libs.js)
window.__lib = {id: ()=> LIBRARY_ID, list: readLibraryList, create: createLibrary, switchTo: switchLibrary, del: deleteLibrary, rename: renameLibrary,
  converter: ()=> converterStored().then(r=> !!r), putConverter: ()=> mainStatePut({key: "converter", version: "t", js: new Blob(["x"]), wasm: new Blob(["y"]), size: 2, at: Date.now()}),
  name: currentLibraryName, popover: openLibraryPopover};
// the welcome (welcome.js)
window.IMPORT_ACCEPT_FOR_TEST = IMPORT_ACCEPT;
window.backupInfoForTest = ()=> backupInfo;
// shared library as the backup (share.js)
window.__share = {offer: (meta)=> offerNativeImport(meta, {}, {}, null, {backupRestore: true}), meta: ()=> buildNativeMeta({type: "library"}).meta,
  prompt: backupPromptNeeded, covered: sharedCoversLibrary, keepers: ()=> root.backupKeepers, keeperLines,
  noteKept: ()=>{ root.backupKeepers = Object.assign({}, root.backupKeepers, {[sharedConfig().deviceName]: Date.now()}); return saveState(); },
  label: ()=> document.getElementById("btnBackup").textContent, setup: ()=> backupInfo.setupDone};
window.__share.manualBackup = downloadManualBackup; window.__share.manualPlan = manualBackupPlan;
window.__share.missingNote = ()=> sharedMissingNote({waiting: false, from: "Laptop"});
window.openImportExportForTest = openImportExportDialog;
window.__choose = {open: openSharedChoose, markAllSeen: sharedMarkAllSeen, cfg: ()=> sharedConfig()};
window.__drive = {fetch: (params, init)=> driveFetch(sharedConfig(), params, init || {}), doc: ()=> sharedDocFromLibrary()};
// the move to 37player.com (moved.js)
window.__moved = {to: ()=> MOVED_TO, newAddress: newAddressFor, open: openMovedDialog,
  setShared: (cfg)=>{ root.settings.sharedLibrary = cfg; }};
// re-tagging on Safari (webkitstore.js)
window.__wk = {rewrite: rewriteFileTagsIfPossible, stored: async (id)=>{ const r = await idbGet("audio", id); return r ? {size: r.blob.size, read: (await r.blob.arrayBuffer()).byteLength, type: r.blob.type} : null; }, tags: async (id)=>{ const r = await idbGet("audio", id); return parseAudioTags(r.blob); }};
// damaged stored files (damaged.js)
window.__dmg = {ids: ()=> [...damagedAudio.ids], get: async (id)=> (await idbGet("audio", id)).blob, salvage: salvageOldFile, skipped: ()=> zipSkipped.slice(),
  zip: (entries)=> buildZipBlob(entries),
  // This browser stores files properly, so "damaged" is pretended: a stored
  // WAV whose second RIFF header starts at byte 12 (the Safari pattern).
  pretend: ()=>{ storedAudioDamaged = async (id)=>{ const r = await idbGet("audio", id); if(!r || !r.blob) return false; const h = new Uint8Array(await r.blob.slice(0, 16).arrayBuffer()); return String.fromCharCode(...h.subarray(12, 16)) === "RIFF"; }; }};
window.__starter = {just: ()=> libraryIsJustStarter(), check: (meta)=> checkRestoreAgainstLibrary(meta), label: ()=> { const b = document.getElementById("btnBackup"); return b.style.display === "none" ? "" : b.textContent; }, update: ()=> updateBackupIndicator()};
// files opened with 37 Player (openwith.js)
window.__open = {take: (files)=> takeOpenedFiles(files), lastImport: ()=> [...(lastImportIds() || [])], preview: ()=> libPreviewTrackId};
// the converter crashing once (conv5.js): the next conversion throws as ffmpeg.wasm did
window.__crashNext = ()=>{ const real = converterConvert; let once = true; converterConvert = async (...a)=>{ if(once){ once = false; throw new Error("memory access out of bounds"); } return real(...a); }; };
window.__hold = ()=> sharedTransferHold(); window.__opbar = (on)=>{ if(on) setActiveOperationProgress("Sending 3 of 9", null); else clearActiveOperation(); };
window.__lib.newDialog = ()=> openNewLibraryDialog();
// exporting files unzipped (exportfile.js)
window.__exp = {select: (ids)=>{ appMode = "library"; applyAppMode(); libSelectedTracks.clear(); ids.forEach(i=> libSelectedTracks.add(i)); }, dialog: ()=> openExportDialog()};
// the radio-button decision dialogs (askRadio): pick by label, press its button
window.__radio = (labelRe)=>{ const re = new RegExp(labelRe); const l = [...document.querySelectorAll('#askRadios label')].find(x=> re.test(x.querySelector('strong').textContent)); if(!l) return false; l.querySelector('input').checked = true; document.getElementById('askGo').click(); return true; };
window.__radioChecked = ()=> document.querySelector('#askRadios input:checked')?.closest('label').querySelector('strong').textContent || '';
