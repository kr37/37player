History and Undo

Two ways to take back a change. **Undo** is for your own last few changes on this device, a moment after making them. **History** is for anything in a shared library from the last 30 days, made on any device.

### Undo and redo

On 'Edit Playlists' and 'Library', the ↶ button beside Settings takes back your last change, and ↷ puts it back again. The keyboard does the same: <kbd>Ctrl</kbd>+<kbd>Z</kbd> (<kbd>⌘</kbd>+<kbd>Z</kbd> on a Mac) to undo, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd> to redo.

- **What counts as a change:** anything you do to tracks, playlists and folders: renaming, editing a track's details, moving, reordering, adding or removing items, silences and stops, deleting, splitting, importing. Changes made within a second or so of each other count as one.
- **Hold the pointer over ↶** to see what it will undo, for example "Undo: changed “Morning”". After undoing, a short message at the bottom says what was undone.
- **Up to 30 steps** are kept, for each library, and they're still there after closing and reopening 37 Player.
- **A deleted track comes back** in the playlists it was in, with its sound. Its audio is kept on this device for a day after it's deleted, so Undo can bring it back. In a shared library, a track whose audio is no longer here comes back from the shared library instead.
- **In a shared library, Undo takes back only your own change.** If another device has changed the same thing since (renamed the same playlist again, say), that is left as it is, and the message says so. Undoing is itself a change like any other, so the other devices get it at their next sync.
- **Not undone:** changes that arrive from other devices (use History for those), a new picture for a track, and converting a file to another format.
- A library that isn't shared has Undo, but no History.

### History

Every time a device saves a change to a shared library, the shared library keeps that version: on 37player.com for 30 days, on Google Drive all of them. **History…** in Settings → Shared library (and in Settings → Backups) lists them, newest first, each with its time, the device that saved it and what it changed, for example "1 track changed · changed “Heart Jewel”". The arrows at the top step through them one at a time. Versions saved before 37 Player 1.4.084 just say "Saved".

Choose a version, then one of the two views:

- **What restoring would change:** one row for each difference between now and that version: a playlist, a track, or the order of things inside a folder. Now is on the left, then is on the right, and each row says whether it was added, deleted or changed since. A playlist's row can show its two versions side by side, with what was added or taken away marked.
- **What changed at this point:** only what that one save changed, before and after. Useful to find when something went wrong.

To go back, every row starts as **Keep now**. Tap a row's button to make it **Restore**, or use **Restore everything**, then the **Restore** button at the bottom. Restoring brings each chosen row back as it was then. For something added since, that means taking it out again. Tracks a restored playlist needs come back with it.

- **Nothing is ever erased.** A restore is saved as a new version at the top of the list, and every device gets it at its next sync. A restore you regret can be restored away again from History.
- **If someone saves while you're choosing,** the list is brought up to date first, keeping your choices where nothing changed, and asks you to check before restoring.
- **A device set to Receive updates only** can look through History but can't restore.
- **Older than 30 days** (on 37player.com): those versions are gone. A backup kept by one of the devices (see 'Backing up') goes further back.
