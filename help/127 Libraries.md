Libraries

One device can hold more than one library: a Center's library and your own, say, or your Dharma recordings and everything else. Each library has its own tracks, playlists, backups, PIN and sharing. Only one is open at a time, and switching never loses anything: the others are simply put aside until you open them again.

### Making one

In Settings → **Library**, open **All libraries** and choose **New library…**, give it a name, and choose how it starts:

- **Start empty:** a new, empty library. Fill it as usual, with Import / Export.
- **Join a shared library:** enter the join code and this device's name, and the new library joins straight away. Leave the name empty and it takes the shared library's own name, such as "IKRC Library".

Joining a shared library from a library that already has tracks asks first whether to make a new library for it instead. That's usually the right choice: joining with an existing library would add all its tracks and playlists to the shared library, for everyone in it to see.

### Switching

Once there's more than one library, the open library's name is shown in the top bar, so it's clear which one a session is about to play from. Click it to see the others and switch. Settings → **Library** → **All libraries** can switch too, and it's where libraries are renamed and deleted. Below it, the same page shows the open library: its tracks and playlists, where it lives (the browser it runs in, the shared library it syncs with, where it's backed up), its file types, and the storage all libraries use together.

If something is playing, switching asks first, because it stops playback. Each library remembers its own place: the playlist you had open and where the session had got to.

Two windows can have two different libraries open at the same time. A new window opens the library chosen most recently.

### Keeping a library in a folder (Chrome and Edge on a computer)

Normally a library lives inside the browser, where the browser can erase it (see 'Reliability'), so most people also keep a backup folder: two copies of everything, three counting the music you imported from. In Chrome or Edge on a computer, a library can live in an ordinary folder instead: Settings → **Library** → **Kept in** → **Keep it in a folder…**

- **You choose where,** for example in Music. 37 Player makes a folder named after the library there and copies the whole library into it. If you've already made an empty folder for this library, choose that folder: 37 Player asks whether to use it as it is. That needs as much free space as the library takes, for a while.
- **Then it runs from the folder.** The browser's copy is no longer used, and 37 Player offers to remove it to free the space.
- **The folder is the library,** not a backup of it, so automatic backups stop and the button at the top says **In a folder**. Back the folder up as you back up the rest of the computer, or export a .37p now and then. Please don't rename, move, add or remove files in it yourself.
- **Readable names:** the recordings are in "music", in a folder for each artist, then each album, named after their details, such as "music/Tharpa/Prayers for Meditation/01 Liberating Prayer.mp3". "playlists" has each playlist as an .m3u8 file that other players (VLC, foobar2000, Music.app) can open; 37 Player keeps them up to date but doesn't use them itself. You can play them or copy them elsewhere with any other program. Edit a track's details in 37 Player and its file is renamed to match (Undo puts the name back). Playlists, artwork and settings are in the folder "37 Player's own files". A folder library made before version 1.4.174 has its recordings moved into the readable names by itself, the first time it's opened.
- **Permission:** an installed 37 Player keeps permission to the folder. In a browser tab, Chrome may ask again after a restart: choose **Open it**.
- **Moving the folder:** move the whole folder, then open 37 Player and choose **Find the folder…**. It knows its own folder again by the file "37 Player library.json" inside it.

### In the desktop app

The desktop app keeps every library in a folder of its own on the computer, where no cleaning program can erase it.

- **Where:** the first time, it asks where your libraries should live, suggesting **Music/37 Player Libraries**. Choose another place if you like; each library gets its own folder inside it, with the same readable names as above.
- **Its name:** the folder takes the library's name (rename the library and the folder follows the next time 37 Player starts). Settings → **Library** shows where it is, with **Show** to open it.
- **Backups:** 37 Player doesn't make its own here, and doesn't ask: the folder is ordinary files, so back it up with the rest of the computer, or share the library.
- **Found again:** if the app's own settings are ever lost (a reinstall, a cleaning program), it looks in that place and finds its libraries by their "37 Player library.json". A library kept anywhere else: Settings → **Library** → **All libraries** → **Find a library folder…**. If a library's folder can't be found (a drive that isn't plugged in, a folder moved), the app asks where it is rather than starting it again empty.

**Importing a folder** (Import / Export → **Choose a folder…**) asks how to take its recordings:

- **Use in place:** they stay where they are (your Music folder, say, or Music.app's), and the library only points to them. 37 Player never changes, moves or deletes those files. Your edits (names, artists, artwork, cuts) are kept in the library; exports, .37p files and shared libraries get copies with your edits. Deleting such a track from the library leaves its file alone.
- **Copy into the library:** the library keeps its own copies; the originals stay as they are.
- **Move into the library:** as Copy, then each original is deleted once its copy is checked.

Files dropped on 37 Player or picked one by one are always copied. A folder on another drive (a USB stick, an external disk) suggests Copy, because tracks used in place can't play while their drive is unplugged: they say "on a drive that isn't connected" and come back when it is.

Settings → **Library** lists the folders used in place, with **Look for new files** (for recordings added to the folder since), **Copy into the library** and **Move into the library** (to make them the library's own after all), and **Find this folder…** if one has moved. The library's playlists in "playlists" point to recordings used in place where they are, so other players find them too.

### Merging a backup or export into a library

Importing a .37p (a backup or a library export) into a library that already has things offers **Merge** or **Replace**. Merging adds what's new. If some of the file's tracks are already here with other details (a different name, artist, album or number) or another copy of the recording, 37 Player lists them first and asks: **Keep this library's** (the usual choice: an older file shouldn't undo newer changes) or **Take the file's**.

### Very big recordings

On a Mac, iPad or iPhone (Safari's engine), changing the details of a recording over 256 MB changes them in the library, and in a folder library the file's name, but not the details stored inside the file itself. Rewriting a file that big there means reading all of it into memory, and in a shared library sending all of it again. Exports always carry the current details. Other programs that open the stored file directly see the details it had when it was imported.

### Copying between libraries

To copy tracks or playlists from the open library into another one on this device, use 'Import / Export' → **Copy to another library** (it's there once you have more than one library). Choose what to copy, as for Export (the selected tracks, a playlist, a folder, an album, all playlists or the whole library), then the library to copy into. That list starts at **Choose a library…** every time, so nothing goes to the wrong one out of habit.

- **Playlists go into folders of the same names** in the other library, made there if they're missing.
- **Tracks the other library already has are left as they are there.** Tracks keep their identity, so copying the same thing again doesn't make duplicates, and a playlist copied before is brought up to date.
- **A different playlist with the same name** in that folder is kept, and the copy gets the source library's name added, such as "Acoustic (My library)".
- **Nothing stays linked:** later changes on either side stay where they're made.
- The copy appears at once in a window that has the other library open, and otherwise the next time it's opened. There it's one step that **Undo** can take back, and in a shared library it's sent to the other devices like anything else you add.
- While copying, closing or refreshing the window asks first, and switching libraries says the copy would stop. A copy that's stopped leaves nothing half-copied behind.

### What belongs to each library, and what to the device

- **Each library has its own:** tracks and playlists, the PIN, the backup folder, the File format settings, and its shared library, if any, with What's on this device, Review changes and Receive updates only.
- **The device keeps for all of them:** the language, display settings, the screen-off playback settings, this device's name for shared libraries, and the converter.

### Syncing

Only the open library syncs. A shared library that isn't open catches up as soon as you open it, with whatever changed meanwhile, so nothing is missed.

### Deleting

Settings → **Library** → **All libraries** → **Delete…** removes a library's tracks, playlists and settings from this device. If it keeps a backup folder (Chrome or Edge on a computer), the dialog offers to delete that backup too: only the files 37 Player put there, and only while the folder still holds that library's backup. Backup files the browser saved (Firefox, Safari, phones) can't be reached, so delete them yourself if you no longer want them; their names include the library's name, such as lib-native-backup-full-skbc-2026-10-22-1530.37p (.zip before version 1.4.092; backups made before version 1.4.051 don't include the name). The shared library it may be joined to isn't touched either: other devices keep it, and this device can join it again later. To keep a copy first, open the library and make a backup or a Portable export.

A library kept in a folder is only forgotten by this device: the folder and everything in it stay on the computer, to delete yourself if you don't need it.

The open library can't be deleted: switch to another one first.

### Space

All libraries share the browser's storage on this device, except those kept in a folder, which take space on the disk like any other files. A recording in two libraries is stored twice.
