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
| dup | The same recordings imported on two devices are matched |
| ipad | Touch: selecting, dragging, folders (iPad emulation) |
| miss, miss2 | Tracks not arrived yet: banner, "waiting for (device)", clearing when they land; miss2 in the order an import writes |
| play | Pressing play on a track still downloading: one download, no restarts, never starts by itself |
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
| welcome | The welcome for each kind of device and browser |
| share | The welcome's sharing question, "In sync", who keeps backups, restoring on a joined device |
| choose | What's on this device: unticking, New, ticking, albums, back to Everything |
| drive | Google Drive libraries against a fake Google and the real token.php: sign-in, making a folder, joining, a true tie, an expired token, signing in again |
| moved | The move to 37player.com: a new browser goes straight there, a used one stays with "37 Player has moved" and the way across; saved addresses follow |
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
