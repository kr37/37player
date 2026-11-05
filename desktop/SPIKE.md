# Tauri spike (v2): brief for the session on the HP

**Read first:** `CLAUDE.md`, then `NOTES.md`, sections "Architecture in brief"
(the storage layer, 1.4.151–153), "Playback model", "Playing with the screen
off", and under "Open / later" the item **v2.0: Tauri 2 for storage**.

## What a spike is here

A short, throwaway experiment that answers one question before we commit to
building: **does 37 Player play audio dependably inside Tauri 2's Windows
webview (WebView2)?** Yes, it really is just a small Tauri 2 app that loads
`37-player.html` and checks audio. Time box: about a day. The code may be
thrown away; the findings are what matter.

**Not in the spike:** any storage work (the app keeps using IndexedDB inside
the webview, as it does in a browser), Rust beyond the template, readable file
names, updaters, signing, Mac, Linux, iPad. Don't change `37-player.html`
except for tiny, clearly marked workarounds needed to run at all (list them in
the results).

## Setup (native Windows, not WSL)

- Rust (rustup, MSVC toolchain), Microsoft C++ Build Tools ("Desktop
  development with C++"), Node LTS. WebView2 is already on Windows 10/11.
- Branch `tauri-spike`, from `dev`. Everything goes in `desktop/` in this repo
  (it's public on the droplet's site, which is fine: `desktop/.htaccess`
  blocks it from the web). `.gitignore`: `desktop/src-tauri/target/`,
  `desktop/node_modules/`, `desktop/dist/`.
- `npm create tauri-app@latest` (vanilla JS), or `cargo tauri init`, in
  `desktop/`. Product name "37 Player", identifier `com.player37.spike` for
  now (the real one, probably `com.player37.app`, is decided later and never
  changes after the first release).
- Frontend: a script copies `../37-player.html` to `desktop/dist/index.html`
  (and `../help.json` beside it) before dev/build; `frontendDist` points at
  `dist`. One app file, no fork.
- Window config: `"dragDropEnabled": false` (otherwise Tauri takes file drops
  and the page never sees them; imports by dragging must work), a sensible
  size (1300×900), `devtools` on in debug builds. For the spike, `"csp": null`.

## What will differ from a browser (expected, note what happens)

- The page's address is `http://tauri.localhost`, not 37player.com: `sw.js`
  won't register (fine), the starter track (`libraries/starter.mp3`) won't load
  (fine), help.json comes from `dist/`.
- The converter (ffmpeg.wasm) is fetched from `https://37player.com/ffmpeg/`
  (CORS is open there). It must work: WASM, a worker built from a blob.
- Shared library on the droplet (`sync.php`): CORS is `*`, so joining with a
  code should work. Google Drive sign-in will **not** work (its return
  address is 37player.com); expected, just confirm it fails cleanly.
- `showDirectoryPicker` (folder libraries, folder backups): may or may not
  exist in WebView2. Note which.

## Checklist (on the HP, then the installed build on the Surface)

Use real Center material where possible: a puja playlist with silences and
stops, a long teaching (1–2 hours), and the 1.2 GB WAV if it's to hand.

1. **Import:** a folder by the file picker, and by dragging a folder in; an
   M3U8 playlist with it; a .37p backup restored.
2. **A whole session:** a real playlist from start to end: tracks, silences
   (ticking), stops (waiting for a click), moving on by itself. Timing of
   silences right?
3. **Seeking** on a long recording: click in the waveform, near the end, back
   to the start; the time shown matches what's heard.
4. **The 1.2 GB WAV:** imports, plays, seeks.
5. **Loudness:** Even out loudness By album / By track, and a track's own
   +6 dB (that path uses Web Audio): audible, no glitches.
6. **Converter:** import a WMA or ALAC file; it converts and plays.
7. **Splitter:** split a track; the pieces play.
8. **Minimised and covered:** start a playlist with a silence and a few short
   tracks, minimise the window for 10 minutes, and separately cover it with
   another app. Does it keep advancing, and do silences end on time? (Webviews
   throttle hidden pages. If it stalls, try Tauri's `backgroundThrottling`
   window option and report both.)
9. **Sleep and wake** during a pause, then play.
10. **Media keys** (keyboard play/pause) and the Windows media overlay
    (Media Session): do they show the track and control it?
11. **Shared library:** join an existing droplet library (a test one), let it
    sync, play a track that arrives by sync.
12. **Closing the window while playing:** what happens? (The app should ask;
    record what it does now.)
13. **Restart:** quit and reopen; library, playlists and place are all there.
14. **Surface:** `npm run tauri build`, install the .msi/.exe on the Surface,
    and run 2, 3, 8 and 13 there.

## Report

`desktop/SPIKE-RESULTS.md`: the WebView2 version (`chrome://version` in
devtools, or `navigator.userAgent`), Windows version on each machine, the
checklist with pass / fail / notes, every console error worth knowing, any
workaround used, and a short verdict: go, go with conditions, or no-go.
Add a two-line summary to NOTES.md under the v2.0 item. Commit as Gen (see
CLAUDE.md) to `tauri-spike`; push; don't merge.

## The Mac (SKBC's Mac mini, macOS 12 Monterey)

The Mac app is built on GitHub (`.github/workflows/desktop-mac.yml`, on every
push to `tauri-spike`) and published as a pre-release, **37 Player for Mac,
test build N**, under the repo's Releases: download `37-Player-mac-test.dmg`,
open it, drag 37 Player to Applications.

- **First open:** it's unsigned, so right-click (or Control-click) the app →
  **Open** → Open. If macOS says it's "damaged", in Terminal:
  `xattr -cr "/Applications/37 Player.app"`, then open it again.
- **Console:** right-click in the app → **Inspect Element** opens Web
  Inspector (Console tab). Note errors worth knowing.
- **Which WebKit:** in Inspector's console, `navigator.userAgent`; and About
  This Mac → the Mac's model and macOS version.

The same checklist, most important first if time is short: 2 (a whole
session), 8 (minimised and covered, and with the screen locked or the
display asleep), 3, 4, 5, 6, 10, 11 (droplet library), 13, then the rest.
On the Mac also: **Dock and Cmd-Q** (quitting while playing: what happens?),
and **does the folder picker exist** (`'showDirectoryPicker' in window`;
expected: no, in WebKit). Results go in `desktop/SPIKE-RESULTS.md` beside
the Windows ones.
