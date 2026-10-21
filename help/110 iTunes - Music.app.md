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
- **A track that can't be found** — never downloaded (streamed from Apple Music, or left in the cloud), or outside the folder you picked — leaves a **Stop** in its place in the playlist, named "MISSING TRACK: title — album", so playback halts right there instead of quietly skipping it, and the playlist is flagged. Once the track is in the library, put it in where the Stop is, and remove the Stop.
- **AIFF files** (.aif), common in older iTunes libraries, come in as WAV, since most browsers can't play AIFF. The sound is identical, and the name, artist, album and artwork come along.
- **Older iTunes Store purchases** protected against copying (.m4p files) can't be played in a browser.
- **Files a browser can't play** — Windows Media Audio (.wma), Apple Lossless (ALAC, inside an .m4a) outside Safari, compressed AIFF and a few others — are converted to MP3 as they come in, so they play everywhere and keep their place in the playlists. 37 Player then asks whether to keep the originals too, for a later export (a portable export takes the original), showing how much room they take; Settings → Library cleanup can discard them later. Converting needs 37 Player's converter, which it fetches by itself (about 31 MB, once) and keeps, so it works offline afterwards; it waits while anything is playing. Without the converter (no internet the first time, say), such files come in marked "Can't be played", with **Convert them now** for later.
- **Your music doesn't have to be organized the way Music.app keeps it.** Tracks are found by their folder names and file name, and if a file has moved, by its name and size.
- **Single playlists** work too: a playlist exported on its own (**File → Library → Export Playlist…**, as an .m3u file), or an .m3u, .m3u8 or .xspf (VLC) from another player. Put it in the music folder and import the folder. ('Importing playlists' explains where playlists end up.)

### Exporting

To take a library from 37 Player into Music.app or iTunes, use 'Import / Export' → Export and choose **Portable**. It unpacks into a **music** folder (artist / album / tracks) and a **playlists** folder of .m3u8 files.

- **The audio:** in Music.app, choose **File → Import…** and pick the **music** folder.
- **The playlists:** choose **File → Library → Import Playlist…** and pick each .m3u8 file. Music.app doesn't recreate folders from these, so a playlist lands at the top level; drag it into a playlist folder afterwards if you want one.

Every track keeps its name, artist, album, track number and artwork, since 37 Player writes those into the files themselves.

Volume adjustments made in 37 Player, and its evening out, don't come along: they aren't written into the files as ReplayGain tags, so Music.app plays each file at its own level. Music.app's own **Sound Check** (in its Playback settings) evens tracks out in a similar way.

### Why standardize for Music.app and iTunes

Music.app and iTunes play one track straight into the next — but only smoothly when the two are alike. When the next track is a different file type (MP3 after AAC), or has a different sample rate (44.1 kHz after 48 kHz, say) or a different number of channels (mono after stereo), the player has to reset its audio output between them, and you hear a click, dropout, short gap, or worse.

37 Player itself doesn't have this problem, so there's no need to change the library for it. Instead, when exporting with **Portable**, tick **Convert to the preferred format**: every file in the export comes out alike, and the library stays as it is. For a stricter match, set the preferred format (Settings → **File format**) to **Best for Apple** (AAC, 44.1 kHz, stereo), or choose your own under Custom.

### The library's file format

Settings → **File format** sets one **preferred format** for the library — Standard (MP3 192k, recommended), Best for Apple, Very small, Lossless (FLAC, not recommended: much larger, with no difference you can hear), or Custom — and which files are converted to it:

- **Don't touch my files:** nothing is changed. A file this browser can't play still gets a playable copy, and its original is kept too.
- **Reduce uncompressed audio** (recommended): WAV and AIFF files are converted as they come in.
- **Choose the rules:** uncompressed audio, a bitrate above a limit, a sample rate or channel count other than the preferred format's, or less widely playable types (Opus, Ogg, WebM).

The page says what the settings would mean for the library as it is ("12 tracks would be converted…"). Converting them is in Settings → **Library cleanup** → Convert to the preferred format, with **Convert them now** and the list of those tracks (name, album, type, size, sample rate, bit rate, channels). In a shared library these settings belong to the library, so a change on one device applies on all of them, and a file about to be converted is never sent before its converted version is ready.

Videos (a recorded teaching, say) can come in too: 37 Player asks whether to take their sound as audio tracks. The video itself isn't kept.
