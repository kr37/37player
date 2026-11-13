// The desktop app's shell. 37 Player itself is the page (37-player.html,
// copied into dist/ by copy-app.mjs); this only holds the window.
//  - One instance: a second launch brings the open window forward instead
//    of opening another copy on the same library (two copies share one
//    WebView2 data folder, which broke the spike's open window).
//  - Closing asks first: closing the window, or quitting (Cmd-Q on a Mac),
//    is held back and the page is told ("p37-close-requested"); the page
//    asks if something would stop, then calls p37_quit (see the page's
//    "The desktop app" section).
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
mod device;
mod files;
mod oauth;
mod pages;
mod updates;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Quitting(AtomicBool);

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
//     version's middle number is the bridge (Gen Rinzin, 7 Nov 2026): a new
//     command the page relies on after that makes bridge 3, version 2.3.000.
const BRIDGE: u32 = 2;

#[derive(serde::Serialize)]
struct ShellInfo { version: String, bridge: u32, pages: bool, device: bool, updates: bool, zoom: bool }

// The shell's version is the page's version as of the shell's own last
// change (tauri.conf.json "version"), like sync.php's.
#[tauri::command]
fn p37_shell_info(app: tauri::AppHandle) -> ShellInfo {
    // updates: it can update itself (updates.rs, shell 2.2.3).
    // zoom: it sizes the page itself (p37_zoom, shell 2.4.0).
    ShellInfo { version: app.package_info().version.to_string(), bridge: BRIDGE, pages: app.state::<Arc<pages::Pages>>().enabled(), device: true, updates: true, zoom: true }
}

// The display's Size, by the webview's own zoom (as Ctrl-plus in a browser)
// rather than the page magnifying itself with a CSS transform: WebKitGTK
// drew transformed text blurred (Gen Rinzin's T470, 13 Nov 2026), and this
// way Settings, Help and dialogs follow the size too. Kept between 1 and 2.
pub fn zoom_within(scale: f64) -> f64 { if scale.is_finite() { scale.clamp(1.0, 2.0) } else { 1.0 } }
#[tauri::command]
fn p37_zoom(window: tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    window.set_zoom(zoom_within(scale)).map_err(|e| e.to_string())
}

// The device's own settings (device.rs): read back, and kept.
#[tauri::command]
fn p37_device_get(device: tauri::State<'_, Arc<device::Device>>) -> serde_json::Map<String, serde_json::Value> { device.read() }
#[tauri::command]
fn p37_device_put(device: tauri::State<'_, Arc<device::Device>>, values: serde_json::Map<String, serde_json::Value>) -> Result<(), String> { device.write(&values) }

// Page updates: where they come from. The public key is Gen's (`tauri signer
// generate`; the private one is in GitHub's secrets); "none" turns them off.
// Test builds follow dev (page-test), others main (page-latest).
const PAGE_KEY: &str = include_str!("../page-key.pub");
const PAGE_CHANNEL: &str = match option_env!("P37_PAGE_CHANNEL") { Some(c) => c, None => "latest" };

#[tauri::command]
fn p37_page_info(pages: tauri::State<'_, Arc<pages::Pages>>) -> pages::Info { pages.info() }

#[tauri::command]
async fn p37_page_check(pages: tauri::State<'_, Arc<pages::Pages>>) -> Result<pages::Check, String> {
    let p = pages.inner().clone();
    tauri::async_runtime::spawn_blocking(move || p.check(&pages::http_get)).await.map_err(|e| e.to_string())
}

// The page started (its library loaded): it's a good one.
#[tauri::command]
fn p37_page_ok(pages: tauri::State<'_, Arc<pages::Pages>>, version: String) {
    if pages.running() == version { pages.confirm(); }
}

// Update now: the newest page is chosen, and the page reloads into it.
#[tauri::command]
fn p37_page_switch(app: tauri::AppHandle, pages: tauri::State<'_, Arc<pages::Pages>>) -> String {
    let v = pages.choose();
    watch_page(&app, pages.inner().clone(), v.clone());
    v
}

// A downloaded page has a minute to say it started; if it doesn't, it's put
// aside and the window reloads into the one before it.
fn watch_page(app: &tauri::AppHandle, pages: Arc<pages::Pages>, version: String) {
    if !pages.running_is_downloaded() { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(60));
        if pages.give_up_on(&version) {
            if let Some(w) = app.get_webview_window("main") { let _ = w.eval("location.reload()"); }
        }
    });
}

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
fn p37_quit(app: tauri::AppHandle) {
    app.state::<Quitting>().0.store(true, Ordering::SeqCst);
    app.exit(0);
}

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

fn ask_page(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("p37-close-requested", ());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    // The page in use: the newest good one downloaded, or the bundled one.
    let inner = context.set_assets(Box::new(pages::NoAssets));
    let bundled = inner.get(&"/index.html".into()).and_then(|b| pages::meta(&b, "app-version")).unwrap_or_else(|| "0.0.000".into());
    // Each channel's pages in a folder of their own (pages/latest, pages/test):
    // an m build installed after a d build (or the other way) runs its own
    // channel's newest page at once (Gen Rinzin, 7 Nov 2026), while the
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
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
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
                    ask_page(app);
                }
            });
    }
    builder
        .manage(Quitting(AtomicBool::new(false)))
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
            std::thread::spawn(move || responder.respond(files::serve(&app, &req)));
        })
        .setup(move |app| {
            let roots_file = app.path().app_data_dir().map(|d| d.join("roots.json")).unwrap_or_else(|_| std::path::PathBuf::from("roots.json"));
            app.manage(files::Roots::load(roots_file));
            #[cfg(desktop)]
            if let Some(w) = app.get_webview_window("main") { fit_to_screen(&w); }
            watch_page(app.handle(), pages.clone(), first.clone());
            check_pages_daily(app.handle(), pages.clone());
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![p37_quit, p37_shell_info, p37_zoom,
            p37_page_info, p37_page_check, p37_page_ok, p37_page_switch, p37_device_get, p37_device_put,
            files::fs_roots, files::fs_root_default, files::fs_root_choose, files::fs_root_forget,
            files::fs_place, files::fs_place_default, files::fs_root_info, files::fs_root_rename, files::fs_root_show, files::fs_places_restore, files::fs_remove_if_empty,
            oauth::p37_google_signin, oauth::p37_open_url, files::fs_find_libraries, files::fs_root_choose_library, files::fs_root_use_found,
            files::fs_list, files::fs_stat, files::fs_read, files::fs_write, files::fs_copy, files::fs_rename, files::fs_remove, files::fs_mkdir,
            updates::p37_shell_update_check, updates::p37_shell_update_install])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !window.app_handle().state::<Quitting>().0.load(Ordering::SeqCst) {
                    api.prevent_close();
                    ask_page(window.app_handle());
                }
            }
        })
        .build(context)
        .expect("error while building the app")
        .run(|app, event| {
            // Cmd-Q, or the system asking the app to quit: the page decides too.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() && !app.state::<Quitting>().0.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    ask_page(app);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::fit_window;
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
