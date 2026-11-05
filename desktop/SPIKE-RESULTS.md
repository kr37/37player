# Tauri spike (v2): results

The brief is `desktop/SPIKE.md`. The app is `desktop/` on branch `tauri-spike`:
Tauri 2 running `37-player.html` (1.4.153, unchanged) in WebView2.

## Machines

| | HP | Surface |
|---|---|---|
| Model | HP EliteBook 820 G3 | (to come) |
| Windows | 10 Pro, build 19045 | |
| WebView2 | 156.0.4314.58 (Chromium 156.0.8078.80) | |
| Build tested | `tauri dev` (debug); the release build started once to check it | installed release build |

The release build (`npm run tauri build`: `37 Player_0.1.0_x64-setup.exe`
11.3 MB, `.msi` 11.8 MB, converter included) runs at `http://tauri.localhost/`
and serves the bundled converter (ffmpeg-core.wasm, 32 MB), the starter track
and help.json; a missing file comes back as index.html there too.

## Checklist

Tested by Gen on the HP, 4 Nov 2026, with the console recorded over the
DevTools protocol throughout.

| # | Test | HP | Notes |
|---|---|---|---|
| 1 | Import | pass, with one gap | Folder through the picker: yes. Selected files dragged onto a playlist: yes. M3U8 with its files: yes. .37p restore: yes. Dragging a **folder** in imports nothing; that's 37 Player in any browser, not WebView2 (see below). |
| 2 | A whole session | pass | Tracks, silences, stops and moving on by itself all right; silences on time. |
| 3 | Seeking on a long recording | pass | "Seems about right." |
| 4 | The 1.2 GB WAV | pass | Arrived through a shared library, played, sought, split into 3. |
| 5 | Loudness | pass | By album, by track, a track's own boost: audible, no glitches. |
| 6 | Converter | pass | After bundling ffmpeg.wasm with the app (below). |
| 7 | Splitter | pass | The pieces play. |
| 8 | Minimised and covered | pass | Kept advancing for 10 minutes minimised and when covered; silences ended on time. No `backgroundThrottling` setting was needed. |
| 9 | Sleep and wake during a pause | pass | After waking, the track was where it stopped; Play played it. (It was paused, so not starting by itself is right.) |
| 10 | Media keys and the Windows media overlay | pass | Show the track and control it. |
| 11 | Shared library (droplet) | pass | Joined, synced, played a track that came by sync. Google Drive: blocked as expected (`token.php` refuses the webview's origin: CORS). It failed cleanly, with a message, but the wrong one: it said the server wasn't available or set up, when it's the desktop app that has no Drive sign-in yet. |
| 12 | Closing the window while playing | **fail** | The window closes at once and the music stops, with no question, even while audio was being sent to the shared library. A browser asks (`beforeunload`); Tauri's close doesn't. |
| 13 | Restart | pass | All three libraries, the playlists and the place (track and position, its +3 dB) were back; the shared library's sending carried on. |
| 14 | The Surface | to come | |

## What differed from a browser

- **The page's address.** `tauri dev` serves `dist/` from its own server at
  `http://127.0.0.1:1430`; the built app is `http://tauri.localhost`. Each is
  a separate origin with its own IndexedDB, so the dev and installed copies
  have separate libraries. The real app's address (and so `useHttpsScheme`)
  has to be chosen before the first release and never changed, or every
  library is left behind, just as renaming `temple-sound-library` would.
- **Missing files come back as `index.html`, not 404.** That turned the
  starter track into an unplayable track, and the converter download into
  "ffmpeg-core.wasm isn't a WebAssembly file". Fixed outside the app: the
  copy script puts `libraries/starter.mp3` in `dist/`.
- **The converter is looked for beside the app.** The brief expected it from
  37player.com, but `converterBaseUrl` uses 37player.com only for `file://`;
  on any http(s) address it uses `ffmpeg/` beside the app. The copy script
  now downloads ffmpeg-core.js, .wasm and VERSION from 37player.com once into
  `dist/ffmpeg/`, so the desktop app carries its converter (+31 MB) and
  converts offline from the first run. Worth keeping for the real app.
- **The service worker** doesn't register (`sw.js` comes back as HTML: "The
  script has an unsupported MIME type"). Harmless, and not wanted in the
  desktop app anyway.
- **`showDirectoryPicker` exists** in WebView2, and the folder picker works.
- **Storage:** quota about 10.7–13 GB (the browser's share of the disk);
  `navigator.storage.persisted()` is false.
- **Google Drive:** `token.php?op=status` is refused by CORS from the
  webview's origin, and the app then says the server isn't available or set
  up, which points at the wrong thing. A desktop sign-in flow is needed
  anyway (the redirect comes back to 37player.com); until then the desktop
  app should say Google Drive isn't available in it yet.

## Workarounds used

None in `37-player.html`. Outside it, in `desktop/copy-app.mjs`: the starter
track and the converter are copied into `dist/` beside the app.

## Console

Distinct errors and warnings over the whole session (count, message):

- 8 × "The script has an unsupported MIME type ('text/html')": the service worker, above.
- 7 × "Waveform analysis failed … Unable to decode audio data": files the
  browser can't decode, before conversion (WMA/ALAC). As in a browser.
- 4 × CORS on `https://37player.com/token.php?op=status`: Google Drive, above.
- 2 × "Couldn't fetch the converter: ffmpeg-core.wasm isn't a WebAssembly file": before the converter was bundled.
- 1 × "The library came back empty, but this device had one: treated as not
  loaded": a false alarm (below).

## Found on the way (not WebView2)

- **"Your library didn't load" when it had only just been made.** Seen at
  least once while making, joining and deleting libraries; at 9:08 PM it
  came straight after a reload cut off a shared library's uploads. Gen: the
  same false alarm played a part in losing his backups when his disk filled.
  `storageLooksUsedBefore` treats a library with no saved record as lost when
  the device's list says it had tracks or is shared, or when storage is
  persistent around a database just created; the "new" and "joining" marks
  that excuse it last for one start only (`:36362`, `:43832`). Likely: a join
  cut off by a reload before the library's first save, or a new library never
  saved in a browser whose storage is persistent (installed Chrome). To be
  reproduced and fixed on `dev` with a test; probably by saving a library
  record the moment a library is made or joined.
- **Dropping a folder onto a playlist imports nothing,** silently, in every
  browser: the drop handlers pass `dataTransfer.files`, which holds the
  folder itself, and `importFiles` keeps only audio files. Reading folders
  with `webkitGetAsEntry` would fix it for browsers and the desktop alike.

## Verdict

**Go with conditions** (pending the Surface). Audio in WebView2 behaved
like Chrome in every playback test, including minimised, covered, sleep and
the media keys. Conditions for the real app:

1. Closing the window asks first when something is playing or being sent
   (catch `CloseRequested` in Rust and ask the page).
2. Choose the app's address (and identifier) once, before the first release.
3. Bundle the converter with the app.
4. A desktop sign-in flow for Google Drive (and pCloud); until then, say
   Drive isn't available in the desktop app.
5. One instance only (Tauri's single-instance plugin: a second launch brings
   the open window forward). Two copies share one WebView2 data folder; on
   the HP, starting the release build while the dev build (launched with a
   debugging option) was open failed with WebView2 error 0x8007139F, and the
   open one's webview closed at the same moment. With identical options a
   second launch would open a second window on the same library.
