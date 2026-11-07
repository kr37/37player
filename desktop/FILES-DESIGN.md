# Design note: the desktop app's files backend (bridge 2)

For Gen Rinzin to review before anything is built. 5 Nov 2026; Gen Rinzin's answers the same
evening are worked in (see the end).

## What it's for

In the desktop app, a library should live as ordinary files on disk, not in the
webview's storage (IndexedDB), on the Mac as well as Windows. On Windows the
folder libraries of 1.4.153 already work in the app (WebView2 has the folder
picker), but the Mac's webview has no folder picker, so there the files have to
be reached through the app's Rust side. This is the step that makes the desktop
app what v2 is for: one copy of each recording, out of reach of anything that
clears a browser's storage.

## The idea: the same files store, reached through Rust

`FolderLibraryStore` (1.4.152) already keeps a library as files, tested with the
whole suite, and it's written against a browser's folder "handles": open a
sub-folder, list it, read a file, write a file whole, remove a file. So rather
than a second storage engine, the desktop app gives the page **handles of its
own**, a small JavaScript object with the same few methods, each one a call to
Rust:

| Handle method (what the store uses) | Rust command |
|---|---|
| `getDirectoryHandle(name, {create})` | `fs_dir(path, create)` |
| `getFileHandle(name, {create})`, `getFile()` | `fs_stat(path)`, and reading (below) |
| `entries()` | `fs_list(path)` |
| `createWritable()`, `write()`, `close()` | `fs_write(path, bytes)`: to a temporary file, then renamed over the old one, so a file is never half written. Over 8 MB the page sends pieces to `<name>.p37part` (`fs_write` with the header `p37-append: 1`) and renames that onto the file (`fs_rename`); a whole file read where it lies is copied (`fs_copy`) |
| `removeEntry(name, {recursive})` | `fs_remove(path)` |

Plus a sixth, `fs_rename(root, from, to)`, for readable names (below).

Everything above (revisions, the one-day grace, interrupted writes, the
library record's revision check, Undo, sync) stays exactly as it is and as
tested. Rust only does those few things and knows nothing about tracks or
playlists. That's the "keep Rust boring" rule from the start.

**Every command names its root** as well as a path inside it:
`fs_list(root, path)` and so on. A root is a folder Rust has on its list, and
only the person puts a folder there, through the system's folder dialog (or
the app's default folder for a new library): a library's own folder, or a
folder **used in place** (below). Paths are checked against their root (no
`..`, nothing outside it). The page can't widen what Rust reaches. Naming the
root in every call also lets more than one library be open at once, which a
later feature wants (other libraries' playlists on Playing, read-only; NOTES.md,
Open / later): each library is its own store over its own root.

## The one hard part: recordings are big

Today the app handles a recording as a **blob** in memory: it plays it from an
object URL, reads pieces of it for the waveform and loudness, cuts it in the
splitter, puts it in exports, sends it to the shared library, hands it to the
converter. IndexedDB gives the page blobs that are backed by files on disk, so
even the 1.2 GB WAV never has to sit in memory. A file read through Rust
arrives as bytes, so a 1.2 GB WAV would have to cross into the page whole.
That can't be the plan.

So recordings get read **by address** instead. Rust serves each root
at a private address of the app's own (a custom scheme, such as
`p37lib://localhost/<root>/…`), with Range requests, the way a web server
serves a file in pieces:

1. **Playing:** the player is given that address instead of an object URL. The
   webview streams from disk and seeks with Range, the same as playing from a
   website. (The Windows spike showed WebView2 plays this way; the Mac's webview
   plays from addresses too, and the Linux webview's trouble with custom schemes
   doesn't matter, as Linux isn't first-class.)
2. **Reading pieces** (waveform, loudness, the splitter, tags, sync uploads in
   pieces): the store's `getFile()` returns a stand-in for a blob, a small
   object with the blob's `size`, `type`, `name` and `slice()`, whose pieces are
   fetched from the address with Range when they're read. Most of the app
   already reads recordings piece by piece (`File.slice`, `analyzeMp3InPieces`
   and so on), because it already had to for phones.
3. **The places that need a real blob** have to be found and handled one by
   one. A first look suggests: exports and .37p backups (the ZIP writer),
   sending a whole file in one request, the converter (ffmpeg.wasm reads a real
   `File`), and Copy to another library. For each, either read pieces from the
   address, or, for files under a size limit (say 200 MB), simply read the
   bytes. Finding them all is the main work, and the tests will show what's
   missed.

**An experiment first, on the Mac mini,** because it could make point 3 much
smaller: when the Mac's webview fetches a big file from an address and makes a
blob of it (`fetch(url).blob()`), does it keep that blob on disk, as it does
for IndexedDB, or does it hold all of it in memory? If on disk, the stand-in
could often just be a real blob. A test build that does this with the 1.2 GB WAV,
watched in Activity Monitor, answers it in a few minutes.

## Where libraries live, and the small things around it

- **Where (Gen Rinzin):** a new library in the desktop app goes in
  `Music/37 Player Libraries/<library name>/`, unless the person chooses elsewhere (the system's folder dialog,
  through Tauri). The same layout as today's folder libraries, with
  `37 Player library.json` saying which library it is, so a folder can be moved
  and found again, and a folder made in Chrome can be opened in the desktop app
  and back.
- **The list of libraries and their folders:** today in localStorage and a tiny
  IndexedDB database; in the desktop app, a small file in the app's own data
  folder, kept by Rust, so it can't be lost along with the webview's storage.
- **Moving a library in** from the webview's storage **happens by itself (Gen Rinzin)**:
  on the first start of a desktop app with bridge 2, each library in the
  webview's storage is copied into its folder, checked (every record and file
  read back), and then used from there; a notice says where it went. The
  webview's copy stays untouched as a fallback for 30 days, then is removed
  (Settings can remove it sooner). A copy cut off part way (the app closed, a
  full disk) carries on at the next start, as 1.4.154's interrupted copies do;
  until it finishes, the library keeps working from the webview's storage.
- **Permissions on a Mac:** an app from outside the App Store isn't sandboxed;
  macOS may ask once before it reaches some folders (Documents, Desktop,
  external drives). Music is the friendliest default.
- **A library on a drive that isn't plugged in:** "can't find its folder", as
  for folder libraries today (Find the folder… / Open another library).
- **Bridge number 2** for the shell that has all this; a page that needs it on
  an older shell says to download the new desktop app.

## Readable names (Gen Rinzin: integral, the same week)

Gen Rinzin: readable artist / album / track file names are part of this move, not a
later step. So the files store names recordings readably from the start, and
nothing is first laid out by ID and then moved again:

A proposal for the layout:

```
Music/37 Player Libraries/Rinzin's library/
  37 Player library.json
  README.txt
  music/<Artist>/<Album>/<NN> <Title>.mp3
  playlists/<folders>/<Playlist>.m3u8   (a courtesy for other players; kept up to date, never read back)
  37 Player's own files/   (playlists and details, artwork, the waiting room; not for editing)
```

(Gen Rinzin, 6 Nov 2026, built in 1.4.179: recordings under `music/` and a visible
`playlists/`, so the top of the folder reads like a table of contents.)

The names are made the way the portable export already makes them
(`music/artist/album/…`), so a library folder looks like an export.

- The name comes from the track's details when the file is written; a file
  name that's taken, or the same recording twice, gets " (2)". Characters a
  file system refuses become "-"; very long names are shortened.
- Changing a track's name, artist or album renames (and moves) its file
  (`fs_rename`), as part of the same saved change, so Undo puts it back.
- The library record keeps each track's file path, so finding a recording
  never depends on its name. A file someone renames or moves by hand is "missing
  audio", and Check library looks for it by size and content in the library's
  folder.
- In the browser (Chrome/Edge folder libraries, 1.4.153), the same names, the
  same code.
- The order of work: readable names go into step 2 (the store learns them
  while it's being given Rust's handles), tested through the same fake.

## Use in place (Gen Rinzin likes it)

Of the three import modes planned for v2 (Copy, **Use in place**, Move), Use in
place leaves the recordings where they are: the person's own music folder
stays theirs, and the library only points into it.

- Each folder used in place is a root on Rust's list (above), chosen by the
  person in the folder dialog; Rust reads there, and nothing else.
- 37 Player never renames, moves or deletes a file in a folder used in place.
  Deleting such a track takes it out of the library only.
- Its recordings play by address and are read in pieces like the library's own.
- A shared library still gets a copy of the audio when it syncs (another
  device can't reach this computer's folder).
- **Edits to a track used in place** (Gen Rinzin's three ways, 5 Nov 2026: a) copy
  the recording into the library and point there, b) keep the edited details
  in the library's records only, c) write them into the file, which may
  belong to Music.app's library; Gen Rinzin leaned to a), and also floated setup
  options: no edits at all, ask each time, or a lasting choice).
  **Suggested (waiting for Gen Rinzin): b) as the rule, no prompts, plus one switch
  per folder, "Also write my changes into these files" (c), off by default.**
  a) quietly turns Use in place back into copying, one edit at a time (the
  disk fills unpredictably); under b) nothing inside 37 Player loses the
  edit, and everything that leaves it (exports, .37p, the shared library's
  copy) gets the edited tags written into its own copy, so only the original
  file stays as it was, which is what Music.app would want. "No edits at all"
  can come later if someone asks.
- **Gen Rinzin, 5 Nov 2026: b) it is, explained at the start of the import.** While
  a folder is used in place, its files **will not be touched**: edits live only
  in 37 Player's library (its records, `meta.json` and so on). Anyone who wants
  their edits in ordinary files to use elsewhere can export from 37 Player, or
  turn the folder into Copy (or Move) to the library. The per-folder switch to
  write into the files isn't part of this; it can come later if asked for.
- **The mode belongs to each import, not to the library.** One library can
  hold a folder used in place (say, Music.app's), recordings copied in from a
  USB stick, and others moved in. Each track's record says where its recording
  is: the library's own folder, or a path inside a root used in place. A
  folder used in place can later be turned into Copy or Move (its recordings
  copied or moved into the library's folder, and from then on the library's
  own); the reverse isn't offered.
- **Anything 37 Player makes is the library's own,** in the library's folder:
  a split's pieces, a conversion (the original stays where it is, in place),
  a recording from a shared library. Splitting a track used in place leaves
  its original untouched; the pieces go in `Music/37 Player Libraries/<library>/`.
- **Anything not imported as a folder used in place is copied.** Files dropped
  on 37 Player, picked one by one, or arriving in a shared library: their
  origin isn't a folder the person handed over (a Downloads folder gets
  emptied), so the library takes its own copy. A file that later appears in a
  folder used in place (a new album copied into Music.app's folder) isn't seen
  until that folder is looked through again ("Look for new files", later).
- **Removable drives** (a USB stick, an external disk; Rust can tell): the
  import defaults to Copy and says why. Use in place is still allowed, with a
  warning. When the drive isn't connected, its tracks show as "on a drive
  that isn't connected" (not missing, not damaged, nothing offered to delete)
  and come back when it is.
- **playlists/ with tracks used in place** (Gen Rinzin, 6 Nov 2026): the .m3u8
  points to the file where it is, with as many `../` as it takes
  (`../../../Music/iTunes/…`), so the playlist still works if the whole
  drive's tree moves together. Where no relative path exists (on Windows, a
  track on another drive letter), the line is the full path (`E:\Talks\…`),
  which every player reads too. A track on a drive that isn't connected keeps
  its line; the other player shows it as missing, as it would its own.
- Use in place and Move come after the backend and readable names work (they
  need the roots and the addresses, nothing more).

## The device's own settings (Gen Rinzin, 6 Nov 2026: as persistent as possible)

With libraries in folders, the webview's storage still holds a little: the
list of libraries and where each is, which one opens, the language, theme and
other settings of this device. That storage can go: WebView2 is Chromium and
can evict storage that isn't marked persistent when the disk is nearly full;
WebKit has its own limits; cleaning tools (CCleaner, CleanMyMac) and some
uninstalls delete it; nothing in 37 Player offers to. So in the desktop app
the shell keeps these in its own file, `device.json` in the app's data folder
(beside `roots.json`; on Windows the hidden AppData folder every program
uses, on the Mac `~/Library/Application Support/<identifier>/`), read and
written through the shell, with the webview's storage only a copy. If the
webview's storage is lost, nothing is: the libraries are found again from
`device.json`, and failing that by looking in `Music/37 Player Libraries/`
for folders with a `37 Player library.json`. Each library's own settings
already live in its folder.

- The app's identifier (now `com.player37.spike`; to be `com.player37.app`,
  Gen Rinzin, 6 Nov 2026) names that data folder, and
  the webview's storage, so the real one is set before friends' beta tests
  and then never changed.

## Everything the page keeps in browser storage, and where it goes (6 Nov 2026)

Gen Rinzin's test for 2.0: **delete the app's webview storage (CCleaner, CleanMyMac),
start again, and nothing is missing.** So everything a person would miss lives
in a file the shell can reach; the webview's storage holds only copies and
caches. Inventory of 1.4.190:

**A library's IndexedDB (`temple-sound-library`, `…~<id>`)** → its folder. A
folder library (`FolderLibraryStore`) already keeps all three stores as files,
so moving the library moves all of it:

| Store / record | What | In the folder |
|---|---|---|
| `audio`, `artwork` | recordings and pictures | `music/…` (readable names), `37 Player's own files/artwork/` |
| `state` `root` | tracks, playlists, the library's settings (shared library's join details too) | `37 Player's own files/state/` |
| `state` `undo`, `undotrash:*` | Undo's history, and what it keeps a day | same |
| `state` `sharedBase`, `sharedPending`, `sharedSeen`, `sharedCovered` | the shared library's last agreed version, files waiting either way | same |
| `state` `convertQueue`, `checkLibrary`, `libraryInfo`, `mp4repair`, `incomingCopies`, `copyPartial`, `replacing` | work in progress, and its markers | same |

**The device's IndexedDB** → stays (a cache): `converter` in the main
library's `state` (ffmpeg.wasm, fetched again from the app when missing);
`37player-folders` (folder handles of a browser; the desktop app finds its
folders by path, in `device.json` and `roots.json`).

**localStorage, the device's** → `device.json` (the shell's, in the app's data
folder), with localStorage as its copy:

| Key | What | |
|---|---|---|
| `37player.libraries` | the list of libraries, each one's folder, which opened last | **device.json** (lost: found again under the libraries' folder, below) |
| `37player.device` | language, theme, playback choices and other settings of this device | **device.json** |
| `37player.libTable` | Library → Table's columns | device.json |
| `37player.playLog` | the playback log | device.json (a log file beside it, trimmed) |
| `37player.storage`, `37player.autoRestore`, `37player.driveSignIn` | how this device stores, restores, signs in | device.json (Drive sign-in: re-asked if lost, fine) |
| `37player.feedbackSent`, `37player.logsSentAt` | when feedback and logs were last sent | can be lost |
| `37player.acceptEmpty`, `37player.newEmpty`, `37player.pendingJoin`, sessionStorage `37player.library`, `37player.place` | a step in progress, this window's library and place | can be lost |

**localStorage, a library's** (`….<library id>` or `…~<id>`) → its folder,
where a person would miss it, else nothing (built in 1.4.195: `local.json` in its own files' folder):

| Key | What | |
|---|---|---|
| `37player.sharedLog` | the shared library's sync log | the folder (`37 Player's own files/`), trimmed as now |
| `37player.syncPendingSince`, `37player.dailyAsk`, `37player.autoRestoreDeclined`, `37player.autoRestoreSent`, `37player.movedToFolder` | reminders and answers | the folder |
| `37player.analyzing`, `37player.downloading`, `37player.downloadCrashed` | crash markers (what was being done when the page died) | can be lost (worst case: one retry) |

**The shell's own** (`roots.json`, `pages/`, `device.json`) is in the app's
data folder: AppData on Windows, `~/Library/Application Support/<identifier>/`
on the Mac. A cleaner that empties that too (or a new computer) loses the list
of libraries: the app then looks for folders with a `37 Player library.json`
in the libraries' default place (`Music/37 Player Libraries/`), and **Find a
library folder…** opens any other (Gen Rinzin: the place is the person's choice; the
default is only a suggestion).

**Reading the list before the page starts:** the page reads the library list
synchronously as it loads (`pickWindowLibrary`), and `invoke` is asynchronous,
so the shell hands the page `device.json` as it starts (an initialization
script setting `window.__p37Device`); the page uses localStorage when it has
it, and that when it doesn't (a wiped webview), writing it back.

**Built (1.4.195):** see NOTES.md, "The desktop app's first start of 2.0".

**The move (step 4, Gen Rinzin):** the first start of 2.0 asks where the libraries
should live, suggesting `Music/37 Player Libraries/` with **Choose another
place…**, then copies each library from browser storage into its folder,
checks every file, and switches. The browser-storage copy stays 30 days as a
fallback, then goes.

## Testing

- The page side runs in the existing suite: a fake of the Rust commands,
  written in JavaScript over the browser's private file system, stands in for
  Rust, so every test that runs on the files store (`STORE=opfs`) runs on the
  desktop's handles too.
- The Rust side gets its own tests: paths outside the folder refused, writes
  whole or not at all (a full disk included), Range answers right.
- Then the HP, the Surface and the Mac mini, with real libraries: the spike's
  checklist again, plus moving a library in, the 1.2 GB WAV, and a full disk.

## In what order

1. The Mac experiment above (a day's work at most, with a test build).
2. Rust's commands (with roots) and the address, with their tests; the
   handles in the page; readable names in the store; the suite run through the
   fake. **Done 6 Nov 2026** (shell 1.4.175, page 1.4.174–175): `files.rs`
   with `fs_roots`, `fs_root_default`, `fs_root_choose`, `fs_root_forget`,
   `fs_list`, `fs_stat`, `fs_read`, `fs_write`, `fs_copy`, `fs_rename`,
   `fs_remove`, `fs_mkdir` and `p37lib://`, 12 `cargo test` tests (run before
   each desktop build); `DesktopDirHandle` / `DesktopFileHandle` in the page;
   readable names in the store for Chrome/Edge folder libraries too; so far the
   fake runs readnames.js's scenario, not yet the whole `STORE=opfs` set. Not
   switched on: the page doesn't use them, and the bridge stays 1.
3. Playing by address; the stand-in for big files; the places needing real
   blobs, one by one. **Done 6 Nov 2026** (page 1.4.194: DiskBlob, JoinedBlob,
   pieces of 8 MB with `p37-append`; the `STORE=desktop` set with every file
   a DiskBlob; `tests/diskblob.js`).
4. Where libraries live, the list file, moving libraries in by themselves;
   bridge 2. **Done 6 Nov 2026** (page 1.4.195, shell on the bridge2 branch:
   `fs_place`, `fs_place_default`, `fs_find_libraries`,
   `fs_root_choose_library`; `BRIDGE = 2` and `window.__p37Bridge` set before
   the page runs; `tests/desktopmove.js`, which is also the wipe test of step
   5 run through the stand-in shell). Left for the Mac: the same by hand.
5. The three machines.

6. Use in place, then Move.

## Gen Rinzin's answers (5 Nov 2026)

- **Default place:** `Music/37 Player Libraries/`.
- **Moving libraries out of the webview's storage:** automatic (few people use
  37 Player yet, and Gen Rinzin can tell them; still, it should just happen).
- **Readable names:** integral to the move, ideally the same week: built into
  the store in step 2, above.
- **Use in place:** Rust's access covers those folders too, as roots the
  person chose.
- **Later, not essential:** other libraries' playlists on Playing (and maybe
  Edit Playlists' columns C and D), read-only, below the open library's and
  folded at first; they don't sync and may be out of date until opened. Hence
  every call naming its root.

## Still open

- Nothing at the moment. (Edits to tracks used in place: decided, b).)
