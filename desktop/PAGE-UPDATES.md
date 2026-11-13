# The desktop app's page updates itself

**Built (6 Nov 2026):** the shell's side in `desktop/src-tauri/src/pages.rs`
(on `tauri-spike`, now the `desktop` branch, with `cargo test`s), the page's in 1.4.182 (`desktopPageUp`,
tests/desktop.js), the signing job in `.github/workflows/page-release.yml`.
**Waiting for the key pair** (below): until the public key is in
`desktop/src-tauri/page-key.pub` (now "none") and the private one in the
secrets, nothing is published and nothing downloaded is used.

How it came out, where it differs from the design below:
- **Update now, not Restart now:** the window reloads into the new page, as
  on the website; the app keeps running. The same "Update now" under the
  version, and the same offer from Check for updates, as the website's.
- **A page that doesn't start** is caught within a minute, not only after
  two starts: if it hasn't said so (`p37_page_ok`) a minute after it was
  chosen, it's put aside and the window reloads into the one before it, as
  the website's service worker does. Two starts without word also does it.
- **The shell downloads** (Rust, `ureq`), not the page, so a page whose
  update check is broken can still be replaced.
- **page.json** (version, bridge) is fetched first, then the files only if
  they're newer; files are written beside, then renamed into place.
- The **converter** (ffmpeg) still comes with the shell: a page that needs a
  different converter version needs a new build (rare; the converter has
  changed once).

## The key pair (Gen Rinzin, once)

On the T470 (needs Node):

    npx @tauri-apps/cli@2 signer generate -w ~/.tauri/37player-pages.key

It asks for a password (choose one and keep it with the key). It writes
`37player-pages.key` (private) and `37player-pages.key.pub` (public). Then on
GitHub, kr37/37player → Settings → Secrets and variables → Actions → New
repository secret, twice:
- `TAURI_SIGNING_PRIVATE_KEY`: the whole contents of `37player-pages.key`;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password.

Send Claude the contents of `37player-pages.key.pub` (public, safe to share);
it goes into `page-key.pub`. Keep the private key file backed up: losing it
means a new key pair and a new desktop build for everyone. The same key can
sign shell updates later (Tauri's updater uses this kind of key).

## The design

For Gen Rinzin to look over. 6 Nov 2026. The aim is to make development go smoothly:
GitHub builds a new desktop app only when the Rust shell changes, and every
ordinary change reaches desktop users the way it reaches the web.

## Why it can work

37 Player is one HTML file, `37-player.html`. The desktop app is a small Rust
shell around it that rarely changes (closing, one instance, the menu, the
window, and from bridge 2 the files). Today each desktop build bundles the
page as it was on that day, so a fix to the page needs a new build, a download
and an install. Instead, the shell can fetch a newer page and use it from the
next start, as the web version does.

## How

1. **Where pages come from.** A newer `37-player.html` and its signature
   (`37-player.html.sig`). Two possible sources, for Gen Rinzin to choose:
   - **GitHub (suggested).** When `main` changes, a small GitHub Actions job (a
     Linux machine, seconds, not a desktop build) signs the page and replaces
     the files of one rolling release, `page-latest`. Merging to `main` is
     already Gen Rinzin's "approved", so desktop users get what the web gets, without
     waiting for the droplet, and the droplet serves nothing extra.
   - **37player.com.** The page as deployed, plus a `.sig` that Gen Rinzin makes with
     a script when he deploys. The private key must then live off the droplet
     (his laptop), or a hacked server could sign its own page.
   A test channel could follow `dev` the same way (`page-test`), for the
   desktop test builds, so they get dev's page without a rebuild.
   Either way people never see GitHub for this: the shell fetches the file
   from a fixed address in the background. Downloading the app itself is a
   separate matter: a page on 37player.com can link straight to the
   installer files, wherever they're kept.

2. **What the shell checks** before keeping a page (Rust, `pages.rs`):
   - the signature, with a public key built into the shell (ed25519; the
     private key in GitHub's secrets, or on Gen Rinzin's laptop). A downloaded page
     can reach the library folders (bridge 2), so only Gen Rinzin's pages may run;
   - its `app-version` is newer than the page in use;
   - the bridge it needs (a new `<meta name="desktop-bridge" content="2">`,
     beside `app-version`) is one this shell has. A page that needs a newer
     shell isn't used; the page in use says a new version of the app is
     needed (Check for updates already has the wording);
   - it looks like 37 Player (the `app-version` tag, a sensible size).
   Kept in the app's data folder as `pages/37-player-<version>.html` with its
   signature; the newest two are kept, older ones removed.

3. **Which page runs.** At start, the shell serves the newest kept page that
   still passes its signature check and suits its bridge, otherwise the
   bundled one. It does this through Tauri's own assets (`Context::set_assets`
   with a wrapper that answers `37-player.html` from the kept page and
   everything else from the bundle), **so the address stays the same**:
   `tauri://localhost` on the Mac, `https://tauri.localhost` on Windows. That
   matters because the browser storage, and so the library until bridge 2,
   belongs to that address; another address would open an empty library.
   (What would change it: serving a downloaded page some other way, from its
   file or from the web, rather than as the app's own page. This design
   doesn't.) After bridge 2 the libraries are folders, but the browser
   storage still holds the list of libraries, which one opens, the language,
   theme and other settings; **Gen Rinzin, 6 Nov 2026: be as persistent as
   possible**, so these move into the shell's own file too
   (FILES-DESIGN.md, "The device's own settings"), and then the address
   hardly matters.

4. **When.** The page asks the shell to check (`p37_page_check`) once a day,
   a minute after starting, and when the person presses Check for updates. A
   new page is downloaded quietly and used **from the next start**. Check for
   updates says "1.4.x is ready: it's used next time 37 Player starts"
   (with **Restart now**, which asks first if something is playing, as closing
   does). Never in the middle of playing.

5. **If a new page fails.** The page tells the shell it started properly
   (`p37_page_ok`, once the library has loaded). If a downloaded page starts
   twice without saying so, the shell goes back to the one before it (then the
   bundled one) and stops using that version. So a bad page can't leave the
   app unusable. The bundled page is never replaced (Gen Rinzin likes this: the page
   the shell shipped with is always there to fall back to). One care: a
   newer page may have saved the library in a form an older page doesn't
   know, so a fallback page must at least open such a library safely, or say
   it needs the newer version, rather than damage it.

6. **The shell itself.** Updates to the Rust shell (rare) could use Tauri's
   updater later, which wants signed builds; that fits with the Apple account
   when it comes. Until then a new shell is a download from the Releases page,
   as now. **Done, shell 2.2.3 (13 Nov 2026):** `updates.rs` with Tauri's
   updater plugin, its packages signed with this same key; the page asks
   before installing (NOTES.md, "The desktop app updates itself").

## What changes for Gen Rinzin

- Nothing in the deploy routine with the GitHub source: merging to `main` is
  the release, for the web (once he pulls on the droplet) and the desktop
  app. With the 37player.com source, one extra command when deploying.
- A key pair, made once; the public key goes into the shell, the private key
  into GitHub's secrets (or his laptop).
- Desktop builds on GitHub only when the shell changes (`desktop/` files), so
  Mac machines are needed rarely.

## Testing

- `cargo test`: the signature check (good, altered, wrong key), the version
  and bridge rules, the choice of page, falling back after two failed starts.
- The page: Check for updates' messages in the desktop app (the existing
  desktop.js test, with a stand-in shell).
- On a real Mac and Windows: a test channel page newer than the bundled one,
  used from the next start; then a deliberately broken one, rolled back.

## Command-line options (Gen Rinzin, 6 Nov 2026: can the shell take them?)

Yes; a sketch, nothing decided:
- `--bundled-page`: start with the page the shell shipped with, whatever
  has been downloaded since (for when a page update goes wrong in a way the
  automatic fallback doesn't catch). Holding Shift while it starts could do
  the same for people who don't use a terminal.
- `--list-libraries`: print each library's name and folder, then quit. The
  shell can do this itself once libraries are folders it knows (bridge 2,
  `roots.json` and each folder's `37 Player library.json`).
- `--library <name or folder>`: open that library. With one instance only,
  a second start passes its options to the window already open.
- Printing from a windowed app needs a little care on Windows (attaching to
  the terminal it was started from); on the Mac it's run as
  `"/Applications/37 Player.app/Contents/MacOS/37 Player" --list-libraries`.
  Or (Gen Rinzin) a small window with the list instead, with a Copy button: no
  terminal needed at all. Perhaps both: printed when started from a
  terminal, a window otherwise.

## Questions for Gen Rinzin

- Source: GitHub's `page-latest` (suggested) or 37player.com? **Gen Rinzin, 6 Nov 2026: GitHub.**
- Should desktop test builds follow `dev` (a test channel)? **Gen Rinzin, 6 Nov 2026: yes.**
- From the next start only, or offer **Restart now** too? **Gen Rinzin, 6 Nov 2026: offer Restart now.**
