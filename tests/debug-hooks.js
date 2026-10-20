// Test hooks, put into a TEST COPY of 37-player.html by make-debug-copy.py
// (never into the real file). Top-level functions in the app aren't on
// `window`, so tests reach them through these.
window.__dbg = {getRoot:()=>root, saveState, bulkImportFolder, setMode:(m)=>{appMode=m; applyAppMode();}, editPl:(id)=>{editingPlaylistId=id; renderEditorScreen();}, render:()=>renderPlayer(), disp:(th,mc)=>{ root.settings.theme=th; root.settings.moreContrast=mc; applyDisplaySettings(); }};
window.__dbg3 = {put: (s,v)=>idbPut(s,v),
  // joins, pressing the join dialog's "Join" itself
  join: async (u,c,n)=>{ const pr = joinSharedLibrary(u,c,n); const iv = setInterval(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>b.textContent.trim()==='Join'); if(b){ window.__joinDialog = b.closest('.modal').innerText; b.click(); } }, 150); try{ return await pr; } finally { clearInterval(iv); } },
  fetchNow: sharedFetchTracksNow, missing: sharedTrackMissing, review: openSharedReview, rvState: ()=>sharedReviewState,
  sync: (o)=>runSharedSync(Object.assign({force:true},o||{})), status: ()=>sharedStatus, pending: ()=>sharedPending,
  leave: leaveSharedLibrary, render: renderSharedSection, awake: sharedAwakeStart, awakeOn: ()=>!!sharedAwake};
window.__dbg4 = {settings: openSettingsPage, help: openHelpPage};
window.__rv = {rows: syncReviewRows, classify: (r,m)=>syncClassifyPartial(r,m,new Set()), def: syncDefaultChoice, set: (st)=>{ const page=document.createElement("div"); page.id="reviewPage"; page.className="settings-page rv-page"; placeOverlayPage(page, closeSharedReview); page.innerHTML='<div class="rv-scroll" id="rvScroll"></div><div class="rv-foot" id="rvFoot"></div>'; document.body.appendChild(page); sharedReviewState=st; renderSharedReview(); }};
window.__aa = {analyze: analyzeAudio};
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
