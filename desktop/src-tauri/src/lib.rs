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
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Quitting(AtomicBool);

// What this shell can do for the page (see the page's DESKTOP_BRIDGE_NEEDED).
// Raise it when the page may start relying on something new here:
// 1 = closing asks first (p37-close-requested, p37_quit).
const BRIDGE: u32 = 1;

#[derive(serde::Serialize)]
struct ShellInfo { version: String, bridge: u32 }

// The shell's version is the page's version as of the shell's own last
// change (tauri.conf.json "version"), like sync.php's.
#[tauri::command]
fn p37_shell_info(app: tauri::AppHandle) -> ShellInfo {
    ShellInfo { version: app.package_info().version.to_string(), bridge: BRIDGE }
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
        .setup(|app| {
            #[cfg(desktop)]
            if let Some(w) = app.get_webview_window("main") { fit_to_screen(&w); }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![p37_quit, p37_shell_info])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !window.app_handle().state::<Quitting>().0.load(Ordering::SeqCst) {
                    api.prevent_close();
                    ask_page(window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
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
