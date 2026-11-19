History and Undo

Two ways to take back a change. **Undo** (↶) is for your own last few changes on this device, a moment after making them. **History** shows every change in one list, and can take the library back to any point in it, or bring back one playlist or track as it was.

### Undo and redo

On 'Edit Playlists' and 'Library', the ↶ button beside Settings takes back your last change, and ↷ puts it back again. The keyboard does the same: <kbd>Ctrl</kbd>+<kbd>Z</kbd> (<kbd>⌘</kbd>+<kbd>Z</kbd> on a Mac) to undo, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd> to redo.

- **What counts as a change:** anything you do to tracks, playlists and folders: renaming, editing a track's details, moving, reordering, adding or removing items, silences and stops, deleting, splitting, importing, a new picture for a track, and **Replace file**. Changes made within a second or so of each other count as one.
- **Hold the pointer over ↶** to see what it will undo, for example "Undo: changed “Morning”". After undoing, a short message at the bottom says what was undone.
- **Hold ↶ down, or right-click it,** to open History.
- **Up to 30 steps** are kept, for each library, and they're still there after closing and reopening 37 Player.
- **An older change asks first.** When the next thing to undo was done more than 2 hours ago, 37 Player says so and asks: **Undo it**, **Cancel**, or **View detailed history**, which opens History so you can see what you'd be taking back. Once you've said Undo it, the undos that follow don't ask again, until you change something or reopen 37 Player.
- **Deleting tracks that playlists use:** after **Delete**, 37 Player asks one more thing, before anything is deleted: whether to delete the playlists and folders this leaves empty (selected to begin with), and the playlists that used the tracks but still have others (not selected). Both are listed. Playlists and folders that were empty before are left alone. One Undo brings back the tracks and the playlists together.
- **A deleted track comes back** in the playlists it was in, with its sound. Its audio is kept on this device for a day after it's deleted, so Undo can bring it back; the same goes for a picture or a recording you replaced. In a shared library, a deleted track whose audio is no longer here comes back from the shared library instead.
- **In a shared library, Undo takes back only your own change.** If another device has changed the same thing since (renamed the same playlist again, say), that is left as it is, and the message says so. Undoing is itself a change like any other, so the other devices get it at their next sync.
- **Not undone:** changes that arrive from other devices (use History for those), work 37 Player does by itself (waveforms, evening out loudness), and converting a file to another format.

### Opening History

- **Settings → Undo history**, the first item in Settings.
- **History…** in Settings → Shared library (or in Settings → Backups).
- **Holding down ↶**, or right-clicking it.
- **View detailed history**, when Undo asks about an older change.

On the left is the list of points to go back to, newest first, grouped by day. Choose one, and the right side shows what going back to it would do. Nothing changes until you press a button there.

**A library that isn't shared** lists the changes Undo has kept on this device (the last 30), and at the bottom **Before these changes**, the point before all of them.

**A shared library** lists its **versions**: every time a device saves a change, the shared library keeps that version, on 37player.com for 30 days, on Google Drive all of them. Each shows its time, the device that saved it and what it changed, for example "1 track changed · changed “Heart Jewel”". If this device has changes it hasn't sent yet, they're listed above the versions, under "This device, not yet synced" (usually there are none: History sends anything waiting when it opens). Offline, only those are listed: the versions need a connection.

A shared library's History has two tabs: **Roll back the library** and **Bring back tracks or playlists**.

### Roll back the library

For going back to how everything was at one point: say, after a muddle of changes on several devices.

Choose a version on the left. The versions above it are struck through, under "above this line would be undone": that's what rolling back takes away, and whose changes they were. On the right, the box holds **the library then**, with the **Roll back to this** button, beside **the library now**. Both sides line up row for row, in two parts:

- **Playlists:** the folders and playlists that differ, in their folders as on 'Playing'. Open a playlist to see its tracks, then and now. When the order in a folder changed, "Order then" and "Order now" list the whole folder both ways, with what moved in bold.
- **Tracks:** by artist, then album, then track. Every deleted track is listed, however many there are. An artist or album that was only renamed is one row with both names, and its unchanged albums are one grey line you can open.

**Green** is what rolling back would bring back, **red** what would be lost, *blue italic* a new name; a tag beside each says "deleted since", "added since", "renamed" or "changed". Grey is unchanged. A space left blank means it isn't there on that side. As you move from version to version, anything that has been listed stays listed while History is open, in grey once both sides agree, so nothing seems to vanish. **Wrap** shows long names in full.

You needn't roll back at all: often it's enough to see what changed, then mend a playlist by hand on 'Edit Playlists'.

**Roll back to this** asks first, and says how much audio would move: recordings that come back are downloaded again by each device that holds them; recordings that would be lost leave every device. Then every device that shares the library gets it as it was then, at its next sync.

- **Nothing is erased.** The rollback is added as a new version at the top of the list, and can be rolled back too. The versions above it are kept for at least 30 days (on Google Drive, until you choose **Free up space…**), so you can still go back to any of them.
- **Choosing one of this device's changes** (not yet synced) shows the library with those changes undone, and the button is **Undo back to this**: it undoes them here, and Redo brings them back.
- **If this device has changes not yet sent,** a version can't be rolled back to until they're undone or synced: rolling back underneath them would mix them back in.
- **If someone saves while you're looking,** the comparison is brought up to date and asks you to look again before rolling back.
- **A device set to Receive updates only** can look through History but can't roll back.

### Bring back tracks or playlists

For one thing as it was, leaving everything else as it is: a playlist someone rearranged, a deleted track, a name changed by mistake.

At the top: **Playlists** or **Tracks**, then **By folder** or **Flat list**, and **Show: Changes** (only what has an earlier state to bring back) or **Everything** (the rest in grey).

- **On the left, find the playlist or track.** By folder is the library as it is now, with anything deleted shown where it last was, in green, marked "deleted". Tracks can be found **By playlist** (each playlist opening to its tracks, and **Not in a playlist** at the end) or **By album**. **Flat list** lists every name each one has had, old names in grey with what it's called now. **Search names** finds old names too, so something can be found by a name it no longer has.
- **In the middle,** what it is **Now**, beside an earlier state in the box, row for row: a playlist's tracks lined up, those only there now in red, those only there then in green. A track shows its name, artist and album, and both pictures if the artwork changed. Where a playlist was, at the top level or in a folder, is shown on both sides.
- **On the right, Previous versions:** each different earlier state it has had, once each (the most recent time it was that way). Choose one to see it in the box. "Always the same since…" means there's nothing earlier to bring back.

The buttons are in the box:

- **Replace the current playlist with this:** the playlist goes back to that state, in the folder it was in then (that folder comes back too, if it has been deleted).
- **Bring this back as a copy, “Morning (13 Nov)”:** the earlier state as a new playlist beside the current one, dated with the day of that version.
- **Bring this back:** for something deleted. A playlist comes back with its folder and any tracks it needs; a track comes back with its recording, which is downloaded again (its size is shown).
- **Replace the current track with this:** the track as it was then: its name and details, and its recording or picture too where those differ.

Each one is saved as a new version of the shared library, and the other devices get it at their next sync. If someone saves while you're choosing, it says so and asks you to look again. A device set to Receive updates only can look, but has no buttons.

**Build list from history (slow)** appears when some versions were saved before 37 Player noted what each one changed. It goes through them once, on this device, so they're listed too.

### Going further back

Versions older than 30 days on 37player.com are gone. A backup kept by one of the devices (see 'Backing up') goes further back.
