# Design note: the desktop app's files backend (bridge 2)

For Gen to review before anything is built. 5 Nov 2026.

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

Everything above (revisions, the one-day grace, interrupted writes, the
library record's revision check, Undo, sync) stays exactly as it is and as
tested. Rust only does those five things, only inside the library's own folder
(paths are checked: no `..`, nothing outside), and knows nothing about tracks
or playlists. That's the "keep Rust boring" rule from the start.

## The one hard part: recordings are big

Today the app handles a recording as a **blob** in memory: it plays it from an
object URL, reads pieces of it for the waveform and loudness, cuts it in the
splitter, puts it in exports, sends it to the shared library, hands it to the
converter. IndexedDB gives the page blobs that are backed by files on disk, so
even the 1.2 GB WAV never has to sit in memory. A file read through Rust
arrives as bytes, so a 1.2 GB WAV would have to cross into the page whole.
That can't be the plan.

So recordings get read **by address** instead. Rust serves the library folder
at a private address of the app's own (a custom scheme, such as
`p37lib://localhost/…`), with Range requests, the way a web server serves a
file in pieces:

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

- **Where:** a new library in the desktop app goes in `Music/37 Player/<library
  name>/`, unless the person chooses elsewhere (the system's folder dialog,
  through Tauri). The same layout as today's folder libraries, with
  `37 Player library.json` saying which library it is, so a folder can be moved
  and found again, and a folder made in Chrome can be opened in the desktop app
  and back.
- **The list of libraries and their folders:** today in localStorage and a tiny
  IndexedDB database; in the desktop app, a small file in the app's own data
  folder, kept by Rust, so it can't be lost along with the webview's storage.
- **Moving a library in** from the webview's storage: the same "Keep it in a
  folder" copy as 1.4.153, with Rust's handles instead of the browser's.
- **Permissions on a Mac:** an app from outside the App Store isn't sandboxed;
  macOS may ask once before it reaches some folders (Documents, Desktop,
  external drives). Music is the friendliest default.
- **A library on a drive that isn't plugged in:** "can't find its folder", as
  for folder libraries today (Find the folder… / Open another library).
- **Bridge number 2** for the shell that has all this; a page that needs it on
  an older shell says to download the new desktop app.

## Testing

- The page side runs in the existing suite: a fake of the five Rust commands,
  written in JavaScript over the browser's private file system, stands in for
  Rust, so every test that runs on the files store (`STORE=opfs`) runs on the
  desktop's handles too.
- The Rust side gets its own tests: paths outside the folder refused, writes
  whole or not at all (a full disk included), Range answers right.
- Then the HP, the Surface and the Mac mini, with real libraries: the spike's
  checklist again, plus moving a library in, the 1.2 GB WAV, and a full disk.

## In what order

1. The Mac experiment above (a day's work at most, with a test build).
2. Rust's five commands and the address, with their tests; the handles in the
   page; the suite run through the fake.
3. Playing by address; the stand-in for big files; the places needing real
   blobs, one by one.
4. Where libraries live, the list file, moving a library in; bridge 2.
5. The three machines.

## Questions for Gen

- Is `Music/37 Player/` the right default place?
- Should the desktop app move existing libraries out of its webview storage by
  itself on first start (asking once), or only when asked, as in Chrome?
- Readable artist/album file names: still a later step, after this works?
