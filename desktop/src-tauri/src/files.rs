// The files a library is kept in, for the page (v2, bridge 2: see
// desktop/FILES-DESIGN.md). Rust only reaches folders on its list of
// "roots": a library's folder, or a folder used in place. Only the person
// puts one there (the system's folder dialog, or the app's default folder for
// a new library), and every command names its root as well as a path inside
// it, checked: no "..", nothing absolute, nothing that leaves the root
// through a link. Rust knows nothing about tracks or playlists; the page's
// FolderLibraryStore does the rest, as it does in the browser.
//
// Commands (all named fs_*): roots (list, default, choose, forget), and
// list, stat, read (a range), write (to a temporary file, then swapped in, so
// a reader never sees half a file), copy, rename, remove, mkdir.
// Recordings are also served at p37lib://localhost/<root>/<path> (on
// Windows http://p37lib.localhost/…), with Range, so the page can play and
// read a big file in pieces instead of holding it in memory.
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::Manager;

// ---- Paths, checked
// A path inside a root, from the page's "A/B/c.mp3": each part must be a
// plain name. Rejected: empty parts, "." and "..", "\" (a second separator
// on Windows), ":" (drives and Windows' alternate streams), NUL, and
// anything absolute.
pub fn safe_rel(rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() { return Ok(PathBuf::new()); }
    let mut out = PathBuf::new();
    for part in rel.split('/') {
        if part.is_empty() || part == "." || part == ".." || part.contains('\\') || part.contains(':') || part.contains('\0') {
            return Err(format!("not a path inside the folder: {:?}", rel));
        }
        out.push(part);
    }
    for c in out.components() {
        if !matches!(c, Component::Normal(_)) { return Err(format!("not a path inside the folder: {:?}", rel)); }
    }
    Ok(out)
}

// The full path of rel inside root, refusing one that leaves the root
// through a link: the deepest part that exists, with links followed, must
// still be inside the root (with its links followed too).
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let full = root.join(safe_rel(rel)?);
    let real_root = fs::canonicalize(root).map_err(|e| format!("the folder isn't there: {}", e))?;
    let mut probe = full.clone();
    loop {
        if probe.exists() || fs::symlink_metadata(&probe).is_ok() {
            let real = fs::canonicalize(&probe).map_err(|e| e.to_string())?;
            if !real.starts_with(&real_root) { return Err(format!("outside the folder: {:?}", rel)); }
            break;
        }
        if !probe.pop() { break; }
    }
    Ok(full)
}

// ---- Roots
#[derive(Default)]
pub struct Roots { map: Mutex<BTreeMap<String, PathBuf>>, file: Mutex<Option<PathBuf>> }

impl Roots {
    pub fn load(file: PathBuf) -> Roots {
        let map = fs::read_to_string(&file).ok()
            .and_then(|s| serde_json::from_str::<BTreeMap<String, String>>(&s).ok())
            .map(|m| m.into_iter().map(|(k, v)| (k, PathBuf::from(v))).collect())
            .unwrap_or_default();
        Roots { map: Mutex::new(map), file: Mutex::new(Some(file)) }
    }
    fn save(&self) -> Result<(), String> {
        let file = self.file.lock().unwrap().clone();
        let Some(file) = file else { return Ok(()) };
        let m: BTreeMap<String, String> = self.map.lock().unwrap().iter().map(|(k, v)| (k.clone(), v.to_string_lossy().into_owned())).collect();
        if let Some(dir) = file.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
        write_replacing(&file, serde_json::to_string_pretty(&m).unwrap().as_bytes())
    }
    pub fn set(&self, id: &str, path: PathBuf) -> Result<(), String> {
        if id.is_empty() || id.contains('/') { return Err("a root's name can't be empty or have \"/\"".into()); }
        self.map.lock().unwrap().insert(id.to_string(), path);
        self.save()
    }
    pub fn forget(&self, id: &str) -> Result<(), String> { self.map.lock().unwrap().remove(id); self.save() }
    pub fn get(&self, id: &str) -> Result<PathBuf, String> {
        self.map.lock().unwrap().get(id).cloned().ok_or_else(|| format!("no folder called {:?} on the list", id))
    }
    pub fn list(&self) -> BTreeMap<String, String> {
        self.map.lock().unwrap().iter().map(|(k, v)| (k.clone(), v.to_string_lossy().into_owned())).collect()
    }
}

// A folder name from a library's name: what Windows and the Mac refuse
// becomes "-", trailing dots and spaces go (as the page's recordingPathPart).
pub fn folder_name(name: &str) -> String {
    let mut c: String = name.chars().map(|ch| if "/\\:*?\"<>|".contains(ch) || ch.is_control() { '-' } else { ch }).collect();
    c = c.split_whitespace().collect::<Vec<_>>().join(" ");
    if c.chars().count() > 80 { c = c.chars().take(80).collect::<String>().trim().to_string(); }
    let c = c.trim_end_matches(|ch| ch == '.' || ch == ' ').to_string();
    if c.is_empty() { "Library".into() } else { c }
}

// ---- Files
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Entry { pub name: String, pub kind: &'static str, pub size: u64, pub modified: f64 }

fn entry_of(name: String, md: &fs::Metadata) -> Entry {
    let modified = md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0);
    Entry { name, kind: if md.is_dir() { "directory" } else { "file" }, size: if md.is_dir() { 0 } else { md.len() }, modified }
}

pub fn list(root: &Path, rel: &str) -> Result<Vec<Entry>, String> {
    let dir = resolve(root, rel)?;
    let mut out = vec![];
    for e in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().into_owned();
        if name.contains(".p37tmp-") { continue; } // a write under way (see write)
        if let Ok(md) = fs::metadata(e.path()) { out.push(entry_of(name, &md)); }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn stat(root: &Path, rel: &str) -> Result<Option<Entry>, String> {
    let p = resolve(root, rel)?;
    match fs::metadata(&p) {
        Ok(md) => Ok(Some(entry_of(p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), &md))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// Bytes start..end (end exclusive; None: to the end), at most what's there.
pub fn read(root: &Path, rel: &str, start: u64, end: Option<u64>) -> Result<Vec<u8>, String> {
    let p = resolve(root, rel)?;
    let mut f = fs::File::open(&p).map_err(|e| e.to_string())?;
    let len = f.metadata().map_err(|e| e.to_string())?.len();
    let end = end.unwrap_or(len).min(len);
    if start >= end { return Ok(vec![]); }
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; (end - start) as usize];
    f.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

// The whole file, written beside it under a temporary name and then swapped
// in: a reader sees the old file or the new one, never half of either.
fn write_replacing(p: &Path, bytes: &[u8]) -> Result<(), String> {
    let name = p.file_name().ok_or("no file name")?.to_string_lossy().into_owned();
    let tmp = p.with_file_name(format!("{}.p37tmp-{}", name, std::process::id() as u64 * 1000 + (std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.subsec_micros() as u64).unwrap_or(0))));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| { let _ = fs::remove_file(&tmp); e.to_string() })?;
        f.sync_all().ok();
    }
    fs::rename(&tmp, p).map_err(|e| { let _ = fs::remove_file(&tmp); e.to_string() })
}

pub fn write(root: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
    if rel.is_empty() { return Err("no file name".into()); }
    let p = resolve(root, rel)?;
    if let Some(dir) = p.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    resolve(root, rel)?; // the folders just made are still inside
    write_replacing(&p, bytes)
}

// Adds bytes to the end of a file (made if missing), for a big file the page
// writes in pieces: it writes them to a file of its own beside the target,
// then renames that onto the target, so nothing is half written.
pub fn append(root: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
    if rel.is_empty() { return Err("no file name".into()); }
    let p = resolve(root, rel)?;
    if let Some(dir) = p.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    resolve(root, rel)?;
    let mut f = fs::OpenOptions::new().create(true).append(true).open(&p).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

// Copy or move a file, within a root or from one to another; the target's
// folders are made. A file already at the target is refused unless replace.
pub fn copy(from_root: &Path, from: &str, to_root: &Path, to: &str, replace: bool) -> Result<(), String> {
    let (a, b) = (resolve(from_root, from)?, resolve(to_root, to)?);
    if !replace && b.exists() { return Err(format!("already there: {:?}", to)); }
    if let Some(dir) = b.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    let name = b.file_name().ok_or("no file name")?.to_string_lossy().into_owned();
    let tmp = b.with_file_name(format!("{}.p37tmp-copy", name));
    fs::copy(&a, &tmp).map_err(|e| { let _ = fs::remove_file(&tmp); e.to_string() })?;
    fs::rename(&tmp, &b).map_err(|e| { let _ = fs::remove_file(&tmp); e.to_string() })
}

pub fn rename(from_root: &Path, from: &str, to_root: &Path, to: &str, replace: bool) -> Result<(), String> {
    let (a, b) = (resolve(from_root, from)?, resolve(to_root, to)?);
    if !a.exists() { return Err(format!("not there: {:?}", from)); }
    // A change of capitals only is the same file on Windows and the Mac.
    let same = a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase();
    if !replace && !same && b.exists() { return Err(format!("already there: {:?}", to)); }
    if let Some(dir) = b.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    match fs::rename(&a, &b) {
        Ok(()) => Ok(()),
        // Another disk (a folder used in place on a USB stick): copy, then remove.
        Err(_) => { copy(from_root, from, to_root, to, replace)?; fs::remove_file(&a).map_err(|e| e.to_string()) }
    }
}

// A file, or an empty folder. A folder with something in it only with
// recursive, and never the root itself.
pub fn remove(root: &Path, rel: &str, recursive: bool) -> Result<bool, String> {
    if rel.is_empty() { return Err("not the folder itself".into()); }
    let p = resolve(root, rel)?;
    let md = match fs::symlink_metadata(&p) { Ok(m) => m, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false), Err(e) => return Err(e.to_string()) };
    if md.is_dir() {
        if recursive { fs::remove_dir_all(&p) } else { fs::remove_dir(&p) }.map_err(|e| e.to_string())?;
    } else { fs::remove_file(&p).map_err(|e| e.to_string())?; }
    Ok(true)
}

pub fn mkdir(root: &Path, rel: &str) -> Result<(), String> {
    let p = resolve(root, rel)?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    resolve(root, rel).map(|_| ())
}

// ---- Commands
fn roots(app: &tauri::AppHandle) -> tauri::State<'_, Roots> { app.state::<Roots>() }

#[tauri::command]
pub fn fs_roots(app: tauri::AppHandle) -> BTreeMap<String, String> { roots(&app).list() }

// ---- Folders used in place (2.0): one the person chose for a library to
// point into. Where it is, whether it's there now (a drive unplugged), and
// whether it's on another drive than the system's (the page defaults such an
// import to Copy: removable drives come and go).
#[derive(serde::Serialize)]
pub struct RootInfo { path: String, present: bool, other_drive: bool }

pub fn other_drive(p: &Path) -> bool {
    let s = p.to_string_lossy().replace('\\', "/");
    if cfg!(target_os = "windows") {
        let sys = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()).to_lowercase();
        return !s.to_lowercase().starts_with(&sys);
    }
    s.starts_with("/Volumes/") || s.starts_with("/media/") || s.starts_with("/run/media/") || s.starts_with("/mnt/")
}

#[tauri::command]
pub fn fs_root_info(app: tauri::AppHandle, id: String) -> Result<RootInfo, String> {
    let p = roots(&app).get(&id)?;
    Ok(RootInfo { present: p.is_dir(), other_drive: other_drive(&p), path: p.to_string_lossy().into_owned() })
}

// Opens one of the folders on the list in Finder, Explorer or the like
// (Settings → Library → Library folder → Show).
#[tauri::command]
pub fn fs_root_show(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let p = roots(&app).get(&id)?;
    if !p.is_dir() { return Err("the folder isn't there".into()); }
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&p).spawn();
    #[cfg(windows)]
    let r = std::process::Command::new("explorer").arg(&p).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&p).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

// ---- Folders used in place, put back (Gen Rinzin's wipe test on the HP,
// 7 Nov 2026): the app's data folder emptied, its list of folders goes, and
// every track used in place couldn't be read. The library's own record of
// them ("places", in its folder) names each one and its path; the shell reads
// that record itself and puts back only those, under that library's own
// ids ("in-<library>-…"), and only ones that are there.
pub fn places_to_restore(lib: &Path, lib_id: &str) -> Vec<(String, PathBuf)> {
    let mut out = vec![];
    let file = [lib.join("37 Player's own files").join("state").join("places.json"), lib.join("state").join("places.json")].into_iter().find(|p| p.is_file());
    let Some(file) = file else { return out };
    let Ok(bytes) = fs::read(&file) else { return out };
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return out };
    let prefix = format!("in-{}-", lib_id);
    for e in v.get("value").and_then(|x| x.as_array()).cloned().unwrap_or_default() {
        let (Some(root), Some(label)) = (e.get("root").and_then(|x| x.as_str()), e.get("label").and_then(|x| x.as_str())) else { continue };
        if !root.starts_with(&prefix) || root.len() > 80 { continue; }
        let p = PathBuf::from(label);
        if p.is_absolute() && p.is_dir() { out.push((root.to_string(), p)); }
    }
    out
}

#[tauri::command]
pub fn fs_places_restore(app: tauri::AppHandle, id: String) -> Result<u32, String> {
    let Some(lib_id) = id.strip_prefix("lib-") else { return Err("only a library's folder".into()) };
    let r = roots(&app);
    let lib = r.get(&id)?;
    let mut n = 0;
    for (root, p) in places_to_restore(&lib, lib_id) {
        if r.get(&root).map(|q| q.is_dir()).unwrap_or(false) { continue; }
        r.set(&root, p)?;
        n += 1;
    }
    Ok(n)
}

// A folder used in place that Move into the library has left with nothing in
// it but empty folders and the system's own leftovers.
pub fn only_empty(p: &Path) -> bool {
    let Ok(rd) = fs::read_dir(p) else { return false };
    for e in rd.flatten() {
        let q = e.path();
        if q.is_dir() { if !only_empty(&q) { return false; } continue; }
        let n = e.file_name().to_string_lossy().to_lowercase();
        if !(n == ".ds_store" || n == "thumbs.db" || n == "desktop.ini" || n.starts_with("._")) { return false; }
    }
    true
}

// Is it empty (dry), or remove it if it is; and forget it.
#[tauri::command]
pub fn fs_remove_if_empty(app: tauri::AppHandle, id: String, dry: bool) -> Result<bool, String> {
    if !id.starts_with("in-") { return Err("only a folder used in place".into()); }
    let r = roots(&app);
    let p = r.get(&id)?;
    if !only_empty(&p) { return Ok(false); }
    if !dry { fs::remove_dir_all(&p).map_err(|e| e.to_string())?; r.forget(&id)?; }
    Ok(true)
}

// ---- A library's folder follows its name (Gen Rinzin, 7 Nov 2026): renamed
// within the folder it's in, at the app's start before the library opens
// (Windows won't rename a folder whose files are in use). " (2)" and so on
// when the name is taken; nothing to do when the folder already has it.
pub fn renamed_path(cur: &Path, name: &str) -> Option<PathBuf> {
    let want = folder_name(name);
    let base = cur.file_name()?.to_string_lossy().into_owned();
    let bare = match base.rfind(" (") { Some(i) if base.ends_with(')') && base[i + 2..base.len() - 1].chars().all(|c| c.is_ascii_digit()) => base[..i].to_string(), _ => base.clone() };
    if bare == want { return None; }
    let parent = cur.parent()?;
    // Only the capitals differ: the same name on Windows and Mac folders.
    if base.to_lowercase() == want.to_lowercase() { return Some(parent.join(&want)); }
    let mut p = parent.join(&want);
    let mut n = 2;
    while p.exists() { p = parent.join(format!("{} ({})", want, n)); n += 1; }
    Some(p)
}

#[tauri::command]
pub fn fs_root_rename(app: tauri::AppHandle, id: String, name: String) -> Result<String, String> {
    if !id.starts_with("lib-") { return Err("only a library's folder".into()); }
    let r = roots(&app);
    let cur = r.get(&id)?;
    let Some(to) = renamed_path(&cur, &name) else { return Ok(cur.to_string_lossy().into_owned()) };
    fs::rename(&cur, &to).map_err(|e| e.to_string())?;
    r.set(&id, to.clone())?;
    Ok(to.to_string_lossy().into_owned())
}

// ---- Where the libraries live (2.0, step 4)
// The libraries' place: the folder new libraries' folders are made in, and
// where the app looks for them when its list is lost. The person chooses it
// (the first start of 2.0 asks): on the list as the root "place" (chosen
// with fs_root_choose, or fs_place_default); until then, the suggestion,
// Music/37 Player Libraries. A library's folder is the root "lib-<id>".
pub const MARKER: &str = "37 Player library.json";
fn default_place(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let music = app.path().audio_dir().or_else(|_| app.path().home_dir().map(|h| h.join("Music"))).map_err(|e| e.to_string())?;
    Ok(music.join("37 Player Libraries"))
}
fn place(app: &tauri::AppHandle) -> Result<PathBuf, String> { roots(app).get("place").or_else(|_| default_place(app)) }

// A library's folder says whose it is: (id, name) from its marker file.
pub fn read_marker(dir: &Path) -> Option<(String, String)> {
    let v: serde_json::Value = serde_json::from_slice(&fs::read(dir.join(MARKER)).ok()?).ok()?;
    if v.get("format")?.as_str()? != "37player-library" { return None; }
    let id = v.get("id")?.as_str()?.to_string();
    if id.is_empty() || id.len() > 40 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') { return None; }
    Some((id, v.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string()))
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Found { pub id: String, pub name: String, pub path: String }

// The library folders directly inside a folder.
pub fn find_libraries(base: &Path) -> Vec<Found> {
    let mut out = vec![];
    let Ok(rd) = fs::read_dir(base) else { return out };
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() { continue; }
        if let Some((id, name)) = read_marker(&p) { out.push(Found { id, name, path: p.to_string_lossy().into_owned() }); }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

#[derive(serde::Serialize)]
pub struct Place { path: String, chosen: bool }

#[tauri::command]
pub fn fs_place(app: tauri::AppHandle) -> Result<Place, String> {
    let chosen = roots(&app).get("place").is_ok();
    Ok(Place { path: place(&app)?.to_string_lossy().into_owned(), chosen })
}

// The person took the suggestion: Music/37 Player Libraries, made.
#[tauri::command]
pub fn fs_place_default(app: tauri::AppHandle) -> Result<String, String> {
    let p = default_place(&app)?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    roots(&app).set("place", p.clone())?;
    Ok(p.to_string_lossy().into_owned())
}

// The library folders in the libraries' place, each put on the list as
// "lib-<id>" unless it's there already and its folder still is (the app's
// own data folder lost or emptied, a folder moved within the place).
#[tauri::command]
pub fn fs_find_libraries(app: tauri::AppHandle) -> Result<Vec<Found>, String> {
    let found = find_libraries(&place(&app)?);
    let r = roots(&app);
    for f in &found {
        let rid = format!("lib-{}", f.id);
        let keep = r.get(&rid).map(|p| p.is_dir()).unwrap_or(false);
        if !keep { r.set(&rid, PathBuf::from(&f.path))?; }
    }
    Ok(found)
}

// Find a library folder…: the person chooses a folder anywhere; if it's a
// library's, it goes on the list as that library's. None if they cancel.
#[tauri::command]
pub async fn fs_root_choose_library(app: tauri::AppHandle, title: String) -> Result<Option<Found>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(p) = app.dialog().file().set_title(title).blocking_pick_folder() else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let Some((id, name)) = read_marker(&path) else { return Err("not a library folder".into()) };
    roots(&app).set(&format!("lib-{}", id), path.clone())?;
    Ok(Some(Found { id, name, path: path.to_string_lossy().into_owned() }))
}

// A new library's folder in the libraries' place (see above),
// <place>/<name> (" (2)" and so on when that's taken), made and put on the
// list as `id`. Returns its path.
#[tauri::command]
pub fn fs_root_default(app: tauri::AppHandle, id: String, name: String) -> Result<String, String> {
    let base = place(&app)?;
    let name = folder_name(&name);
    let mut dir = base.join(&name);
    let mut n = 2;
    while dir.exists() { dir = base.join(format!("{} ({})", name, n)); n += 1; }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    roots(&app).set(&id, dir.clone())?;
    Ok(dir.to_string_lossy().into_owned())
}

// The person chooses a folder in the system's dialog; it goes on the list as
// `id`. None if they cancel.
#[tauri::command]
pub async fn fs_root_choose(app: tauri::AppHandle, id: String, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().set_title(title).blocking_pick_folder();
    let Some(p) = picked else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    roots(&app).set(&id, path.clone())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn fs_root_forget(app: tauri::AppHandle, id: String) -> Result<(), String> { roots(&app).forget(&id) }

#[tauri::command]
pub fn fs_list(app: tauri::AppHandle, root: String, path: String) -> Result<Vec<Entry>, String> { list(&roots(&app).get(&root)?, &path) }

#[tauri::command]
pub fn fs_stat(app: tauri::AppHandle, root: String, path: String) -> Result<Option<Entry>, String> { stat(&roots(&app).get(&root)?, &path) }

#[tauri::command]
pub fn fs_read(app: tauri::AppHandle, root: String, path: String, start: Option<u64>, end: Option<u64>) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(read(&roots(&app).get(&root)?, &path, start.unwrap_or(0), end)?))
}

// The bytes come as the request's body (no JSON); the root and path in the
// headers "p37-root" and "p37-path", URI-encoded (headers are ASCII). With
// "p37-append: 1" the bytes go on the end of the file (append), else they
// replace it whole.
#[tauri::command]
pub fn fs_write(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let h = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(percent_decode).ok_or_else(|| format!("no {} header", k));
    let (root, path) = (h("p37-root")?, h("p37-path")?);
    let adding = h("p37-append").map(|v| v == "1").unwrap_or(false);
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("the file's bytes must be the body".into()) };
    let r = roots(&app).get(&root)?;
    if adding { append(&r, &path, bytes) } else { write(&r, &path, bytes) }
}

#[tauri::command]
pub fn fs_copy(app: tauri::AppHandle, root: String, from: String, to_root: Option<String>, to: String, replace: Option<bool>) -> Result<(), String> {
    let r = roots(&app);
    copy(&r.get(&root)?, &from, &r.get(to_root.as_deref().unwrap_or(&root))?, &to, replace.unwrap_or(false))
}

#[tauri::command]
pub fn fs_rename(app: tauri::AppHandle, root: String, from: String, to_root: Option<String>, to: String, replace: Option<bool>) -> Result<(), String> {
    let r = roots(&app);
    rename(&r.get(&root)?, &from, &r.get(to_root.as_deref().unwrap_or(&root))?, &to, replace.unwrap_or(false))
}

#[tauri::command]
pub fn fs_remove(app: tauri::AppHandle, root: String, path: String, recursive: Option<bool>) -> Result<bool, String> {
    remove(&roots(&app).get(&root)?, &path, recursive.unwrap_or(false))
}

#[tauri::command]
pub fn fs_mkdir(app: tauri::AppHandle, root: String, path: String) -> Result<(), String> { mkdir(&roots(&app).get(&root)?, &path) }

pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = ((b[i + 1] as char).to_digit(16), b.get(i + 2).and_then(|c| (*c as char).to_digit(16))) {
                out.push((h * 16 + l) as u8); i += 3; continue;
            }
        }
        out.push(b[i]); i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---- p37lib://localhost/<root>/<path>, with Range
// "bytes=a-b", "bytes=a-", "bytes=-n" for a file of len bytes: the range
// start..end (end exclusive), or None for one that can't be served.
pub fn parse_range(h: &str, len: u64) -> Option<(u64, u64)> {
    let spec = h.trim().strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    if len == 0 { return None; }
    if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        if n == 0 { return None; }
        return Some((len.saturating_sub(n), len));
    }
    let start: u64 = a.parse().ok()?;
    if start >= len { return None; }
    let end = if b.is_empty() { len } else { (b.parse::<u64>().ok()? + 1).min(len) };
    if end <= start { return None; }
    Some((start, end))
}

const SERVE_PIECE: u64 = 4 << 20; // an open-ended range gets at most this much at a time

pub fn serve(app: &tauri::AppHandle, req: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::{Response, StatusCode};
    let fail = |code: StatusCode, msg: String| Response::builder().status(code).header("Access-Control-Allow-Origin", "*").body(msg.into_bytes()).unwrap();
    let path = percent_decode(req.uri().path().trim_start_matches('/'));
    let Some((root, rel)) = path.split_once('/') else { return fail(StatusCode::NOT_FOUND, "no root".into()) };
    let base = match roots(app).get(root) { Ok(b) => b, Err(e) => return fail(StatusCode::NOT_FOUND, e) };
    let full = match resolve(&base, rel) { Ok(p) => p, Err(e) => return fail(StatusCode::FORBIDDEN, e) };
    let len = match fs::metadata(&full) { Ok(m) if m.is_file() => m.len(), _ => return fail(StatusCode::NOT_FOUND, "not there".into()) };
    let mime = mime_for(rel);
    let range = req.headers().get("range").and_then(|v| v.to_str().ok());
    let (start, end, partial) = match range {
        Some(h) => match parse_range(h, len) {
            Some((s, e)) => (s, e.min(s + SERVE_PIECE).max(s), true),
            None => return Response::builder().status(StatusCode::RANGE_NOT_SATISFIABLE).header("Content-Range", format!("bytes */{}", len)).header("Access-Control-Allow-Origin", "*").body(vec![]).unwrap(),
        },
        None => (0, len, false),
    };
    let body = match read(&base, rel, start, Some(end)) { Ok(b) => b, Err(e) => return fail(StatusCode::INTERNAL_SERVER_ERROR, e) };
    let mut r = Response::builder()
        .header("Content-Type", mime).header("Accept-Ranges", "bytes").header("Content-Length", body.len().to_string())
        .header("Access-Control-Allow-Origin", "*").header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    r = if partial { r.status(StatusCode::PARTIAL_CONTENT).header("Content-Range", format!("bytes {}-{}/{}", start, end.saturating_sub(1), len)) } else { r.status(StatusCode::OK) };
    r.body(body).unwrap()
}

fn mime_for(rel: &str) -> &'static str {
    let ext = rel.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg", "m4a" | "mp4" | "aac" => "audio/mp4", "wav" => "audio/wav", "flac" => "audio/flac",
        "ogg" | "opus" => "audio/ogg", "webm" => "audio/webm", "aif" | "aiff" => "audio/aiff", "wma" => "audio/x-ms-wma",
        "jpg" | "jpeg" => "image/jpeg", "png" => "image/png", "json" => "application/json", _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("p37-files-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    #[test]
    fn paths_must_stay_inside() {
        for bad in ["..", "a/../../b", "/etc/passwd", "a//b", "./a", "a\\..\\b", "C:/x", "a:stream", "a/\0b"] {
            assert!(safe_rel(bad).is_err(), "{:?} should be refused", bad);
        }
        assert_eq!(safe_rel("Tharpa/Prayers/01 Liberating Prayer.mp3").unwrap(), PathBuf::from("Tharpa").join("Prayers").join("01 Liberating Prayer.mp3"));
        assert_eq!(safe_rel("37 Player's own files/audio/%0041bc.json").unwrap().components().count(), 3);
    }
    #[cfg(unix)]
    #[test]
    fn a_link_out_of_the_folder_is_refused() {
        let d = tmp("link"); let outside = tmp("outside");
        fs::write(outside.join("secret.txt"), b"no").unwrap();
        std::os::unix::fs::symlink(&outside, d.join("escape")).unwrap();
        assert!(resolve(&d, "escape/secret.txt").is_err());
        assert!(read(&d, "escape/secret.txt", 0, None).is_err());
        assert!(write(&d, "escape/new.txt", b"x").is_err());
        assert!(!outside.join("new.txt").exists());
    }
    #[test]
    fn folders_used_in_place_come_back_from_the_library_s_record() {
        let d = tmp("places");
        let talks = d.join("Talks"); fs::create_dir_all(&talks).unwrap();
        let rec = format!(r#"{{"key":"places","value":[{{"root":"in-main-ab12","label":{}}},{{"root":"in-other-cd34","label":{}}},{{"root":"in-main-gone","label":{}}}]}}"#,
            serde_json::to_string(&talks.to_string_lossy()).unwrap(), serde_json::to_string(&talks.to_string_lossy()).unwrap(), serde_json::to_string(&d.join("nope").to_string_lossy()).unwrap());
        write(&d, "Lib/37 Player's own files/state/places.json", rec.as_bytes()).unwrap();
        assert_eq!(places_to_restore(&d.join("Lib"), "main"), vec![("in-main-ab12".to_string(), talks.clone())]);
        assert!(places_to_restore(&d.join("Other"), "main").is_empty());
    }
    #[test]
    fn an_emptied_folder() {
        let d = tmp("empty");
        write(&d, "A/B/.DS_Store", b"x").unwrap(); fs::create_dir_all(d.join("A/C")).unwrap();
        assert!(only_empty(&d.join("A")));
        write(&d, "A/C/left.mp3", b"x").unwrap();
        assert!(!only_empty(&d.join("A")));
    }
    #[test]
    fn a_folder_follows_its_library_s_name() {
        let d = tmp("rename");
        fs::create_dir_all(d.join("My library")).unwrap();
        fs::create_dir_all(d.join("Prayers")).unwrap();
        assert_eq!(renamed_path(&d.join("My library"), "My library"), None);
        assert_eq!(renamed_path(&d.join("My library (2)"), "My library"), None);
        assert_eq!(renamed_path(&d.join("My library"), "Teachings"), Some(d.join("Teachings")));
        assert_eq!(renamed_path(&d.join("My library"), "Prayers"), Some(d.join("Prayers (2)")));
        assert_eq!(renamed_path(&d.join("My library"), "My Library"), Some(d.join("My Library")));
        assert_eq!(renamed_path(&d.join("My library"), "Rinzin's: 2.0"), Some(d.join("Rinzin's- 2.0")));
    }
    #[test]
    fn another_drive() {
        if cfg!(target_os = "windows") { return; }
        assert!(other_drive(Path::new("/Volumes/USB/Talks")));
        assert!(other_drive(Path::new("/media/me/USB")));
        assert!(!other_drive(Path::new("/Users/me/Music")));
        assert!(!other_drive(Path::new("/home/me/Music")));
    }
    #[test]
    fn library_folders_are_found_by_their_marker() {
        let d = tmp("find");
        write(&d, "Kadampa/37 Player library.json", br#"{"format":"37player-library","id":"abc_1","name":"Kadampa"}"#).unwrap();
        write(&d, "Main/37 Player library.json", br#"{"format":"37player-library","id":"main"}"#).unwrap();
        write(&d, "Other/37 Player library.json", br#"{"format":"something-else","id":"x"}"#).unwrap();
        write(&d, "Bad/37 Player library.json", br#"{"format":"37player-library","id":"../x"}"#).unwrap();
        write(&d, "Plain/a.mp3", b"x").unwrap();
        let f = find_libraries(&d);
        assert_eq!(f.iter().map(|x| (x.id.as_str(), x.name.as_str())).collect::<Vec<_>>(), vec![("abc_1", "Kadampa"), ("main", "")]);
        assert!(find_libraries(&d.join("nothing")).is_empty());
    }
    #[test]
    fn a_big_file_in_pieces() {
        let d = tmp("append");
        append(&d, "A/big.wav.p37part", b"0123").unwrap();
        append(&d, "A/big.wav.p37part", b"4567").unwrap();
        write(&d, "A/big.wav", b"old").unwrap();
        rename(&d, "A/big.wav.p37part", &d, "A/big.wav", true).unwrap();
        assert_eq!(read(&d, "A/big.wav", 0, None).unwrap(), b"01234567");
        assert_eq!(list(&d, "A").unwrap().len(), 1);
    }
    #[test]
    fn write_read_list_stat() {
        let d = tmp("rw");
        write(&d, "Tharpa/Prayers/01 Liberating Prayer.mp3", b"0123456789").unwrap();
        assert_eq!(read(&d, "Tharpa/Prayers/01 Liberating Prayer.mp3", 0, None).unwrap(), b"0123456789");
        assert_eq!(read(&d, "Tharpa/Prayers/01 Liberating Prayer.mp3", 3, Some(6)).unwrap(), b"345");
        assert_eq!(read(&d, "Tharpa/Prayers/01 Liberating Prayer.mp3", 8, Some(99)).unwrap(), b"89");
        write(&d, "Tharpa/Prayers/01 Liberating Prayer.mp3", b"new").unwrap();
        assert_eq!(read(&d, "Tharpa/Prayers/01 Liberating Prayer.mp3", 0, None).unwrap(), b"new");
        let l = list(&d, "Tharpa/Prayers").unwrap();
        assert_eq!(l.len(), 1, "no temporary files left: {:?}", l);
        assert_eq!((l[0].name.as_str(), l[0].kind, l[0].size), ("01 Liberating Prayer.mp3", "file", 3));
        assert_eq!(list(&d, "").unwrap()[0].kind, "directory");
        assert!(stat(&d, "nothing.mp3").unwrap().is_none());
        assert_eq!(stat(&d, "Tharpa").unwrap().unwrap().kind, "directory");
    }
    #[test]
    fn copy_rename_remove() {
        let d = tmp("mv"); let other = tmp("mv-other");
        write(&d, "A/B/x.mp3", b"x").unwrap();
        copy(&d, "A/B/x.mp3", &d, "A/C/y.mp3", false).unwrap();
        assert!(copy(&d, "A/B/x.mp3", &d, "A/C/y.mp3", false).is_err(), "a copy doesn't write over a file");
        rename(&d, "A/C/y.mp3", &d, "D/E/z.mp3", false).unwrap();
        assert_eq!(read(&d, "D/E/z.mp3", 0, None).unwrap(), b"x");
        assert!(stat(&d, "A/C/y.mp3").unwrap().is_none());
        rename(&d, "D/E/z.mp3", &other, "z.mp3", false).unwrap();
        assert_eq!(read(&other, "z.mp3", 0, None).unwrap(), b"x");
        assert!(remove(&d, "A", false).is_err(), "a folder with something in it");
        assert!(remove(&d, "A/C", false).unwrap(), "an empty folder");
        assert!(!remove(&d, "A/C", false).unwrap(), "already gone");
        assert!(remove(&d, "", true).is_err(), "never the folder itself");
        assert!(remove(&d, "A", true).unwrap());
        assert!(stat(&d, "A").unwrap().is_none());
    }
    #[test]
    fn a_change_of_capitals_only() {
        let d = tmp("case");
        write(&d, "tharpa/x.mp3", b"x").unwrap();
        rename(&d, "tharpa/x.mp3", &d, "tharpa/X.mp3", false).unwrap();
        assert_eq!(list(&d, "tharpa").unwrap().iter().map(|e| e.name.clone()).collect::<Vec<_>>(), vec!["X.mp3"]);
    }
    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 100)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 1000)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 1000)));
        assert_eq!(parse_range("bytes=990-2000", 1000), Some((990, 1000)));
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("bytes=5-2", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
        assert_eq!(parse_range("bytes=0-", 0), None);
    }
    #[test]
    fn names_and_roots() {
        assert_eq!(folder_name("Rinzin's library"), "Rinzin's library");
        assert_eq!(folder_name("A/B: c?. "), "A-B- c-");
        assert_eq!(folder_name("   "), "Library");
        let d = tmp("roots");
        let r = Roots::load(d.join("roots.json"));
        r.set("lib1", d.join("one")).unwrap();
        assert!(r.set("a/b", d.clone()).is_err());
        let again = Roots::load(d.join("roots.json"));
        assert_eq!(again.get("lib1").unwrap(), d.join("one"));
        again.forget("lib1").unwrap();
        assert!(Roots::load(d.join("roots.json")).get("lib1").is_err());
        assert_eq!(percent_decode("Rinzin%27s%20library%2F%E2%80%93"), "Rinzin's library/–");
    }
}
