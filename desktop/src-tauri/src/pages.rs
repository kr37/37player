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
//  - a page that doesn't say it started (p37_page_ok) within a minute, or
//    over two starts, is put aside for good and the one before it is used,
//    as the website's service worker does. The bundled page is never
//    replaced, so there's always one to go back to.
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};

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
        }
    }

    pub fn enabled(&self) -> bool { self.verifier.has_key() && self.base_url.is_some() }
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

    /// Picks the page to use: the newest kept one that's newer than the
    /// bundled page, not put aside, and passes its checks; else the bundled
    /// page. Counts a start for a downloaded page. At start, and for Update
    /// now.
    pub fn choose(&self) -> String {
        let mut st = self.state.lock().unwrap();
        let mut skipped: Option<String> = None;
        let mut pick: Option<(String, HashMap<String, Vec<u8>>)> = None;
        if self.verifier.has_key() {
            for v in self.kept() {
                if version_cmp(&v, &self.bundled) != Ordering::Greater { break; }
                if st.bad.contains(&v) { continue; }
                if st.unconfirmed.get(&v).copied().unwrap_or(0) >= MAX_UNCONFIRMED {
                    st.bad.push(v.clone());
                    st.unconfirmed.remove(&v);
                    skipped.get_or_insert(v);
                    continue;
                }
                match self.load_kept(&v) {
                    Ok(files) => { pick = Some((v, files)); break; }
                    Err(e) => { eprintln!("37 Player: page {v} not used: {e}"); }
                }
            }
        }
        let version = match pick {
            Some((v, files)) => {
                *st.unconfirmed.entry(v.clone()).or_insert(0) += 1;
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
        let mut st = self.state.lock().unwrap();
        let ready = if self.verifier.has_key() {
            self.kept().into_iter().find(|v| version_cmp(v, &running) == Ordering::Greater
                && version_cmp(v, &self.bundled) == Ordering::Greater && !st.bad.contains(v))
        } else { None };
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
        let base = base.trim_end_matches('/').to_string();
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
        let bad = self.state.lock().unwrap().bad.contains(&version);
        if version_cmp(&version, &newest_here) != Ordering::Greater || bad {
            // Already here and waiting: say so.
            let running = self.running();
            if version_cmp(&newest_here, &running) == Ordering::Greater && self.kept().contains(&newest_here)
                && !self.state.lock().unwrap().bad.contains(&newest_here) {
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
        let tmp = self.dir.join(format!(".{version}.part"));
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

    pub fn dir(&self) -> &Path { &self.dir }
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
    fn only_the_newest_two_are_kept() {
        let (k, d) = (keys(), tmpdir("keep"));
        let p = pages(&d, &k, "1.4.181", 1);
        for v in ["1.4.190", "1.4.191", "1.4.192"] { assert!(matches!(p.check(&Source::new(&k, v, None).fetch()), Check::Ready { .. })); }
        assert_eq!(p.kept(), vec!["1.4.192".to_string(), "1.4.191".to_string()]);
    }

    #[test]
    fn the_data_folder_is_tauris() {
        if cfg!(target_os = "linux") {
            let d = data_dir("com.player37.app").unwrap();
            assert!(d.ends_with("com.player37.app"));
        }
    }
}
