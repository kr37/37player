Reliability

37 Player is built to be dependable in the middle of a session: once it's set up, it doesn't need the internet, and your library is kept right there on the computer. This page explains where the library lives, what could erase it, and how to protect it — and suggests two short exercises that prove all of this to yourself before you rely on it at an event.

### Where your library lives

Everything you put into 37 Player — the audio, playlists, stops and silences, notes, artwork, and every edit — is stored inside the browser, in a database that every browser has built in, called **IndexedDB**. It isn't a folder of files you can open; it's tucked away in the browser's own storage, alongside its settings and history.

That storage is kept separately for each browser and each website address. Chrome and Safari on the same computer each have their own library; so do the website and a 37-player.html file opened from disk. (See 'Multiple instances'.)

Keeping everything inside the browser is what makes 37 Player quick and able to work offline. The other side of it is that the library is only as safe as the browser's storage — which is why backups matter.

### Working offline

After the first visit, 37 Player doesn't need the internet at all. The browser keeps its own copy of the app, and the library is already on the computer, so you can open 37 Player and run a whole session with no connection.

Only a few things use the internet:

- the very first visit, to load the app;
- 'Import / Export' → **Server libraries**;
- checking for and installing updates. Click the version number at the top (v1.3…) to check. On a phone, it's under ☰. If there's a newer version, **Update** installs it and reloads 37 Player. The library stays as it is, but playback stops, so don't do it mid-session.

A copy opened from a file (such as the 37-player.html in your backup folder) doesn't need the internet even the first time — only for updates.

### What can erase the library — and what protects it

- **Clearing the browser's data.** "Clear browsing data", clearing history with site data included, or cleanup tools such as CleanMyMac or CCleaner erase it on the spot. Nothing inside the browser can prevent that; only a backup protects against it.
- **The browser making room.** When the disk gets very full, a browser may delete a website's storage to free up space — unless that storage has been marked **persistent**. 37 Player asks for this every time it starts, and installing it as an app makes it much more likely to be granted (see 'Setup'). Firefox may ask you directly — choose **Allow**. To check, open Settings (⚙, on 'Edit Playlists' or 'Library') → **Library info** → Storage.
- **Safari's one-week rule.** Safari erases a website's storage after seven days of using Safari without visiting that site. Opening 37 Player regularly avoids it. So does adding it to the Dock (Safari → File → Add to Dock, macOS Sonoma or later) or to the Home Screen on an iPhone or iPad: opening that app counts as a visit. Note that the Dock or Home Screen app keeps its own separate library.
- **Private or incognito windows** keep nothing once they're closed. Never build a library in one.
- **Uninstalling or resetting the browser**, deleting the browser's user profile, or the computer failing or being lost.

For everything on that list, the real protection is a **backup**. In Chrome, Edge, and other browsers built on the same engine, backups to a folder happen automatically (in Brave, first turn on "File System Access API" at brave://flags). In Firefox and Safari, and on phones and tablets, backups are manual. See 'Backing up'.

### If the computer freezes or loses power

A crash at the moment 37 Player is saving can damage part of the browser's storage. 37 Player keeps a spare copy of the library's list of tracks and playlists, a few minutes behind at most, and uses it by itself if the main one can't be read — anything changed in those last few minutes may need doing again.

If neither can be read, 37 Player says so when it starts, and changes nothing until you choose:

- **Restore from your backup folder** (or a backup file). Audio still stored in the browser is kept, and any that the backup doesn't know about — added since it was made — can be added back as tracks afterwards.
- **Rebuild the tracks from the audio still stored here.** The audio is stored separately and usually survives; each track gets its name, artist, album and artwork from the file itself. Playlists can't be rebuilt this way, so backups to your backup folder pause until you've restored from it (or chosen to replace it).

Don't clear the browser's data in this situation — that would erase the audio that's still there.

### Try it: run with no internet

Worth doing once, so there are no surprises at an event:

1. Make or import a small library — a few tracks and one playlist are plenty.
2. Close 37 Player, then open it again while still online. (This makes sure the browser has kept its copy of the app.)
3. Turn off Wi-Fi, and unplug any network cable.
4. Close 37 Player, open it again, and play the playlist.

It should open and play exactly as before. Turn Wi-Fi back on when you're done.

### Try it: restore from a backup

The surest way to trust a backup is to restore from one. With automatic backups it takes a minute or two:

1. Check that the button at the top says **✓ Backed up**. Anything not yet backed up would be lost.
2. Clear 37 Player's data — **only** 37 Player's, not the whole browser's (see below).
3. Open 37 Player again, while online: clearing its data also removes the browser's saved copy of the app, so this one visit needs the internet. It starts as if new, and its setup appears.
4. Choose the same backup folder, and pick **Restore this backup**. Everything comes back, and backups carry on as before.

With manual backups (Firefox, Safari), first click **Back up library** and keep the downloaded file in a folder of its own. After clearing, use 'Import / Export' → **Restore backup from folder** and choose that folder.

### Clearing only 37 Player's data

The browser's general "Clear browsing data" command clears **every** website — you'd be signed out of email and lose saved settings everywhere. Instead, clear just 37 Player's site, with its page open in an ordinary browser window:

- **Chrome, Edge, Brave:** click the icon at the left end of the address bar → **Site settings** → **Delete data**. (An installed 37 Player app shares its data with the website, so this clears both.)
- **Firefox:** click the padlock at the left end of the address bar → **Clear cookies and site data…**
- **Safari on a Mac:** Safari → Settings → **Privacy** → **Manage Website Data…**; search for the site, select it, and click **Remove**.
- **iPhone or iPad:** Settings → Safari (on newer versions, Settings → Apps → Safari) → **Advanced** → **Website Data**; find the site and swipe left to delete it.
