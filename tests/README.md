# 37 Player tests

Browser tests that drive real Chrome through Puppeteer, against a **test copy**
of `../37-player.html` (the real file is never changed) and a local copy of
`../sync.php`. Written while building shared-library sync and screen-off
playback (October 2026); each prints `ok` / `FAIL` lines and ends with
`ALL OK` or `N FAILED`.

## Setting up (once)

Needs Node, PHP (command line), Python 3, ffmpeg and Chrome or Chromium.

```
cd tests
npm install                 # puppeteer-core only; it uses your own Chrome
./make-fixtures.sh          # makes the test audio in tests/www (about 1.3 GB, mostly WAVs)
```

## Running

```
CHROME=/usr/bin/google-chrome ./run-all.sh            # everything, ~15 minutes
CHROME=/usr/bin/google-chrome ./run-all.sh miss play  # some
```

`run-all.sh` builds the test copy, starts the two servers, makes a fresh
shared library for each test and prints one line per test. Each test's full
output (and any screenshots) goes to `tests/shots/`.

By hand: `./serve.sh` in one terminal (servers on ports 8861 and 8870), then
`node miss.js "$(./new-library.sh)"` in another. `e2e.js` takes two codes:
`node e2e.js "$(./new-library.sh)" "$(./new-library.sh)"`.

**On the files store:** `STORE=opfs python3 make-debug-copy.py` builds a test copy whose libraries are files (OPFS) instead of IndexedDB, so the same tests check that storage. Tests that open IndexedDB themselves (conv, e2e, full, libs, notloaded, …) can't run that way.

## How it fits together

- `debug-hooks.js` — the app's functions the tests reach (`window.__dbg`,
  `__dbg3`, `__st`, …). Top-level functions aren't on `window`, hence hooks.
  If the app renames something a hook uses, the test copy fails to load: fix
  the hook here.
- `make-debug-copy.py` — app + hooks → `www/37-player.html`. Also lets a test
  pretend there's something to sync (`window.__fakeOut`).
- `engine/` — the sync merge engine's tests, in plain Node, after
  `extract-engine.py` pulls the `SYNC-MERGE:BEGIN/END` block out of the app.
- The phone/tablet tests emulate a touch screen and simulate the app leaving
  the screen (`document.hidden`). That tests 37 Player's logic only; what a
  real phone does has to be checked on the phone, with Settings → Playback →
  Playback log.

## The tests

| Test | What it checks |
|---|---|
| e2e | Joining from Settings, two devices syncing, a second library |
| fold | Folders and playlists moving and deleting across devices |
| rev | Review changes: arrows, dependencies, applying |
| part | Partial sync: what comes, what stays, deleting |
| dup | The same recordings imported on two devices are matched; since 2.2.025 the joining device's copies, being the same files, are kept under the shared IDs and none is downloaded |
| ipad | Touch: selecting, dragging, folders (iPad emulation) |
| miss, miss2 | Tracks not arrived yet: banner, "waiting for (device)", clearing when they land; miss2 in the order an import writes |
| table | Library → Table: switching views, sorting both ways, search and chips, selecting (click, Shift, Ctrl-A), Delete asking, double-click playing, ✎, Columns, kept after a reload, an iPad's width with the name pinned |
| p37 | Backups as .37p: the name, a zip inside, restoring when picked and when opened with 37 Player, the iPad picker |
| restore | Automatic restore: the switch, the sealed HttpOnly cookie from restore.php, the library erased, "Bring your library back?" rejoining in one tap; backups only; Start fresh not asked again (its own `php -S` on port 8863) |
| swfallback | The service worker opens the last version that started properly when the server answers 404 or 500, doesn't answer, is down, sends a cut-off file, or a version that doesn't start (the watchdog), says so, and takes a working version afterwards |
| switchsend | Switching library while audio is still being sent: 37 Player asks, in words, instead of the browser's "Leave this page?" |
| splitter | The splitter (1.4.086): three cuts in WAV, MP3, M4A and FLAC with a piece left out, the format each comes out in (and a WAV the settings would convert), clicks landing where they're heard (the MP3 gapless offset), loudness and volume kept, own waveforms, the keyboard, column B's entry becoming the pieces and one Undo taking it back, phone width |
| dropfolder | A folder dropped from the file manager (1.4.155): every file, sub-folders too, in path order; on the Library tab the import review, on a playlist straight in |
| folderpl | Folder import making a playlist of each folder: names, nesting, track-number order, re-importing, unticked |
| plmiss | Playlists whose audio isn't all there: import all, only complete ones, or none |
| stopimport | Stopping a folder import part-way: complete / all / no playlists, and Carry on |
| quota | Storage filling up during a folder import: stops at once, says why, never hangs |
| full | A full device: a failed save shows in the top bar (and once as a dialog), is retried and clears once there's room, nothing lost; a failed audio write keeps the track's revision; receiving stops at a file it can't store, says so, and resumes at Sync now |
| notloaded | Storage that comes back empty on a device that had a library: "Your library didn't load", can't be dismissed, nothing written, Try again / Start empty; a library just made isn't warned about; storage that never answers is said after 8 seconds |
| interrupted | A restore or re-join cut off after clearing (1.4.154): no "didn't load", the library opens empty with a notice, the marker goes; the library record missing with its other records there isn't taken for lost storage |
| dlcrash | A download that closes the page: noted first, named at the next start, not received again by itself, received at Sync now |
| pieces | Receiving in pieces (256 KB here): byte for byte, carried on after being cut off, a file that comes out the wrong size not kept and not retried until Sync now |
| libdel | New library → Start empty skips the sharing question; deleting a library deletes its backup folder only if asked, only 37 Player's files, only while it's that library's |
| bkkeep | The backup folder keeps a track's files while the track is in the library, even when this browser has lost its audio; only a track leaving the library frees its file |
| filestore | The files store (1.4.152): records and files round-trip; a replaced or deleted file stays readable until its grace is over; unused files tidied; the library record written only at the expected revision, a damaged one reported; odd keys round-trip |
| setup | Setting up (2.2.023): the welcome's Try it out / Install; the guide's way on Windows (the desktop app, its warnings, "I can't install apps" → Chrome's way), Mac Safari (Try it out: Chrome suggested, testing only; quiet for four imports; the fifth: "Done trying it out?" with the Mac app and bringing the library along), Linux Chrome after two days, Linux Firefox (Chrome or Edge only), iPad tab (Home Screen), iPad Home Screen app (Google Drive or by hand), installed Linux Chrome (the folder step); the top bar's Install; #setup and #try |
| leave | Leaving through Settings (2.2.027): says how many tracks never arrived; removes them; a playlist left with only a stop counts as empty; defaults (closing the first question) remove the empty one and trim the other; the other choices keep it empty and remove the other |
| copied | A joined library opened by another install (a copied folder, 2.2.021): no sync until asked; another device needs a new name and then syncs under it; "This is still" adds the install; closed, Settings says why and Sync now asks again; a join from before is taken as this install's |
| folderlib | Libraries kept in a folder the person chose (1.4.153): offered in Library info, the move, running from the folder, removing the browser's copy, edits kept, "In a folder", permission asked again, a lost folder found again (and a wrong one refused); after the browser's storage is cleared, a new first library never copied over the old library's folder, while a copy of its own that was cut off still carries on (2.2.019); Find a library folder… in Chrome: in place of an empty first library (also from Keep it in a folder…'s refusal), refused beside one with tracks, added when its ID is new, asking when the library is kept in another folder (2.2.020) |
| desktop | The desktop app's bridge (1.4.156), with a stand-in shell: closing with nothing going on quits; while playing it asks (Keep it open / Close anyway); Google Drive says it isn't available in the desktop app yet; nothing of it in a browser |
| delplaying | Deleting a track that's playing (1.4.162): the confirmation says so; Cancel keeps it playing; Delete stops it and deletes; another track's delete says nothing and playing carries on |
| place | Reloads keep the theme (no dark flash) and the place: Settings section, Help topic, tab; a PIN is still asked |
| phonecols | Phone: dragging the line between columns with a finger, portrait and landscape, kept after a reload |
| play | Pressing play on a track still downloading: one download, no restarts, never starts by itself |
| silclock | A silence ends on time with no animation frames or timeupdates (a covered window on a Mac), 1.4.158 |
| bridge3 | Screen off: silent loop through track → silence → track, lock-screen buttons |
| stoplock | Stops keep the lock screen ready; ▶ there continues |
| ph | Pausing off screen keeps the lock screen ready; ▶ resumes |
| pausesync | Syncing after a pause keeps the paused track on the lock screen |
| awk2 | "Keep syncing with the screen off": starts, gives way to playing, resumes, stops when done |
| pk2 | Waveforms on the server: flat ones never sent, real ones replace flat ones |
| crash | A track whose analysis closed the page is skipped afterwards |
| retry2 | Flat stand-in waveforms repaired; Check for updates reads the version |
| wav, long | Long WAV/MP3 analysed in pieces: same loudness and waveform as whole |
| stop | The list of earlier names sits under the field on a touch screen |
| af | Autofill off on text fields; viewport resizes for the keyboard |
| twowin | An older copy in another window is told a newer one is open, stops syncing and asks to be reloaded |
| conv | Files this browser can't play (WMA, ALAC, compressed AIFF) kept and marked at import; AIFF dropped on a playlist comes in as WAV; Playing says how many can't play; Library cleanup's Check again repairs an old 0:00 AIFF |
| conv3 | Converting: "Convert them now" asks to download the converter, then WMA and Apple Lossless become MP3 in place; the other device in the shared library gets the MP3; a conversion stops when playback starts and is done again after |
| conv4 | Two windows: converting in one waits while the other plays; with "Only when nothing is playing" off it carries on, and turned back on it stops and waits |
| conv5 | The File format settings: a WAV converted under the default, kept under "Don't touch my files" (a WMA still converted, its original kept without asking), Choose the rules with custom AAC showing and converting what it would, FLAC asking first, the settings travelling both ways through a shared library |
| conv6 | Audio from video files (AAC copied out, Vorbis to MP3, a silent video reported, the tracks in the playlist), and a portable export converted to the preferred format |
| conv2 | The same through a folder import: the playlist keeps its place for the WMA, and another device in the shared library sees it marked |
| libs | Several libraries on one device: making, switching, two windows, deleting, joining into a new library |
| welcome | The first run (language, then only whether to join), the glowing buttons, the Heads-up at the first import on Chrome, Firefox, iPad Safari (Are you sure?, a quick job), the iPad Home Screen app and Android (Install), the red backup button, nothing asking on leaving, the daily prompt, a sync that doesn't finish |
| share | The welcome's sharing question, "In sync", who keeps backups, restoring on a joined device |
| choose | What's on this device: unticking, New, ticking, albums, back to Everything |
| drive | Google Drive libraries against a fake Google and the real token.php: sign-in, making a folder, joining, a true tie, an expired token, signing in again |
| bigfile | Big files never held whole in the page (the desktop app): a real Blob made in pieces, a 20 MB file sent to Google Drive 1 MB at a time from the disk, details not written into a big file, no automatic conversion of one (only when asked, with a warning) |
| rejoin | Joining again after leaving partway: a track whose audio never arrived counts as needing it (the choices say what will download, and it is fetched); an already joined device that loses a track's audio gets it back on Sync now |
| moved | The move to 37player.com: a new browser goes straight there, a used one stays with "37 Player has moved" and the way across; saved addresses follow |
| emptyshared | A shared library with nothing in it yet: joining it sends everything up without "use the shared library or combine", and restoring a backup on a device joined to it restores straight in and stays joined |
| webkitstore | Re-tagging stores the new file in one piece and reads it back on Safari (pretended), and as before elsewhere: MP3 and WAV keep playing with the new tags |
| damaged | Library cleanup → Damaged files finds a stored file damaged the Safari way and repairs it from the old file inside; export leaves a damaged file out and names it |
| starter | A library that is still only the starter prayer: no "Back up library", and restoring a backup over it gives no "older than your library" warning; once a track of the person's own is added, both behave as before |
| openwith | Audio files opened with 37 Player (Open with, Android Share): Play it now leaves the library alone, Import imports, Play and import does both; the manifest offers the right types |
| exportfile | Exporting without a zip: one track as just its file, several as separate files into a chosen folder (a stand-in), a name already there kept |
| allsettings | Settings → All settings: grouped by whose setting it is; theme, a switch, loudness and language changed in the table take effect; PIN links to its page |
| big413 | A file the server refuses as too big isn't sent again at every sync, and the status says so |

## The converter test page (tests/convert/)

A page to try ffmpeg.wasm (ffmpeg compiled for browsers) on real devices
before it goes into 37 Player: load time, conversion speed and memory, and
whether converted files play without gaps. It never touches a 37 Player
library.

On the test site, once: `cd tests/convert && ./get-ffmpeg.sh` (downloads
ffmpeg.wasm 0.12.10, about 32 MB, into `tests/convert/ffmpeg/`, not kept in
git). Then open `https://playertest.37dakinis.net/tests/convert/` on each
device, and press "Copy results" at the end.

`convert-page.js` runs the same page headless: `(cd .. && python3 -m
http.server 8862)`, then `node convert-page.js [more files]`; `FMT=aac`
(or `flac`, `small`) picks the format. Speeds from it say little about a real
device.

## In WebKit and Firefox

The tests are written for Puppeteer and Chrome. `engines/adapter.js` is a
Puppeteer-shaped wrapper over Playwright (as much as the tests use), and
`engines/hook.js` swaps it in for `puppeteer-core` when `ENGINE` is set, so
the same files run in WebKit (Safari's engine: iPads, Safari, the Mac desktop
app) and Firefox:

    npm i --no-save playwright && npx playwright install --with-deps webkit firefox
    ./run-engines.sh webkit              (every test)
    ./run-engines.sh firefox e2e conv    (just these)

`./run-engines.sh chromium` runs them through the adapter in Chrome, to check
the adapter itself. On GitHub, `.github/workflows/tests-engines.yml` runs both
engines on each pull request to main, and when asked; free there (public
repository). Not every test can pass in every engine: some exercise Chrome-only
things (folder access, CDP); the list of those is kept in NOTES.md, Testing.

