// The desktop app's shell. 37 Player itself is the page (37-player.html,
// copied into dist/ by copy-app.mjs); this only holds the window.
//  - One instance: a second launch brings the open window forward instead
//    of opening another copy on the same library (two copies share one
//    WebView2 data folder, which broke the spike's open window).
//  - Closing asks first: closing the window, or quitting (Cmd-Q on a Mac),
//    is held back and the page is told ("p37-close-requested"); the page
//    asks if something would stop, then calls p37_quit (see the page's
//    "The desktop app" section). A page that doesn't answer gets the
//    system's "isn't responding" dialog instead (closing.rs, shell 2.7.1).
//  - On a Mac, the app menu's Quit (Cmd-Q) is our own item, so it asks the
//    page the same way (a test build's Cmd-Q quit without asking); Edit
//    gives the page copy and paste, Window minimise and close.
//  - The window fits the screen: it opens at 1300×900 at most, but no bigger
//    than the screen's free area (fit_window).
//  - Files (files.rs, for bridge 2): the folders the page's library store
//    may reach, the commands it uses there, and p37lib:// to play from them.
//  - The page updates itself (pages.rs, desktop/PAGE-UPDATES.md): newer
//    signed pages from GitHub, used from the next start or at Update now.
//  - The device's own settings (device.rs): device.json, so a wiped webview
//    (CCleaner) loses nothing a person would miss.
//  - What the page can't see for itself (watch.rs): the window not
//    answering for over 2 s, and how the session before ended.
//  - Audio files opened with 37 Player (shell 2.6.0): listed for them
//    (tauri.macos.conf.json), handed over by macOS as an Apple Event
//    (RunEvent::Opened) or on the command line (Windows, Linux, and the
//    single-instance hand-over), and kept for the page (p37_opened_take).
//  - Nothing that waits for a disk runs on the main thread or holds Tauri's
//    shared pool (shell 2.6.1; desktop/AUDIT-boundaries.md, fixes D and E):
//    see `blocking` below.
mod closing;
mod device;
mod files;
mod oauth;
mod pages;
mod updates;
mod fileserver;
mod watch;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Quitting(AtomicBool);

// A command's work that may wait for a disk, on a thread of its own (shell
// 2.6.1; desktop/AUDIT-boundaries.md, 1.2 and 1.3). Two places it mustn't be:
//  - The main thread, which draws the window and takes in every message
//    from the page: a command not marked async runs there, so a slow disk
//    (busy with a big copy, an external drive waking up, a network share)
//    froze the window for as long (fix D).
//  - Tauri's shared pool, where async commands run: as many threads as the
//    computer has cores (4 on the Mac mini). A few slow commands there (a
//    2 GB copy, reads from a sleeping drive, an open folder chooser, which
//    holds its thread until it closes) and every other command waited
//    behind them, saves and the device's settings included (fix E).
// Tauri's pool for blocking work grows as needed (up to 512 threads), so one
// slow call never holds up another. The answers are the same as before.
pub(crate) async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| e.to_string())?
}

// Files opened with 37 Player that the page hasn't taken yet: what it reads
// each one through (a root of its own, files::Roots::open_file), its name,
// size and time. `early` holds paths that came before the roots were loaded
// (macOS can send its Apple Event as the app starts).
#[derive(serde::Serialize, Clone)]
struct OpenedFile { root: String, path: String, size: u64, modified: f64 }
#[derive(Default)]
struct Opened { waiting: std::sync::Mutex<Vec<OpenedFile>>, early: std::sync::Mutex<Vec<std::path::PathBuf>> }

// The paths handed over: each file gets its root and waits for the page,
// which is told ("p37-files-opened"); folders and anything gone are passed by.
// Looking a file up (its real path, its size) waits for its disk, so that
// happens on a short-lived thread of its own, not the main thread, where the
// Apple Event and the hand-over arrive (shell 2.6.1; the audit's fix D: a
// file on a network share that had gone quiet froze the window). Paths that
// come before the roots are loaded are put aside here, on the main thread,
// as setup is, so none can slip between the two.
// (Only macOS sends files this way, so elsewhere nothing calls it.)
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
fn take_opened(app: &tauri::AppHandle, paths: Vec<std::path::PathBuf>) {
    if paths.is_empty() { return; }
    if app.try_state::<files::Roots>().is_none() { app.state::<Opened>().early.lock().unwrap().extend(paths); return; }
    take_opened_soon(app, move || paths);
}
// `paths` is worked out on that thread too (a command line's paths are
// looked at to see which are files).
fn take_opened_soon(app: &tauri::AppHandle, paths: impl FnOnce() -> Vec<std::path::PathBuf> + Send + 'static) {
    let app = app.clone();
    std::thread::spawn(move || take_opened_now(&app, paths()));
}
fn take_opened_now(app: &tauri::AppHandle, paths: Vec<std::path::PathBuf>) {
    if paths.is_empty() { return; }
    let opened = app.state::<Opened>();
    let Some(roots) = app.try_state::<files::Roots>() else { opened.early.lock().unwrap().extend(paths); return };
    let mut got = Vec::new();
    for p in paths {
        let Some((root, path)) = roots.open_file(&p) else { continue };
        let md = std::fs::metadata(&p).ok();
        let modified = md.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0);
        got.push(OpenedFile { root, path, size: md.map(|m| m.len()).unwrap_or(0), modified });
    }
    if got.is_empty() { return; }
    opened.waiting.lock().unwrap().extend(got);
    let _ = app.emit("p37-files-opened", ());
    if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); }
}

// Files on a command line: everything after the program that is a file
// (Windows' Open with and Linux's file managers give the path; options,
// which start with "-", and anything else are passed by).
fn files_in_args<I: IntoIterator<Item = String>>(args: I) -> Vec<std::path::PathBuf> {
    args.into_iter().skip(1).filter(|a| !a.starts_with('-')).map(std::path::PathBuf::from).filter(|p| p.is_file()).collect()
}

#[tauri::command]
fn p37_opened_take(opened: tauri::State<'_, Opened>) -> Vec<OpenedFile> {
    std::mem::take(&mut *opened.waiting.lock().unwrap())
}

// What this shell can do for the page (see the page's DESKTOP_BRIDGE_NEEDED).
// Raise it when the page may start relying on something new here:
// 1 = closing asks first (p37-close-requested, p37_quit).
// 2 = the page keeps its libraries in folders through the fs_* commands
//     (fs_write appending with "p37-append"), plays them from p37lib://, and
//     keeps the device's settings in device.json (p37_device_get/put). The
//     page reads it as window.__p37Bridge, set before it runs (below), to
//     choose its storage (2.0.000).
//     Bridge 2 is everything the shell has as of 2.2.000 (Google sign-in,
//     folders renamed, shown and put back, Use in place's commands). The
//     version's middle number is the bridge (kr37, 7 Nov 2026): a new
//     command the page relies on after that makes bridge 3, version 2.3.000.
const BRIDGE: u32 = 2;

#[derive(serde::Serialize)]
struct ShellInfo { version: String, bridge: u32, pages: bool, device: bool, updates: bool, zoom: bool, trash: bool, watch: bool, append_range: bool, typed_path: bool, opened: bool, slow_route: bool, close_seen: bool, silence: bool, append_at: bool, page_progress: bool, files_http: Option<String> }

// The shell's version is the page's version as of the shell's own last
// change (tauri.conf.json "version"), like sync.php's.
#[tauri::command]
fn p37_shell_info(app: tauri::AppHandle) -> ShellInfo {
    // updates: it can update itself (updates.rs, shell 2.2.3).
    // zoom: it sizes the page itself (p37_zoom, shell 2.4.0).
    ShellInfo { version: app.package_info().version.to_string(), bridge: BRIDGE, pages: app.state::<Arc<pages::Pages>>().enabled(), device: true, updates: true, zoom: true,
        // trash: a library's folder can go to the Trash (fs_root_trash, shell 2.5.2).
        trash: true,
        // watch: p37_watch, the window not answering and the last session's end (watch.rs, shell 2.5.3).
        watch: true,
        // append_range: fs_append_range, a stretch of one file put on the end of another on disk (shell 2.5.3).
        append_range: true,
        // typed_path: a recording's address may end in "/.p37type.<ext>", taken off before the file is found (files::strip_type_suffix, shell 2.5.6).
        typed_path: true,
        // opened: files opened with 37 Player wait for p37_opened_take, with "p37-files-opened" when more come (shell 2.6.0).
        opened: true,
        // slow_route: fs_write takes its bytes by Tauri's slower route too, and says "slow" when they came that way (files::body_bytes, shell 2.7.0).
        slow_route: true,
        // close_seen: the page answers each close at once (p37_close_seen), and one that doesn't gets "isn't responding" (closing.rs, shell 2.7.1).
        close_seen: true,
        // silence: silent WAVs made to length at p37lib://localhost/_silence/<ms> (Linux: the file server's /_silence/<ms>) (files::silence_wav, shell 2.7.4).
        silence: true,
        // append_at: appends refused when the file isn't the size they say ("p37-at", fs_append_range's at), and fs_tidy_leftovers (files::append_at, shell 2.7.5).
        append_at: true,
        // page_progress: a downloaded page's start is given up after a minute with no progress (p37_page_progress) or ten in all, not a minute from its start (pages.rs, shell 2.7.6).
        page_progress: true,
        // files_http: where recordings are also served, on Linux (fileserver.rs, shell 2.5.0).
        files_http: app.try_state::<fileserver::FileServer>().map(|f| f.base.clone()) }
}

// The display's Size, by the webview's own zoom (as Ctrl-plus in a browser)
// rather than the page magnifying itself with a CSS transform: WebKitGTK
// drew transformed text blurred (kr37's T470, 13 Nov 2026), and this
// way Settings, Help and dialogs follow the size too. Kept between 1 and 2.
pub fn zoom_within(scale: f64) -> f64 { if scale.is_finite() { scale.clamp(1.0, 2.0) } else { 1.0 } }
#[tauri::command]
fn p37_zoom(window: tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    window.set_zoom(zoom_within(scale)).map_err(|e| e.to_string())
}

// The device's own settings (device.rs): read back, and kept. Off the main
// thread (shell 2.6.1): p37_device_put is the most frequent command that
// writes, about a second after each playback log line. Each put takes its
// turn as it comes in, so one held up by a slow disk can't land after a
// newer one (device::Device::ticket).
#[tauri::command]
async fn p37_device_get(device: tauri::State<'_, Arc<device::Device>>) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let d = device.inner().clone();
    blocking(move || Ok(d.read())).await
}
#[tauri::command]
async fn p37_device_put(device: tauri::State<'_, Arc<device::Device>>, values: serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let d = device.inner().clone();
    let turn = d.ticket();
    blocking(move || d.write_as(turn, &values)).await
}

// Page updates: where they come from. The public key is Gen's (`tauri signer
// generate`; the private one is in GitHub's secrets); "none" turns them off.
// Test builds follow dev (page-test), others main (page-latest).
const PAGE_KEY: &str = include_str!("../page-key.pub");
const PAGE_CHANNEL: &str = match option_env!("P37_PAGE_CHANNEL") { Some(c) => c, None => "latest" };

// p37_page_info, p37_page_ok and p37_page_switch read and check kept pages
// (megabytes each, and their signatures) or write the pages' state: off the
// main thread (shell 2.6.1, the audit's fix D).
#[tauri::command]
async fn p37_page_info(pages: tauri::State<'_, Arc<pages::Pages>>) -> Result<pages::Info, String> {
    let p = pages.inner().clone();
    blocking(move || Ok(p.info())).await
}

#[tauri::command]
async fn p37_page_check(pages: tauri::State<'_, Arc<pages::Pages>>) -> Result<pages::Check, String> {
    let p = pages.inner().clone();
    tauri::async_runtime::spawn_blocking(move || p.check(&pages::http_get)).await.map_err(|e| e.to_string())
}

// The page started (its library loaded): it's a good one.
#[tauri::command]
async fn p37_page_ok(pages: tauri::State<'_, Arc<pages::Pages>>, version: String) -> Result<(), String> {
    let p = pages.inner().clone();
    blocking(move || { if p.running() == version { p.confirm(); } Ok(()) }).await
}

// Update now: the newest page is chosen, and the page reloads into it.
#[tauri::command]
async fn p37_page_switch(app: tauri::AppHandle, pages: tauri::State<'_, Arc<pages::Pages>>) -> Result<String, String> {
    let p = pages.inner().clone();
    blocking(move || {
        let v = p.choose();
        watch_page(&app, p, v.clone());
        Ok(v)
    }).await
}

// A downloaded page has to say it started: given a minute with no progress
// at all, or ten minutes in all (pages::start_given_up, shell 2.7.6), it's
// put aside and the window reloads into the one before it. Looked at every
// 5 s; the watch ends once the page has said it started, or another runs.
fn watch_page(app: &tauri::AppHandle, pages: Arc<pages::Pages>, version: String) {
    if !pages.running_is_downloaded() { return; }
    let (app, started) = (app.clone(), pages::now_ms());
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if pages.running() != version || !pages.is_unconfirmed(&version) { return; }
        if pages::start_given_up(started, pages.progress_at(), pages::now_ms()) {
            if pages.give_up_on(&version) {
                if let Some(w) = app.get_webview_window("main") { let _ = w.eval("location.reload()"); }
            }
            return;
        }
    });
}

// The page's start is getting on (shell 2.7.6): at each step until its
// library has loaded. No disk: on the main thread.
#[tauri::command]
fn p37_page_progress(pages: tauri::State<'_, Arc<pages::Pages>>) { pages.note_progress(); }

// Once a day (a minute after starting, then hourly to see if a day has
// passed), quietly: a newer page is downloaded and the page told.
fn check_pages_daily(app: &tauri::AppHandle, pages: Arc<pages::Pages>) {
    if !pages.enabled() { return; }
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
        if pages.due() {
            if let pages::Check::Ready { version } = pages.check(&pages::http_get) {
                let _ = app.emit("p37-page-ready", version);
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(3600 - 60));
    });
}

#[tauri::command]
fn p37_quit(app: tauri::AppHandle) { quit_now(&app); }
fn quit_now(app: &tauri::AppHandle) {
    app.state::<Quitting>().0.store(true, Ordering::SeqCst);
    if let Some(w) = watch::get() { w.closing(); }
    app.exit(0);
}

// The page answers a close at once, before its own question (closing.rs);
// at its start it says so, with the words for "isn't responding" in its
// language. No disk: on the main thread.
#[tauri::command]
fn p37_close_seen(closing: tauri::State<'_, Arc<closing::Closing>>, texts: Option<closing::Texts>) { closing.seen(texts); }

// Where the window goes on a screen whose free area (less the menu bar and
// Dock, or the taskbar) is `area` (x, y, width, height): its outer size
// `outer` (with the frame, `frame` of it) shrunk to fit inside the area less
// `margin` on each side, centred there. None when it fits as it is.
// Returns the inner size to set (what set_size takes) and the position.
// (6 Nov 2026: on the Mac mini's screen the 900-high window hung below the
// bottom, and the Library's player at the bottom of the page with it.)
fn fit_window(outer: (u32, u32), frame: (u32, u32), area: (i32, i32, u32, u32), margin: u32) -> Option<((u32, u32), (i32, i32))> {
    let (aw, ah) = (area.2.saturating_sub(2 * margin), area.3.saturating_sub(2 * margin));
    if outer.0 <= aw && outer.1 <= ah { return None; }
    let (w, h) = (outer.0.min(aw).max(frame.0 + 200), outer.1.min(ah).max(frame.1 + 200));
    let x = area.0 + (area.2.saturating_sub(w) / 2) as i32;
    let y = area.1 + (area.3.saturating_sub(h) / 2) as i32;
    Some(((w - frame.0, h - frame.1), (x, y)))
}

#[cfg(desktop)]
fn fit_to_screen(w: &tauri::WebviewWindow) {
    let monitor = match w.current_monitor() {
        Ok(Some(m)) => m,
        _ => match w.primary_monitor() { Ok(Some(m)) => m, _ => return },
    };
    let (Ok(outer), Ok(inner)) = (w.outer_size(), w.inner_size()) else { return };
    let a = monitor.work_area();
    let margin = (12.0 * monitor.scale_factor()).round() as u32;
    let frame = (outer.width.saturating_sub(inner.width), outer.height.saturating_sub(inner.height));
    if let Some(((iw, ih), (x, y))) = fit_window((outer.width, outer.height), frame,
            (a.position.x, a.position.y, a.size.width, a.size.height), margin) {
        let _ = w.set_size(tauri::PhysicalSize::new(iw, ih));
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

// A close, the app menu's Quit or the system's quit: the page is asked, or,
// when it hasn't answered the ask before for NO_ANSWER_MS, the system's
// dialog offers to quit anyway (closing.rs). `system`: the system asked (a
// log-out or restart), which waits on the app; the dialog then comes by
// itself after SYSTEM_MS without an answer.
fn ask_page(app: &tauri::AppHandle, system: bool) {
    let closing = app.state::<Arc<closing::Closing>>().inner().clone();
    if closing.request(watch::now_ms()) == closing::Next::Offer { offer_quit(app); return; }
    // The page silent for a minute or more (watch.rs, shell 2.7.3): offered at once, not after 5 s more.
    if closing.page_answers() && watch::get().map(|w| w.page_is_silent()).unwrap_or(false) { offer_quit(app); return; }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("p37-close-requested", ());
    }
    if system {
        let (app, since) = (app.clone(), closing.asked_at());
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(closing::SYSTEM_MS));
            if let Some(at) = since { if closing.unanswered_since(at) { offer_quit(&app); } }
        });
    }
}

// The page's process ended (the Mac: WebKit's page process crashed, or macOS
// ended it for memory; shell 2.7.2, the audit's fix 8, J). Kept for the
// page's log (watch.rs), then the window reloads, as Tauri did by itself;
// but after a third within two minutes it stops, so a page that dies at
// every start doesn't reload in a loop, and the system's dialog asks:
// Reload / Quit. (Windows' WebView2 says it with ProcessFailed, which
// nothing handles yet: to check on the HP.)
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn page_process_ended(webview: &tauri::Webview) {
    let now = watch::now_ms();
    let again = match watch::get() {
        Some(w) => { w.page_ended(now); watch::should_reload(&mut w.recent_ends.lock().unwrap(), now) }
        None => true,
    };
    if again { let _ = webview.reload(); return; }
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let app = webview.app_handle().clone();
    let t = app.state::<Arc<closing::Closing>>().texts();
    let (wv, app2) = (webview.clone(), app.clone());
    app.dialog().message(t.ended_body).title(t.ended_title).kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCancelCustom(t.reload, t.quit))
        .show(move |reload| {
            if reload { if let Some(w) = watch::get() { w.recent_ends.lock().unwrap().clear(); } let _ = wv.reload(); }
            else { quit_now(&app2); }
        });
}

fn offer_quit(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let closing = app.state::<Arc<closing::Closing>>().inner().clone();
    let Some(t) = closing.start_offer() else { return };
    let app2 = app.clone();
    app.dialog().message(t.body).title(t.title).kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(t.quit, t.wait))
        .show(move |quit| { closing.end_offer(); if quit { quit_now(&app2); } });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    // The page in use: the newest good one downloaded, or the bundled one.
    let inner = context.set_assets(Box::new(pages::NoAssets));
    let bundled = inner.get(&"/index.html".into()).and_then(|b| pages::meta(&b, "app-version")).unwrap_or_else(|| "0.0.000".into());
    // Each channel's pages in a folder of their own (pages/latest, pages/test):
    // an m build installed after a d build (or the other way) runs its own
    // channel's newest page at once (kr37, 7 Nov 2026), while the
    // libraries and settings stay shared. (Pages kept by builds before this,
    // straight in pages/, are left alone and not used.)
    let pages_dir = pages::data_dir(&context.config().identifier).map(|d| d.join("pages").join(PAGE_CHANNEL)).unwrap_or_else(|| std::path::PathBuf::from("pages").join(PAGE_CHANNEL));
    let verifier = if PAGE_KEY.trim() == "none" { pages::Verifier::none() } else { pages::Verifier::new(PAGE_KEY) };
    let page_source = format!("https://github.com/kr37/37player/releases/download/page-{PAGE_CHANNEL}");
    let pages = Arc::new(pages::Pages::new(pages_dir, &bundled, BRIDGE, verifier, Some(page_source), PAGE_CHANNEL));
    let first = pages.choose();
    context.set_assets(Box::new(pages::PageAssets { inner, pages: pages.clone() }));
    // The device's settings, handed to the page before it runs.
    let device_file = pages::data_dir(&context.config().identifier).map(|d| d.join("device.json")).unwrap_or_else(|| std::path::PathBuf::from("device.json"));
    let device = Arc::new(device::Device::new(device_file));
    let device_script = format!("window.__p37Bridge = {};\n{}", BRIDGE, device.init_script());
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // Registered first, as the plugin asks.
        // A second launch with files (Open with on Windows and Linux while
        // 37 Player runs) hands them to this one. Relative paths are the
        // second launch's, so they're taken from its folder.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            let cwd = std::path::PathBuf::from(cwd);
            let args: Vec<String> = args.into_iter().enumerate().map(|(i, a)| if i > 0 && !a.starts_with('-') && std::path::Path::new(&a).is_relative() { cwd.join(&a).to_string_lossy().into_owned() } else { a }).collect();
            take_opened_soon(app, move || files_in_args(args));
        }));
    }
    #[cfg(target_os = "macos")]
    {
        use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
        builder = builder
            .menu(|app| {
                let quit = MenuItem::with_id(app, "p37-quit", "Quit 37 Player", true, Some("CmdOrCtrl+Q"))?;
                let app_menu = Submenu::with_items(app, "37 Player", true, &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ])?;
                let edit = Submenu::with_items(app, "Edit", true, &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ])?;
                let window = Submenu::with_items(app, "Window", true, &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ])?;
                Menu::with_items(app, &[&app_menu, &edit, &window])
            })
            .on_menu_event(|app, event| {
                if event.id().as_ref() == "p37-quit" {
                    ask_page(app, false);
                }
            });
    }
    // The page's process ending: logged, reloaded, no loop (page_process_ended).
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    { builder = builder.on_web_content_process_terminate(|webview| page_process_ended(webview)); }
    builder
        .manage(Quitting(AtomicBool::new(false)))
        .manage(Opened::default())
        .manage(Arc::new(closing::Closing::default()))
        // A page starting to load hasn't said it answers closes yet (closing.rs).
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started { webview.app_handle().state::<Arc<closing::Closing>>().page_started(); }
        })
        .manage(pages.clone())
        .manage(device.clone())
        .plugin(tauri::plugin::Builder::<tauri::Wry, ()>::new("p37device").js_init_script(device_script).build())
        .plugin(tauri_plugin_dialog::init())
        // The shell updating itself (updates.rs): its signatures checked with
        // the key that signs the pages.
        .plugin(tauri_plugin_updater::Builder::new().pubkey(PAGE_KEY.trim()).build())
        .manage(updates::Pending::default())
        .register_asynchronous_uri_scheme_protocol("p37lib", |ctx, req, responder| {
            let app = ctx.app_handle().clone();
            // The file is read here, off the main thread; the answer goes back
            // on the main thread (shell 2.5.7). WebKit cancels a request
            // (stopURLSchemeTask) on its main thread, and wry checks that a
            // request is still alive before each step of an answer; answered
            // from this thread, a cancel could land between the check and the
            // step, WebKit raised, and the app aborted with "panic in a
            // function that cannot unwind" (kr37's SKBC Mac mini, macOS 12,
            // playing a long WebM, which WebKit asks for in many small,
            // often-cancelled pieces; report 2026-11-20-050726). On the main
            // thread the check and the step can't be split.
            std::thread::spawn(move || {
                let resp = files::serve(&app, &req);
                let _ = app.run_on_main_thread(move || responder.respond(resp));
            });
        })
        .setup(move |app| {
            let roots_file = app.path().app_data_dir().map(|d| d.join("roots.json")).unwrap_or_else(|_| std::path::PathBuf::from("roots.json"));
            app.manage(files::Roots::load(roots_file));
            // Files the app was started with: on the command line (Windows,
            // Linux), or an Apple Event that came before the roots were loaded.
            let early = std::mem::take(&mut *app.state::<Opened>().early.lock().unwrap());
            take_opened_soon(app.handle(), move || early.into_iter().chain(files_in_args(std::env::args())).collect());
            watch::start(app.handle());
            // Linux's webview can't play recordings any other way (fileserver.rs).
            #[cfg(target_os = "linux")]
            if let Some(fs) = fileserver::start(app.handle()) { app.manage(fs); }
            #[cfg(desktop)]
            if let Some(w) = app.get_webview_window("main") { fit_to_screen(&w); }
            watch_page(app.handle(), pages.clone(), first.clone());
            check_pages_daily(app.handle(), pages.clone());
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![p37_quit, p37_shell_info, p37_zoom,
            p37_page_info, p37_page_check, p37_page_ok, p37_page_switch, p37_device_get, p37_device_put, p37_opened_take,
            files::fs_roots, files::fs_root_default, files::fs_root_choose, files::fs_root_forget,
            files::fs_place, files::fs_place_default, files::fs_root_info, files::fs_root_rename, files::fs_root_show, files::fs_root_trash, files::fs_places_restore, files::fs_remove_if_empty,
            oauth::p37_google_signin, oauth::p37_open_url, files::fs_find_libraries, files::fs_root_choose_library, files::fs_root_use_found,
            files::fs_list, files::fs_stat, files::fs_read, files::fs_write, files::fs_copy, files::fs_append_range, files::fs_rename, files::fs_remove, files::fs_mkdir, files::fs_tidy_leftovers,
            updates::p37_shell_update_check, updates::p37_shell_update_install, watch::p37_watch, p37_close_seen, p37_page_progress])
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(f) = event { if let Some(w) = watch::get() { w.focused.store(*f, Ordering::SeqCst); } }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !window.app_handle().state::<Quitting>().0.load(Ordering::SeqCst) {
                    api.prevent_close();
                    ask_page(window.app_handle(), false);
                }
            }
        })
        .build(context)
        .expect("error while building the app")
        .run(|app, event| {
            // Finder's Open with, a double-click, a file dropped on the Dock
            // icon: macOS sends these as an Apple Event, at the start and
            // while running, never on the command line.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { urls } = &event {
                take_opened(app, urls.iter().filter_map(|u| u.to_file_path().ok()).collect());
            }
            // A normal end: the next start won't say it didn't close normally.
            if let RunEvent::Exit = event { if let Some(w) = watch::get() { w.closing(); } }
            // Cmd-Q, or the system asking the app to quit: the page decides too.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() && !app.state::<Quitting>().0.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    ask_page(app, true);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::fit_window;
    #[test]
    fn files_on_the_command_line() {
        let d = std::env::temp_dir().join(format!("p37-args-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("Talk.mp3"); std::fs::write(&f, b"x").unwrap();
        let s = |p: &std::path::Path| p.to_string_lossy().into_owned();
        let got = super::files_in_args(vec![s(&d.join("37 Player")), "--flag".into(), s(&f), s(&d), s(&d.join("gone.mp3"))]);
        assert_eq!(got, vec![f.clone()]);
        assert!(super::files_in_args(vec![s(&f)]).is_empty()); // the first is the program itself
    }
    #[test]
    fn fits_as_it_is() {
        assert_eq!(fit_window((1300, 900), (0, 28), (0, 25, 1920, 1030), 12), None);
    }
    #[test]
    fn too_tall_for_the_screen() {
        // A 1366×768 screen, 25 px of menu bar and a 70 px Dock: 673 high to use.
        let ((iw, ih), (x, y)) = fit_window((1300, 928), (0, 28), (0, 25, 1366, 673), 12).unwrap();
        assert_eq!((iw, ih), (1300, 649 - 28));
        assert_eq!((x, y), (33, 25 + 12));
    }
    #[test]
    fn too_wide_and_tall_at_double_scale() {
        let ((iw, ih), (x, y)) = fit_window((2600, 1856), (0, 56), (0, 50, 2560, 1500), 24).unwrap();
        assert_eq!((iw, ih), (2512, 1452 - 56));
        assert_eq!((x, y), (24, 50 + 24));
    }
    #[test]
    fn never_smaller_than_a_usable_window() {
        let ((iw, ih), _) = fit_window((1300, 900), (0, 28), (0, 0, 100, 100), 12).unwrap();
        assert_eq!((iw, ih), (200, 200));
    }
    #[test]
    fn a_second_screen_to_the_left() {
        let (_, (x, y)) = fit_window((1300, 900), (0, 28), (-1280, 0, 1280, 800), 12).unwrap();
        assert_eq!((x, y), (-1280 + 12, 12));
    }
}
