Shared library

A shared library keeps the same tracks and playlists on several devices: the rooms of a Center, or your own computer, phone and tablet. A change made on any of them, such as a new playlist, a renamed track or a tweak on the iPad, reaches the others by itself within a few minutes.

### Joining

You need a **join code** from whoever runs your shared library. In Settings → **Shared library**, enter the code and a name for this device (for example "Gompa iPad"), and choose **Join**.

- **A device with nothing in it yet** simply receives the shared library.
- **A device that already has a library** asks first, and shows how many tracks are already in the shared library, only on this device, and only in the shared library. **Use the shared library here** replaces what's on this device with the shared one. **Combine them** adds this device's tracks and playlists to the shared library, which is how the first device fills an empty shared library. A recording this device imported separately (so 37 Player knows it by a different ID) is matched to the shared copy by its name, album, artist and length, so combining doesn't create duplicates. Folders and playlists work the same way: a folder or playlist with the same name in the same place becomes one with the shared one, such as the **Classes** folder every new library starts with. If a playlist's tracks differ, this device's version is kept beside the shared one as "Name (device name)", marked ⚠.

The tracks' details and playlists arrive straight away, on every device. The audio follows in the background, shown in the bar along the bottom. A track that hasn't arrived yet is fetched the moment it's played. While anything is playing, sending and receiving pause between files so the sound stays clean, and pick up again when it stops. While the first device is still sending its audio, the others show how many files are still on their way, and pick them up as they arrive. A large library takes a while the first time; after that, only what changed travels.

### Day to day

There's nothing to do. 37 Player checks a few seconds after every change, every few minutes while it's open, and whenever it comes back on screen. **Sync now** in Settings does it at once, and Settings shows when it last synced.

- **Working offline** is fine: everything plays from this device as always, and changes are sent the next time it's online.
- **Each device keeps its own settings**: display, PIN, backups and volume aren't shared.
- **Backups still matter.** A shared library protects against losing one device. It doesn't protect against a mistake made on one device, because that mistake is shared too.

### When two devices change the same thing

37 Player compares each device's changes with the last version they both had, so most changes simply combine. A rename on one device and new artwork on another both survive, and so do two different playlists edited at the same time.

- **The same playlist's tracks changed on two devices before they synced:** both versions are kept. The shared one keeps its name; the other appears beside it as "Name (device name)", marked ⚠. Look at both, keep the one you want, and delete the other.
- **The same detail of a track changed on both** (the same track renamed differently, say): the version that reached the shared library first wins.
- **Deleted on one device but edited on another:** the edited one is kept. A track still used in a playlist is never deleted.

### Phones and tablets

- **Wi-Fi only:** on an Android phone, **Send and receive audio on Wi-Fi only** is on to begin with. Library changes still sync on mobile data (they're tiny), and a track you play that hasn't arrived yet is still fetched. Everything else waits for Wi-Fi. iPhones, iPads and computers can't tell Wi-Fi from mobile data. They have **Pause sending and receiving audio** instead, to switch on before using mobile data.
- **Keep syncing with the screen off:** a phone or tablet stops 37 Player soon after its screen locks, which pauses a big first sync. While there's audio to send or receive, Settings → Shared library offers **Keep syncing with the screen off**. It keeps 37 Player going by quietly playing silence, shows the progress on the lock screen, and stops by itself when everything has arrived. The lock screen's pause button stops it, and so does playing anything. It's best done plugged in.

### Receive updates only

For a player nobody edits on, such as a meditation room's laptop, turn on **Receive updates only**. That device takes every change from the shared library and sends nothing. Anything changed on it by accident is replaced at the next sync.

### Leaving

**Leave shared library** stops syncing this device. Its library stays exactly as it is now, as an ordinary library of its own.

### If something goes wrong

- **Sync log:** Settings → Shared library → **Sync log** lists what syncing did recently: each file sent or received, what it saved, and any errors, with a line every 10 minutes while 37 Player is open. It's kept on this device even if 37 Player closes or crashes, so a gap in those lines shows when it stopped. Copy it into a message if you're reporting a problem.
- **Going round in circles:** if this device saves to the shared library 30 times in 2 minutes, syncing stops by itself and says so. **Sync now** starts it again.
- **Opening without syncing:** add `?nosync` to the end of 37 Player's address (for example `https://player.37dakinis.net/37-player.html?nosync`). Sharing stays off for that session, and Settings lets you leave the shared library.
