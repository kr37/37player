Audio playback problems

Most recordings play everywhere: **MP3** and **M4A** (AAC) play in every browser and in the desktop app, and so does **WAV**, though it's very large. A few other kinds of file play on some devices but not on others: **WebM** and **Opus** (common for recordings made in a browser or on an Android phone, and for many downloads from the web), **Ogg**, **FLAC**, **AIFF**, **Apple Lossless** (ALAC, outside Safari) and some rarer ones. An older Mac, an iPad or iPhone, and Safari are the likeliest to have trouble with them.

### What it looks like

- **A track won't start**, and 37 Player says it can't be played.
- **The time runs, but there's no sound.**
- **The length is wrong**, or moving to another point in the track doesn't land where it should.
- **The same track plays well on another device.**

### What to do: convert it

Converting makes the recording into the library's preferred format (Settings → **File conversion**: MP3, unless you've chosen another), which plays on every device. The converted file takes the place of the old one, so the track keeps its name, its details and its place in every playlist. In a shared library the converted file goes to every device.

1. Open 'Library' → **Table**.
2. Click the **Type** heading to sort by it, so that tracks of the same kind are together.
3. Select the tracks that have trouble: click one, then Shift+click another to select everything between them.
4. Click **Convert** in the bar under the table. (In **Browse**, **Convert** is in the bar above the tracks.)

Converting needs 37 Player's converter, which it fetches the first time (about 26 MB) and then keeps, so it works offline afterwards. It waits while anything is playing, and shows how far it has got at the bottom of the window, with **Stop**. A track that is already in the preferred format is left as it is. Afterwards 37 Player asks whether to keep the originals too, for a later export (with **Don't touch my files** they are simply kept). A file over 500 MB gets a warning first, since converting needs about as much memory as the file's size.

Convert goes by your choice, whatever the settings on the File conversion page say. With the recommended setting there (**Make every file playable everywhere**), 37 Player converts such files by itself as they come in, and a shared library always does.

### What Type shows

Table's **Type** shows what kind of file a track really is, found from what's inside it, not only from its name: a file can be named .mp3 and be WebM inside. Tracks are recorded this way as they come in. For tracks that came in before 37 Player did this, Settings → Library cleanup → **Check library** finds out, and says how many were another kind than their names said.

### When converting doesn't help

- **A track that can't be played on any device** may have lost its file, or the file may be damaged. Settings → **Library cleanup** lists such tracks, with **Find or replace…** to give a track its file again.
- **Still no sound?** Use **Send feedback…** in Help to tell the author of 37 Player, with a note of which track and what happened. The playback log goes with it, and says which kinds of file this device can play.
