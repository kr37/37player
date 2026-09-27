Backing up

37 Player keeps your whole library inside the browser, and several everyday things can erase it there — clearing the browser's data above all (see 'Reliability'). The only real protection is a copy outside the browser, as ordinary files: a backup.

### Automatic backups (Chrome, Edge, and similar browsers on a computer)

In Chrome or Edge on a computer (Windows, Mac, Linux, or Chromebook), 37 Player can keep a backup folder up to date by itself, a few seconds after every change. Most other browsers built on the same engine can too; in Brave, first turn on "File System Access API" at brave://flags.

- **Setting it up:** the first time 37 Player starts, it asks for a backup folder. Create a new, empty folder and choose it — not your existing music folder. You can change it later in Settings. If Chrome asks whether 37 Player may keep access to the folder, choose **Allow on every visit**; otherwise it will ask again each time you open 37 Player (the button at the top will say **Resume backups** — click it to continue).
- **A synced folder** (Dropbox, Google Drive, Syncthing, or similar) also gives you a copy off this computer.
- **The button at the top** shows how things stand, on every tab: **✓ Backed up** when all is well, **Backing up…** while it catches up.

### Manual backups (other browsers, phones, and tablets)

Firefox, Safari, and browsers on phones and tablets can't write to a folder, so backups there are manual — at your own risk. When the library has changes that haven't been backed up, a **Back up library** button appears at the top: amber at first, red after an hour. Clicking it downloads a backup file; keep it somewhere safe. The first one is a full backup of everything. After that you can choose between backing up just the changes since the full backup — usually tiny and quick — or a new full backup; 37 Player shows the size of each, and recommends a new full backup once the changes grow past half its size. Keep your backup files together in one folder — for example **37 Player backups** in your Music folder: to restore, use 'Import / Export' → Restore backup from folder and choose that folder, and 37 Player puts the newest full backup and its latest changes together for you.

Browsers save downloads to their Downloads folder unless told otherwise, and 37 Player can't choose the folder for them. So set your browser to ask where to save — in Firefox, Settings → General → **Always ask you where to save files**; in Safari, Settings → General → File download location → **Ask for each download** — then choose your backups folder once, and the browser remembers it next time.

It's also worth keeping a copy of 37 Player itself in that folder, so your backups never depend on the website: download **37-player.html** from player.37dakinis.net (37 Player offers it during setup, too). Opened from the file, it keeps a library of its own — restore into it from your backups. When you leave 'Edit Playlists' or 'Library' with changes that haven't been backed up, 37 Player also asks whether to back up first.

Anyone can back up, even without the PIN — a backup never changes the library.

### What's in the backup folder

- **Library - do not touch** — the library itself. Please don't edit, rename, or rearrange anything in it; 37 Player relies on it exactly as it is. Its files are named by internal ID, not by title.
- **contents.csv** — a list of every track, with its artist, album, name, and playlists. Open it in any spreadsheet program to find a particular recording.
- **37-player.html** — 37 Player itself, for running without the website (see below).
- **README.txt** — a short explanation, for anyone who comes across the folder.

The backup is a mirror, not a history: something deleted in 37 Player is removed from the backup too. For a snapshot you can go back to, use 'Import / Export' → Export now and then, and keep that file somewhere else.

### Restoring

If the browser's data is ever cleared, 37 Player starts as if new, and its setup appears again. Choose the same backup folder and pick **Restore this backup** — everything comes back, and backups carry on in that folder.

You can also restore at any time, in any browser, from 'Import / Export' → **Restore backup from folder**.

### One folder, one copy of 37 Player

Each copy of 37 Player — in a particular browser, on a particular computer — has its own library. If two copies back up to the same folder (for example, two computers sharing a synced folder), each would keep replacing the other's library. So when 37 Player finds that another copy has taken over its backup folder, it stops and shows **Backup paused**; click it to choose what to do. Restoring from a folder hands it over to the copy that restored it.

### Running without the website

As soon as you choose a backup folder, 37 Player puts a copy of itself there: 37-player.html. Open it in Chrome or Edge to run 37 Player without the website or an internet connection. If your backup was made from the website, the copy may start with an empty library of its own — restore from the same folder as described above.

That copy keeps itself up to date: when a newer version is published and there's an internet connection, it shows an Update button at the top. Updating keeps your library exactly as it is. Keep the file in its backup folder — that's what lets it update itself. Chrome or Edge on a computer only.
