Importing playlists

Playlists from other players come in along with their audio: choose the folder that holds both, in 'Import / Export' → **Choose a folder…** (or a .zip of it, with **Choose a .zip file…**).

### What's read as a playlist

- **.m3u and .m3u8** files, from almost any player — and from 37 Player's own Portable export.
- **.xspf** files, from VLC and others.
- **Library.xml**, exported from Music.app or iTunes (File → Library → Export Library…) — every playlist in it, in its playlist folders. See 'iTunes / Music.app'.

A playlist file can be anywhere in the folder you choose. Its tracks are found wherever they are in that folder too — by where the playlist says they are, or, when that's a path on another computer, by the last few folder names and the file name. A track that can't be found leaves a **Stop** named "MISSING TRACK: …" in its place, and the playlist is flagged.

**Only what the playlists use:** everything in the folder is imported unless you say otherwise. When the folder has playlists, the review before importing offers **Import only tracks that are in playlists** (off to begin with) — handy for bringing in a friend's session playlists without their whole music collection.

### Where the playlists end up

Playlists keep the folders they're in, as folders in 'Edit Playlists' — counted from the folder you chose:

- `Music/Morning.m3u8` → **Morning**, at the top level
- `Music/Pujas/Heruka.m3u8` → **Pujas** → **Heruka**
- `Music/Source Albums/Heart Jewel/Heart Jewel.m3u8` → **Source Albums** → **Heart Jewel** → **Heart Jewel**

That last one is the thing to watch: a playlist saved beside its album's audio brings the album's folders along as playlist folders.

**A folder called "playlists"** (any capitalization, at any depth) changes that: it and everything above it are left out, and only the folders beneath it are kept.

- `Music/PLAYLISTS/Kangso.xspf` → **Kangso**, at the top level
- `Music/Playlists/Festivals/Spring/Day 1.m3u8` → **Festivals** → **Spring** → **Day 1**

So for the tidiest result, gather the playlist files into a "playlists" folder, arranged the way you'd like them to appear. 37 Player's Portable export always does this, so importing one gives back the same folders you had.

Playlists from Music.app's Library.xml are the exception: they keep the playlist folders they had in Music.app.

### When a playlist is already here

A playlist with the same name, in the same folder, as one already in 'Edit Playlists' is listed for review before anything is imported: **Replace** it (the usual choice when bringing in a newer version), **Skip** it, or **Import as new** alongside it.
