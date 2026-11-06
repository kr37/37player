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

- **You choose where,** for example in Music. 37 Player makes a folder named after the library there and copies the whole library into it. That needs as much free space as the library takes, for a while.
- **Then it runs from the folder.** The browser's copy is no longer used, and 37 Player offers to remove it to free the space.
- **The folder is the library,** not a backup of it, so automatic backups stop and the button at the top says **In a folder**. Back the folder up as you back up the rest of the computer, or export a .37p now and then. Please don't rename, move, add or remove files in it yourself.
- **Readable names:** the recordings are in "music", in a folder for each artist, then each album, named after their details, such as "music/Tharpa/Prayers for Meditation/01 Liberating Prayer.mp3". "playlists" has each playlist as an .m3u8 file that other players (VLC, foobar2000, Music.app) can open; 37 Player keeps them up to date but doesn't use them itself. You can play them or copy them elsewhere with any other program. Edit a track's details in 37 Player and its file is renamed to match (Undo puts the name back). Playlists, artwork and settings are in the folder "37 Player's own files". A folder library made before version 1.4.174 has its recordings moved into the readable names by itself, the first time it's opened.
- **Permission:** an installed 37 Player keeps permission to the folder. In a browser tab, Chrome may ask again after a restart: choose **Open it**.
- **Moving the folder:** move the whole folder, then open 37 Player and choose **Find the folder…**. It knows its own folder again by the file "37 Player library.json" inside it.

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
