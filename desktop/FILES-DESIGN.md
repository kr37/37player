# Design note: the desktop app's files backend (bridge 2)

For Gen to review before anything is built. 5 Nov 2026; Gen's answers the same
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
| `createWritable()`, `write()`, `close()` | `fs_write(path, bytes)`: to a temporary file, then renamed over the old one, so a file is never half written |
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

- **Where (Gen):** a new library in the desktop app goes in
  `Music/37 Player Libraries/<library name>/`, unless the person chooses elsewhere (the system's folder dialog,
  through Tauri). The same layout as today's folder libraries, with
  `37 Player library.json` saying which library it is, so a folder can be moved
  and found again, and a folder made in Chrome can be opened in the desktop app
  and back.
- **The list of libraries and their folders:** today in localStorage and a tiny
  IndexedDB database; in the desktop app, a small file in the app's own data
  folder, kept by Rust, so it can't be lost along with the webview's storage.
- **Moving a library in** from the webview's storage **happens by itself (Gen)**:
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

## Readable names (Gen: integral, the same week)

Gen: readable artist / album / track file names are part of this move, not a
later step. So the files store names recordings readably from the start, and
nothing is first laid out by ID and then moved again:

A proposal for the layout:

```
Music/37 Player Libraries/Rinzin's library/
  37 Player library.json
  <Artist>/<Album>/<NN> <Title>.mp3
  37 Player's own files/   (playlists and details, artwork, the waiting room; not for editing)
```

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

## Use in place (Gen likes it)

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
- **Edits to a track used in place** (Gen's three ways, 5 Nov 2026: a) copy
  the recording into the library and point there, b) keep the edited details
  in the library's records only, c) write them into the file, which may
  belong to Music.app's library; Gen leaned to a), and also floated setup
  options: no edits at all, ask each time, or a lasting choice).
  **Suggested (waiting for Gen): b) as the rule, no prompts, plus one switch
  per folder, "Also write my changes into these files" (c), off by default.**
  a) quietly turns Use in place back into copying, one edit at a time (the
  disk fills unpredictably); under b) nothing inside 37 Player loses the
  edit, and everything that leaves it (exports, .37p, the shared library's
  copy) gets the edited tags written into its own copy, so only the original
  file stays as it was, which is what Music.app would want. "No edits at all"
  can come later if someone asks.
- **Gen, 5 Nov 2026: b) it is, explained at the start of the import.** While
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
- Use in place and Move come after the backend and readable names work (they
  need the roots and the addresses, nothing more).

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
   blobs, one by one.
4. Where libraries live, the list file, moving libraries in by themselves;
   bridge 2.
5. The three machines.

6. Use in place, then Move.

## Gen's answers (5 Nov 2026)

- **Default place:** `Music/37 Player Libraries/`.
- **Moving libraries out of the webview's storage:** automatic (few people use
  37 Player yet, and Gen can tell them; still, it should just happen).
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
