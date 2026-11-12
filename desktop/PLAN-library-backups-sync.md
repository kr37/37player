# Where the library lives, backups and shared libraries: the plan

For Gen Rinzin to agree before any message changes. Written 11 Nov 2026 against page 2.2.009 (`dev`). Nothing here is built yet.

How sure each statement is:

- **T** = an automated test in `tests/` covers it (named).
- **R** = tried on a real device (who and when, from NOTES.md).
- **E** = expected from reading the code; not tried.

## 1. The rules behind the table

1. **One library, in one place, as ordinary files, wherever the device allows it.** Browser storage is for trying 37 Player out, and for devices that offer nothing else (phones, tablets, Safari, Firefox).
2. **37 Player doesn't make a second full copy on the same disk unless asked.** A backup folder beside a 50 GB library is what filled the T470. Automatic backup folders stay only as an option for a library still in browser storage, and say how much room they take.
3. **Never "you don't need a backup".** For a library kept as files: "Back this folder up with the rest of your computer." For a device in a shared library: "Everything here is also in the shared library."
4. **A shared library is the recommended second copy** for any device that can't keep files (phone, tablet, Safari, Firefox), and for any Center with more than one device. It counts as protection only while syncing finishes (the existing "Sync isn't finishing" after 3 days).
5. **Say it once, at the moment it matters.** No backup question before a first import in the desktop app (as now).

## 2. Each way of running 37 Player

| Way of running | Where the library should live | Keeping it safe | Shared library | What 37 Player says today | What it should say |
|---|---|---|---|---|---|
| **Desktop app, Mac and Windows** | Its own folder in the place chosen at first start (as now) | The computer's own backup (Time Machine, File History) includes the folder; or a shared library | Optional. Recommended for a Center with several devices, or as a copy off this computer | Nothing before importing. Top button: **In a folder**; its tooltip says to back it up with the computer or export a .37p | Same, plus one quiet notice after the first import: "Your library is ordinary files in *path*. It is as safe as this computer's disk: include it in the computer's backup, or join a shared library." Never offers a backup folder |
| **Chrome or Edge on a computer, installed as an app** (Brave with its flag) | **A folder** (Settings → Library → Keep it in a folder…). Browser storage only while trying it out | As the desktop app | As the desktop app | Heads-up before the first import: Install, then "Turn on automatic backups, or join a shared library" | Heads-up leads with **Keep the library in a folder** (one copy, ordinary files), then shared library. Automatic backups move to Settings, for a library left in browser storage, with the room they take. On Mac and Windows, one line: "The desktop app does this without asking for permission again" |
| **Chrome or Edge on a computer, in a tab** | As above, after installing | As above | As above | The same Heads-up, with Install as its first step | The same, with why installing matters here: a tab is asked for the folder again after each restart, and the browser may clear a tab's storage when the disk is short |
| **A new library made in Settings** (Chrome/Edge, any library after the first) | A folder, chosen as the library is made | As above | As above | Starts in browser storage; the Heads-up encourages a backup | First question: **Where should this library be kept?** A folder (suggested) / This browser's storage |
| **Safari on a Mac, in a tab** | Not here: Safari erases a site's library after 7 days unused | n/a | n/a | "Use Chrome or Edge instead, or add 37 Player to the Dock first" | "**Get the desktop app**" first (it runs on macOS 12 too: R, the Mac mini); Chrome or Edge second; the Dock app last |
| **Safari Dock app (macOS 14+)** | Browser storage (no folder access) | Shared library; else backup files (.37p) by hand | **Recommended**: the only set-and-forget protection here | "Good job installing…", shared library, or back up by hand | Same, plus: "The desktop app keeps the library as files instead" |
| **Firefox on a computer** | Browser storage (no folder access, can't be installed) | Shared library; else .37p by hand | **Recommended** | "Use Chrome or Edge instead" | Mac and Windows: "Get the desktop app" first, Chrome or Edge second. Linux: Chrome or Edge |
| **iPad or iPhone, Safari tab** | Not here (7-day rule) | n/a | n/a | "Add 37 Player to your Home Screen, then import there" | No change |
| **iPad or iPhone, Home Screen app** | Browser storage (the only choice) | **Shared library.** A backup file by hand only for small libraries (a 13.84 GB one took Safari about ten minutes: R, the iPad, 24 Oct) | **Recommended**, with "Only what I choose" on a small device | "Good job installing…": shared library is the set-and-forget way; else back up by hand | No change |
| **Android, Chrome** (installed or not) | Browser storage; install so Chrome keeps it | Shared library; else backup files by hand | **Recommended** | Install, then "Join a shared library, or back up by hand" | No change |
| **A copy opened from a file** (`37-player.html` on disk) | Browser storage of that file's address | Backup folder (Chrome/Edge) or by hand | Droplet libraries only (Google sign-in needs the website) | Works; the welcome no longer mentions it | On Mac and Windows, point to the desktop app. Keep it working for Linux and for old machines |

Linux has no desktop app yet, so Chrome or Edge with a folder library is the recommendation there.

## 3. What survives each kind of failure

Columns are the five setups a device can be in. "Shared" means joined, with syncing finished ("In sync").

| What happens | Desktop app (folder) | Chrome/Edge, library in a folder | Browser storage + automatic backup folder | Browser storage only (also iPad, iPhone, Android) | Any of these + shared library |
|---|---|---|---|---|---|
| **Browser or app storage cleared** (Clear site data, CCleaner, the browser short of room, Safari's 7 days) | Nothing lost. **R** (HP, 7 Nov; Mac mini, 8 Nov), **T** desktoplibs.js | Files stay, but **Chrome has no way to open the folder again**: gap, see 5.2. **E** | Library gone; **Restore backup from folder** brings it back. **T** bkkeep.js for the folder keeping its files; the T470's own backup had lost its audio before 1.4.150 (**R**, 1 Nov) | **Lost** | Join again; everything downloads. **T** restore.js (the automatic offer); **R** in progress on the T470 |
| **The app's own data folder deleted too, or a reinstall** | Found by itself in the suggested place; elsewhere, **Find a library folder…**. **R** (HP), **T** desktoplibs.js | n/a | n/a | n/a | As above |
| **Disk dies, computer lost or stolen** | Lost, unless the computer was backed up | Lost, unless backed up | Lost if the backup folder was on the same disk (it usually is) | Lost | **Survives**: join on the new device. **E** as a whole; each step is the ordinary join |
| **Disk full** | Not tried. **E**: writes fail, the library record is written last so it stays as it was | Not tried, same expectation | The backup no longer empties itself (**T** bkkeep.js) | An import stops at once and says why (**T** quota.js); receiving from a shared library waits and tries again later (**E**) | The shared library is unaffected |
| **Library folder moved, renamed, or its drive unplugged** | Asks (Try again / Find a library folder…), never makes an empty one. **T** desktoplibs.js | **Find the folder…**. **T** folderlib.js (stand-in folders) | n/a | n/a | n/a |
| **A playlist or track deleted or spoiled by mistake** | Undo: the last 30 changes, kept across restarts; a deleted track's audio is kept for a day (**T** undo.js). Later: only the computer's backup or an older .37p | The same | The backup folder is a mirror: the mistake is copied in seconds | Undo only | The mistake syncs to every device; **History…** brings the earlier version back. **T** hist.js |
| **Phone or tablet lost or reset** | n/a | n/a | n/a | **Lost** | **Survives**: join again |
| **A folder used in place goes away** (desktop app) | Those tracks say the drive isn't connected; the library, its playlists and other tracks are untouched. **R** (HP), **T** inplace.js | n/a | n/a | n/a | Other devices still have the shared copies |
| **The shared library's server is lost** (droplet, a Drive account) | | | | | Every full-sync device still has everything; a new shared library is made from one of them (**E**). The droplet is copied to the T470 nightly (running since 29 Oct) |

Not yet tried anywhere, and worth trying before release: a full disk with a folder library; a whole "lose the computer, join on a new one" run with a large library; Safari's 7-day erase on a real tab, and that the Home Screen and Dock apps are spared.

## 4. Rejoining a library

| Where the library still is | What to do | What moves |
|---|---|---|
| **On this computer's disk, desktop app** (app storage lost, reinstall) | Start the app; if it isn't found, Settings → Libraries → Find a library folder… | Nothing. The join (code or Google sign-in), the device's name and the last agreed state are kept inside the library's folder, so it is still joined and carries on. **E** for the sync carrying on; the library itself **R**/**T** |
| **On this computer's disk, Chrome/Edge folder library** (Chrome's data cleared) | **Nothing works today**: gap, 5.2 | |
| **Only in the cloud** | Shared library → Join (code, or Google sign-in) → Everything / Only what I choose | Everything chosen downloads |
| **A backup folder or .37p here, and in the cloud** | Restore into an **empty** library, then Join and choose **Use the shared library here** | Only what changed since the backup (see section 5) |
| **A library folder copied from another device, and in the cloud** | Desktop app: Find a library folder… | Only what changed since the copy (see section 5) |

## 5. The USB stick: what the code does

Checked in `37-player.html` 2.2.009: `joinSharedLibrary`, `sharedSyncOnce`, `sharedReconcileAudio`, `sharedSameAudio`, `sharedDuplicateMap`, `sharedFoldDuplicates`, `sharedApplyDoc`, the restore in `offerNativeImportNow`.

**How sync decides two files are the same.** Not by looking at the audio. A track is its ID; a recording is that ID plus its *revision* (`audioRev`, a new one each time the file is written: import, replace, convert, a tag change written into the file). This device's file is "the one the shared library means" when ID, revision and size agree (`sharedSameAudio`). Then nothing is sent or received.

So the answer depends on whether the copy keeps the IDs and revisions.

| How the 50 GB gets to the new device | Recognised as the same? | What then moves | What to watch |
|---|---|---|---|
| **A. The whole library folder** (desktop app), opened with Find a library folder… | Yes. IDs and revisions are in the folder, and so is the join itself: the copy is already joined, with the state the two last agreed on | Only changes made since the copy, both ways, as an ordinary sync | 1. **Both devices now have the same device name.** Change it on the new one (Settings → Shared library) before much else: the name is used in "waiting for *X* to send it", in backup notes, logs, and "kept both" copies. 2. Tracks used in place point at folders that aren't on the new computer. 3. If the new computer already has a first library, what Find does when both are the internal `main` is in the shell and I haven't read it: to check before relying on it. **E**: not tried |
| **B. A .37p or a backup folder**, restored into an empty library, then Join → **Use the shared library here** | Yes. The restore writes audio before the tracks, so IDs and revisions come through unchanged | Only files whose revision changed since the backup are downloaded. The join question shows the download size before you commit: it should be small | Choose **Use the shared library here**, as the restore dialog already advises. **Combine** also moves nothing for unchanged files (and for changed revisions it compares size and the first and last 64 KB with the server before deciding), but with an old copy it brings back whatever was deleted since, for everyone, and keeps two of each playlist changed since. A 50 GB .37p is one file: not tried at that size. **E**; the five cases of differing revisions are **T** reconcile.js |
| **C. Plain files**: the music folder, a Portable export, or importing the library folder's `music/` afresh | **No.** A fresh import gives every track a new ID | On Combine, tracks are matched by name, album, artist and length. **Matched: this device's copy is removed and the shared one downloaded**, so about 50 GB comes down anyway. **Unmatched** (a tag differs, or two alike in the shared library): sent up as extra tracks, duplicates for everyone | Don't seed this way today |

**Does anything get replaced in the shared library?** Not from a straight copy. The shared library's copy of a recording is replaced only when this device's differs in content *and* has the newer revision, or the server's copy is missing or damaged (`sharedReconcileAudio`, cases 2 to 4). A copy has identical bytes, so none of those apply. A detail edited on the copy before joining would send that one file.

### 5.1 Found while checking: possible loss with "Keep it in a folder…" (Chrome/Edge)

`moveLibraryToFolder` treats a chosen folder whose marker has this library's ID as "this library's own folder, carry on", and then writes this library's records over the folder's. Every browser's first library has the same ID (`main`). So a new, empty first library pointed at an existing library folder would replace that folder's record of tracks and playlists with the empty one; the recordings would stay on disk, unlisted. On the T470 the read-only files stopped it. Read in the code, **not run**. I'd confirm it with a test and fix it before anything else: a folder that already holds a library with content is never written into; it's offered to be opened instead (5.2).

**Confirmed and fixed in 2.2.019** (12 Nov 2026). tests/folderlib.js clears the browser's storage, makes a new first library and points Keep it in a folder… at the old library's folder: before the fix the old folder's list of tracks was replaced by the empty one. Now a folder holding a library is used only if it is this library's own unfinished copy: its marker carries a token kept in this library's own storage (so it goes when that storage goes), or no library record was written into it yet. Anything else, the chosen folder itself or one of the library's name inside it, is refused: "“X” already holds a 37 Player library. 37 Player won't copy this library over it: choose another place." A copy cut off after its library record was written still carries on (tested). Offering to open the folder instead comes with item 2 (5.2).

### 5.2 Missing: opening an existing library folder in Chrome/Edge

The desktop app has Find a library folder…; Chrome and Edge have nothing like it. That one feature would cover: Chrome's data cleared with a folder library; the T470 rebuild without a second 50 GB; seeding by USB in Chrome; and it is most of "Use in place" for the browser.

**Built in 2.2.020** (12 Nov 2026): Settings → Library → All libraries → **Find a library folder…** in Chrome and Edge, and **Open that library** where Keep it in a folder… refuses. Opening writes nothing into the folder. The library keeps the folder's ID, so when this browser already has a library with that ID:

| This browser's library with the same ID | What happens |
|---|---|
| None | Added to the list of libraries |
| Kept in another folder | Asks; **Use “X”** runs it from the new folder, the other folder stays as it is |
| In the browser's storage, still only the starter (every new first library) | The folder's library takes its place and name; the browser's copy is left alone. This is the T470 rebuild |
| In the browser's storage, with tracks or playlists of its own | Refused, nothing changed |

**T** folderlib.js for all four. **Decided by Gen Rinzin (12 Nov):** the last row keeps refusing; he will try it. The other way would be to open the folder as a separate library by giving the folder a new ID. The catch: anything else that knows the folder by its old ID (another browser profile, the desktop app on the same computer) would then see it as another library's folder and refuse it. Seeding a new computer by USB isn't affected, since its first library is still empty.

## 6. Proposed order of work, once the tables are agreed

1. Test and fix 5.1. **Done, 2.2.019.**
2. **Open a library folder…** in Chrome/Edge (5.2). **Done, 2.2.020** (named Find a library folder…, as in the desktop app; see 5.2).
3. A copied library notices it is on a new device (an ID per install, kept outside the folder) and asks for this device's name before syncing. **Done, 2.2.021:** "Is this another device?" with a name field, **Another device: use this name** / **This is still “X”**; nothing syncs until answered. The desktop app's two-stage wipe test now asks once (the install ID goes with the data folder): "This is still" answers it. **T** copied.js.
4. The message changes in section 2. **First part done, 2.2.022:** the quiet "Your library is ordinary files" notice after the first import (desktop app and folder libraries), and "Where should this library be kept?" (a folder suggested) for a new library made in Settings in Chrome/Edge. **Second part, 2.2.023:** Gen Rinzin replaced the drafted wizard with his own design (12 Nov): Try it out / Install, on the home page and in the welcome; Install assesses the device and offers only the best way (Mac/Windows: the desktop app only, with how to get past the unsigned-build warnings; other computers: Chrome or Edge, installed, the library in a folder; iPad/iPhone: the Home Screen, then Google Drive or backups by hand); Try it out is quiet for two days or until the fifth import, then asks once; an Install button in the top bar wherever 37 Player isn't installed. Automatic backup folders are left in Settings → Backups only. **T** setup.js.
5. Joining with plain files (row C): where a match has the same size and the same first and last 64 KB as the shared copy, keep this device's file as that track's audio instead of removing it and downloading. Then any copy of the files seeds a device.
6. **Leaving a shared library cleans up after itself** (added by Gen Rinzin, 11 Nov 2026: tracks that never synced, left sitting without audio, are a bug). On leaving: tracks whose audio never arrived are removed from the library; then it asks about playlists left empty (default: remove them) and playlists left with some tracks missing. Since 2.2.018 such tracks are fetched if the device joins again, but a device that stays out keeps them, silent, with nothing to show it until one is played.

## 7. Questions for Gen Rinzin

1. **Gen Palden's backup prompts.** The desktop app (2.0 on) never offers a backup folder, and its web view can't ask for folder permission. Was he on Chrome, or an older desktop build? It changes whether there's a bug to find.
2. **Automatic backup folders.** Keep them as a Settings option for browser-storage libraries (this plan), or retire them once Chrome can open and keep libraries in folders?
3. **Safari and Firefox on Mac and Windows**: desktop app first, Chrome/Edge second, as proposed?

## 8. Gen Rinzin's notes on section 2 (11 Nov 2026), with Claude's replies. Nothing decided yet.

1. **Rule 5, "say it once": a welcome wizard instead, with "Just trying it out" or "Install it".** Claude: agreed, and it fits rule 1. "Just trying it out" keeps the library in browser storage and says nothing more until the library has grown (a number of tracks, or a day or two of use: to choose), then asks once. "Set it up properly" walks through where the library lives (desktop app, or a folder in Chrome/Edge), installing, and a shared library. It would replace the Heads-up before the first import.
2. **A new library made in Settings (Chrome/Edge): force a folder?** Claude: make the folder the choice already selected, with browser storage as a smaller second choice, not forced. In a tab that isn't installed, a folder library can't open after a restart until permission is given again, and Brave needs its flag; someone hitting either needs a way through. Needs 5.1 fixed first.
3. **Safari in a tab (Mac, iPad, iPhone): say "This arrangement is for testing only. Safari will delete the library."** Claude: yes, with the condition stated so it stays true: "…if 7 days pass without opening 37 Player here."
4. **Android, Chrome: what resilience can be built, as for the desktop app?** Claude: a web page on Android can't keep files in a folder the person chooses, so the recordings themselves can only be protected by a shared library. What can survive the browser clearing its storage is the way back: Automatic restore (1.4.093, Settings → Backups, the website only) already keeps each library's shared library or backups in a cookie the page can't read, and offers to bring the library back. Proposed: on a phone or tablet, turning it on is offered at the moment of joining or creating a shared library, not left in Settings; and installing is pressed harder there, since Chrome keeps an installed app's storage. To check on a real phone: that the cookie outlives Chrome clearing storage for space.

## 9. Question 1 answered (11 Nov 2026, from Gen Palden's feedback reports)

He is in the desktop app (page 2.2.002). What keeps asking for permission is macOS itself ("allow access to…"), not a backup folder. The test builds aren't signed with a Developer ID, so macOS doesn't keep his answer the way it does for a signed app. His MacBook has also failed to send 15 of its 21 recordings to his Drive library since 10 Nov, most likely because the app can't read them; 2.2.017 makes that visible in the sync log. For the table: the desktop app's row needs "signed, so macOS asks once" before it can be recommended to Centers.

## 10. Gen Rinzin's notes on sections 3 to 9 (11 Nov 2026), with Claude's replies

**Decided by Gen Rinzin:**

- Order of work (section 6): agreed.
- Question 2: automatic backup folders aren't retired yet, but are made much less prominent.
- Question 3: yes, Safari and Firefox on Mac and Windows point to the desktop app first.
- Section 8, notes 1 to 3: agreed (a welcome wizard with "Just trying it out" / "Set it up properly"; a new library's folder preselected, not forced; Safari tabs say they're for testing only).
- Automatic restore's cookie: store it without asking (one GDPR notice if needed), not an opt-in switch.
- Apple Developer membership: getting it now, so the desktop app can be signed.

**Section 3 (what survives):**

1. *Full disk with a shared library: keep playing by dropping some files to fetch the ones a playlist needs.* Later, if ever. Partial sync's "Only what I choose" is the manual version of this.
2. *Folder moved, renamed or unplugged: is the fact that it was shared lost?* No. The join is kept inside the library's folder, so once the folder is found again it is still joined. Tried on the Mac mini, 11 Nov (the wipe test, both stages).
3. *Undo's time limit.* There isn't an hour's limit: Undo keeps the last 30 changes, across restarts. What is limited is a deleted track's audio, kept one day (the hourly figure is how often old ones are cleared out). Both are fixed numbers today. Free disk space: a browser only gives a rough estimate; the desktop app's shell could report it exactly but doesn't yet. Proposed: deleted audio kept 7 days or up to a size limit, whichever comes first, with the limit set from free space in the desktop app.
4. *Use in place in Chrome/Edge?* Possible in principle (the browser can keep permission for a folder), with the same permission prompts as a folder library; it comes naturally after "Open a library folder…" (5.2). *A used-in-place folder gone, and the device is in a shared library: fetch those tracks into the library?* Agreed as the right behaviour, with one question first, since a drive may just be unplugged: ask once, "Fetch these N tracks from the shared library (size)?". *A path column in Library → Table:* added to the to-do list.
5. *The server lost: several devices joining the new shared library before it's rebuilt.* By the code, each device sends only files the new library doesn't list yet, and tracks are matched by ID, so nothing is duplicated in the library; two devices may send the same file at the same moment (a droplet library keeps one; Google Drive may keep two copies, which Free up space removes). **E**, not tried. *Is either side rewritten when a library that's essentially the same rejoins?* No, by the code (section 5), and now partly tried: after both wipes on the Mac mini nothing was sent or received.
6. *A row for "the shared library is temporarily unavailable".* Added here: the round fails, the log says why, the device goes on working with what it has, and the next round (three minutes later) tries again; nothing is lost. **R**: Gen Palden's log, 11 Nov ("token.php unreachable", then rounds carrying on).

**Section 4 (rejoining):**

7. *"Use the shared library here": does it delete what was just restored?* No. It removes only tracks the shared library doesn't have, and downloads only recordings whose revision differs. Restored tracks with the same IDs and revisions stay and aren't fetched.
8. **Found by Gen Rinzin's test: a bug.** Join, leave partway (100 of the files received), join again: all three choices said "Downloads nothing", though 438 tracks had no audio. The cause: leaving clears the list of files still to fetch but keeps the tracks, and "the same recording" (`sharedSameAudio`) compares revision and size, never whether the audio is actually here. So after rejoining, those tracks would stay silent and the device would say In sync. To fix: a track whose audio isn't on the device counts as needing it, at joining and in each round. Also his proposals for leaving: remove tracks whose audio never arrived, and ask about playlists left empty (default yes) or left with missing audio.
9. *A copied library folder: Find a library folder… first, then link to the shared library?* Find it first; it is then already linked (the join travels in the folder). Give the device its own name.
10. *The Google Drive dialog jumps when "checking…" appears above the button:* to-do list, to sit on the button's line.
