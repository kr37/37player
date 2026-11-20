# wry 0.57.1, patched for 37 Player

This is wry 0.57.1 as published on crates.io, with one change, used by the
desktop app through `[patch.crates-io]` in `../../src-tauri/Cargo.toml`.

**The change** (`src/wkwebview/class/url_scheme_handler.rs`, marked "37 Player's
patch"): a custom-protocol answer is handed to WebKit on the main thread, from
whichever thread it is sent. wry's own responder (now the closure `answer`) is
unchanged; the new `responder` calls it directly on the main thread, or queues
it there with `NSOperationQueue::mainQueue().addOperationWithBlock`. Also
added: objc2-foundation's `NSOperation` feature, which that needs.

**Why:** answered from another thread (Tauri's async command replies come from
tokio workers; 37 Player's p37lib server answered from its own threads),
WebKit could stop a task on the main thread between wry's
`check_task_is_valid` and `didReceiveResponse`. It then raised, and
`objc2::exception::catch` could not contain it: the app aborted with "panic in
a function that cannot unwind" (macOS 12.7.6, x86_64, reports
2026-11-20-050726 and 2026-11-20-061426 in kr37/37player-reports, symbolized
with the build's dSYM). wry 0.57.3 has the same code.

**Leaving it:** when a wry release answers on the main thread itself, remove
the `[patch.crates-io]` entry and this folder.
