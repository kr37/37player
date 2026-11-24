// The shell updating itself (shell 2.2.3, 13 Nov 2026; planned in
// desktop/PAGE-UPDATES.md, item 6, once builds were signed). Tauri's updater
// plugin does the hard part (replacing the .app on a Mac, running the
// installer on Windows); this module only says where to look and keeps the
// update found between the page's two calls:
//
// - p37_shell_update_check: is there a newer shell on this build's channel?
//   The channel is the pages' (P37_PAGE_CHANNEL at build time): a "d" build
//   (test) reads desktop-latest-dev's latest.json, an "m" build (latest)
//   desktop-latest's. desktop-latest.yml writes that file when a build is put
//   there. Its signatures are checked with the key that signs the page
//   updates (page-key.pub), so only builds made by this repo's workflow can
//   be installed. Only a newer version counts (semver, tauri.conf.json).
// - p37_shell_update_install: downloads it, installs it, and restarts the
//   app. The page asks the person first, and only when nothing is playing;
//   it saves before calling this.
//
// - Its download (shell 2.7.7; desktop/AUDIT-boundaries.md 1.10, the
//   audit's fix 15, H) had no time limit, so one that stopped left
//   "Updating…" up for good with no way out. Now: given up after a minute
//   with nothing arriving (STALL_MS) or 30 minutes in all (the updater's own
//   timeout); progress is told to the page ("p37-shell-update-progress",
//   {got, total}); p37_shell_update_cancel stops it. Only the download can be
//   stopped: once it's whole and checked, installing goes on.
//
// Linux .deb installs can't be updated this way (Tauri's updater replaces
// AppImages only): there, latest.json has no linux entry and no update is
// offered.
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Default)]
pub struct Pending(pub Mutex<Option<tauri_plugin_updater::Update>>);

/// A download under way: how to stop it.
#[derive(Default)]
pub struct Downloading(pub Mutex<Option<Box<dyn Fn() + Send>>>);

pub const STALL_MS: u64 = 60_000;
pub const TOTAL: std::time::Duration = std::time::Duration::from_secs(30 * 60);

#[derive(Serialize, Clone)]
struct Progress { got: u64, total: Option<u64> }

/// Whether a download whose last bytes came at `last` has stalled at `now`.
pub fn stalled(last: u64, now: u64) -> bool { now.saturating_sub(last) >= STALL_MS }

#[derive(Serialize)]
pub struct ShellUpdate { version: String, current: String, notes: Option<String> }

// Where this build's channel keeps its latest.json.
pub fn endpoint(channel: &str) -> String {
    let release = if channel == "test" { "desktop-latest-dev" } else { "desktop-latest" };
    format!("https://github.com/kr37/37player/releases/download/{release}/latest.json")
}

#[tauri::command]
pub async fn p37_shell_update_check(app: tauri::AppHandle) -> Result<Option<ShellUpdate>, String> {
    let url = tauri::Url::parse(&endpoint(crate::PAGE_CHANNEL)).map_err(|e| e.to_string())?;
    let updater = app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.timeout(TOTAL).build().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    let out = found.as_ref().map(|u| ShellUpdate { version: u.version.clone(), current: u.current_version.clone(), notes: u.body.clone() });
    *app.state::<Pending>().0.lock().unwrap() = found;
    Ok(out)
}

#[tauri::command]
pub async fn p37_shell_update_install(app: tauri::AppHandle) -> Result<(), String> {
    let update = app.state::<Pending>().0.lock().unwrap().take().ok_or("no update was found to install (check first)")?;
    // The download, as a task of its own that Cancel or a stall can stop.
    let last = Arc::new(AtomicU64::new(crate::watch::now_ms()));
    let (stopped_by_stall, done) = (Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false)));
    let (app2, last2) = (app.clone(), last.clone());
    let task = tauri::async_runtime::spawn(async move {
        let mut got = 0u64;
        let mut told = 0u64;
        let bytes = update.download(|n, total| {
            got += n as u64;
            let now = crate::watch::now_ms();
            last2.store(now, Ordering::SeqCst);
            if now.saturating_sub(told) >= 250 || total == Some(got) { told = now; let _ = app2.emit("p37-shell-update-progress", Progress { got, total }); }
        }, || {}).await;
        bytes.map(|b| (update, b))
    });
    let abort = task.inner().abort_handle();
    let abort2 = task.inner().abort_handle();
    *app.state::<Downloading>().0.lock().unwrap() = Some(Box::new(move || abort.abort()));
    {
        let (last, stopped_by_stall, done) = (last.clone(), stopped_by_stall.clone(), done.clone());
        std::thread::spawn(move || {
            while !done.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_secs(2));
                if stalled(last.load(Ordering::SeqCst), crate::watch::now_ms()) { stopped_by_stall.store(true, Ordering::SeqCst); abort2.abort(); return; }
            }
        });
    }
    let result = task.await;
    done.store(true, Ordering::SeqCst);
    app.state::<Downloading>().0.lock().unwrap().take();
    let (update, bytes) = match result {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => return Err(e.to_string()),
        Err(_) if stopped_by_stall.load(Ordering::SeqCst) => return Err(format!("the download stopped: nothing arrived for {} s", STALL_MS / 1000)),
        Err(_) => return Err("cancelled".into()),
    };
    // The installer closes the app on Windows, and the new one starts: not an
    // unexpected end (watch.rs). Running again if the install fails.
    if let Some(w) = crate::watch::get() { w.closing(); }
    if let Err(e) = crate::blocking(move || update.install(bytes).map_err(|e| e.to_string())).await {
        if let Some(w) = crate::watch::get() { w.running_again(); }
        return Err(e);
    }
    // On Windows the installer has already closed the app and will start the
    // new one; on a Mac the new .app is in place: start it.
    app.restart();
}

// Cancel, from the page's "Updating…": stops a download under way (nothing
// once it's installing). No disk: on the main thread.
#[tauri::command]
pub fn p37_shell_update_cancel(app: tauri::AppHandle) -> bool {
    match app.state::<Downloading>().0.lock().unwrap().take() { Some(stop) => { stop(); true } None => false }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_download_stalls_after_a_minute_with_nothing() {
        assert!(!stalled(1_000_000, 1_000_000 + STALL_MS - 1));
        assert!(stalled(1_000_000, 1_000_000 + STALL_MS));
    }
    #[test]
    fn each_channel_reads_its_own_release() {
        assert_eq!(endpoint("test"), "https://github.com/kr37/37player/releases/download/desktop-latest-dev/latest.json");
        assert_eq!(endpoint("latest"), "https://github.com/kr37/37player/releases/download/desktop-latest/latest.json");
    }
}
