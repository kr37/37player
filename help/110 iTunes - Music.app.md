iTunes / Music.app

How 37 Player works alongside Music.app on a Mac and iTunes on Windows: bringing a library in, taking one back out, and why standardizing matters there.

### Importing

37 Player can bring in a whole Music.app or iTunes library in one go — the audio, and every playlist inside its playlist folders.

**1. Export the library file.** In Music.app (or iTunes), choose **File → Library → Export Library…** and save the file into the folder that holds your music:

- **Music.app:** the **Media** folder, usually in your Music folder under **Music → Media**.
- **iTunes on Windows:** the **iTunes Media** folder, usually in your Music folder under **iTunes → iTunes Media**.

Keep the name it suggests (Library.xml). That one file lists every playlist and where each of its tracks is.

**2. Import the folder.** In 37 Player, open 'Import / Export', choose **Import a folder…**, and pick that same folder. 37 Player reads the library file along with the audio, and the usual review appears: how many tracks are new, and which playlist entries couldn't be found. Choose **Import**, and the playlists appear in 'Edit Playlists' in the same folders they had in Music.app.

Good to know:

- **Everything in the folder is imported**, not just the tracks your playlists use. To bring in less, pick a smaller folder (one artist, say) — playlists still come in, with anything outside that folder listed as missing.
- **Apple's own lists** (Library, Music, Downloaded and the like) are left out. A smart playlist comes in as the tracks it held when you exported — it doesn't keep updating.
- **Tracks that were never downloaded** — streamed from Apple Music, or left in the cloud — have no file, so they're listed as missing. Download them in Music.app first if you need them.
- **Older iTunes Store purchases** protected against copying (.m4p files) can't be played in a browser.
- **Your music doesn't have to be organized the way Music.app keeps it.** Tracks are found by their folder names and file name, and if a file has moved, by its name and size.
- **Single playlists** work too: a playlist exported on its own (**File → Library → Export Playlist…**, as an .m3u file), or an .m3u or .m3u8 from another player. Put it in the music folder and import the folder.

### Exporting

To take a library from 37 Player into Music.app or iTunes, use 'Import / Export' → Export and choose **Portable**. It unpacks into a **music** folder (artist / album / tracks) and a **playlists** folder of .m3u8 files.

- **The audio:** in Music.app, choose **File → Import…** and pick the **music** folder.
- **The playlists:** choose **File → Library → Import Playlist…** and pick each .m3u8 file. Music.app doesn't recreate folders from these, so a playlist lands at the top level; drag it into a playlist folder afterwards if you want one.

Every track keeps its name, artist, album, track number and artwork, since 37 Player writes those into the files themselves.

### Why standardize for Music.app and iTunes

Music.app and iTunes play one track straight into the next — but only smoothly when the two are alike. When the next track has a different sample rate (44.1 kHz after 48 kHz, say) or a different number of channels (mono after stereo), the player has to reset its audio output between them, and you hear a click, a dropout, or a short gap. In a sadhana split into many tracks, that can land in the middle of a prayer.

37 Player itself doesn't have this problem, but a library headed for Music.app or iTunes is better standardized first: Settings → **Library standardization** converts, in the background, every file to the same format — AAC, stereo, at one sample rate — so every track matches its neighbours. It also shrinks uncompressed files like WAV a great deal.

The conversion needs a browser that can create AAC files — usually Safari, or Chrome or Edge on a Mac or Windows; the Library standardization section says so when this one can't. Chrome and Firefox on Linux can't: there, uncompressed files are still made smaller (as Opus), and the rest are left as they are.
