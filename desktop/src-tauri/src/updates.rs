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
// Linux .deb installs can't be updated this way (Tauri's updater replaces
// AppImages only): there, latest.json has no linux entry and no update is
// offered.
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

#[derive(Default)]
pub struct Pending(pub Mutex<Option<tauri_plugin_updater::Update>>);

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
    let updater = app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    let out = found.as_ref().map(|u| ShellUpdate { version: u.version.clone(), current: u.current_version.clone(), notes: u.body.clone() });
    *app.state::<Pending>().0.lock().unwrap() = found;
    Ok(out)
}

#[tauri::command]
pub async fn p37_shell_update_install(app: tauri::AppHandle) -> Result<(), String> {
    let update = app.state::<Pending>().0.lock().unwrap().take().ok_or("no update was found to install (check first)")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    // On Windows the installer has already closed the app and will start the
    // new one; on a Mac the new .app is in place: start it.
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn each_channel_reads_its_own_release() {
        assert_eq!(endpoint("test"), "https://github.com/kr37/37player/releases/download/desktop-latest-dev/latest.json");
        assert_eq!(endpoint("latest"), "https://github.com/kr37/37player/releases/download/desktop-latest/latest.json");
    }
}
