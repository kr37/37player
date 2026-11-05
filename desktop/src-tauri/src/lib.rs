// The desktop app's shell. 37 Player itself is the page (37-player.html,
// copied into dist/ by copy-app.mjs); this only holds the window.
//  - One instance: a second launch brings the open window forward instead
//    of opening another copy on the same library (two copies share one
//    WebView2 data folder, which broke the spike's open window).
//  - Closing asks first: closing the window, or quitting (Cmd-Q on a Mac),
//    is held back and the page is told ("p37-close-requested"); the page
//    asks if something would stop, then calls p37_quit (see the page's
//    "The desktop app" section).
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Quitting(AtomicBool);

#[tauri::command]
fn p37_quit(app: tauri::AppHandle) {
    app.state::<Quitting>().0.store(true, Ordering::SeqCst);
    app.exit(0);
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
    builder
        .manage(Quitting(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![p37_quit])
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
