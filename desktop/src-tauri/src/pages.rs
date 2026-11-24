// The page updates itself (desktop/PAGE-UPDATES.md). The shell carries the
// page as it was when the shell was built (the bundled page), and fetches
// newer ones that Gen's GitHub job signed:
//  - from a rolling release (page-latest from main, page-test from dev for
//    the test builds), checked once a day and when the person asks;
//  - kept in the app's data folder, pages/<version>/, with their signatures;
//  - used from the next start, or at once when the person chooses Update now
//    (the window reloads; the process keeps running);
//  - served as the app's own index.html and help.json (PageAssets), so the
//    address, and with it the browser storage, stays the same;
//  - only if the signature is good (a page can reach the library folders),
//    the version is newer than the bundled one, and the bridge it needs is
//    one this shell has;
//  - a page that doesn't say it started (p37_page_ok), or over two starts,
//    is put aside for good and the one before it is used, as the website's
//    service worker does. The bundled page is never replaced, so there's
//    always one to go back to. "Doesn't say it started" (shell 2.7.6; the
//    audit's fix 14, G, decided by kr37 on 23 Nov 2026): a minute with no
//    progress at all (p37_page_progress, sent as its start gets on), or ten
//    minutes in all; it had been a minute from its start, and on a swapping
//    Mac mini a start of over a minute set a good page aside for good
//    (11 Nov 2026). A giant library loading steadily is never set aside; a
//    page stuck at one step still is. A page from before 2.7.010 sends no
//    progress, so for it the minute still counts from its start.
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::PathBuf;
#[cfg(test)]
use std::path::Path;
use std::sync::{Mutex, RwLock};
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

/// The files a page is made of, as the app serves them.
pub const FILES: [&str; 2] = ["index.html", "help.json"];
/// Downloaded pages kept (besides the one in use and the bundled one).
const KEEP: usize = 2;
/// Starts without word from the page before it's put aside.
const MAX_UNCONFIRMED: u32 = 2;
/// A real 37-player.html is megabytes; anything much smaller is an error page.
const MIN_PAGE_BYTES: usize = 200_000;
const MAX_FILE_BYTES: u64 = 40 * 1024 * 1024;
/// Checked by itself at most this often (seconds).
pub const CHECK_EVERY: u64 = 20 * 3600;
/// A downloaded page's start: set aside after this long with no progress, or this long in all (ms).
pub const START_QUIET_MS: u64 = 60_000;
pub const START_TOTAL_MS: u64 = 600_000;
/// Whether a page that started at `started`, whose last progress was at `progress`, is given up on at `now`.
pub fn start_given_up(started: u64, progress: u64, now: u64) -> bool {
    now.saturating_sub(progress.max(started)) >= START_QUIET_MS || now.saturating_sub(started) >= START_TOTAL_MS
}
pub fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

/// Versions compared as numbers, part by part ("1.4.99" < "1.4.100" < "2.0.000").
pub fn version_cmp(a: &str, b: &str) -> Ordering {
    let pa: Vec<u64> = a.split('.').map(|x| x.parse().unwrap_or(0)).collect();
    let pb: Vec<u64> = b.split('.').map(|x| x.parse().unwrap_or(0)).collect();
    for i in 0..pa.len().max(pb.len()) {
        let o = pa.get(i).unwrap_or(&0).cmp(pb.get(i).unwrap_or(&0));
        if o != Ordering::Equal { return o; }
    }
    Ordering::Equal
}

pub fn is_version(s: &str) -> bool {
    !s.is_empty() && s.split('.').count() >= 2 && s.split('.').all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// A `<meta name="…" content="…">` near the top of the page.
pub fn meta(html: &[u8], name: &str) -> Option<String> {
    let head = String::from_utf8_lossy(&html[..html.len().min(8000)]);
    let tag = format!("<meta name=\"{}\" content=\"", name);
    let start = head.find(&tag)? + tag.len();
    let end = head[start..].find('"')? + start;
    Some(head[start..end].to_string())
}

/// Checks signatures made by `tauri signer sign` (minisign, base64-wrapped)
/// with the public key built into the shell (page-key.pub, from
/// `tauri signer generate`). Without a key nothing downloaded is ever used.
pub struct Verifier { key: Option<minisign_verify::PublicKey> }

fn unbase64(s: &str) -> Option<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(s.trim()).ok()?;
    String::from_utf8(bytes).ok()
}

impl Verifier {
    pub fn new(tauri_pubkey: &str) -> Verifier {
        let key = unbase64(tauri_pubkey).and_then(|t| minisign_verify::PublicKey::decode(&t).ok());
        Verifier { key }
    }
    pub fn none() -> Verifier { Verifier { key: None } }
    pub fn has_key(&self) -> bool { self.key.is_some() }
    pub fn check(&self, data: &[u8], sig: &[u8]) -> bool {
        let Some(key) = &self.key else { return false };
        let Some(text) = std::str::from_utf8(sig).ok().and_then(unbase64) else { return false };
        let Ok(sig) = minisign_verify::Signature::decode(&text) else { return false };
        key.verify(data, &sig, false).is_ok()
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Reverted { pub from: String, pub to: String }

#[derive(Default, Serialize, Deserialize)]
struct State {
    #[serde(default)] last_check: u64,
    /// Starts of a downloaded page without its "started" (p37_page_ok).
    #[serde(default)] unconfirmed: HashMap<String, u32>,
    /// Versions put aside: never used again (a newer one is).
    #[serde(default)] bad: Vec<String>,
    /// A fallback the page hasn't said yet ("1.4.190 didn't start; 1.4.189").
    #[serde(default)] reverted: Option<Reverted>,
}

struct Chosen { version: String, files: HashMap<String, Vec<u8>> }

#[derive(Serialize, Debug, PartialEq)]
pub struct Info {
    /// The page in use, and the one the shell came with.
    pub running: String,
    pub bundled: String,
    /// A newer page downloaded and waiting (used by Update now, or next start).
    pub ready: Option<String>,
    /// Said once, then forgotten.
    pub reverted: Option<Reverted>,
    pub channel: String,
    pub enabled: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum Check {
    /// A newer page is downloaded and ready.
    Ready { version: String },
    /// Nothing newer than what's here.
    Current { version: String },
    /// The newest page needs a newer desktop app (its bridge).
    NeedsApp { version: String },
    /// Page updates are off in this build (no key, or no source).
    Off,
    Error { error: String },
}

pub struct Pages {
    dir: PathBuf,
    bundled: String,
    bridge: u32,
    verifier: Verifier,
    base_url: Option<String>,
    channel: String,
    chosen: RwLock<Chosen>,
    state: Mutex<State>,
    /// One check at a time. The daily check (a minute after starting) and
    /// Check for updates once ran together and shared one temporary folder,
    /// each emptying it first: the Mac mini kept 2.5.016 without
    /// index.html.sig (15 Nov 2026), refused it at every start and Update
    /// now, while Update now went on being offered.
    checking: Mutex<()>,
    /// One choice at a time (choose()). `state` is held only for moments:
    /// never while a page is read and checked (shell 2.6.1, the audit's fix D).
    /// The hourly check held it while reading kept pages (megabytes each,
    /// and their signatures), and About's p37_page_info, then on the main
    /// thread, waited for it with the window frozen.
    choosing: Mutex<()>,
    /// When the running page last said its start was getting on (ms).
    progress_at: AtomicU64,
}

fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

impl Pages {
    pub fn new(dir: PathBuf, bundled: &str, bridge: u32, verifier: Verifier, base_url: Option<String>, channel: &str) -> Pages {
        let state = std::fs::read(dir.join("state.json")).ok()
            .and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Pages {
            dir, bundled: bundled.to_string(), bridge, verifier, base_url, channel: channel.to_string(),
            chosen: RwLock::new(Chosen { version: bundled.to_string(), files: HashMap::new() }),
            state: Mutex::new(state),
            checking: Mutex::new(()),
            choosing: Mutex::new(()),
            progress_at: AtomicU64::new(0),
        }
    }

    pub fn enabled(&self) -> bool { self.verifier.has_key() && self.base_url.is_some() }
    /// The running page's start is getting on (p37_page_progress).
    pub fn note_progress(&self) { self.progress_at.store(now_ms(), AtomicOrdering::SeqCst); }
    pub fn progress_at(&self) -> u64 { self.progress_at.load(AtomicOrdering::SeqCst) }
    /// A downloaded page that hasn't said it started yet.
    pub fn is_unconfirmed(&self, version: &str) -> bool { self.state.lock().unwrap().unconfirmed.contains_key(version) }
    pub fn running(&self) -> String { self.chosen.read().unwrap().version.clone() }
    pub fn running_is_downloaded(&self) -> bool { !self.chosen.read().unwrap().files.is_empty() }

    fn save(&self, st: &State) {
        let _ = std::fs::create_dir_all(&self.dir);
        if let Ok(b) = serde_json::to_vec_pretty(st) {
            let tmp = self.dir.join("state.json.tmp");
            if std::fs::write(&tmp, b).is_ok() { let _ = std::fs::rename(&tmp, self.dir.join("state.json")); }
        }
    }

    /// The kept versions, newest first.
    fn kept(&self) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(&self.dir).into_iter().flatten().flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| is_version(n)).collect();
        v.sort_by(|a, b| version_cmp(b, a));
        v
    }

    /// A page's files, checked: every signature, the version it says, the
    /// bridge it needs, its size. Err says why not.
    fn check_files(&self, version: &str, get: &mut dyn FnMut(&str) -> Result<Vec<u8>, String>) -> Result<HashMap<String, Vec<u8>>, String> {
        let mut files = HashMap::new();
        for name in FILES {
            let data = get(name)?;
            let sig = get(&format!("{name}.sig"))?;
            if !self.verifier.check(&data, &sig) { return Err(format!("{name}: the signature doesn't match")); }
            files.insert(name.to_string(), data);
            files.insert(format!("{name}.sig"), sig);
        }
        let html = &files["index.html"];
        if html.len() < MIN_PAGE_BYTES { return Err("index.html is too small to be 37 Player".into()); }
        match meta(html, "app-version") {
            Some(v) if v == version => {}
            other => return Err(format!("index.html says it's {:?}, not {version}", other)),
        }
        Ok(files)
    }
    fn bridge_needed(html: &[u8]) -> u32 { meta(html, "desktop-bridge").and_then(|b| b.parse().ok()).unwrap_or(1) }

    fn load_kept(&self, version: &str) -> Result<HashMap<String, Vec<u8>>, String> {
        let d = self.dir.join(version);
        let files = self.check_files(version, &mut |n| std::fs::read(d.join(n)).map_err(|e| format!("{n}: {e}")))?;
        if Self::bridge_needed(&files["index.html"]) > self.bridge { return Err("needs a newer desktop app".into()); }
        Ok(files)
    }

    /// A kept page that would really be used: all its files there and good,
    /// not put aside (`bad`, a copy of the state's list). What "ready" may
    /// name (it's what choose() would take). It reads the page: never call it
    /// holding `state`.
    fn usable(&self, version: &str, bad: &[String]) -> bool {
        !bad.iter().any(|b| b == version) && self.load_kept(version).is_ok()
    }
    fn bad_now(&self) -> Vec<String> { self.state.lock().unwrap().bad.clone() }

    /// Picks the page to use: the newest kept one that's newer than the
    /// bundled page, not put aside, and passes its checks; else the bundled
    /// page. Counts a start for a downloaded page. At start, and for Update
    /// now.
    pub fn choose(&self) -> String {
        let _one_at_a_time = self.choosing.lock().unwrap_or_else(|e| e.into_inner());
        // What the state says, then the pages read and checked without it.
        let (bad, unconfirmed) = { let st = self.state.lock().unwrap(); (st.bad.clone(), st.unconfirmed.clone()) };
        let mut set_aside: Vec<String> = vec![];
        let mut pick: Option<(String, HashMap<String, Vec<u8>>)> = None;
        if self.verifier.has_key() {
            for v in self.kept() {
                if version_cmp(&v, &self.bundled) != Ordering::Greater { break; }
                if bad.contains(&v) { continue; }
                if unconfirmed.get(&v).copied().unwrap_or(0) >= MAX_UNCONFIRMED { set_aside.push(v); continue; }
                match self.load_kept(&v) {
                    Ok(files) => { pick = Some((v, files)); break; }
                    Err(e) => { eprintln!("37 Player: page {v} not used: {e}"); }
                }
            }
        }
        let mut st = self.state.lock().unwrap();
        for v in &set_aside {
            if !st.bad.contains(v) { st.bad.push(v.clone()); }
            st.unconfirmed.remove(v);
        }
        let skipped = set_aside.into_iter().next();
        let version = match pick {
            Some((v, files)) => {
                *st.unconfirmed.entry(v.clone()).or_insert(0) += 1;
                self.note_progress();
                *self.chosen.write().unwrap() = Chosen { version: v.clone(), files };
                v
            }
            None => {
                *self.chosen.write().unwrap() = Chosen { version: self.bundled.clone(), files: HashMap::new() };
                self.bundled.clone()
            }
        };
        if let Some(from) = skipped { st.reverted = Some(Reverted { from, to: version.clone() }); }
        self.save(&st);
        version
    }

    /// The page said it started (its library loaded).
    pub fn confirm(&self) {
        let v = self.running();
        let mut st = self.state.lock().unwrap();
        if st.unconfirmed.remove(&v).is_some() { self.save(&st); }
    }

    /// A downloaded page that hasn't said it started a minute after it was
    /// chosen: put aside, and the one before it chosen. True when it was.
    pub fn give_up_on(&self, version: &str) -> bool {
        {
            let mut st = self.state.lock().unwrap();
            if self.running() != version || !self.running_is_downloaded() || !st.unconfirmed.contains_key(version) { return false; }
            st.unconfirmed.remove(version);
            if !st.bad.iter().any(|b| b == version) { st.bad.push(version.to_string()); }
            self.save(&st);
        }
        let to = self.choose();
        let mut st = self.state.lock().unwrap();
        st.reverted = Some(Reverted { from: version.to_string(), to });
        self.save(&st);
        true
    }

    /// What the app serves for `key` ("/index.html"), when it's a
    /// downloaded page's file; None for the bundle's own.
    pub fn serve(&self, key: &str) -> Option<Vec<u8>> {
        let name = key.trim_start_matches('/');
        let name = if name.is_empty() { "index.html" } else { name };
        if !FILES.contains(&name) { return None; }
        self.chosen.read().unwrap().files.get(name).cloned()
    }

    pub fn info(&self) -> Info {
        let running = self.running();
        let ready = if self.verifier.has_key() {
            let bad = self.bad_now();
            self.kept().into_iter().find(|v| version_cmp(v, &running) == Ordering::Greater
                && version_cmp(v, &self.bundled) == Ordering::Greater && self.usable(v, &bad))
        } else { None };
        let mut st = self.state.lock().unwrap();
        let reverted = st.reverted.take();
        if reverted.is_some() { self.save(&st); }
        Info { running, bundled: self.bundled.clone(), ready, reverted, channel: self.channel.clone(), enabled: self.enabled() }
    }

    pub fn due(&self) -> bool {
        self.enabled() && now().saturating_sub(self.state.lock().unwrap().last_check) >= CHECK_EVERY
    }

    /// Asks the source for its newest page and, if it's newer than any here,
    /// downloads, checks and keeps it. `fetch` gets a URL's bytes.
    pub fn check(&self, fetch: &dyn Fn(&str) -> Result<Vec<u8>, String>) -> Check {
        let Some(base) = self.base_url.clone().filter(|_| self.verifier.has_key()) else { return Check::Off };
        let _one_at_a_time = self.checking.lock().unwrap_or_else(|e| e.into_inner());
        let base = base.trim_end_matches('/').to_string();
        // A kept page that's incomplete or altered (not one in use) is removed,
        // so it's fetched again rather than offered and then refused.
        let running = self.running();
        for v in self.kept() {
            if v != running && self.load_kept(&v).is_err() {
                eprintln!("37 Player: kept page {v} is incomplete or altered: removed");
                let _ = std::fs::remove_dir_all(self.dir.join(&v));
            }
        }
        let manifest: serde_json::Value = match fetch(&format!("{base}/page.json")).and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string())) {
            Ok(m) => m,
            Err(e) => return Check::Error { error: e },
        };
        let Some(version) = manifest.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()).filter(|v| is_version(v)) else {
            return Check::Error { error: "page.json has no version".into() };
        };
        let bridge = manifest.get("bridge").and_then(|b| b.as_u64()).unwrap_or(1) as u32;
        {
            let mut st = self.state.lock().unwrap();
            st.last_check = now();
            self.save(&st);
        }
        let newest_here = std::iter::once(self.running()).chain(std::iter::once(self.bundled.clone()))
            .chain(self.kept()).max_by(|a, b| version_cmp(a, b)).unwrap();
        let bad = self.bad_now();
        if version_cmp(&version, &newest_here) != Ordering::Greater || bad.contains(&version) {
            // Already here and waiting: say so.
            let running = self.running();
            if version_cmp(&newest_here, &running) == Ordering::Greater && self.kept().contains(&newest_here)
                && self.usable(&newest_here, &bad) {
                return Check::Ready { version: newest_here };
            }
            return Check::Current { version: running };
        }
        if bridge > self.bridge { return Check::NeedsApp { version }; }
        let files = match self.check_files(&version, &mut |n| fetch(&format!("{base}/{n}"))) {
            Ok(f) => f,
            Err(e) => return Check::Error { error: e },
        };
        if Self::bridge_needed(&files["index.html"]) > self.bridge { return Check::NeedsApp { version }; }
        // Written beside, then renamed into place, so a half-written page is
        // never taken for a whole one.
        let tmp = self.dir.join(format!(".{version}.{}.part", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let write = || -> std::io::Result<()> {
            std::fs::create_dir_all(&tmp)?;
            for (name, data) in &files { std::fs::write(tmp.join(name), data)?; }
            let dest = self.dir.join(&version);
            let _ = std::fs::remove_dir_all(&dest);
            std::fs::rename(&tmp, &dest)
        };
        if let Err(e) = write() { let _ = std::fs::remove_dir_all(&tmp); return Check::Error { error: e.to_string() }; }
        self.prune();
        Check::Ready { version }
    }

    /// Keeps the newest KEEP downloaded pages, and the one in use.
    fn prune(&self) {
        let running = self.running();
        for (i, v) in self.kept().into_iter().enumerate() {
            if i >= KEEP && v != running { let _ = std::fs::remove_dir_all(self.dir.join(&v)); }
        }
    }

}

/// The app's assets, with the page's files answered from the chosen page.
pub struct PageAssets<R: tauri::Runtime> {
    pub inner: Box<dyn tauri::Assets<R>>,
    pub pages: std::sync::Arc<Pages>,
}

impl<R: tauri::Runtime> tauri::Assets<R> for PageAssets<R> {
    fn setup(&self, app: &tauri::App<R>) { self.inner.setup(app); }
    fn get(&self, key: &tauri::utils::assets::AssetKey) -> Option<Cow<'_, [u8]>> {
        match self.pages.serve(key.as_ref()) {
            Some(b) => Some(Cow::Owned(b)),
            None => self.inner.get(key),
        }
    }
    fn iter(&self) -> Box<tauri::utils::assets::AssetsIter<'_>> { self.inner.iter() }
    fn csp_hashes(&self, html_path: &tauri::utils::assets::AssetKey) -> Box<dyn Iterator<Item = tauri::utils::assets::CspHash<'_>> + '_> {
        self.inner.csp_hashes(html_path)
    }
}

/// Stands in for the app's assets for a moment, while they're wrapped.
pub struct NoAssets;
impl<R: tauri::Runtime> tauri::Assets<R> for NoAssets {
    fn get(&self, _key: &tauri::utils::assets::AssetKey) -> Option<Cow<'_, [u8]>> { None }
    fn iter(&self) -> Box<tauri::utils::assets::AssetsIter<'_>> { Box::new(std::iter::empty()) }
    fn csp_hashes(&self, _html_path: &tauri::utils::assets::AssetKey) -> Box<dyn Iterator<Item = tauri::utils::assets::CspHash<'_>> + '_> { Box::new(std::iter::empty()) }
}

/// The app's data folder, as Tauri's app_data_dir makes it, worked out
/// before the app exists (the assets are set before it's built).
pub fn data_dir(identifier: &str) -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library").join("Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).filter(|p| p.is_absolute())
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
    };
    base.map(|b| b.join(identifier))
}

/// GETs a URL (following GitHub's redirect to its file store).
pub fn http_get(url: &str) -> Result<Vec<u8>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(120)))
        .user_agent("37 Player desktop")
        .build().into();
    let mut res = agent.get(url).call().map_err(|e| format!("{url}: {e}"))?;
    res.body_mut().with_config().limit(MAX_FILE_BYTES).read_to_vec().map_err(|e| format!("{url}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    struct Keys { pk: minisign::PublicKey, sk: minisign::SecretKey }
    fn keys() -> Keys { let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap(); Keys { pk: kp.pk, sk: kp.sk } }
    fn b64(s: &str) -> String { base64::engine::general_purpose::STANDARD.encode(s) }
    impl Keys {
        // As `tauri signer generate` writes the public key, and `tauri signer sign` a signature.
        fn tauri_pub(&self) -> String { b64(&self.pk.to_box().unwrap().to_string()) }
        fn sign(&self, data: &[u8]) -> Vec<u8> {
            let sig = minisign::sign(Some(&self.pk), &self.sk, std::io::Cursor::new(data), None, None).unwrap();
            b64(&sig.to_string()).into_bytes()
        }
    }
    fn page(version: &str, bridge: Option<u32>) -> Vec<u8> {
        let b = bridge.map(|b| format!("<meta name=\"desktop-bridge\" content=\"{b}\">\n")).unwrap_or_default();
        let mut s = format!("<!DOCTYPE html>\n<meta name=\"app-version\" content=\"{version}\">\n{b}<title>37 Player</title>\n");
        s.push_str(&"x".repeat(MIN_PAGE_BYTES));
        s.into_bytes()
    }
    fn help(version: &str) -> Vec<u8> { format!("{{\"for\":\"{version}\"}}").into_bytes() }
    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("p37-pages-{}-{}-{}", name, std::process::id(), now()));
        let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); d
    }
    /// A source (the release) as a map of URL → bytes.
    struct Source { files: HashMap<String, Vec<u8>>, base: String }
    impl Source {
        fn new(k: &Keys, version: &str, bridge: Option<u32>) -> Source {
            let base = "https://example.test/page-latest".to_string();
            let mut files = HashMap::new();
            let (p, h) = (page(version, bridge), help(version));
            files.insert(format!("{base}/page.json"), format!("{{\"version\":\"{version}\",\"bridge\":{}}}", bridge.unwrap_or(1)).into_bytes());
            files.insert(format!("{base}/index.html.sig"), k.sign(&p));
            files.insert(format!("{base}/help.json.sig"), k.sign(&h));
            files.insert(format!("{base}/index.html"), p);
            files.insert(format!("{base}/help.json"), h);
            Source { files, base }
        }
        fn fetch(&self) -> impl Fn(&str) -> Result<Vec<u8>, String> + '_ {
            move |u: &str| self.files.get(u).cloned().ok_or_else(|| format!("404 {u}"))
        }
    }
    fn pages(dir: &Path, k: &Keys, bundled: &str, bridge: u32) -> Pages {
        Pages::new(dir.to_path_buf(), bundled, bridge, Verifier::new(&k.tauri_pub()), Some("https://example.test/page-latest".into()), "latest")
    }

    #[test]
    fn versions_compare_as_numbers() {
        assert_eq!(version_cmp("1.4.99", "1.4.100"), Ordering::Less);
        assert_eq!(version_cmp("2.0.000", "1.4.181"), Ordering::Greater);
        assert_eq!(version_cmp("1.4.148.10", "1.4.148.9"), Ordering::Greater);
        assert_eq!(version_cmp("1.4.181", "1.4.181"), Ordering::Equal);
        assert!(is_version("1.4.181") && !is_version("1.4.x") && !is_version(".part") && !is_version("1"));
    }

    #[test]
    fn signatures() {
        let (k, other) = (keys(), keys());
        let v = Verifier::new(&k.tauri_pub());
        assert!(v.check(b"hello", &k.sign(b"hello")));
        assert!(!v.check(b"hellO", &k.sign(b"hello")), "altered");
        assert!(!v.check(b"hello", &other.sign(b"hello")), "another key");
        assert!(!v.check(b"hello", b"not a signature"));
        assert!(!Verifier::new("none").check(b"hello", &k.sign(b"hello")), "no key: nothing passes");
    }

    #[test]
    fn a_newer_page_is_downloaded_then_used_from_the_next_start() {
        let (k, d) = (keys(), tmpdir("newer"));
        let src = Source::new(&k, "1.4.190", None);
        let p = pages(&d, &k, "1.4.181", 1);
        assert_eq!(p.choose(), "1.4.181");
        assert_eq!(p.serve("/index.html"), None, "the bundled page is the bundle's");
        assert_eq!(p.check(&src.fetch()), Check::Ready { version: "1.4.190".into() });
        assert_eq!(p.running(), "1.4.181", "not in the middle of things");
        assert_eq!(p.info().ready.as_deref(), Some("1.4.190"));
        assert_eq!(p.check(&src.fetch()), Check::Ready { version: "1.4.190".into() }, "asked again: still waiting");
        // The next start (or Update now).
        let p = pages(&d, &k, "1.4.181", 1);
        assert_eq!(p.choose(), "1.4.190");
        assert_eq!(meta(&p.serve("/index.html").unwrap(), "app-version").as_deref(), Some("1.4.190"));
        assert_eq!(p.serve("/help.json").unwrap(), help("1.4.190"));
        assert_eq!(p.serve("/ffmpeg/ffmpeg-core.js"), None, "everything else from the bundle");
        p.confirm();
        assert_eq!(p.check(&src.fetch()), Check::Current { version: "1.4.190".into() });
    }

    #[test]
    fn nothing_older_or_unsigned_or_mislabelled_or_for_a_newer_shell() {
        let (k, d) = (keys(), tmpdir("refused"));
        let p = pages(&d, &k, "1.4.181", 1);
        p.choose();
        assert_eq!(p.check(&Source::new(&k, "1.4.170", None).fetch()), Check::Current { version: "1.4.181".into() });
        assert_eq!(p.check(&Source::new(&keys(), "1.4.190", None).fetch()), Check::Error { error: "index.html: the signature doesn't match".into() });
        let mut src = Source::new(&k, "1.4.190", None);
        let p191 = page("1.4.191", None);
        src.files.insert(format!("{}/index.html.sig", src.base), k.sign(&p191));
        src.files.insert(format!("{}/index.html", src.base), p191);
        assert!(matches!(p.check(&src.fetch()), Check::Error { .. }), "page.json and the page disagree");
        assert_eq!(p.check(&Source::new(&k, "1.4.192", Some(2)).fetch()), Check::NeedsApp { version: "1.4.192".into() });
        assert!(p.kept().is_empty(), "nothing kept");
        let off = Pages::new(d.clone(), "1.4.181", 1, Verifier::new("none"), Some("x".into()), "latest");
        assert_eq!(off.check(&Source::new(&k, "1.4.190", None).fetch()), Check::Off);
    }

    #[test]
    fn a_page_altered_on_disk_isnt_used() {
        let (k, d) = (keys(), tmpdir("altered"));
        let p = pages(&d, &k, "1.4.181", 1);
        p.check(&Source::new(&k, "1.4.190", None).fetch());
        let f = d.join("1.4.190").join("index.html");
        let mut b = std::fs::read(&f).unwrap(); b[300] = b'y'; std::fs::write(&f, b).unwrap();
        assert_eq!(pages(&d, &k, "1.4.181", 1).choose(), "1.4.181");
    }

    #[test]
    fn a_page_that_never_says_it_started_is_put_aside_after_two_starts() {
        let (k, d) = (keys(), tmpdir("twostarts"));
        let p = pages(&d, &k, "1.4.181", 1);
        p.check(&Source::new(&k, "1.4.189", None).fetch());
        let p = pages(&d, &k, "1.4.181", 1);
        assert_eq!(p.choose(), "1.4.189"); p.confirm(); // a good one
        p.check(&Source::new(&k, "1.4.190", None).fetch());
        for _ in 0..2 { assert_eq!(pages(&d, &k, "1.4.181", 1).choose(), "1.4.190"); } // starts, never says so
        let p = pages(&d, &k, "1.4.181", 1);
        assert_eq!(p.choose(), "1.4.189", "back to the one before");
        assert_eq!(p.info().reverted, Some(Reverted { from: "1.4.190".into(), to: "1.4.189".into() }));
        assert_eq!(p.info().reverted, None, "said once");
        assert_eq!(p.check(&Source::new(&k, "1.4.190", None).fetch()), Check::Current { version: "1.4.189".into() }, "not fetched again");
        assert_eq!(p.check(&Source::new(&k, "1.4.191", None).fetch()), Check::Ready { version: "1.4.191".into() }, "a corrected one is");
    }

    #[test]
    fn a_page_that_doesnt_start_within_a_minute_is_given_up_on_at_once() {
        let (k, d) = (keys(), tmpdir("minute"));
        let p = pages(&d, &k, "1.4.181", 1);
        p.check(&Source::new(&k, "1.4.190", None).fetch());
        assert_eq!(p.choose(), "1.4.190"); // Update now
        assert!(p.give_up_on("1.4.190"));
        assert_eq!(p.running(), "1.4.181", "the bundled page again");
        assert_eq!(p.info().reverted, Some(Reverted { from: "1.4.190".into(), to: "1.4.181".into() }));
        assert_eq!(pages(&d, &k, "1.4.181", 1).choose(), "1.4.181", "and at the next start");
        // One that did say so isn't touched.
        let p = pages(&d, &k, "1.4.181", 1);
        p.check(&Source::new(&k, "1.4.191", None).fetch());
        assert_eq!(p.choose(), "1.4.191"); p.confirm();
        assert!(!p.give_up_on("1.4.191"));
        assert_eq!(p.running(), "1.4.191");
    }

    #[test]
    fn a_new_shell_with_a_newer_bundled_page_uses_its_own() {
        let (k, d) = (keys(), tmpdir("newshell"));
        pages(&d, &k, "1.4.181", 1).check(&Source::new(&k, "1.4.190", None).fetch());
        assert_eq!(pages(&d, &k, "1.4.195", 1).choose(), "1.4.195");
    }

    #[test]
    fn a_kept_page_missing_a_file_isnt_offered_and_is_fetched_again() {
        let (k, d) = (keys(), tmpdir("missing"));
        let src = Source::new(&k, "1.4.190", None);
        let p = pages(&d, &k, "1.4.181", 1);
        p.choose();
        p.check(&src.fetch());
        std::fs::remove_file(d.join("1.4.190").join("index.html.sig")).unwrap(); // as on the Mac mini
        let p = pages(&d, &k, "1.4.181", 1);
        assert_eq!(p.choose(), "1.4.181");
        assert_eq!(p.info().ready, None, "not offered");
        assert_eq!(p.check(&src.fetch()), Check::Ready { version: "1.4.190".into() }, "fetched again");
        assert_eq!(p.choose(), "1.4.190");
    }

    #[test]
    fn two_checks_at_once_keep_a_whole_page() {
        let (k, d) = (keys(), tmpdir("together"));
        let src = Source::new(&k, "1.4.190", None);
        let p = std::sync::Arc::new(pages(&d, &k, "1.4.181", 1));
        p.choose();
        let slow = |u: &str| -> Result<Vec<u8>, String> { std::thread::sleep(std::time::Duration::from_millis(20)); src.fetch()(u) };
        std::thread::scope(|sc| {
            for _ in 0..4 { let p = p.clone(); sc.spawn(move || { p.check(&slow); }); }
        });
        let names: Vec<String> = std::fs::read_dir(d.join("1.4.190")).unwrap().flatten().map(|e| e.file_name().into_string().unwrap()).collect();
        assert_eq!(names.len(), 4, "{names:?}");
        assert_eq!(pages(&d, &k, "1.4.181", 1).choose(), "1.4.190");
    }

    #[test]
    fn checks_choices_and_questions_at_once_agree() {
        // From threads of their own since shell 2.6.1: About's question, Update
        // now's choice, the hourly check and the page's "started" together.
        let (k, d) = (keys(), tmpdir("atonce"));
        let src = Source::new(&k, "1.4.190", None);
        let p = std::sync::Arc::new(pages(&d, &k, "1.4.181", 1));
        p.choose();
        p.check(&src.fetch());
        std::thread::scope(|sc| {
            for i in 0..8 {
                let (p, src) = (p.clone(), &src);
                sc.spawn(move || match i % 4 {
                    // Ready while 1.4.181 runs, Current once a choice has taken 1.4.190.
                    0 => { let c = p.check(&src.fetch()); assert!(c == Check::Ready { version: "1.4.190".into() } || c == Check::Current { version: "1.4.190".into() }, "{c:?}"); }
                    1 => { let r = p.info().ready; assert!(r.is_none() || r.as_deref() == Some("1.4.190"), "{r:?}"); }
                    2 => { assert_eq!(p.choose(), "1.4.190"); }
                    _ => { p.confirm(); }
                });
            }
        });
        assert_eq!(p.running(), "1.4.190");
        p.confirm();
        assert_eq!(pages(&d, &k, "1.4.181", 1).choose(), "1.4.190", "a good page, kept");
    }

    #[test]
    fn a_start_is_given_up_after_a_quiet_minute_or_ten_minutes_in_all() {
        let t0 = 1_000_000;
        assert!(!start_given_up(t0, 0, t0 + START_QUIET_MS - 1), "no progress said yet: a minute from its start (a page before 2.7.010)");
        assert!(start_given_up(t0, 0, t0 + START_QUIET_MS));
        assert!(!start_given_up(t0, t0 + 300_000, t0 + 330_000), "five minutes in, still getting on: kept");
        assert!(start_given_up(t0, t0 + 300_000, t0 + 300_000 + START_QUIET_MS), "then a quiet minute: given up");
        assert!(start_given_up(t0, t0 + START_TOTAL_MS - 1000, t0 + START_TOTAL_MS), "ten minutes in all, however it's getting on");
    }
    #[test]
    fn progress_is_noted_when_a_page_is_chosen() {
        let (k, d) = (keys(), tmpdir("progress"));
        let p = pages(&d, &k, "1.4.181", 1);
        p.check(&Source::new(&k, "1.4.190", None).fetch());
        assert_eq!(p.progress_at(), 0);
        assert_eq!(p.choose(), "1.4.190");
        assert!(p.progress_at() > 0 && p.is_unconfirmed("1.4.190"));
        p.confirm();
        assert!(!p.is_unconfirmed("1.4.190"));
    }
    #[test]
    fn only_the_newest_two_are_kept() {
        let (k, d) = (keys(), tmpdir("keep"));
        let p = pages(&d, &k, "1.4.181", 1);
        for v in ["1.4.190", "1.4.191", "1.4.192"] { assert!(matches!(p.check(&Source::new(&k, v, None).fetch()), Check::Ready { .. })); }
        assert_eq!(p.kept(), vec!["1.4.192".to_string(), "1.4.191".to_string()]);
    }

    #[test]
    fn gens_key_is_read() {
        let k = include_str!("../page-key.pub");
        assert!(k.trim() == "none" || Verifier::new(k).has_key(), "page-key.pub is neither \"none\" nor a key tauri signer made");
    }

    #[test]
    fn the_data_folder_is_tauris() {
        if cfg!(target_os = "linux") {
            let d = data_dir("com.player37.app").unwrap();
            assert!(d.ends_with("com.player37.app"));
        }
    }
}
