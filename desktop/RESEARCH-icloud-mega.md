# iCloud (CloudKit) and MEGA for shared libraries: research

12 Nov 2026. Gen Rinzin asked whether iCloud through CloudKit and MEGA would
be good homes for a cloud library, besides the droplet (`sync.php`) and
Google Drive. Nothing is built. This is what was found, from Apple's
documentation and developer forums and MEGA's JavaScript library, with no
code tried yet.

## How a new home would fit

Google Drive got in without touching the sync: `driveFetch(cfg, params,
init)` answers sync.php's requests (`state`, `file`, `history`, `list`,
`log`, `logs`, `peaks`) from a Drive folder. A CloudKit or MEGA home would be
a third such adapter, beside sign-in, join/create and Leave. The sync code
itself, the 16 MB pieces for big audio, history and the logs would stay as
they are.

## iCloud through CloudKit

**What it is.** Apple's database service, which is reachable from any
browser by CloudKit JS (`https://cdn.apple-cloudkit.com/ck/2/cloudkit.js`) or
by plain HTTPS calls (CloudKit Web Services). It works on Windows and
Android too: anyone with an Apple ID can sign in, and Apple's sign-in page
offers to make one.

**Setting it up needs Gen Rinzin's Apple Developer account** (which he now
has): an iCloud container (e.g. `iCloud.com.37player`), the record types
(the schema) made in the CloudKit Console or by CKTool JS, and an API token
for web services, which can be limited to the allowed origins
(37player.com, test.37player.com).

**Where the data goes.** A person's own library would go in their *private*
database, which counts against **their own iCloud storage**. The developer
pays nothing for it and can't see it. That is the main catch: free iCloud is
5 GB, often already full of photos. With iCloud+ (50 GB and up) it's roomy.
The public database counts against the developer's quota instead, but
anyone could read it, so it's wrong for libraries.

**Big files.** The Web Services reference gives 50 MB as the largest asset
field (older pages say 15 MB), and an upload address lasts 15 minutes.
37 Player already sends big audio to the droplet as 16 MB pieces
(`sharedSendInPieces`), so the same pieces would fit.

**Several people, one library.** Every device signed in to the same Apple ID
sees the same private database, which may be enough for one Center (one
Center Apple ID on every device). Between different Apple IDs, CloudKit
shares a whole record zone: the owner keeps the library in a zone of their
private database, makes a share (CloudKit JS `shareWithUI`), and the others
accept it (`acceptShares` / `records/accept`). It then appears in their
*shared* database, and they can write to it when allowed. It's unclear (an
open forum question in 2026) whose storage the others' uploads count
against; probably the owner's.

**Change control.** Every record has a change tag, and a save made against
an older tag is refused. That fits the library's `rev` check (two devices
saving at once).

**Sign-in, the part to test first.**
- In a browser tab: Apple shows its sign-in in a pop-up and hands back a
  `ckWebAuthToken`. With `persist: true` the session is kept in a cookie on
  37player.com's own domain.
- In the desktop app: probably like Google. Apple's note says a web view
  must open the sign-in in the real browser. An API token can be given a
  custom sign-in callback address that receives the token
  (`…?ckWebAuthToken=…`), so the shell's loopback sign-in (`oauth.rs`), or a
  page on 37player.com that passes the token on, could take it back. That
  needs a second API token, for the desktop app.
- On an iPad's Home Screen web app, pop-ups and cookies are kept apart from
  Safari's. Whether the sign-in comes back there is unknown until tried.
- In 2026 some developers report trouble: "421 AUTHENTICATION_REQUIRED"
  straight after a successful sign-in, and `setupAuth()` returning null. Most
  of the Web Services reference is in Apple's documentation archive. CloudKit
  JS is still updated (2.6.x), but Apple puts most of its effort into the
  native frameworks.

**Verdict.** It's a good fit for Apple households and Centers that already
pay for iCloud+. It's free to run, and the data is the person's own. It
falls short when the free 5 GB is all they have. Before any adapter work,
it's worth a small test (half a day), which needs Gen Rinzin to make the
container and a development API token:
1. Sign in from a Chrome tab on Windows, Safari on the Mac, an iPad in
   Safari and as a Home Screen app, and the desktop app through the browser.
2. Save a 16 MB piece and a gzipped state record, then read them back.
3. Save over a stale change tag and check that it's refused.
4. See what the iPad shows in Settings → iCloud → Manage Storage afterwards
   (one forum report says that bytes fields take about 10 times their size,
   and that assets don't).

## MEGA

**What's attractive:** 20 GB free, and a JavaScript library (`megajs`, from
the community, maintained) that works in browsers.

**What's against it:**
- **There's no OAuth.** Signing in is by the person's MEGA email and password,
  typed into 37 Player, which then holds their session. With Google and Apple,
  only their own pages see the password. MEGA's own SDK documentation has no
  OAuth either (a Duplicati forum looked in 2019).
- **Everything is end-to-end encrypted.** The app encrypts and decrypts every
  byte itself (`megajs` does it), which costs time and memory on phones and
  old Macs, where 37 Player already works hard with big WAVs.
- To check before going further: the free account's transfer limits, and
  MEGA's terms for third-party apps.

**Verdict.** Lower priority than CloudKit. The password sign-in is a real
step back from the other homes.
