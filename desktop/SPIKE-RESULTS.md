# Tauri spike (v2): results

The brief is `desktop/SPIKE.md`. The app is `desktop/` on branch `tauri-spike`:
Tauri 2 running `37-player.html` (1.4.153, unchanged) in WebView2.

## Machines

| | HP | Surface |
|---|---|---|
| Model | HP EliteBook 820 G3 | Surface |
| Windows | 10 Pro, build 19045 | 10 Pro 22H2, build 19045.6466 |
| WebView2 | 156.0.4314.58 (Chromium 156.0.8078.80) | 156.0.4314.58 (from the registry; the runtime isn't listed under Apps there) |
| Build tested | `tauri dev` (debug); the release build started once to check it | installed release build |

The release build (`npm run tauri build`: `37 Player_0.1.0_x64-setup.exe`
11.3 MB, `.msi` 11.8 MB, converter included) runs at `http://tauri.localhost/`
and serves the bundled converter (ffmpeg-core.wasm, 32 MB), the starter track
and help.json; a missing file comes back as index.html there too.

## Checklist

Tested by Gen on the HP, 4 Nov 2026, with the console recorded over the
DevTools protocol throughout; then 2, 3, 8 and 13 on the Surface with the
installed release build (`setup.exe`, unsigned: SmartScreen's "Run anyway"),
5 Nov 2026.

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
| 14 | The Surface (2, 3, 8, 13 with the installed build) | pass | All four passed. |

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

**Go with conditions.** Audio in WebView2 behaved like Chrome in every
playback test, on both machines and in both the dev and the installed build,
including minimised, covered, sleep and the media keys. The only failure
(closing without asking) is the shell's, not the webview's. Conditions for
the real app:

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

## The Mac (SKBC's Mac mini, macOS 12 Monterey), 5 Nov 2026

Tested by Gen with the GitHub-built test builds (`.github/workflows/desktop-mac.yml`):
first the Mac-only build 2 (1.4.153), then desktop test build 6 (1.4.160). Unsigned:
installed from the .dmg and opened without trouble.

| Test | Result | Notes |
|---|---|---|
| Install, sync, play | pass | Synced from the droplet library, pulled tracks, played. |
| Seeking in the 1.3 GB WAV | pass | |
| Minimised | pass | Tracks move on; silences end on time. |
| Covered, hidden (Cmd-H) | **fail, fixed** | A 60-second silence took 60–69 s covered and 69 s hidden (Gen's stopwatch: 71 s from 10 s before a track's end to the next track, 71–80 covered, 80 hidden). The silence's clock was only looked at on animation frames and timeupdate, which a covered window on a Mac gets rarely. Fixed in 1.4.158 (`runSilenceClock`): after it, timing "now perfect" (build 6). |
| Screen locked, display asleep | pass | 71 s, as in the foreground (build 6). |
| Cmd-Q while playing | **fail, fixed** | Build 2 quit without asking (it predates the question). Build 6, with its own Quit menu item: the dialog works well. |
| Check for updates | pass | Says a newer desktop version is a new download (1.4.159). |
| Library info | **fixed** | Said "?'s storage (IndexedDB) for localhost" and "this browser's own storage"; 1.4.161 says the desktop app's own storage. |
| Starter track, converter | **fixed** | The Mac app's address is `tauri://localhost`, so they were fetched from 37player.com, which refuses that origin (CORS); 1.4.157 takes them from beside the app. |
| A fresh start | note | Deleting the app keeps its data (`~/Library/WebKit/com.player37.spike`, `~/Library/Caches/com.player37.spike`); delete those for a first run. |
| Folder picker | absent | As expected in WebKit: no "Keep it in a folder" on the Mac until the Rust files backend. |

Console (build 2): the viewport's `interactive-widget` and the embedded manifest's
relative `start_url`/`scope` are reported by WebKit; harmless.

Later on 5 Nov: **restart** (library, playlists, place) and a **fresh first run** both passed.

Later still (build 6, 1.4.160): **media keys and Now Playing** pass; **reopening** resumes
about 4 seconds back (37 Player's usual rewind); the **splitter** works.

**Converter: fails.** Converting a .wma stops with "Aborted(CompileError:
WebAssembly.Module doesn't parse at byte 3: can't get Function local's type in group 0,
in function at index 10)". The webview can't load ffmpeg-core.wasm at all, whatever the
file. Reading the wasm: function 10's first locals are `v128` (0x7b), WebAssembly SIMD,
and the core has 4,478 local groups of that type. ffmpeg.wasm 0.12.10 is built with SIMD (`-msimd128` in its Makefile's `PROD_CFLAGS`); Safari has it from 16.4. The Mac mini's Safari is 17.6, and build 10 (1.4.161) still fails: on older macOS a Safari update keeps its newer WebKit for Safari alone (`/Library/Apple/System/Library/StagedFrameworks/Safari`), and other apps' webviews get the WebKit Monterey shipped with. Updating Safari can't help the desktop app, and the Mac mini can't go past Monterey.

Checked with wabt: apart from SIMD, everything the converter uses (bulk memory, sign extension, atomics) is in Safari-15-era WebKit, so SIMD is the only obstacle. `@ffmpeg/core-st` 0.11.1 validates without SIMD but is an older ffmpeg with a different API. A no-SIMD build of 0.12.10 (`make build-st` with `-O3` and libwebp's SIMD off) would keep the same API. The choices: that build, picked when `WebAssembly.validate` says there's no SIMD (it would also help iPads and Macs whose Safari is older than 16.4); a native ffmpeg in the desktop app; another device converting; or a clear message.

**Verdict for the Mac so far: go.** Every playback problem found was 37 Player's own
and is fixed; WKWebView on Monterey played everything, including with the display asleep.
On Monterey the converter needs a build without SIMD (or a native ffmpeg).
