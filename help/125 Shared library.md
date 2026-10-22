Shared library

A shared library keeps the same tracks and playlists on several devices: the rooms of a Center, or your own computer, phone and tablet. A change made on any of them, such as a new playlist, a renamed track or a tweak on the iPad, reaches the others by itself within a few minutes.

### Joining

You need a **join code** from whoever runs your shared library. Enter it with a name for this device (for example "Temple iPad"), either in the welcome when 37 Player first opens (**Join a shared library**) or later in Settings → **Shared library**, and choose **Join**.

To bring only some of the shared library to this device, tick **Bring only the playlists I choose (partial sync)** beside the code. Nothing moves yet: the next step says how much would travel either way, with partial sync first, and you choose there. Partial sync can also be turned on or off later. See 'Partial sync' below.

- **A device with nothing in it yet** simply receives the shared library.
- **A device that already has a library** asks first. Each choice says what it removes, sends and downloads. **Use the shared library here** replaces what's on this device with the shared one, so anything only on this device is removed. **Combine them** (the suggested choice, since it loses nothing) adds this device's tracks and playlists to the shared library, which is how the first device fills an empty shared library. A recording this device imported separately (so 37 Player knows it by a different ID) is matched to the shared copy by its name, album, artist and length, so combining doesn't create duplicates. Folders and playlists work the same way: a folder or playlist with the same name in the same place becomes one with the shared one, such as the **Archive** folder every new library starts with. If a playlist's tracks differ, this device's version is kept beside the shared one as "Name (device name)", marked ⚠.

Before anything moves, 37 Player says how much joining will download or send (for example "about 2.1 GB"). On mobile data or a slow connection, you can cancel and join later.

The tracks' details and playlists arrive straight away, on every device. The audio follows in the background, shown in the bar along the bottom. A track that hasn't arrived yet is fetched the moment it's played. While anything is playing, sending and receiving pause between files so the sound stays clean, and pick up again when it stops. While the first device is still sending its audio, the others show how many files are still on their way, and pick them up as they arrive. A large library takes a while the first time; after that, only what changed travels.

### On Google Drive

A shared library can also live in a folder of your Google Drive. In Settings → **Shared library** (or the welcome's join step), choose **Use Google Drive…** and sign in with Google. 37 Player then shows the 37 Player libraries in that Google Drive: choose one to join, or **Make a new library on Google Drive**. It appears in your Drive as a folder called "37 Player – " and the library's name.

- **Every device that shares it signs in with the same Google account,** a Center's account, say. Sharing one Drive library between several people's own Google accounts isn't possible yet.
- **37 Player sees only what it made** in that Google Drive, nothing else.
- **Everything else works the same:** what's on each device, reviewing changes, receiving updates only, and leaving.
- **If Google asks you to sign in again** (the sign-in was removed in your Google account, say, or the device went unused for months), the button at the top says **Sign in to Google**. It takes you to Settings → Shared library and **Sign in to Google again**.
- **Leave the folder alone in Drive:** don't move or rename what's inside it. Moving the folder itself, or renaming it, is fine.

### Day to day

There's nothing to do. 37 Player checks a few seconds after every change, every few minutes while it's open, and whenever it comes back on screen. **Sync now** in Settings does it at once. Settings also shows when this device last checked, and whether it's **up to date**, still **updating** (downloading or sending audio), or **waiting** for files from other devices that haven't sent them yet.

- **Working offline** is fine: everything plays from this device as always, and changes are sent the next time it's online.
- **Each device keeps its own settings**: display, PIN, backups and volume aren't shared.
- **The shared library is this device's backup.** Once everything on a device has reached the shared library, the **Back up library** button at the top reads **In sync**, and 37 Player stops reminding you to back up. Until then (just after a change, or while audio is being sent), it says **Syncing…**. Tapping **In sync** still lets you save a backup on this device: it opens with **Up to date**, then the usual backup choices.
- **Who keeps backups.** A shared library still needs one device that backs it up: it protects against losing a device, but not against a mistake, because a mistake is shared too. A computer with Chrome or Edge and a backup folder (see 'Backing up') does it by itself, and every device shows when it last did, for example "Backed up by Gen's laptop, today" (on the button's tooltip, and in Settings → Backups and Shared library).

### If a device loses its library

If a device's browser data is cleared, or you want to undo a mess on one device, don't restore an old backup into it: join the shared library again, and choose **Use the shared library here**. That brings back everything as it is now, with everyone's latest changes.

Restoring a backup on a device that's in a shared library offers **Get the current shared library** for this reason. Restoring an older backup there instead first leaves the shared library, because otherwise everything deleted since the backup was made would come back for everyone. A backup made on a device in a shared library says so when it's restored, and suggests joining that shared library instead.

### When two devices change the same thing

37 Player compares each device's changes with the last version they both had, so most changes simply combine. A rename on one device and new artwork on another both survive, and so do two different playlists edited at the same time.

- **The same playlist's tracks changed on two devices before they synced:** both versions are kept. The shared one keeps its name; the other appears beside it as "Name (device name)", marked ⚠. Look at both, keep the one you want, and delete the other.
- **The same detail of a track changed on both** (the same track renamed differently, say): the version that reached the shared library first wins.
- **Deleted on one device but edited on another:** the edited one is kept. A track still used in a playlist is never deleted.

### Tracks that haven't arrived yet

A track whose audio isn't on this device yet shows its name in **bold**, with the reason under it:

- **"On its way from the shared library"** means the shared library has the audio, and it's downloading. On Playing, **Get them now** above the list fetches a playlist's missing tracks straight away, even while something plays.
- **"Waiting for Office laptop to send it"** means the device that added the track hasn't sent its audio yet, perhaps because it was closed too soon. It arrives once that device is open and online again.

Playing also says above the list how many of the playlist's tracks can't play yet, so check before a session starts.

Pressing play on a track that's on its way fetches it at once. If it arrives within a few seconds, it plays. If not, a message says it's still coming. Press play again once it's here. It never starts by itself later, so it can't interrupt whatever you've moved on to.

While 37 Player is sending audio, the bar along the bottom says so. Keep it open until that finishes. Closing the window asks first. Closing a laptop's lid can't be caught, so wait for the bar to finish before you close it.

### Phones and tablets

A phone or tablet stops 37 Player soon after its screen locks, which pauses a big first sync. On a phone or tablet, Settings → Shared library has a **Keep syncing with the screen off** switch, which stays as you set it. While it's on, whenever there's something to send or receive and nothing is playing, 37 Player keeps going by quietly playing silence, with the progress on the lock screen, until everything has arrived. Playing always comes first: syncing waits while a session plays and carries on by itself the moment it stops, even with the screen locked. The lock screen's pause button stops it until you next open 37 Player or play something. It's best done plugged in.

Sharing uses mobile data like any other connection, because a shared library only works when every device keeps it complete. The one big transfer is when a device joins, and the join screen says how much that will be before it starts.

### Reviewing changes before they sync

To decide for yourself what comes and goes, turn on **Review changes before syncing** in Settings → Shared library. Nothing then changes on this device or in the shared library until you say so. 37 Player still checks, and when this device and the shared library differ, a button at the top says so, such as **3 shared changes**. Tap it (or **Review changes…** in Settings, which appears while this is on) to see the list.

Each row is one difference: a folder or playlist, a track, or the order of things inside a folder. The left side says what this device has, and the right side says what the shared library has. The arrow between them says which version wins:

- **→ Send:** this device's version goes to the shared library.
- **← Take:** the shared library's version comes here.
- **✕ Skip:** leave both as they are for now. The row comes up again next time.

Tap an arrow to change it. Each row starts with a suggestion: send what changed here, take what changed in the shared library. A row changed in **both** places is shown in red with **?**, and you choose. **Synchronize** does what the arrows say, and it waits until every **?** is decided.

New tracks are listed under the playlist that uses them. If you take or send a playlist, its new tracks have to come along, so their arrows are locked, with a note saying which playlist needs them. Skip the playlist and they unlock.

If anything changes while the list is open (someone else syncs, say), Synchronize first shows the updated list, keeping your choices where nothing changed. Check it, then press Synchronize again.

### What's on this device

**What's on this device…** in Settings → Shared library shows the whole shared library, with a tick on everything that's on this device and the size of each folder and playlist. The total at the top says how much of the shared library this device holds.

- **Tick** a playlist or folder to bring it here; **untick** it to take it off this device. The shared library keeps it, and so do the other devices. A track used by two playlists stays while either is ticked.
- **Nothing changes until Apply.** The bar at the bottom says what Apply will do, for example "Brings 12 tracks (840 MB to download) · Takes 3 tracks off this device".
- **Albums**, below the playlists, list every album in the shared library. Tick one to bring its tracks here, for example to make playlists from them, without bringing any playlist. An album shows as ticked when all its tracks will be here, and partly ticked when some come with a playlist.
- **Folders** open and close by their arrow or their name; the box beside them ticks everything inside.
- **Cancel** leaves everything as it was.

### Everything, or only what you choose

Under **On this device** in Settings → Shared library:

- **Everything in the shared library** (the usual choice): everything comes here and stays in step. A Center's playback computers and iPads, or your own phone and laptop, work this way, with nothing to think about. Unticking something in What's on this device asks first, then switches the device to the other choice.
- **Only what I choose:** this device holds what's ticked in What's on this device. What it holds stays in step both ways, including new tracks added to its playlists elsewhere. Good for a small iPad, a laptop for one retreat, or helping with a few of a Center's playlists from home.
  - **New playlists from other devices** wait for you, marked **New** in What's on this device; the button at the top says how many, for example **2 new in the shared library**, and opens it. Turn on **New playlists from other devices come here by themselves** to have them arrive on their own (what you've unticked stays off).
  - **Deleting asks which you mean.** Deleting a folder, playlist or track offers **Remove from this device** (the shared library keeps it, and What's on this device can bring it back) or **Delete everywhere** (it's deleted from the shared library and every device). Anything that disappears from this device some other way, such as through Library cleanup, counts as removed from this device. Only **Delete everywhere** deletes from the shared library.
  - **Choosing Everything again** brings the whole shared library here. 37 Player says how much that is first.

When joining, tick **Bring only the playlists I choose** beside the join code for Only what I choose. Everything already on the device joins the shared library, and What's on this device opens so you can tick what else to bring.

### Receive updates only

For a player nobody edits on, such as a meditation room's laptop, turn on **Receive updates only**. That device takes every change from the shared library and sends nothing. Anything changed on it by accident is replaced at the next sync.

### Leaving

**Leave shared library** stops syncing this device. Its library stays exactly as it is now, as an ordinary library of its own.

### If something goes wrong

- **Sync log:** Settings → Shared library → **Sync log** lists what syncing did recently: each file sent or received, what it saved, and any errors, with a line every 10 minutes while 37 Player is open. It's kept on this device even if 37 Player closes or crashes, so a gap in those lines shows when it stopped. Copy it into a message if you're reporting a problem.
- **Going round in circles:** if this device saves to the shared library 30 times in 2 minutes, syncing stops by itself and says so. **Sync now** starts it again.
- **Opening without syncing:** add `?nosync` to the end of 37 Player's address (for example `https://37player.com/37-player.html?nosync`). Sharing stays off for that session, and Settings lets you leave the shared library.
