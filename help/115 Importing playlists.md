Importing playlists

Playlists from other players come in along with their audio: choose the folder that holds both, in 'Import / Export' → **Choose a folder…** (or a .zip of it, with **Choose a .zip file…**).

### What's read as a playlist

- **.m3u and .m3u8** files, from almost any player — and from 37 Player's own Portable export.
- **.xspf** files, from VLC and others.
- **Library.xml**, exported from Music.app or iTunes (File → Library → Export Library…) — every playlist in it, in its playlist folders. See 'iTunes / Music.app'.

A playlist file can be anywhere in the folder you choose. Its tracks are found wherever they are in that folder too — by where the playlist says they are, or, when that's a path on another computer, by the last few folder names and the file name. A track that can't be found leaves a **Stop** named "MISSING TRACK: …" in its place, and the playlist is flagged.

**Playlists with missing audio:** when some playlists here refer to audio that isn't in the folder (old playlist files left behind, say), the review says how many, lists them with how much of each was found, and asks: **import all** of them (each missing track becomes a Stop), **only the ones with all their audio**, or **no playlists, only the audio**. It starts at "all" while every such playlist found at least half its tracks, and otherwise at "only the ones with all their audio". When every playlist is complete, nothing is asked.

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

### Folders as playlists

A folder with no playlist files in it can still come in as playlists. The review before importing offers **Make a playlist of each folder** — ticked to begin with when the folder has no playlists of its own, unticked when it does. Each folder holding audio becomes a playlist named after it, inside playlist folders arranged like the folders you chose, counting the chosen folder itself:

- `Pujas/Heruka/…` and `Pujas/Tara/…` → **Pujas** → **Heruka**, and **Pujas** → **Tara**
- `Heart Jewel/…` on its own → one playlist, **Heart Jewel**, at the top level
- `Teachings/Intro.mp3` beside `Teachings/Day 1/…` → **Teachings** → **Teachings** (the loose tracks) and **Teachings** → **Day 1**

Tracks are in track-number order, then by file name ("2" before "10"); a track with no number comes after the numbered ones. Since these playlists use every file, this and **Import only tracks that are in playlists** can't both be on.

### When a playlist is already here

A playlist with the same name, in the same folder, as one already in 'Edit Playlists' (from a playlist file, or a folder made into a playlist) is listed for review before anything is imported: **Replace** it (the usual choice when bringing in a newer version), **Skip** it, or **Import as new** alongside it.
