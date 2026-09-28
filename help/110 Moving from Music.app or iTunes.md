Moving from Music.app or iTunes

37 Player can bring in a whole Music.app or iTunes library in one go — the audio, and every playlist inside its playlist folders.

### 1. Export the library file

In Music.app on a Mac (or iTunes on Windows), choose **File → Library → Export Library…** and save the file into the folder that holds your music:

- **Music.app:** the **Media** folder, usually in your Music folder under **Music → Media**.
- **iTunes on Windows:** the **iTunes Media** folder, usually in your Music folder under **iTunes → iTunes Media**.

Keep the name it suggests (Library.xml). That one file lists every playlist and where each of its tracks is.

### 2. Import the folder

In 37 Player, open 'Import / Export', choose **Import a folder…**, and pick that same folder. 37 Player reads the library file along with the audio, and the usual review appears: how many tracks are new, and which playlist entries couldn't be found. Choose **Import**, and the playlists appear in 'Edit Playlists' in the same folders they had in Music.app.

### Good to know

- **Everything in the folder is imported**, not just the tracks your playlists use. To bring in less, pick a smaller folder (one artist, say) — playlists still come in, with anything outside that folder listed as missing.
- **Apple's own lists** (Library, Music, Downloaded and the like) are left out. A smart playlist comes in as the tracks it held when you exported — it doesn't keep updating.
- **Tracks that were never downloaded** — streamed from Apple Music, or left in the cloud — have no file, so they're listed as missing. Download them in Music.app first if you need them.
- **Older iTunes Store purchases** protected against copying (.m4p files) can't be played in a browser.
- **Your music doesn't have to be organized the way Music.app keeps it.** Tracks are found by their folder names and file name, and if a file has moved, by its name and size.

### Single playlists

A playlist exported on its own (**File → Library → Export Playlist…**, as an .m3u file), or an .m3u or .m3u8 from another player, works too: put it in the music folder and import the folder. Playlist files that list tracks by their full location on another computer are matched the same way.
