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
  convert: (ids)=>convertTracks(ids), state: ()=>({queue: convertQueue.slice(), running: convertRunning, worker: !!converterWorker, bar: activeOperation && activeOperation.text}), stored: ()=>converterStored().then(r=>!!r), libPreview: (id)=>playLibraryPreview(id), overlay: (id)=>openPlaylistOverlay(id), put: (js, wasm, version)=> mainStatePut({key: "converter", version, js, wasm, size: js.size + wasm.size, at: Date.now()}).then(()=>{ converterRecCache = undefined; converterRefetched = false; }), version: ()=> converterStored().then(r=> r && r.version), stop: ()=> converterStop(), garbleProbes: (n)=>{ const real = window.__realConverterAsk || (window.__realConverterAsk = converterAsk); let left = n; converterAsk = (msg)=>{ if(left > 0 && msg && msg.file && !msg.outName){ left--; msg = Object.assign({}, msg, {file: new File([new Uint8Array(msg.file.size).fill(0x5a)], msg.file.name)}); } return real(msg); }; },
  musicEntries: (ids, convert)=>buildMusicEntries(new Set(ids), null, {convert: !!convert}), dropOriginal: (id)=>dropKeptOriginal(findLibraryTrack(id)), policy: ()=>formatPolicy(), matches: (id)=>trackMatchesPolicy(findLibraryTrack(id)), queueRecord: ()=>idbGet("state", "convertQueue").then(r=> r && r.value || null)};
// No quiet converter download 20 s after opening, unless a test asks for it.
window.__noAutoConverter = true;
// The Heads-up at the first import and the once-a-day backup prompt (1.4.092)
// would interrupt tests that aren't about them; welcome.js turns them on.
if(window.__headsUpOn !== true){ window.__noHeadsUp = true; window.__noDailyPrompt = true; }
// The welcome's Try it out / Install (2.2.023) answers itself as "No, just
// start" did, unless a test asks for it (welcome.js, setup.js).
if(window.__welcomeOn !== true) window.__autoTry = true;
// The join dialog as the old welcome's "Yes, join or create one" opened it
// (now in Install's steps): share.js, drive.js.
window.__joinFromWelcome = ()=>{ setupJoinStep(setupEnvironment()); };
window.openSetupGuideForTest = ()=>{ openSetupGuide(); };
// A track's recording taken away, as if it never arrived (leave.js).
window.__dropAudio = (id)=> libStore.del("audio", [id]);
// playback
window.__play = (id)=>playItem(id);
window.__pause = ()=> togglePlay();
window.__aud = ()=>({src: audioEl.src, paused: audioEl.paused, t: audioEl.currentTime, rs: audioEl.readyState, ns: audioEl.networkState, err: audioEl.error ? audioEl.error.code + " " + (audioEl.error.message || "") : null});
window.__st = ()=>({src: audioEl.src, paused: audioEl.paused, t: audioEl.currentTime, d: audioEl.duration, rs: audioEl.readyState, ns: audioEl.networkState, err: audioEl.error ? audioEl.error.code + " " + (audioEl.error.message || "") : null,
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
window.saveBackupInfoForTest = ()=> saveBackupInfo();
// shared library as the backup (share.js)
window.__share = {offer: (meta)=> offerNativeImport(meta, {}, {}, null, {backupRestore: true}), meta: ()=> buildNativeMeta({type: "library"}).meta,
  prompt: ()=> libraryNeedsBackup() && !libraryProtected() && !sharedAboutToCover(), covered: sharedCoversLibrary, keepers: ()=> root.backupKeepers, keeperLines,
  noteKept: ()=>{ root.backupKeepers = Object.assign({}, root.backupKeepers, {[sharedConfig().deviceName]: Date.now()}); return saveState(); },
  label: ()=> document.getElementById("btnBackup").textContent, setup: ()=> backupInfo.setupDone};
window.__share.manualBackup = downloadManualBackup; window.__share.judge = judgeBackupFiles; window.__share.manualPlan = manualBackupPlan;
window.__hist = {open: openSharedHistory};
window.__undo = {undo: doUndo, redo: doRedo, del: deleteLibraryTracks, stacks: ()=> ({undo: undoStack.length, redo: redoStack.length, labels: undoStack.map(undoLabel)}), rebase: undoRebase};
window.__split = performTrackSplit; window.__queueSplit = queueTrackSplit; window.__audioUrl = getAudioUrl; window.__retag = rewriteFileTagsIfPossible;
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
  zip: (entries)=> buildZipBlob(entries), put: (id, blob)=> idbPut("audio", {id, blob, rev: uid()}), check: ()=> checkStoredFiles(), countCopies: ()=>{ window.__wkCopies = 0; const real = webkitOwnBytes; webkitOwnBytes = async (b)=>{ window.__wkCopies++; return real(b); }; },
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
// the splitter (splitter.js)
window.__splitter = {open: openSplitter, state: ()=> spl, close: closeSplitter, into: splitTrackInto, job: queueSplitJob, busy: ()=> splitWorking || splitQueue.length > 0,
  fineOf: async (id)=>{ const tr = findLibraryTrack(id); return splitFineAnalysis(tr, (await idbGet("audio", id)).blob, null, ()=> false); },
  quiet: splitFindQuiet, offset: async (id)=> mp3PlaybackOffset((await idbGet("audio", id)).blob), ensure: ensureConverter,
  cursor: (s)=> splitSetCursor(s), editItem: openEditItem, find: findNode};
// still sending audio (switchsend.js)
window.__fakeSending = ()=>{ sharedUploading = true; sharedStatus.transfer = {kind: "up", done: 0, total: 1}; };
window.__openWith = (files)=> openWithFiles(files);
// automatic restore (restore.js)
window.__ar = {send: ()=> autoRestoreSend(), on: ()=> autoRestoreOn(), entry: ()=> autoRestoreEntry(), backupInfo: ()=> backupInfo};
window.__ops = {set: (text, key)=> setActiveOperationProgress(text, null, key), stop: (text, fn)=> setActiveOperationProgress(text, fn), clear: (key)=> clearActiveOperation(key)};
window.__check = {run: ()=> checkLibrary(), standIn: (p)=> isStandInPeaks(p)};
// added to the MP3 one above (pk2.js calls __pieces itself; replacing it broke pk2 from 1.4.108)
Object.assign(window.__pieces, {m4a: (b)=> analyzeM4aInPieces(b), whole: (b)=> analyzeAudio(b), any: (b, k)=> analyzeInPieces(b, k),
  // the whole file decoded at once, through the same measuring as the pieces
  sameWay: async (b)=>{ const C = window.OfflineAudioContext; const buf = await new C(1, 1, 44100).decodeAudioData(await b.arrayBuffer()); const an = makePieceAnalyzer(buf.sampleRate, Math.min(2, buf.numberOfChannels)); const ch = [buf.getChannelData(0)]; if(buf.numberOfChannels > 1) ch.push(buf.getChannelData(1)); await an.push(ch); return an.finish(); }});
window.__pieces.more = (b, k)=> analyzeInPieces(b, k);
window.__idbDel = (store, id)=> idbDelete(store, id);
window.__idbPut = (store, rec)=> idbPut(store, rec);
window.__pieces.conv = (b)=> analyzeWithConverter(b); window.__pieces.getConverter = ()=> downloadConverter();
// copying between libraries (copylib.js)
window.__copyLib = {ie: openImportExportDialog, open: openCopyToLibraryDialog, apply: applyIncomingCopies,
  audioIn: async (libId, id)=>{ const d = storageOpen(libId); try{ return !!(await d.get("audio", id)); } finally { d.close(); } }};
window.__copyLib.fakeDeadCopy = async (libId, id)=>{ const d = storageOpen(libId); try{ await d.put("audio", {id, blob: new Blob(["x"])}); await d.put("state", {key: COPY_PARTIAL_KEY, value: {ids: [id], at: Date.now()}}); } finally { d.close(); } };
window.__copyLib.partialMark = async (libId)=>{ const d = storageOpen(libId); try{ return !!(await d.get("state", COPY_PARTIAL_KEY)); } finally { d.close(); } };
window.__splitter.mark = (t)=> splitAddMark(t); window.__splitter.playPiece = (k)=> splitPlayPiece(k);
// devices' logs in the shared library (sharedlogs.js)
window.__logs = {send: (force)=> sharedSendLogs(force), others: sharedOtherLogs, stem: logFileStem, feedback: openFeedbackDialog};
// the backup folder keeping files whose audio isn't here (bkkeep.js)
window.__bk = {run: ()=> runFolderBackupHere(), fullScan: ()=>{ backupFullScanNeeded = true; }, info: ()=> backupInfo, del: (ids)=> deleteLibraryTracks(ids)};
// the files store itself (filestore.js): a store in OPFS folder `name`, whatever this device uses
window.__fs = {make: (name)=> new FolderLibraryStore(async (create)=>{ const top = await navigator.storage.getDirectory(); return folderChild(top, name, create); }, "37player-files-test~" + name, {}), makeNamed: (name, paths, canMove)=> new FolderLibraryStore(async (create)=>{ const top = await navigator.storage.getDirectory(); return folderChild(top, name, create); }, "37player-files-test~" + name, {recordingPath: (id)=> paths[id] || null, canMove: (id)=> !canMove || canMove(id)}), pathFor: (t)=> recordingPathFor(t), makeNamedDesktop: (name, paths, canMove)=> new FolderLibraryStore(async ()=> desktopRootDir(name), "37player-files-test~d~" + name, {recordingPath: (id)=> paths[id] || null, canMove: (id)=> !canMove || canMove(id)}), makeDesktop: (name)=> new FolderLibraryStore(async ()=> desktopRootDir(name), "37player-files-test~d~" + name, {}),
  keyOf: fileKeyOf, unkey: keyOfFile};
// libraries kept in a folder (folderlib.js)
window.__fl = {move: moveLibraryToFolder, name: ()=> libraryFolderName(LIBRARY_ID), forget: ()=> folderHandleDelete(LIBRARY_ID), kind: ()=> libStore.constructor.name, store: FolderLibraryStore, folderNameFor: ()=> folderNameFor(currentLibraryName()), rekey: (st, a, b)=> libStore.rekey(st, a, b)};
// a restore or re-join cut off (interrupted.js)
window.__int = {clear: (what)=> idbClearAll(what)};
// dropped folders (dropfolder.js)
window.__drop = {take: (dt)=> takeDrop(dt)};
// the desktop app's bridge (desktop.js)
window.__driveStart = (el)=> driveStartFrom(el, {what: "connect"}); window.__inDesktop = ()=> IN_DESKTOP_APP;
// deleting a track that's playing (delplaying.js)
window.__delAsk = (ids)=> confirmDeleteTracksFromLibrary(ids, ()=> deleteLibraryTracks(ids));
window.__edPrev = (id)=>{ loadEditorPreview(id); document.getElementById('edPreviewPlay').click(); };
window.__edPrevPaused = ()=> document.getElementById('edPreviewAudio').paused;
window.__lvl = ()=> ({ctx: levelCtx, routed: levelGains.has(audioEl)}); // levelwatch.js
window.__share.note = (m)=> sharedMissingNote(m); // miss.js
window.__dbg3.trashKeys = ()=> undoTrashKeys(); // reconcile.js
window.__dbg3.downloadPass = ()=> sharedDownloadPending(sharedConfig()); // reconcile.js
window.__disk = {kind: ()=> STORAGE_KIND, idbPut, idbGet, DiskBlob, JoinedBlob, audioObjectUrl, writeFileTo, storageOpen, readLibraryList, writeLibraryList, libraryDbName, renameLibrary, id: ()=> LIBRARY_ID, openImportChoice, desktopImportFolder, placeFolders, placeIntoLibrary, placeLookForNew, placePathFrom, libStore: ()=> libStore, rewriteFileTagsIfPossible, tracksWithMissingAudio, showAudioMissing, confirmDeleteTracksFromLibrary, syncPlaylistFiles, placeOffline, switchLibrary, togglePlay}; // diskblob.js, desktoplibs.js, inplace.js, switchplaying.js
window.__sil = {mp3: buildSilentMp3Bytes, entries: buildPlaceholderEntries, recognize: recognizePlaceholder, tags: parseAudioTags}; // silencemp3.js
window.__big = {realBlob, sharedFetch, blobWithCurrentTags, convertTracks, trackIsBigFile, scheduleConvertResume, bigBytes: ()=> BIG_FILE_BYTES, queue: ()=> convertQueue.slice()}; // bigfile.js
window.__rejoin = {idbDelete, storedAudioIds, absent: ()=> [...sharedAudioAbsent], revs: ()=> root.library.map(t=> [t.id.slice(0,6), t.audioRev, t.fileSize])}; // rejoin.js
// the Playing volume (volume.js)
window.__vol = {set: (v)=> setMainVolume(v), get: ()=> mainVolume, gain: ()=> mainVolumeGain()};
// the converter reading a file by its address (lazyconv.js)
window.__lazy = {start: ()=> converterStart(), convert: (b, n, f, t)=> converterConvert(b, n, f, t), input: (b, n)=> converterInput(b, n), off: ()=> converterLazyOff, setOff: (v)=>{ converterLazyOff = v; }, stop: ()=> converterStop(), log: ()=> (typeof playLogLines !== "undefined" ? playLogLines : null)};
// Settings → About → Check for updates (shellupd.js)
window.__updates = {check: ()=> checkForUpdatesNow()};
