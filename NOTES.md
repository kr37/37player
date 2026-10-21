# 37 Player: notes

The big picture as of October 2026 (version 1.4.000: converting, and the library's file format). Commit messages hold the detail of each change. This file says how the whole thing works and why it is the way it is. Update it when a decision changes.

## What it is

A playlist player for live sessions at Kadampa centers: chanting, prayers, mandala offerings, teachings, with silences and stops between them. It's built for an operator who needs the right audio, in the right order, every time, often on an old computer or an iPad. It came out of IKRC's old and new Macs being unable to share a Music.app library, and Music.app becoming hard for non-technical people to use.

- One self-contained HTML file, `37-player.html`, running as a PWA. It's offline-capable, and the whole library (audio included) lives in the browser's IndexedDB.
- Users so far: Gen Rinzin, two friends, and Samudrabadra (Fort Myers). Prospective: KMC Texas (three rooms wanting one shared library) and IKRC (Macs and an iPad). Phones are a "handy sometimes" platform, not the main target.

## Where it lives

- **Repo:** `github.com/kr37/37player` (public). Layout:
  - `37-player.html` (the app), `sw.js`, `help.json`, `help/` (topics and `generate_help.py`);
  - `sync.php` and `SYNC-SETUP.md` (shared libraries on the droplet);
  - `index.html` (the about page, not the app) and `homepage/` (its icon, logo and screenshots);
  - `scripts/` (`convert_incompatible_audio.py`, `scan_incompatible_audio.py`, `generate_library_manifest.py`);
  - `tests/` (browser tests; see tests/README.md);
  - `NOTES.md` (this file).
- **Site:** `player.37dakinis.net/` is a git working copy of the repo on the droplet, plus `libraries/` (read-only starter collections with `manifest.json`, not in git). `sync.php`'s data is outside the web root at `/var/lib/37player/`, bind-mounted from the DigitalOcean volume.
- **Release routine:** the droplet's copy is also the live test bed (the laptop mounts it over SSH).
  - Changes made there: run `help/generate_help.py` (embeds the help topics into `37-player.html`, writes `help.json`) and `scripts/generate_library_manifest.py` if the libraries changed; commit; push.
  - Changes made by a Claude session go to the standing **`dev`** branch. At the start of a session, bring `dev` up to date with `main` first (`git merge origin/main`). Push to `dev` as work goes; when a batch is ready, open (or update) one pull request from `dev` into `main` and say it's ready. Gen merges it; `dev` carries on afterwards, it isn't deleted.
  - Testing `dev`: on the droplet, `git checkout dev && git pull --ff-only` (or a separate test site, below); back to `main` with `git checkout main && git pull --ff-only`.
  - Commit and push any edits made on the droplet before starting a session, so the session builds on them.
  - Planned: a test site, `playertest.37dakinis.net`, a second working copy on `dev`. It has its own IndexedDB on every device (a different address), so it should join a **test copy** of the shared library, not the real one: `cp -a /var/lib/37player/<lib> /var/lib/37player/<lib>test`, then `php sync.php newcode <lib>test`. A branch's bugs then can't reach the real library.
  - `sync.php` changes take effect as soon as the droplet has them. `SYNC-SETUP.md` covers first-time setup and the Apache upload limit.
- **Backups of the droplet:** a nightly rsync of `/var/lib/37player/` to the T470.

## Architecture in brief

- **IndexedDB `temple-sound-library`.** Never rename it, or every user loses their library. Stores: `state`, `audio`, `artwork`. Audio and artwork are keyed by track ID; IDs never change.
- **Several libraries on one device** (1.4.001; Settings → Libraries, and the name in the top bar once there's more than one). Each library is its own database: the first is `temple-sound-library` (id `main`), the others `temple-sound-library~<id>`. The list is in localStorage `37player.libraries` (names, sizes, the last one chosen, ids of deleted ones), and each database also holds its own name (state record `libraryInfo`) so a lost list is rebuilt from `indexedDB.databases()` (`rediscoverLibraries`).
  - **Switching reloads the page** into the other library (`switchLibrary`), so nothing in memory carries over. Which library a window has open is per window (sessionStorage `37player.library`); two windows can have two libraries open.
  - **Per library:** everything in its database (library, view settings, session, backup record and folder, `sharedBase`, `sharedPending`, `sharedSeen`), and the channels, locks and localStorage keys that concern its contents: `libScoped()` adds `~<id>` (`37player-sync`, the sync, transfer, backup, tag-snapshot, mp4-repair and standardize locks, `37player.analyzing`, `37player.sharedLog`). The first library keeps the old names, so an older window still agrees with a newer one.
  - **Per device:** `DEVICE_SETTING_KEYS` (language, display, screen-off playback, the default device name, server addresses) in localStorage `37player.device`, laid over each library's settings on load and saved with every save; a `storage` event brings another window's change in before this window can save the old value back. The converter stays in the first library's database whichever is open (`mainStateGet/Put/Delete`). Device-wide channels and locks: `37player-playing`, `37player-version`, `37player-convert`, `37player-converter-fetch`, and `37player-libraries` (the list changed; a library was deleted).
  - **Only the open library syncs.** A new library starts empty (the starter prayer is only for the first). New library → Join a shared library joins at once after the reload (sessionStorage `37player.pendingJoin`) and takes the shared library's name. Joining from a library that already has tracks offers a new library first, since combining would put them in front of everyone.
  - **Deleting** is for libraries that aren't open: their database is deleted (the first library's is emptied instead, as it holds the converter). Windows on it are told, close it at once, and reload into another.
- **State is split** into the library (`library`, `tree`, `rev`) and the view (settings, session). The library is written only when its hash changes, and only if no other window has written since (`idbWriteLibraryIfCurrent`). A BroadcastChannel keeps other windows live.
- **Old windows:** two windows on one computer share one library, so a window left open on an old version syncs by old rules (a 1.3.021 window and a 1.3.045 one re-saved the library every 3 minutes all night). Each window announces its version on BroadcastChannel `37player-version`; one that hears of a newer version stops syncing and asks to be reloaded (1.3.047). Devices also strip local-only fields (`SYNC_LOCAL_TRACK_FIELDS`) from the shared library as they receive it (1.3.046).
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
- **Pauses off screen** (`pauseHold`, same setting, now "…at stops and pauses"): after a pause with the app off screen, the silent loop runs for up to 30 minutes so the lock screen's play still works. Without it an iPad put the page to sleep at once, and play gave no sound.
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
- **Keep syncing with the screen off** (phones and tablets): a setting that stays as set (`cfg.keepAwake`). While on, whenever there's something to send or receive and nothing is playing, a silent loop keeps the page awake, with progress on the lock screen. Playback stops it; it restarts the moment playback stops. The lock screen's pause holds it off until the app is next on screen or plays. When a track is paused part-way, the lock screen keeps the track ("Paused · Receiving 2 of 5"), and its play (or pause) button resumes the track.
- **Review changes:** a FreeFileSync-style overlay with arrows per row (send / take / skip). It holds back automatic syncing while open.
- **Partial sync** (a "left sync"):
  - Everything on the device syncs both ways.
  - New playlists from others arrive only when chosen in Review.
  - New tracks in playlists the device already holds arrive automatically.
  - Deleting offers three choices: Cancel / Remove from this device / Delete everywhere.
- **Missing tracks** are marked big and clear, saying where each one is coming from ("on its way from {device}" or "waiting for {device} to send it").
- **Upload size limit:** Apache 2.4.54+ refuses request bodies over 1 GiB by default (`LimitRequestBody`), answering 413. A 1.2 GB WAV hit it. The droplet needs `LimitRequestBody 0` for sync.php (see SYNC-SETUP.md). The app now stops resending a refused file until "Sync now" and says so in the status (1.3.045). A later improvement: send big files in pieces (resumable).
- **Mobile data:** treated like any other connection, because library integrity matters more. Only the join dialog warns about the size.

## Non-obvious decisions

- **Re-encode target is AAC 192 kbps, 44.1 kHz, stereo, `.m4a`.** It re-encodes only uncompressed audio, codecs a browser can't play, and odd channel counts or sample rates. An ordinary 192k MP3 is never touched.
- **Files a browser can't play are kept, never thrown away** (1.3.048). Import stores the original and marks its track `needsConvert` with the format's name ("Windows Media Audio (WMA)", "Apple Lossless (ALAC)", "AIFF-C (ima4)"; `describeFormatProblem`), so playlists keep their place for it and nothing is lost. It's part of the audio group in sync, so every device shows it, and whichever device later converts the file clears it. Marked like a missing track (bold, with the reason under it; `trackCantPlay`, `markRowNotHere`), and Playing says how many in a playlist can't play. Library cleanup → Tracks that can't be played → **Check again** (`recheckStoredAudio`) re-reads stored files with today's decoders: an AIFF an older version left at 0:00 comes back as WAV. Only a playlist file posing as audio is still left out.
- **The converter is ffmpeg.wasm** (1.3.049): `scripts/get_ffmpeg.sh` puts ffmpeg-core.js and .wasm (0.12.10, about 31 MB) in the site's `ffmpeg/` (not in git; CORS via its .htaccess). A device downloads them once, when something first needs converting (or from Library cleanup → Converter), into IndexedDB's state store (record `converter`, kept when the library is replaced), so it works offline and in downloaded copies (which fetch from player.37dakinis.net). It runs in a worker built from inline source (`converterWorkerMain`), reading the input in place (WORKERFS). **Convert** (after an import, on Playing's banner, in Library cleanup) turns a track marked `needsConvert`, or a 0:00 track, into MP3 192k: channels kept, sample rate kept unless MP3 can't hold it, tags and picture carried, the library's details written in after (`applyConvertedAudio`). One queue, one window at a time (lock `37player-convert`); it waits while anything plays in any 37 Player window on the computer (each window says when it plays, BroadcastChannel `37player-playing`; `anyWindowPlaying`, also used by Standardize and background analysis), and a conversion under way when playback starts is dropped and done again after. Standardize's "Only when nothing is playing" switch turns this off for converting too.
- **Unplayable files are converted at import, without asking** (1.3.053). The converter is fetched quietly ahead of need (during setup while the language is chosen, and on any start where it's missing, once nothing plays; `fetchConverterWhenIdle`, `ensureConverter`). A conversion keeps the original in the audio store under `orig:<id>` (local to the device: not synced, not in backups; track field `original`, local), and at the end of the run "Keep the originals?" is asked once, with their size. A portable export takes a kept original; Library cleanup can discard them. Deleting a track's audio deletes its original (`idbDelete`).
- **The library's format settings** (1.3.054; Settings → File format, which replaces the old Standardize page and its background MediaRecorder queue, now stopped): one preferred format (presets standard / apple / small / lossless, or custom: MP3, AAC or FLAC, bitrate, rate, channels; FLAC asks "Not recommended" first) and when to convert: `untouched` (Don't touch my files: originals of unplayable files kept without asking), `reduce` (the default: WAV/AIFF as they come in), `rules`. Stored in `root.formatPolicy`, saved with the library, carried in the shared document as `doc.policy` (`syncMergePolicy`: one field, the side that changed it wins; a document from an older version leaves it as it was). Conversions as files come in are done by the importing device; the page shows what the settings would convert in the library now, with "Convert them now". A file waiting to be converted isn't uploaded (`convertSoon`, `convertQueue`): only the result is. Portable export can "Convert to the preferred format" (the Music.app case), leaving the library alone. Re-encoding leans the library to 44.1 kHz stereo (the lossy presets set both, 1.3.055: stereo costs nothing at a constant bitrate); MP3 is constant bitrate (`-abr 0`) so seeking is exact. Kept originals stay on the converting device (the question says so in a shared library). Video files: asked about, their sound taken out (AAC/MP3 copied as is, anything else to the preferred format), the video not kept.
- **Tag edits must never need a re-encode, and must never silently destroy tag information.** Getting the right audio in the right order matters more than perfect metadata.
- **Backup folders use ID filenames** under "Library - do not touch". Readable names would invite reorganizing. A Portable export is the player-ready copy.
- **An empty library never backs up,** so a wiped browser can't overwrite a good backup. A backup folder belongs to one copy of the app; another copy only takes it over by an explicit choice.
- **Silences and stops live only inside playlists,** and each one is independent: they're never shared between playlists. Portable exports write them as `STOP - name.wav` / `SILENCE - name.wav` placeholders, which turn back into real items on import.
- **The PIN only guards against accidental edits.** The repo is public.
- **sync.php carries its own version** (`SYNC_VERSION`): set it to the app's version whenever sync.php itself changes, not otherwise, both in `SYNC_VERSION` and in the comment at the top of the file. The app shows it in Settings → Shared library; `php sync.php version` prints it.
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
  - ALAC and WMA play in no browser, so they're converted with the scripts in `scripts/`.
  - What MediaRecorder writes as "AAC" varies by browser. Some write Opus, which `findMp4AudioCodecFourcc` catches.
- **Long recordings and memory:** decoding a whole file holds it all as raw samples (a 2-hour stereo teaching is about 2.5 GB), which crashed a phone's tab ("Aw, Snap!") and made a laptop give up with a flat stand-in waveform. Past a per-device budget, MP3s are decoded about 3 minutes at a time, cut at frame boundaries (`analyzeMp3InPieces`), and WAVs are read a few MB at a time with no decoder (`analyzeWavInPieces`); both feed `makePieceAnalyzer` / `makeLoudnessMeter`. Other formats past the budget get a stand-in waveform and no loudness, marked with the budget of the device that tried (`loudness.tooLong`, in MB); a device with a bigger budget (a computer) tries again, and the result reaches the others through sync. Budgets: 2000 MB on a computer reporting 8 GB, otherwise 1000 MB (about 45 minutes of stereo). Splitting a track still decodes it whole. On phones and tablets MP3/WAV always go in pieces (1 MB pieces for MP3 there). The first piece starts after an MP3's Xing/Info header frame (`mp3AudioStart`): with that and smaller pieces, an iPad that had crashed on four 2-hour MP3s analyzed each in about a minute (1.3.042, 19 Oct 2026). A background analysis that gets the page closed is remembered (`guardedAnalysis`, localStorage `37player.analyzing`) and that track is skipped by that version (`analysisCrashed` = version). The server's `list` reports stand-in waveforms (`flatPeaks`, exactly 3601 bytes) so a device with the real one replaces it. Waveforms travel separately from the library document (720 numbers a track would make every save megabytes): each is a small file on the server named after its audio version, sent with the audio and fetched with it. A flat stand-in is never sent. A device with a stand-in (`repairStandInPeaks`, once per track via the local `peaksTried`) first asks the server, else makes it and sends it with `replace=1`, the one case the server overwrites a file. Loudness is in the library document (the audio group), so it syncs directly.
- **Long work freezes the page:** decoding and loudness loops yield to the page (`yieldToPage`). A 90-minute track used to freeze the page for 9 s.

## Tried and abandoned (don't go back)

- **Screen off:** filling only the gap between tracks with silence didn't stop the drop-out. Routing all playback through Web Audio didn't either: the phone also paused tracks itself.
- **Wi-Fi-only syncing:** removed. Devices that quietly stayed out of date were worse than the data use.
- **Merging two people's reordering of the same playlist:** that's where automatic merges go wrong. Keep both copies instead.
- **Master/follower roles for sync:** a joined device can edit, and can have things of its own.
- **Google Drive via OAuth as the *only* storage:** Google Cloud setup, sign-in tied to one site, and uncertain sharing across accounts. It comes back as one storage among several, per library (see Open / later).
- **A localhost helper for backups:** too much to install. Backups are automatic in Chrome/Edge and manual zips elsewhere.

## Testing

- **Environment:** Puppeteer driving real Chromium, on a test copy with debug hooks injected. Never on the shipped file.
- **Suites:**
  - two-device sync scenarios run against `php -S` with a scratch data folder;
  - the merge engine has standalone tests.
- **Simulating the screen off:** override `document.hidden` and send `visibilitychange`. This tests the logic only. Real phone behavior has to be checked on a phone, with the playback log.

## Open / later

- **File formats and converting** (talked through 20 Oct 2026; keeping unplayable files done in 1.3.048, converting them in 1.3.049, above):
  - **Principle:** keep everything, and let a capable device fix it. A file only needs converting once, anywhere: the result syncs to every device. Works the same with the droplet, Google Drive or no sync at all.
  - **Converter:** ffmpeg.wasm (the community build of ffmpeg for browsers), our own audio-only LGPL build, hosted on player.37dakinis.net, downloaded once (offered during setup on computers, off by default on phones and iPads) and kept locally, so it works offline. Decodes what browsers can't (ALAC, WMA, compressed AIFF), encodes MP3 and AAC on any browser including Linux Chrome and Firefox, faster than real time, reading big files in place (WORKERFS). Next: a test page to measure the build's size, speed and memory on a 2-hour file, and gapless playback of the results.
  - **Measured 20 Oct 2026** with tests/convert/ (ffmpeg.wasm 0.12.10, standard build): MP3 192k at 40–46× real time on the T470 (Firefox), 75–79× on the iPad (Safari 26), 58–62× on an Android phone (Firefox); a 2-hour recording in 1½–2½ minutes. AAC 2–4× slower than MP3 (a 2-hour mono talk took 9½ minutes on the T470). Converter memory 32–55 MB whatever the file's length (it reads the input in place); the finished file is held until stored. So phones and iPads are capable converting devices too: no need to keep the converter to computers. Formats add no gap (0 ms on every device).
  - **Gapless playback is the player, not the formats:** 37 Player gives its one `<audio>` element the next file when a track ends, so there's always a short break between tracks, whatever the format; scheduling the next file sample-accurately (Web Audio) was seamless on every device. Not wanted for now: a month of use never ran into it, since sessions have silences and stops between items.
  - **Done in 1.3.053–1.3.054** (see Non-obvious decisions). What follows is the original plan, kept for its reasoning.
  - **Standardize becomes optional, off by default.** It began for fear of the browser's storage filling up (not borne out) and for Music.app's gapless playback (mismatched rates/channels click between tracks); the latter becomes an **export option** ("Export for Music.app": one rate and channel count in the exported copy), downplayed. Presets: Keep as is (default) / Standard, most universal (MP3 192k, like Tharpa) / Lossless (FLAC) / Very small / Custom (format, bitrate, sample rate, channels: keep by default, thresholds such as "only above N kbps"). A **preferred format** (default MP3 192k) is what files that can't be played are converted to.
  - **Format settings belong to the shared library,** not the device: one device's choice replaces files everywhere. The library's settings win; the join preview says what that means ("40 of this device's files will be converted, 3.1 GB → 0.6 GB"). Every settings change says its effect before applying ("This will convert 42 tracks…").
  - **Older iPads and Macs must keep working:** no Opus in shared libraries (old Safari can't play it). The 336 "wrong channel count" (mono) and 15 "wrong sample rate" files on the T470 aren't problems; they stop being counted as such.
  - **Conversion runs whenever nothing is playing** (not only off the Playing tab), in a worker; playback stops the current file, to be redone.
  - **Sending big files:** a size threshold; over it, ask "Send as is / Convert first / Not now".
  - **Library cleanup becomes one page laid out like Help and Settings:** Library info (stats) → Can't play → Duplicates → Missing artwork and tags (the "571 missing…" selector moves here from the Library page; "Find duplicates" stays on the Library page too) → Storage → Format.
  - **Server conversion** (sync.php with ffmpeg): held back as a fallback; Gen isn't willing to host many centers' or friends' libraries.

- **Sync:** restore from history, borrowing from another library (a one-time import), a QR join code, and a per-library quota.
- **Sync field tests:** all seven done by 19 Oct 2026, including closing the laptop mid-send, syncing with the iPad's screen off, and Safari keeping the iPad's library through two weeks unused. Playing a session during a big sync led to the long-recording fixes (1.3.030–1.3.032); worth one more run.
- **Partial sync:** when "new in the shared library" leads into Review changes, show those new items highlighted. Possibly only that once, or with a "most recent changes" button. The "new since last review" set (`sharedSeen`) already exists to drive it.
- **Settings → "All settings":** one page listing every setting in a two-column table: the control, then its label, with tap or hover for more help. Grouped under headers. Every setting also stays where it is now.
- **Library:** clip extraction, auto-updating playlists after a split, and undo for destructive actions.
- **Standardize:** a "shrink" step for files over the target bitrate. Long files: Standardize decodes the whole file (fails for ~2 h stereo) and encodes in real time through MediaRecorder (2 h of audio = 2 h of the app in front, off 'Playing'); a 1.2 GB WAV never got converted and hit the server's 1 GiB upload limit. Worth reading WAVs in pieces and finding a faster-than-real-time encoder (WebCodecs AudioEncoder). Also: the idle return to 'Playing' after 10 minutes stops Standardize, so an unattended laptop never finishes anything long; let it carry on there while nothing plays and nobody has touched the machine, pausing at the first input.
- **Hosting:** Drive or Dropbox adapters for individuals' libraries. Only centers are hosted on the droplet.
- **Other storage for shared libraries** (talked through 20 Oct 2026). Each library chooses its storage; the merge engine stays as it is and only a small adapter changes per service.
  - **The save without a conditional write:** never update the library file, add the next one (`state/000124.json`, as the droplet already stores versions). Then list that number: if there are two, the older wins; the loser deletes its own, merges and retries, as after a 409. Works on any service, including Drive v3, which offers no ETag to make a write conditional.
  - **Google Drive:** the narrow `drive.file` permission (no security review). A browser-only app gets only an hourly access token, and renewing it silently is unreliable on Safari, so the iPad would ask to sign in again. Decided: a small `token.php` on the droplet holds the OAuth client secret and trades sign-ins for refresh tokens (kept on the device, never on the droplet; it stores nothing, logs no bodies; one Google Cloud project for everyone, published out of Testing, or refresh tokens expire after 7 days). Library data goes straight between the device and Drive. Sharing one library across several Google accounts needs each to pick the folder once in Google's picker: test on a nonprofit shared drive before promising it; one center account on every device avoids it.
  - **pCloud** (Gen and friends use it): has OAuth and a browser SDK, and `diff` for cheap change checks; tokens appear not to expire. Old reports of CORS errors and IP-bound download links: an evening's test page first (sign in, upload, download from player.37dakinis.net). If browser downloads fail, it offers nothing over the droplet.
  - **Dropbox** gives browser apps refresh tokens (PKCE), so no server; 2 GB free. **OneDrive** browser tokens last about a day.
  - **Order:** libraries on one device (done, 1.4.001) → copying between libraries (keep track IDs, so copying again or back finds the copy already there; the same screen can serve Borrow from another library by join code) → pCloud test page → Drive adapter with `token.php`.
