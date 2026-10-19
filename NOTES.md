# 37 Player: notes

The big picture as of October 2026 (version 1.3.028). Commit messages hold the detail of each change. This file says how the whole thing works and why it is the way it is. Update it when a decision changes.

## What it is

A playlist player for live sessions at Kadampa centers: chanting, prayers, mandala offerings, teachings, with silences and stops between them. It's built for an operator who needs the right audio, in the right order, every time, often on an old computer or an iPad. It came out of IKRC's old and new Macs being unable to share a Music.app library, and Music.app becoming hard for non-technical people to use.

- One self-contained HTML file, `37-player.html`, running as a PWA. It's offline-capable, and the whole library (audio included) lives in the browser's IndexedDB.
- Users so far: Gen Rinzin, two friends, and Samudrabadra (Fort Myers). Prospective: KMC Texas (three rooms wanting one shared library) and IKRC (Macs and an iPad). Phones are a "handy sometimes" platform, not the main target.

## Where it lives

- **Repo:** `github.com/kr37/37player` (public). The droplet serves a pulled copy.
- **Site:** `player.37dakinis.net/` holds:
  - `index.html`: the about page, not the app;
  - `37-player.html`;
  - `sw.js`, `help.json`, `help/`;
  - `libraries/`: read-only starter collections with `manifest.json`;
  - `sync.php`: shared libraries. Its data is outside the web root at `/var/lib/37player/`, bind-mounted from the DigitalOcean volume.
- **Release routine:**
  1. Run `help/generate_help.py`, which embeds the help topics into `37-player.html` and writes `help.json`.
  2. Run the library-manifest generator.
  3. Commit, push, and pull on the droplet.
  4. `sync.php` changes are copied to the droplet by hand. `SYNC-SETUP.md` covers its first-time setup.
- **Backups of the droplet:** a nightly rsync of `/var/lib/37player/` to the T470.

## Architecture in brief

- **IndexedDB `temple-sound-library`.** Never rename it, or every user loses their library. Stores: `state`, `audio`, `artwork`. Audio and artwork are keyed by track ID; IDs never change.
- **State is split** into the library (`library`, `tree`, `rev`) and the view (settings, session). The library is written only when its hash changes, and only if no other window has written since (`idbWriteLibraryIfCurrent`). A BroadcastChannel keeps other windows live.
- **Rule for all code:** `root.library` and `root.tree` can be replaced at any moment by another window or a sync. Hold IDs, never long-lived object references.
- **`sw.js`** can't be inlined (a spec restriction). It caches only the app page and `help.json`, network-first, and skips Range requests.
- **Help** is Markdown in `help/NNN Title.md`. It's embedded into the HTML because a `file://` copy can't fetch `help.json`. It's English only, by design.
- **The UI** is translated into 9 languages (en, es, fr, pt, de, zh, vi, el, it). Every new string goes into all nine.

## Playback model

- **Highlighted vs. queued.** "Highlighted" (`selectedItemId`) is UI only. "Queued or playing" (`currentItemId`) changes only through `activateItem()`. A single click highlights; a double-click or Enter plays from the start.
- **Each step.** The next item is looked up fresh when an item ends, so edits made mid-session take effect. Deleting the playing entry lets it finish.
- **Silences and stops.** Silences tick on their own clock. Stops wait for a click.
- **Only the latest press counts.** If a track's audio must be fetched first (shared library), a press that's still waiting is dropped when another is made. Playback never starts by itself minutes later.
- **Loudness.** "Even out loudness" and per-track +/- adjustments use `el.volume` when turning down. Turning up needs Web Audio (`createMediaElementSource` into a GainNode). Once an element is routed that way, it stays routed until reload.

### Playing with the screen off (phones and iPads)

The hardest-won part. Found and fixed in October 2026 (1.3.022 to 1.3.028), using the playback log.

- **The problem:** on Android and iPadOS, a track that starts while the app is off screen (screen locked, or another app in front) plays for a couple of seconds, then goes silent. The player still reports "playing" and its time keeps running. The sound comes back when the app returns to the screen.
- **The fix:** while the app is off screen and the player is playing, a silent 10-second WAV loops on its own `<audio>` element (`silentKeepAlive`, `updateLoopHold`). The page never stops making sound in the phone's eyes. The same loop already carried silences along with the screen off.
- **Between items** (`playBridge`): the moment after one item ends and before the next is really playing counts as still playing. The loop stays on and the lock screen keeps saying "playing".
- **Stops** (`stopHold`): with "Keep the lock screen ready at stops" on (default), the silent loop runs through a stop, the lock screen shows the stop's name, and its play (or pause) button continues the session. Off saves battery; then a stop needs 37 Player itself.
- **Lock-screen commands:** Media Session "play" only plays and "pause" only pauses. They used to toggle, so a stray "play" from the phone paused a playing track.
- **Phone pauses at a track's start:** if the phone pauses a track within 5 seconds of its start, with the app off screen and no press, it's restarted once. Later pauses (a phone call, unplugged headphones) are respected.
- **Diagnosis:** the **playback log** (Settings → Playback, `playLog()`) records track starts, the app leaving and returning to the screen, pauses the phone made, and a "still playing" line every minute. Keep it. Ask for it first whenever playback misbehaves on a device.

## Shared library sync (1.3.000 onward)

The full plan and history are in the project doc `shared-library-sync.md`. In short:

- **Server:** `sync.php` is plain PHP, with no framework or database. Libraries are joined by a secret code; the server stores only its hash.
- **Versions:** each library version is one JSON file, so history comes free. Saves are "only if still at version N" (`flock`); otherwise the server returns 409 and the app merges and retries. Audio and artwork are named `id.rev` and never overwritten.
- **Merging** is three-way: this device, the shared library, and the last-agreed base (IndexedDB `sharedBase`).
  - A change made in one place wins.
  - A track changed in both places merges field by field.
  - A playlist changed in both places: both are kept, with the device name added to the copy and a ⚠ mark.
  - Edited on one device, deleted on another: the edit wins.
  - A sibling merely moving is not an edit, so it never revives a deletion.
- **Engine:** the merge engine is the `SYNC-MERGE:BEGIN/END` block, pure functions with their own tests.
- **Transfers:**
  - Audio moves in the background, one window at a time: `navigator.locks`, with separate locks for down and up.
  - It waits while anything plays, because transfers made phones crackle. A track you press play on is still fetched at once, with one download per file at a time.
- **Keep syncing with the screen off** (phones and tablets): a setting that stays as set (`cfg.keepAwake`). While on, whenever there's something to send or receive and nothing is playing, a silent loop keeps the page awake, with progress on the lock screen. Playback stops it; it restarts the moment playback stops. The lock screen's pause holds it off until the app is next on screen or plays.
- **Review changes:** a FreeFileSync-style overlay with arrows per row (send / take / skip). It holds back automatic syncing while open.
- **Partial sync** (a "left sync"):
  - Everything on the device syncs both ways.
  - New playlists from others arrive only when chosen in Review.
  - New tracks in playlists the device already holds arrive automatically.
  - Deleting offers three choices: Cancel / Remove from this device / Delete everywhere.
- **Missing tracks** are marked big and clear, saying where each one is coming from ("on its way from {device}" or "waiting for {device} to send it").
- **Mobile data:** treated like any other connection, because library integrity matters more. Only the join dialog warns about the size.

## Non-obvious decisions

- **Re-encode target is AAC 192 kbps, 44.1 kHz, stereo, `.m4a`.** It re-encodes only uncompressed audio, codecs a browser can't play, and odd channel counts or sample rates. An ordinary 192k MP3 is never touched.
- **Tag edits must never need a re-encode, and must never silently destroy tag information.** Getting the right audio in the right order matters more than perfect metadata.
- **Backup folders use ID filenames** under "Library - do not touch". Readable names would invite reorganizing. A Portable export is the player-ready copy.
- **An empty library never backs up,** so a wiped browser can't overwrite a good backup. A backup folder belongs to one copy of the app; another copy only takes it over by an explicit choice.
- **Silences and stops live only inside playlists,** and each one is independent: they're never shared between playlists. Portable exports write them as `STOP - name.wav` / `SILENCE - name.wav` placeholders, which turn back into real items on import.
- **The PIN only guards against accidental edits.** The repo is public.
- **Every shipped change bumps** `<meta name="app-version">`. Replace only that first tag: a blanket search-and-replace of `app-version" content="…"` also rewrote the pattern in `versionFromHtml`, which broke Check for updates from 1.3.022 to 1.3.037 (fixed in 1.3.038; the pattern is now built so it can't be matched). The version stays visible in the header, and it's a button that checks for updates.

## Browser quirks and workarounds

- **Clear a file input's value only after copying its files.** Chromium 141 empties the input's FileList in place when its value is cleared. Copy with `Array.from()` first.
- **Playlist files report as audio.** `.m3u8` reports as `audio/x-mpegurl`, so audio is picked by extension, never by MIME type.
- **Safari:**
  - it clears a site's data after 7 days without use, unless the app is on the Home Screen or Dock;
  - it uses dynamic viewport (`dvh`) heights;
  - the window's scroll position needs resetting, except while typing.
- **iPad touch:**
  - no hover, so row icons appear on selection;
  - drag and drop is synthesized from touch for the folder tree;
  - native `draggable` is turned off on coarse pointers.
- **Folder access:** `showDirectoryPicker` works only in Chrome and Edge on desktop. Brave needs `brave://flags` → File System Access. iOS Chrome is WebKit, so it has no folder access either.
- **Codecs:**
  - ALAC and WMA play in no browser, so they're converted with the `.py` scripts.
  - What MediaRecorder writes as "AAC" varies by browser. Some write Opus, which `findMp4AudioCodecFourcc` catches.
- **Long recordings and memory:** decoding a whole file holds it all as raw samples (a 2-hour stereo teaching is about 2.5 GB), which crashed a phone's tab ("Aw, Snap!") and made a laptop give up with a flat stand-in waveform. Past a per-device budget, MP3s are decoded about 3 minutes at a time, cut at frame boundaries (`analyzeMp3InPieces`), and WAVs are read a few MB at a time with no decoder (`analyzeWavInPieces`); both feed `makePieceAnalyzer` / `makeLoudnessMeter`. Other formats past the budget get a stand-in waveform and no loudness, marked with the budget of the device that tried (`loudness.tooLong`, in MB); a device with a bigger budget (a computer) tries again, and the result reaches the others through sync. Budgets: 2000 MB on a computer reporting 8 GB, otherwise 1000 MB (about 45 minutes of stereo). Splitting a track still decodes it whole. On phones and tablets MP3/WAV always go in pieces (1 MB pieces for MP3 there). The first piece starts after an MP3's Xing/Info header frame (`mp3AudioStart`): suspected cause of Safari on an iPad reserving memory for the whole file and being closed. A background analysis that gets the page closed is remembered (`guardedAnalysis`, localStorage `37player.analyzing`) and that track is skipped by that version (`analysisCrashed` = version). The server's `list` reports stand-in waveforms (`flatPeaks`, exactly 3601 bytes) so a device with the real one replaces it. Waveforms travel separately from the library document (720 numbers a track would make every save megabytes): each is a small file on the server named after its audio version, sent with the audio and fetched with it. A flat stand-in is never sent. A device with a stand-in (`repairStandInPeaks`, once per track via the local `peaksTried`) first asks the server, else makes it and sends it with `replace=1`, the one case the server overwrites a file. Loudness is in the library document (the audio group), so it syncs directly.
- **Long work freezes the page:** decoding and loudness loops yield to the page (`yieldToPage`). A 90-minute track used to freeze the page for 9 s.

## Tried and abandoned (don't go back)

- **Screen off:** filling only the gap between tracks with silence didn't stop the drop-out. Routing all playback through Web Audio didn't either: the phone also paused tracks itself.
- **Wi-Fi-only syncing:** removed. Devices that quietly stayed out of date were worse than the data use.
- **Merging two people's reordering of the same playlist:** that's where automatic merges go wrong. Keep both copies instead.
- **Master/follower roles for sync:** a joined device can edit, and can have things of its own.
- **Google Drive via OAuth as the main storage:** Google Cloud setup, sign-in tied to one site, and uncertain sharing across accounts. It may come back as an option for individuals.
- **A localhost helper for backups:** too much to install. Backups are automatic in Chrome/Edge and manual zips elsewhere.

## Testing

- **Environment:** Puppeteer driving real Chromium, on a test copy with debug hooks injected. Never on the shipped file.
- **Suites:**
  - two-device sync scenarios run against `php -S` with a scratch data folder;
  - the merge engine has standalone tests.
- **Simulating the screen off:** override `document.hidden` and send `visibilitychange`. This tests the logic only. Real phone behavior has to be checked on a phone, with the playback log.

## Open / later

- **Sync:** restore from history, borrowing from another library (a one-time import), a QR join code, and a per-library quota.
- **Sync field tests:** all seven done by 19 Oct 2026, including closing the laptop mid-send, syncing with the iPad's screen off, and Safari keeping the iPad's library through two weeks unused. Playing a session during a big sync led to the long-recording fixes (1.3.030–1.3.032); worth one more run.
- **Partial sync:** when "new in the shared library" leads into Review changes, show those new items highlighted. Possibly only that once, or with a "most recent changes" button. The "new since last review" set (`sharedSeen`) already exists to drive it.
- **Settings → "All settings":** one page listing every setting in a two-column table: the control, then its label, with tap or hover for more help. Grouped under headers. Every setting also stays where it is now.
- **Library:** clip extraction, auto-updating playlists after a split, and undo for destructive actions.
- **Standardize:** a "shrink" step for files over the target bitrate.
- **Hosting:** Drive or Dropbox adapters for individuals' libraries. Only centers are hosted on the droplet.
