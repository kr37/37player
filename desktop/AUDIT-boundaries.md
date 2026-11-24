# Audit: where 37 Player's processes and threads meet

A report for kr37's review, 20 November 2026. **Nothing in the code was
changed.** Fixes come after the release, each in a small step on its own
branch: a d build for the shell, a page version for the page.

Read against:

- `desktop` at 17b5378: shell 2.6.0, including Open With.
- `dev` at 2752741: page 2.6.000.
- wry 0.57.1 as patched in `desktop/vendor/wry` (shell 2.5.8).
- The Tauri versions in `Cargo.lock`: tauri 2.12.5 and tauri-runtime-wry 2.12.3. Their source was read where it decides something below.

Why now: every serious hang or crash so far happened where two processes or
threads meet, not inside one of them:

| When | What happened | Where two sides met |
|---|---|---|
| 8 Nov | The app aborted with a 1 GB WAV | The shell read a file on its main thread while serving the page |
| 11 Nov | The Mac mini restarted itself (the kernel's watchdog: the window server stopped answering for 120 s) | Big WAVs passed to the converter as Blobs; WebKit's Networking process held 4–6 GB |
| 18 Nov | The window froze for good | The page, WebKit's media process and Apple's audio lock waited on each other, over the silent loop's `pause()` |
| 20 Nov | Two aborts on the Mac mini | wry handed p37lib answers to WebKit from the wrong thread (fixed in shell 2.5.8) |

## How to read this

**One pattern behind every freeze:** a main thread waits, with no time
limit, for something on the other side of a boundary. A message sent without
waiting for an answer can't freeze anything. A call that waits can freeze
whoever waits. So each crossing below says:

- **Who waits, on which thread, and for how long.**
- **Failure modes:**
  - the other side gone,
  - reloading,
  - slow,
  - answering twice,
  - never answering,
  - answering off the main thread.
- **What happens today.**
- **A fix, and that fix's risk.**

Each crossing also says **who owns it**:

- **Ours:** both sides are our code, so we fix it.
- **Ours to stop triggering:** the failure is inside Apple's, Microsoft's or WebKit's code, but we set it off.
- **Theirs:** we can only notice it and recover.

And **how we know**:

- **Seen:** in a report or crash.
- **Code:** read in the source, not yet seen happen.
- **Inferred:** reasoned from how the parts work.
- **To check:** needs a measurement on a real machine.

**Platforms**, in kr37's order of importance:

1. Mac (the desktop app);
2. iPad (Safari, or a Home Screen app);
3. Windows (the desktop app, or Chrome or Edge).

Android and Linux get short notes where they differ.

## The map

**The Mac desktop app** is five parts:

1. **The shell**, the Rust program named "37 Player" in Activity Monitor. Its main thread:
   - draws the window, runs the menus and the Dock icon;
   - takes in every message from the page;
   - runs every command not marked async;
   - hands every answer to WebKit (since 2.5.8).

   Its other threads:
   - **The stall watch**, for the whole run.
   - **One thread per p37lib request**, ending with the request.
   - **The page-update check**, waking every hour; plus one thread for 60 s after a page starts.
   - **The sign-in listener**, only while you sign in.
   - **Tauri's shared pool**, as many threads as the computer has cores, where every async command runs.

2. **The page's process**, "tauri://localhost" in Activity Monitor. Its main thread runs all of 37 Player's JavaScript: drawing, clicks, timers, sync and saving. Its other threads:
   - **The converter**, a Web Worker running ffmpeg. It runs only while converting.
   - **WebKit's own threads**, for decoding, storage and the network.

3. **WebKit's media process.** It plays the audio: `play()`, `pause()`, seeking, the audio session. Apple's audio frameworks start reader threads inside it.

4. **WebKit's Networking process.** It handles every `fetch` (Google Drive, sync.php), the browser's storage, and the bytes of every Blob the page makes. That is why it held 4–6 GB on 11 Nov.

5. **Programs and services the shell or WebKit call on:**
   - **The system:** the audio daemon, the file chooser (a separate service on the Mac), Now Playing and the media keys, and Finder's Open With (an Apple Event).
   - **Programs the shell starts or talks to:**
     - your web browser for Google sign-in;
     - `open` to show a folder;
     - the Trash;
     - the updater, which replaces the app and restarts it;
     - a second launch of 37 Player, through the single-instance check.
   - **The disks:** the system disk, and any drive with a folder used in place.

**The iPad** is parts 2 to 5 with no shell: Safari's or the Home Screen app's
page, media and Networking processes, and iPadOS around them.

**Windows:**

- **The desktop app** uses WebView2, Microsoft's built-in version of Chromium's engine. It has its own browser, page, GPU, network and audio processes, with the same Rust shell around them.
- **Chrome and Edge** are the same engine without a shell.

## What matters most

The full list of fixes, in order, is at the end. These are the findings with
the most at stake:

1. **Big commands block other commands.** Commands the shell marks "async" don't run on threads of their own. They share Tauri's pool, as many threads as there are cores (4 on the Mac mini), and our file commands do slow disk work there without letting go. A few slow ones fill the pool, and every other command queues behind them. That includes:
   - a 2 GB copy;
   - a read from a drive that's waking up or gone;
   - an open folder chooser, which holds a pool thread for as long as it's open.

   Code; not yet seen.
2. **A few commands that touch the disk still run on the shell's main thread.** Most often:
   - `p37_device_put`: the device's settings and the playback log, written about a second after each log line.
   - `p37_page_info` and `p37_page_switch`, which read and check every kept page.

   A slow disk freezes the window for that long. Code.
3. **No call to the shell has a time limit on the page's side.** If one never answers, whatever awaits it waits forever. In the worst cases:
   - **Saving:** a save that never ends holds up every later save in silence. Only a save that fails turns the top bar red.
   - **The converter's lock:** converting, splitting, waveforms for unusual formats, export and taking sound from video all share it, and stop together.
   - **Closing:** the window can't close, because the page saves before it says "quit".

   Code.
4. **When one command's request fails, Tauri retries it by another route, and stays on that route.** Then:
   - that command may run **twice**, so an append adds the same piece again;
   - every later `fs_write` fails until a reload, because the other route can't carry raw bytes;
   - every later read comes back as a huge text array.

   Nothing in the page notices. Code (Tauri's `ipc-protocol.js`); not seen in a log.
5. **The window can't close while the page is frozen.** Closing and Quit wait for the page's answer, so only Force Quit works. On a Mac, a log-out or restart is held up too. Inferred from the code, and consistent with the 18 Nov freeze.
6. **On computers, the page still makes audio of its own.** The silence clock plays silent WAVs that live in the page's memory. Recordings of 32 MB or less are read into the page and played from there. That's the arrangement of the 18 Nov deadlock: the media process waiting for bytes that only the page's main thread can give. It's not yet known whether a p37lib recording avoids that path (to check).
7. **Nothing watches the page itself.** The stall watch only watches the shell's main thread:
   - a frozen page leaves no trace, apart from "didn't close normally" at the next start, if it's force quit;
   - if the page's process dies, Tauri reloads it quietly and nothing is logged.

   Code.
8. **The iPad still uses the silent loop.** Its `pause()` started the 18 Nov freeze on a Mac. Whether iPadOS can get stuck the same way is unknown. Before an iPad runs a puja, it's worth knowing.

---

## Part 1: the page and the shell

### 1.1 How every command travels (all three systems)

The page calls `desktopInvoke` (or `__TAURI__.core.invoke`), and Tauri does
the rest:

- **The request:** a `fetch` POST to `ipc://localhost/<command>`, Tauri's own address scheme.
  - On the Mac, WebKit hands it to wry's `start_task`, on the **shell's main thread**.
  - wry copies the request's body there. When WebKit gives the body as a stream rather than all at once, wry reads it **128 bytes at a time** (`url_scheme_handler.rs`), still on the main thread. An 8 MB `fs_write` piece would then be about 65,000 small reads on the thread that draws the window.
  - To check: whether WebKit sends our bodies as a stream. Timing one 8 MB write answers it.
- **The command:**
  - **Not marked async:** runs right there, on the main thread.
  - **Marked async** (`#[tauri::command(async)]` or `async fn`): runs on Tauri's shared pool (`async_runtime::spawn`, not `spawn_blocking`). See 1.3.
- **The answer:**
  - On the Mac, it goes to WebKit on the main thread (the 2.5.8 patch). Its bytes are copied there as well.
  - On Windows, wry already does the same: checked in `webview2/mod.rs`, so Windows didn't have the Mac's crash.
  - On Linux, it goes through GLib's main context. Also the main thread.
- **The time limit:** none, on either side. A command that never returns leaves the page's promise waiting forever.
- **The page reloading meanwhile:**
  - WebKit cancels the fetch, and the shell's command runs on to the end.
  - Its answer finds no request. Since 2.5.8, wry sees that safely.
  - **But** the work still happens. An `fs_rename` or `fs_write` from the old page can land after the new page has read the folder. Rare; Code.
- **A request that fails** (the fetch rejects): Tauri prints "IPC custom protocol failed, Tauri will now use the postMessage interface instead" and **sends the same request again** another way. **Every later request in that page goes that way too.**
  - **Twice:** if the first try reached the shell, the command has now run twice. For `fs_write` with append, `fs_append_range` or `fs_copy` that's wrong data, not just wasted work.
  - **Every later write fails:** the other way turns raw bytes into a JSON list of numbers. `fs_write` then refuses with "the file's bytes must be the body", every time, until a reload.
  - **Every later read is huge:** `fs_read` answers come back as JavaScript text, an 8 MB piece as about 30 MB of text, read on the page's main thread.
  - **How likely:** a fetch to `ipc://` rejects only on a network-level failure. In practice that's the page leaving, or WebKit dropping the task: rare. Code (`ipc-protocol.js` in tauri 2.12.5); not seen in our logs.
- **Owner:** ours (the page and the shell), with Tauri's and wry's code in between.

**Fixes:**

- **A. Keep working after the switch, and restart the window only when nothing plays** (shell and page, small).
  - **kr37 (23 Nov):** if a playlist is playing and playback still works, don't interrupt it.
  - Asking to reload at once was the first proposal. It would also have lost edits made since the switch, since those saves would have failed.
  - **Shell:** `fs_write` also accepts the slower route's body (a JSON list of numbers), so saves keep working, slowly.
  - **Page:** notices the switch (a write that came the slow way, or the "must be the body" error from an older shell), and logs it once.
  - **When nothing is playing** (stopped, or at a stop item), offers "37 Player's window should restart. It takes a moment, and the playlist's place is kept." A reload brings the session's place back.
  - **Risk:** low. Never seen yet; this is insurance.
- **B. Make repeats harmless** (shell and page, medium).
  - `fs_write` with append carries the size the file should have before the append. The shell refuses a mismatch, and the page then starts that file again.
  - `fs_append_range` does the same.
  - `fs_copy` and `fs_rename` are already safe to repeat in effect: same source and destination, same result.
  - Risk: low. An older page without the size is accepted as today.
- **C. Copy bodies faster** (wry patch, small). Read request bodies in 64 KB pieces instead of 128 bytes. Measure first (fix 10). Risk: low; it's the loop's buffer size only. Worth sending upstream with the main-thread patch.

### 1.2 Commands that run on the shell's main thread

These aren't marked async, so the window waits while they run:

| Command | Touches the disk? | How often | Notes |
|---|---|---|---|
| `p37_device_put` | yes: writes device.json, copies the old one to .bak, renames | about 1 s after any change to the mirrored keys, including **every playback log line** (`playLog` → `37player.playLog`, up to 400 lines) | the most frequent one |
| `p37_device_get` | reads device.json | rare (the start reads it through an init script) | |
| `p37_page_info` | **reads and checks the signature of every kept page** (megabytes each), holding the pages' state lock | at start and in About | if the hourly check thread holds the lock while reading pages, the main thread waits for it |
| `p37_page_switch` | reads and checks the chosen page | Update now | |
| `p37_page_ok` | writes pages' state | once per start | |
| `fs_place_default`, `fs_root_default` | make folders, write roots.json | creating a library | |
| `fs_root_forget`, `fs_root_use_found` | write roots.json / read a marker file | rare | |
| `p37_open_url` | starts the browser (`open`) | when asked | starting a program is quick |
| `p37_shell_info`, `p37_zoom`, `p37_watch`, `p37_opened_take`, `fs_roots`, `fs_place`, `p37_quit` | no | at start; `p37_watch` every 20 s | fine |

Not commands, but also on the main thread:

- **Finder's Open With** (`RunEvent::Opened`): each file's real path is looked up and its size read there. Quick on a local disk; on a network share it waits for the share.
- **The single-instance hand-over** (a second launch with files): the same.

**Failure modes:**

- **Slow:** a disk that is busy (a big copy running), asleep (an external drive spinning up) or on the network delays every one of these, and the window freezes as long. Seen in kind: the 8 Nov crash was this shape.
- The others (gone, twice, never) don't apply: these finish or fail on their own.
- **Owner:** ours.

**Fix D** (shell, small): mark every command in the table that touches the
disk `async`, and run its body with `spawn_blocking` (as `p37_page_check`
already does).

- Do the same for the Open With path lookups: one short-lived thread.
- In `pages.rs`, read and check pages *before* taking the state lock, not while holding it.
- **Risk:** low. The answers are the same. Two `p37_device_put`s can no longer overlap, as `device.rs` already holds a lock around the write, so order is kept.
- `p37_device_put` itself could also be sent less often: the playback log could be mirrored on a longer delay (10 s) than the rest.

### 1.3 Commands that run on the shared pool

These are marked async, but their bodies do slow, blocking disk work on
Tauri's shared pool (tokio's workers, one per core):

- **Reading and writing files:** `fs_read`, `fs_write`, `fs_copy`, `fs_append_range`, `fs_rename` (a copy when the move crosses drives), `fs_remove` (recursive), `fs_list`, `fs_stat`, `fs_mkdir`.
- **Library folders:** `fs_find_libraries`, `fs_root_trash` (counts every file first), `fs_root_rename`, `fs_root_info`, `fs_places_restore`, `fs_remove_if_empty`.
- **The two folder choosers:** `fs_root_choose` and `fs_root_choose_library`. Each holds a pool thread in `blocking_pick_folder` until the person closes the dialog.

**Failure modes:**

- **Slow, and starving everything else:** with all pool threads busy, every other async command waits. For example:
  - a 2 GB `fs_copy` into the library, plus a big `fs_append_range`, plus two reads from a sleeping USB drive;
  - or one open folder chooser plus three slow reads.

  On a 4-thread Mac mini that's easy to reach during an import with sync running. Playback isn't held up directly, since p37lib has threads of its own, but saving, the device mirror and the start-up checks are. Inferred; not seen.
- **Never answering:** a network share that stops answering can block a read for a long time (the system decides how long). The page waits with no limit (1.1).
- **Every call looks up the folder's real path first** (`resolve` → `canonicalize`), so even `fs_stat` touches a drive that may be gone.
- **Owner:** ours.

**Fix E** (shell, small): run each file command's body with
`tauri::async_runtime::spawn_blocking`, and the folder choosers too. That
pool grows as needed (up to 512 threads), so one slow call never holds up
another.

- **Risk:** low. More threads at once when many reads run together; each still reads at most one piece.

### 1.4 Writing files through the shell

How the page writes (`DesktopFileHandle.createWritable`):

- **Up to 8 MB:** one `fs_write`. The shell writes beside the file and swaps it in, so a reader never sees half a file.
- **Bigger:** pieces of 8 MB appended to `<name>.p37part`, stretches of disk files copied in with `fs_append_range`, then `fs_rename` onto the file.
- **On failure:** the page removes the `.p37part`.
- **Files of 32 MB or less are read whole:** `fs_read` with no end, and so through both main threads (1.1). 32 MB is the largest single answer.

**Failure modes:**

- **Twice:** see 1.1. Repeated appends make a longer, wrong recording, and nothing checks the result's size before the rename. Code.
- **Reloading or a crash mid-write:**
  - the `.p37part` stays behind;
  - `fs_write`'s own `.p37tmp-` files are hidden by `fs_list`, but stay on the disk.

  Harmless, but they collect. Code.
- **Two copies to the same place at once:** `fs_copy`'s temporary name is fixed (`<name>.p37tmp-copy`), so two at once would collide. The page's locks make this unlikely. Code.
- **Windows:** renaming over a file that another program holds open fails (an antivirus scan, Windows Search). Rust opens files so that our own readers don't block it. The page sees an error and the save is retried, so a nuisance rather than a loss. To check on the HP.
- **Owner:** ours.

**Fix B** (1.1) covers the first: the page checks the `.p37part` size before
the rename. A tidy step at library open removes leftover `.p37part` and
`.p37tmp-` files older than a day. **kr37 (23 Nov):** agreed; this is general
housekeeping, not one-time repair code.

### 1.5 p37lib: recordings played and read from the disk

**How it works:**

- The page's player, and the converter worker, ask for `p37lib://localhost/<root>/<path>` on the Mac, or `http://p37lib.localhost/…` on Windows.
- The shell starts a thread per request (`std::thread::spawn` in `lib.rs`), which reads up to 4 MB (`SERVE_PIECE`) and hands the answer back on the main thread.

**Failure modes:**

- **Off the main thread:** fixed in 2.5.8 on the Mac. Windows was already safe (wry dispatches). Linux's player doesn't use p37lib. Seen, fixed.
- **No Range asked for:** the whole file is read into memory for one answer (`serve`, `(0, len, false)`). WebKit's player asks with a Range; a `fetch` or the worker without one wouldn't. Code; no caller found doing it today, but nothing stops one.
- **Slow or gone drive:** the request's thread waits; the main thread doesn't.
  - The player waits, then errors, and `watchPlaceDrive` takes over.
  - The converter's worker uses a **synchronous request with no time limit** (`lazyInput`), so it waits for as long as the shell's read does. See 3.2.
- **Many requests:** a long WebM is asked for in many small, often-cancelled pieces. That's a thread each, not limited, though each is short. Code.
- **Owner:** ours, with WebKit asking.

**Fixes:**

- Cap an answer without a Range at 4 MB too (a 206 answer), or refuse it. Risk: low.
- Give the worker's request a time limit (3.2).

### 1.6 The Linux file server (`fileserver.rs`)

Linux is low priority, so only the points that matter:

- **No write time limit:** a player that stops reading (paused, with the network buffer full) keeps its thread waiting in `write_all` until the connection closes.
- **No limit on threads**, one per connection.
- **A busy loop:** if the system runs out of file handles, the accept loop (`incoming().flatten()`) skips each error and tries again at once, spinning at full CPU.

Fixes: a write time limit (30 s), and a short sleep after an accept error.
Risk: low.

### 1.7 Messages from the shell to the page

| Message | When | If the page is reloading | If the page is frozen | Today |
|---|---|---|---|---|
| `p37-page-ready` | a newer page is downloaded | lost; but the page asks `p37_page_info` at start, so nothing is missed | lost; asked again at the next start | fine |
| `p37-files-opened` | Open With while running | the files wait in the shell's list, and the page takes them at start | they wait | fine: the page listens first, then takes |
| `p37-close-requested` | the close button, Cmd-Q, Quit, the system asking the app to quit | lost: nothing closes; a second click works once the page is up | **lost: the window can't close, and Cmd-Q does nothing** | see 1.8 |

### 1.8 Closing and quitting

**How it works:**

- The shell holds back every close, and every quit the system asks for (`CloseRequested`, `ExitRequested` with no exit code), and sends `p37-close-requested`.
- The page asks first if something would stop, then **awaits `saveState()`**, then calls `p37_quit`.

**Failure modes:**

- **Page frozen:**
  - The window can't be closed.
  - The Quit menu does nothing.
  - A log-out or restart of the Mac waits on 37 Player, and macOS eventually says 37 Player stopped it.
  - Only Force Quit works.

  Inferred; fits the 18 Nov freeze, where the menu bar still answered.
- **A save that never ends:** `saveState()` has no time limit, so `p37_quit` is never sent. Code.
- **Owner:** ours.

**Fix F** (shell and page, small):

- The page answers `p37-close-requested` at once with `p37_close_seen` (a new command; the page checks the shell has it), and races `saveState()` against 10 s before quitting.
- In the shell: if a close was asked for and nothing came back within 5 s, the next close or Quit shows the system's own dialog: "37 Player isn't responding. Quit anyway?" (Quit / Wait).
- A system log-out gets the same after 10 s.
- **Risk:** low. The page's own question still comes first whenever the page is alive. A page too old to answer behaves as today, since the shell only offers the dialog when the page has said it can answer.

### 1.9 Page updates (`pages.rs`)

**Failure modes:**

- **Main thread:** see 1.2.
- **The 60 s rule:**
  - A downloaded page has 60 s from its start to say it started (`p37_page_ok`, sent once the library is loaded).
  - On a swapping Mac mini the start has taken over 20 s, and a slow start past a minute sets a good page aside for good.
  - It has happened once (NOTES, 11 Nov: "37 Player opened (2.2.002)" between two openings of 2.2.009).
  - Seen.
- **The reload after giving up:** sent with `eval("location.reload()")` from the timer thread. Fine: Tauri sends it on to the main thread.
- **The network:** a 120 s limit per file and a 40 MB size limit. Good.
- **Owner:** ours.

**Fix G** (shell and page, small). Revised after kr37's questions (23 Nov), so this is a proposal:

**The first two ideas, and why each falls short:**

- **Counting a page as started when its script first runs:** weaker. A new page's bug is as likely to be in loading the library (a new storage format, a change at start) as anywhere, and that's exactly what the check should catch.
- **A fixed 3 minutes:** still wrong for a giant library on a slow Mac. And a person would usually have quit or restarted long before.

**Proposed: time from progress, not from the start:**

- While the library loads, the page tells the shell it's still making progress (`p37_page_progress`, at each step and every few seconds while reading).
- The page is set aside only when **60 s pass with no progress at all**, or when it doesn't reach "library loaded" within **10 minutes** in all.
- A giant library loading steadily is never set aside; a page stuck at one step still is.

**Unchanged:**

- Quitting before the library loads counts as an unconfirmed start (`choose()`), and **two such starts set the page aside**. So a person who gives up on a page that doesn't work is covered too.
- The page can always be set aside by hand in About.

**Risk:** low.

### 1.10 The shell updating itself (`updates.rs`)

**How it works:**

- `p37_shell_update_check`, then `p37_shell_update_install`, which downloads, installs and restarts.
- The page asks first, saves, and shows "Updating…".

**Failure modes:**

- **Slow or stuck download:** no time limit is set on the updater, so a download that stops leaves "Updating…" up for good, with no way to cancel. Code.
- **Playing:** the question lists what would stop, and the person may still go ahead. By design.
- **Owner:** ours, with the updater plugin.

**Fix H** (shell, small): set the updater's time limit (its `timeout`
option), and report progress to the page with a Cancel button. Risk: low.

### 1.11 Google sign-in (`oauth.rs`)

**How it works:** a one-time listener on 127.0.0.1 for up to 10 minutes,
waiting on Tauri's blocking pool.

**Failure modes:**

- **Starting twice:** two listeners, and the older one waits out its 10 minutes. Harmless.
- **Page reloaded while waiting:** the result arrives after the page that asked is gone, and the person signs in again. Rare.
- **Programs started:** `open` and the browser are started and never waited for. On the Mac and Linux each leaves a finished process entry (a "zombie") until the app quits. Harmless at this rate.

Nothing to fix now.

### 1.12 Files opened with 37 Player (shell 2.6.0)

- **Order:** sound. The page listens, then takes what's waiting.
- **Before the page loads:** files wait in the shell.
- **A second launch on Windows and Linux:** files arrive through the single-instance hand-over.
- **Main thread:** the path lookup on the main thread is the only concern (1.2, fix D).
- **What the page does with them:** reads each file with `getFile()`, so a file of 32 MB or less is read whole into the page (1.4) before the question appears. A few seconds for a batch on a slow disk. Fine.

### 1.13 The stall watch (`watch.rs`)

**What it sees:**

- the shell's main thread held up for more than 2 s, reported once it ends;
- a session that ended without closing;
- the message of a Rust panic.

**What it doesn't see:**

- **A permanent hang of the shell's main thread:** the stall is only reported when it ends, so a window frozen until Force Quit shows only as "didn't close normally".
- **The page's main thread, the media process, the converter:** nothing at all. The 18 Nov freeze left no stall.
- **The page's process ending and being reloaded by Tauri** (1.14).

**Fix I** (shell only, small; it notes the time, using what already runs):

**Why it was declined before:** kr37 declined a page watch on 18 Nov ("37 Player freeze troubleshooting"). It would only log, not prevent anything, and he was hesitant to add more background processes. Both reasons still hold for the version first proposed here: a new timer in the shell, and a new answer from the page every 5 s.

**What was missed then:** the page already calls `p37_watch` every 20 s (`desktopWatchPoll`), and the shell already has a thread running (the stall watch). So:

- **The shell keeps the time of the page's last `p37_watch`.**
- **The stall watch's existing check** sees when that is over 60 s old while the window is on screen, and notes "the page stopped answering at 14:02:10" in running.json.
  - A hidden or minimised window's timers are slowed by the system, so it allows 5 minutes then.
- **Every 30 s, it notes whether its own last check reached the main thread.** A hang of the shell that never ended then leaves its start time too, not only "didn't close normally".

**What this changes:**

- No new thread, no new timer and no new page code.
- It still prevents nothing, but it gives a freeze its start time and connects it to the playback log.
- **Fix F can use it:** if the page has been silent, a close offers "Quit anyway?" at once, instead of after a wait.
- Whether it should ever *act* (reload a frozen page) stays kr37's decision, after seeing what it records.

**Risk:** low. A page busy for over a minute (a big import on a slow Mac) would be noted, which is worth knowing.

**Decided (kr37, 23 Nov):** this version, recording only, linked to fix F, and early in the order.

- **Records only:** the shell keeps the time of the last `p37_watch`. The stall watch's existing loop notes when that is over 1 minute old with the window on screen, or 5 minutes when it's hidden. The page shows the new kind of entry in the log it already writes from `p37_watch` (a line or two of page code).
- **Linked to F:** a close or Quit while the page is silent offers "Quit anyway?" at once.
- **No automatic recovery.** For the freeze seen on 18 Nov, a reload would very likely not help: the stuck media process belongs to the app, not the page, so a reloaded page would likely meet the same stuck process at its first sound (inferred, not tested). Only restarting the whole app clears it, and doing that by itself, perhaps mid-puja on a false alarm, is worse than a frozen window someone can see and act on.
- **Reconsider only with evidence:** if records show freezes recurring in a way a restart reliably cures.
- **Why early:** the record gives each freeze its real start time. On 18 Nov the log's last line (2:02, "silent loop off") was about ten minutes before the page actually froze; that was only worked out from samples taken by chance. Later decisions (fixes M and N) should rest on what real freezes look like.

### 1.14 The page's process ending

**What happens today:**

- **Mac:** if WebKit's page process crashes, or macOS ends it for memory, Tauri reloads the page by itself (tauri-runtime-wry 2.12.3, its default handler). Nothing is logged. A page that dies again at every start would reload in a loop.
- **Windows:** WebView2 reports the same as `ProcessFailed`, and nothing in wry, Tauri or the shell handles it (searched in their source), so the window would likely stay blank. To check on the HP.
- **Linux:** WebKitGTK's `web-process-terminated`: not handled either. Low priority.
- **Owner:** theirs (the crash); ours (what happens next).

**Fix J** (shell, small):

- Our own handler on the Mac: record it for the watch report, then reload.
- After three in two minutes, stop reloading and show a native message with a Reload button.
- On Windows, handle `ProcessFailed` the same way (to check what Tauri gives us).
- **Risk:** low.

### 1.15 Panics: the app ends at once

- **The setting:** the shell is built with `panic = "abort"`, so any panic on any shell thread ends the app at once.
- **Our own code:** every `unwrap()` and `expect()` outside the tests was read. None can fail in practice:
  - locks can't be "poisoned" when a panic aborts;
  - the answers' headers are fixed text;
  - the one `expect` is at start.
- **Where the aborts came from:** all three so far were inside wry or AppKit:
  - the file chooser, 6 Nov;
  - p37lib answers, 20 Nov, twice.
- **The panic hook:** writes running.json while holding its own lock briefly. It can't deadlock in practice.
- **Owner:** theirs.
- Nothing to fix in our code. Keep the symbols with each build (as now), and keep reading crash reports this way.

### 1.16 Starting up

**How it works:** before the library opens, the page awaits, in order:

1. `p37_shell_info`;
2. `desktopLibrariesAtStart` (`fs_find_libraries` and others);
3. `ensureDesktopFolder`;
4. `desktopFolderFollowsName` (`fs_root_rename`);
5. `fs_places_restore`.

The 8-second "storage isn't responding" watch (`openStorageNotResponding`)
starts only after these.

**Failure modes:**

- **Any of these never answers:** a blank window, with nothing said. For example: the libraries' place on a drive that's gone, or every pool thread busy (1.3).
- **Owner:** ours.

**Fix K** (page, small): start the watch before the first of these, and say
which step is waiting (useful in a report). Risk: none to speak of.

---

## Part 2: the page and WebKit, and the system

### 2.1 Playback: the page and the media process

How each kind of audio reaches the player:

| What | Mac (desktop app) | Windows (desktop app) | iPad / Safari | Chrome, Edge |
|---|---|---|---|---|
| a recording over 32 MB | from the disk through p37lib | the same | from the browser's storage (a blob) | the same |
| a recording of 32 MB or less | **read into the page, played as a blob** | the same | a blob | a blob |
| a silence | **the silence clock: silent WAVs made by the page**, up to 30 s each | the same | **the silent loop**, made by the page, started and paused | the silence clock |
| a stop | nothing plays | the same | the silent loop holds the lock screen | nothing |

**The 18 Nov freeze** ("Cleanup 2 – Waveform storage refactor"; samples on
kr37's MacBook):

- the page's main thread waited for the media process to switch audio on;
- the media process's main thread waited for Apple's audio lock, during a `pause()` of the silent loop;
- the audio-file thread, the likely holder of that lock, waited for more of the silent WAV's bytes, which only the page could give.

Seen. The loop is gone on computers since 2.5.046.

**What still matches that pattern on a computer:**

- **The silence clock's WAVs** are made by the page and live in its memory. They're started, and stopped at the end of a silence or when the person skips. Code.
- **Recordings of 32 MB or less** (most tracks) are also held by the page: `getFile()` reads them whole, and `audioObjectUrl` makes a blob URL. Code. kr37 decided on 16 Nov not to change this ("32 MB is small… risks the main function for no seen gain"). That decision was before the deadlock was understood, so it may be worth another look.
- **Unknown, and it decides the above:** whether a p37lib recording's bytes avoid the page's main thread. In WebKit, a media file is loaded on the media process's behalf by the page's process, and on the Mac the custom scheme is answered in the shell. The load may still pass through the page's main thread either way, in which case moving to p37lib changes nothing. To check, with a sample of the three processes while a p37lib recording and a small one play (fix 10).

**What can't be removed** while the page plays the sound: the page's main
thread still makes calls to the media process that wait for an answer
(switching the audio session on, for one). If the media process hangs for
any reason, the page freezes at its next such call. Theirs.

**Fixes:**

- **L** (shell and page, small): on computers, play silences from silent audio the shell supplies, so no page-made audio plays there at all.
  - **Why a silence plays audio at all:** a silence plays audio only as a reliable timer (1.4.158). A covered window on a Mac gets few timer ticks, but a recording's `ended` still comes on time. Each piece is exactly as long as the time left (up to 30 s), so it ends by itself; a `pause()` happens only when someone skips or stops. A side benefit: the sound output stays active through a long silence, so a sleeping USB, Bluetooth or HDMI output can't clip the start of the next track.
  - **kr37's idea (23 Nov):** silent MP3s of each length in a folder of the library (e.g. `My library/music/Silence/`).
  - **Proposed instead:** the shell makes a silent WAV of exactly the length asked, on request, at an address of its own (e.g. `p37lib://localhost/_silence/17350`: a WAV header and zeros, 8 kHz 8-bit like today's). No files are kept anywhere.
  - **Why not files in the library:**
    - a silence's length is anything (17.35 s), and an MP3 can't be exact;
    - a folder per library;
    - it would be seen in Finder, and by backups, sync and Check library;
    - every device of a shared library would need the same files.
  - **Fallback:** the page uses it only when `p37_shell_info` says the shell has it; otherwise it makes the WAV itself, as today.
  - **Risk:** low. The clock's timing is unchanged; only where the bytes come from changes.
- **M** (page, a decision for kr37): play recordings of 32 MB or less from p37lib too.
  - **kr37 (23 Nov):** one way of playing, not one for big files and one for small, seems simpler. It is, within the desktop app. The browsers keep playing from their own storage, so it's one way per kind of 37 Player.
  - **A known cost, from the memory test of 20 Nov night** (report 2026-11-21-035158): when the Mac can't decode a file, playing it from memory says "can't be played", but playing it through p37lib runs the time in silence.
  - **So with everything on p37lib, every unplayable file would fail silently on a Mac.** M should therefore follow the planned format check (NOTES, "The silent WebM, settled": a few tiny samples tried from memory at setup and after an app or system update), so a kind this device can't play gets the can't-be-played dialog before it's played.
  - **Order:** the format check, then M as a d build for a few days of kr37's own use. The sample in fix 10 is no longer a condition, since simplicity is reason enough, but it's still worth taking.
  - **Risk:** medium, since it touches every track.
- **N** (big, a decision for later): in the desktop app, play audio in the shell, with the page only sending "play this from 2:13" and "pause" without waiting.
  - **What it gives:** neither the page nor WebKit's media process is in the path, and a hang in Apple's audio stays on a shell thread while the window carries on. Also gone:
    - turning the audio engine on after a click;
    - Web Audio's quirks;
    - p37lib's silent failures.
  - **kr37 (23 Nov):** it was deferred because the browsers' 37 Player would then play quite differently from the desktop app's, much like keeping two programs.
  - **The answer to that is a narrow seam:** one "player" with two makers behind it, the browser's audio element and the shell's player. Everything else (playlists, the library, the screens) stays shared. Through the seam:
    - play from a time, pause, seek, volume;
    - position and track-ended back.

    That's maintainable, but real:
    - loudness, previews, the Edit preview, Split's preview and Now Playing all go through it;
    - the shell's player needs tests of its own;
    - the iPad stays on the browser's player, so that one must stay good anyway.
  - **Weeks of work.** Listed so it's weighed, not proposed now; fix I's records should decide it.
- **I** (1.13) at least records a freeze if one happens.

### 2.2 Web Audio

How it's used:

- **Turning a track up** (loudness): routes the player through Web Audio (`createMediaElementSource`). Once routed, it stays routed until a reload.
- **A recording from another address** (p37lib, or Linux's file server): playing it through Web Audio without marking it cross-origin gives silence with the time running. That's the 2.5.057 fix. Seen, fixed.
- **The Web Audio engine suspended or interrupted:**
  - an iPad's phone call or Siri;
  - a Mac waking from sleep.

  A routed player then plays in silence, with its time moving. Possible on all systems. Inferred.
- **The Mac mini's silent festival WebM** (macOS 12): settled by the memory test of 20 Nov night (report 2026-11-21-035158).
  - macOS 12's WebKit can't decode this WebM, though it says it can.
  - Played from memory, it's reported as unplayable; through p37lib the time runs in silence.
  - Delivery isn't the cause. Converting is the remedy, and the format check is proposed (see fix M).

**Fix O** (page, small): log the Web Audio engine's state changes (`onstatechange`), and resume it when it's "interrupted" and something is playing. Risk: low.

### 2.3 Storage and the Networking process

- **Desktop app:** libraries are in folders now, but localStorage, and anything not yet moved out of the browser's storage, is still in WebKit's.
- **iPad and the browsers:** everything is.

**Failure modes:**

- **Never answering:** a browser's IndexedDB now and then never answers. Seen in Chrome at start ("Your library didn't load", 1 Nov), and WebKit's is known for it too. The 8-second "storage isn't responding" watch covers the library's open, but not later reads or writes, and a hung write holds `saveChain` (3.3).
- **Memory:** a Blob's bytes live in the Networking process until the page lets go and the collector runs. That's the 11 Nov restart: a whole-computer restart, the worst outcome on this list. What's left that still makes big Blobs:
  - `realBlob()`, which reads a file whole (sending to sync.php over 48 MB in pieces, export);
  - the converter's fallback when it can't read from the disk;
  - recordings of 32 MB or less, read whole.

  Each is either small or now done in pieces. Seen, mostly fixed.
- **Owner:** theirs, triggered by us.

Fix P is in 3.3: a time limit on saves.

### 2.4 The file chooser (Mac: a separate service)

**How it works:** opened by the dialog plugin from a command on the shared
pool. It holds that thread until it closes (1.3).

**Failure modes:**

- **A crash:** one abort inside it while a 1.3 GB file was being worked on (6 Nov). Seen, once.
- **Playback while it's open:** the folder chooser runs a modal loop on the main thread. Whether wry's queued p37lib answers still reach WebKit while it's open decides whether a long recording keeps playing while someone picks a folder. To check (fix 10). If not: the player runs out after its buffer and pauses itself.

### 2.5 Now Playing and the media keys

- **How it works:** the page's `mediaSession` handlers run on the page's main thread.
- **If the page is frozen:** the keys do nothing. That's the only failure mode, and fix I records it.
- Nothing else to fix.

### 2.6 The disks

- **Removable and network drives with folders used in place:** every command and every p37lib request first looks up the folder's real path (`canonicalize`).
  - A drive that's unplugged fails at once: good.
  - A network share that has gone quiet can take a long time to fail, and it waits on whichever thread asked: the pool (1.3), a p37lib thread, or the main thread for Open With (1.2).
  - Code.
- **A full disk:** writes fail with an error, and the page has its "device full" handling. Fine.
- **A sleeping external disk:** the first read waits a few seconds while it spins up. Fine once off the main thread (fix D).

### 2.7 The iPad

No shell, so only the page, WebKit and iPadOS:

- **The silent loop** is still used on phones and tablets, where it keeps the lock screen and playback going. Its `pause()` is the call that hung on the Mac. Whether iPadOS can deadlock the same way is unknown; the iPad's WebKit has the same page / media / Networking split. To check: a few hours of a playlist with silences and stops, the screen locked and unlocked many times. An iPad can't be sampled as a Mac can, but a freeze would show. Owner: ours to stop triggering, if it's real.
- **Being put to sleep:** iPadOS pauses or ends a page in the background. A Home Screen app playing audio is kept awake, which is what the loop is for. If the page is ended, it opens again from storage at the next visit, and the session's place comes back. Inferred; nothing to fix unless seen.
- **Memory:** iPadOS ends a page that uses too much, with no warning: the page reloads. Big imports on an iPad are the risk. Inferred. Today the reload says nothing about it (fix T).
- **Audio interruptions:** a call or Siri suspends the Web Audio engine (fix O).
- **Storage:** Safari's 7-day rule (not for Home Screen apps), and IndexedDB hangs (2.3). Covered by the Reliability help topic and the storage watch.

**Fix Q** (testing, not code): the silent-loop test above, on the IKRC iPad's
model or kr37's, before an iPad is relied on for a puja.

**Fix T** (page, small; kr37's question, 23 Nov): notice an unexpected end at
the next start, and say what it was doing. For every browser version (iPad,
iPhone, Android, desktop browsers); the desktop app has the shell's watch and
fix J.

- **Keeping track:** the page keeps a small record in localStorage:
  - "on screen, doing X" (playing, importing N files, converting, receiving from the shared library…), written when an activity starts or ends, and on the existing 5 s position timer while on screen (no new timer);
  - "put away", written when the page is hidden (`visibilitychange`, `pagehide`).
- **At the next start:** if the last record says on screen, with no "put away" after it, the page ended while in front of you without being closed or put away.
  - On an iPad or iPhone that's almost always the system ending a page that used too much memory.
  - Swiping 37 Player away, locking the screen and switching apps all hide the page first, so they don't count.
- **What it says:** a dialog, logged too and so included in feedback, along the lines of: "37 Player closed unexpectedly at 8:14 PM while importing 240 files. On an iPad this usually means it ran short of memory; importing in smaller batches helps." If it was playing, the session's place is already kept.
- **Limits:**
  - No browser says *why* a page ended, so the wording says "usually".
  - A battery going flat with the screen on would look the same: rare.
- **Risk:** low. The activity named is also what tells us which work needs to be lighter on an iPad.

### 2.8 Windows

What's the same as the Mac and what isn't:

- **Answers on the main thread:** wry already does this on Windows (`webview2/mod.rs` dispatches to the window's thread). Safe.
- **Bodies copied on the window's thread:** yes, as on the Mac (1.1).
- **Media:** Chromium's audio runs in a utility process of its own, and the page's calls to it don't wait the way WebKit's do. A deadlock like 18 Nov's is less likely. Inferred.
- **Renaming over an open file:** 1.4.
- **The page's process ending:** 1.14, to check.
- **Chrome and Edge** (no shell): Part 3.

### 2.9 Android and Linux, briefly

- **Android:** Chrome; like Windows' browsers, plus the silent loop and the phone's sleep rules.
- **Linux:** WebKitGTK and GStreamer in the page's process; recordings come over 127.0.0.1 (1.6). The 18 Nov pattern can't form the same way, since GStreamer reads from the shell's server, not from the page. Inferred.

---

## Part 3: inside the page (all systems, the website included)

### 3.1 Locks held across waits

**How they're used:** the page serializes work with `navigator.locks`:

- the convert lock, shared by converting, splitting, waveforms for unusual formats, export, and taking sound from video;
- `37player-sharedsync`;
- the backup lock, the tag-snapshot lock, the incoming-copies lock, and others.

**Failure mode:**

- **Never answering:** a job inside a lock awaits a shell call, a fetch, a storage request or the converter, none of which has a time limit.
- If that never answers, the lock is held until a reload, and everything waiting for it waits too, in silence. Sync with `ifAvailable` simply stops happening.
- Code; not seen as such. Hangs so far were whole-window ones.
- **Owner:** ours.

The fixes are in 3.2 to 3.4: time limits where the waits are.

### 3.2 The converter

**How it works:**

- The page talks to the worker with `converterAsk`: one question at a time, **no time limit**.
- The worker reads a desktop file with synchronous requests, **no time limit** (`lazyInput`).

**Failure modes:**

- **Never answering:**
  - ffmpeg stuck on a damaged file;
  - a read that never returns (1.5);
  - the worker crashing in a way that doesn't fire `onerror`.

  The queue and the convert lock wait forever, with "Converting…" in the status bar. Code.
- **Owner:** ours.

**Fix R** (page, small):

- If the worker reports no progress for 2 minutes, stop it (`converterStop`), log the file's name, mark the file as not converted ("couldn't be converted: it stopped answering"), and go on with the queue.
- Give the worker's requests a time limit (`x.timeout` works in a worker).
- **Risk:** low. A very slow machine converting a huge file still reports progress, so it isn't cut off.

### 3.3 Saves

**How it works:**

- Saves run one after another (`saveChain`).
- A save that **fails** turns the top bar red and is retried every 30 s.
- A save that **never finishes** holds up every later save, and nothing says so (beyond "Saving…" for dialog jobs).

**Failure modes:**

- **Never answering**, from:
  - a shell call (1.1);
  - a storage request (2.3);
  - a full pool (1.3).

  Edits look fine on screen, and are lost if the app is then closed or crashes. Code.
- **Owner:** ours.

**Fix P** (page, small):

- A save that has run for 30 s logs "saving has taken 30 s so far (waiting on …)" and turns the bar amber, then red at 2 minutes.
- It isn't abandoned: a write that may still land is never treated as failed.
- Closing then asks, as for a failed save.
- **Risk:** low.

### 3.4 The network: sync.php and Google Drive

**How it works:** `sharedFetch` and `driveFetch` have no time limit. Only
one `AbortController` exists in the whole page. The browser's own limits
apply: usually a minute or more of silence before it gives up, longer on
some systems.

**Failure modes:**

- **Slow or never answering:** a sync holding `37player-sharedsync` waits. With `ifAvailable`, later syncs are skipped, not queued, so sync stops until the request ends. Not seen as such; sync logs show "Failed to fetch" after long gaps, which is the browser giving up.
- **Owner:** ours (the time limits); theirs (the network).

**Fix S** (page, small): a time limit per request:

- 30 s for the small ones (state, changes);
- for uploads and downloads, a limit on *no progress* (60 s), not on the total.
- Risk: low. Retried as any failed request is.

### 3.5 Other windows, and the service worker (browsers)

- **BroadcastChannel and the version announcement:** fire-and-forget, nothing waits. Fine.
- **The service worker:**
  - opens the saved copy at once and refreshes in the background (30 s limit);
  - a page that doesn't say it started is put aside (1.4.104);
  - the same shape as the shell's page updates (1.9), with a good time limit.

  Fine.

---

## Measurements to make (no code)

**Fix 10.** On the Mac mini or kr37's MacBook, with a d build:

1. **A sample of the three processes** (Activity Monitor → the process → Sample) while:
   - (a) a p37lib recording over 32 MB plays;
   - (b) one of 32 MB or less plays.

   Does the page's main thread appear in the media loading of (a)? This decides fix M.
2. **One 8 MB `fs_write`** timed, with the stall watch's log. Does the main thread stall? This decides fix C.
3. **Playback with the folder chooser open** for a minute during a long p37lib recording. Does it keep playing? (2.4)
4. **The playback log during a big import with sync on.** Do "the app's window didn't respond" lines appear, and when?

On an iPad, the silent-loop test (fix Q).

## The fixes, in order

Each fix is a small step with its own branch. Shell fixes become a d build;
page fixes become a page version on `dev`. First the ones with the most
safety for the least risk:

| # | Fix | Where | Size | Risk | Covers |
|---|---|---|---|---|---|
| 1 | **E** — file commands and folder choosers on `spawn_blocking` | shell | small | low | 1.3 |
| 2 | **D** — disk work off the main thread (`p37_device_put`, pages, roots.json, Open With); pages read before taking the lock | shell | small | low | 1.2, 1.9 |
| 3 | **A** — keep saving after Tauri's switch; restart the window only when nothing plays | shell + page | small | low | 1.1 |
| 4 | **F** — closing when the page doesn't answer; the page's save before quitting limited to 10 s | shell + page | small | low | 1.8 |
| 5 | **P** — a save that runs long is said, amber then red | page | small | low | 3.3 |
| 6 | **R** — converter: stop and go on after 2 min without progress | page | small | low | 3.2 |
| 7 | **K** — the start's watch covers the shell steps too | page | small | none | 1.16 |
| 8 | **J** — the page's process ending: logged, reloaded, no loop | shell | small | low | 1.14 |
| 9 | **I** — note when the page's regular `p37_watch` stops, in the stall watch's existing check; a shell hang that never ended is named. **Decided: record only, linked to F, early** | shell (+ a line of page) | small | low | 1.13, 2.1, 2.5 |
| 10 | **Measurements** (above) | Mac mini, iPad | — | none | 1.1, 2.1, 2.4 |
| 11 | **L** — silences from silent audio the shell makes to length (not files) | shell + page | small | low | 2.1 |
| 12 | **B** — appends that can't land twice; `.p37part` size checked before the rename | shell + page | medium | low | 1.1, 1.4 |
| 13 | **S** — time limits on sync and Drive requests | page | small | low | 3.4 |
| 14 | **G** — a downloaded page is set aside after 60 s *without progress* (10 min at most), not 60 s from its start | shell + page | small | low | 1.9 |
| 15 | **H** — the shell's update download: time limit, progress, Cancel | shell + page | small | low | 1.10 |
| 16 | **O** — Web Audio's state logged, resumed after an interruption | page | small | low | 2.2 |
| 17 | **C** — wry reads request bodies in 64 KB pieces (if 10 shows it matters) | wry patch | small | low | 1.1 |
| 18 | **M** — one way of playing in the desktop app: every recording from p37lib, after the format check | page | small code, wide effect | medium | 2.1 |
| 19 | p37lib: no whole-file answers; the file server's write limit and accept back-off | shell | small | low | 1.5, 1.6 |
| 20 | **Q** — the iPad silent-loop test | testing | — | none | 2.7 |
| 21 | **T** — an unexpected end noticed at the next start, with what it was doing (browsers) | page | small | low | 2.7 |
| — | **N** — playback in the shell | shell + page | large | high | 2.1 (for later) |

Fixes 1 and 2 could go in one d build, since both only move work to other
threads with the same results. A new command the page relies on (fixes 4, 9
and 14) would make bridge 3 by kr37's rule of 7 Nov, unless the page treats
each as optional (it checks the shell's `p37_shell_info` flags, as for
`opened`). Optional is the gentler path: an older app keeps working as now.

## Afterwards: keeping these checks going

**kr37 (23 Nov):** once this audit's fixes are done, work out a way to make
sure these checks are run for future features and fixes. To discuss then.
The Wi-Fi share work (WebRTC between devices) is an example of a new kind of
crossing that would want the same questions asked.

## Checked and found sound

So the coverage is clear, these were read and need nothing:

- **Answers on the main thread:** on Windows (wry) and Linux (GLib) already; on the Mac since 2.5.8.
- **The opened-files hand-over:** the page listens before it takes, and files that arrive early wait in the shell.
- **`p37-page-ready` lost during a reload:** the page asks `p37_page_info` at start.
- **Writes are atomic:** `write_replacing` writes beside and swaps in; device.json keeps a .bak.
- **Path checks:** every path is checked inside its folder, links included. Opened files can only be read, one each.
- **The shell's `unwrap()`s:** none can fail in practice (1.15).
- **The stall watch:** ignores the computer's sleep, and keeps a panic's first message.
- **Page downloads:** signed, size-limited, time-limited, written beside and renamed, and the bundled page is never replaced.
- **The service worker's own time limit,** and its "put aside" rule.
