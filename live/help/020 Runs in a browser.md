Runs in a browser

37 Player runs entirely in a browser. The browser (Chrome, Edge, etc.) keeps its own storage, and 37 Player lives entirely within it, in a database called IndexedDB. When you import any files or make any playlists, they're stored inside this IndexedDB — the entire music library lives in this one space. You won't find the library on your disk (unless you're kind of a hacker-type).

You can export the library in a structured format, which looks like this:

```
/music/New Kadampa Tradition/Heart Jewel/files
/music/New Kadampa Tradition/OSG/files
/music/Silence/Silence/files
/playlists/action tantra/avalokiteshvara sadhana.m3u8
/playlists/action tantra/medicine buddha sadhana.m3u8
```

That exported structure can be useful to other programs, and it can also be re-imported back into 37 Player — but 37 Player itself is always actually playing from within the browser's own storage, never directly from an exported copy.

This also means that although you may have initially run this from a web URL, once it is initialized, it does not depend at all on an internet connection.

The app itself works the same way as the library data: once it has loaded successfully at least once, the browser keeps its own cached copy, so opening the page again doesn't require reaching the server at all. Between that and the library already living entirely in the browser's own storage, there's nothing about actually running 37 Player that depends on a network connection — only that very first visit does.

{{setup-locally}}
