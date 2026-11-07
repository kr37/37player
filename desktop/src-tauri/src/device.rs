// The device's own settings, kept by the shell (desktop/FILES-DESIGN.md,
// "Everything the page keeps in browser storage"; Gen Rinzin, 6 Nov 2026:
// deleting the app's webview storage, as CCleaner does, must lose nothing).
//
// device.json, in the app's data folder beside roots.json and pages/, holds
// the page's device-level localStorage values that a person would miss: the
// list of libraries and where each is, the device's settings, the Library
// table's columns, the playback log. The page sends them whenever they
// change (p37_device_put); the shell hands them back as the page starts
// (window.__p37Device, an initialization script), and the page fills its
// localStorage from them when its own was wiped.
//
// Written beside, then renamed into place, with the previous one kept as
// device.json.bak, so a crash mid-write never leaves neither.
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Keys the page may keep here (others are refused, so device.json stays
/// what it says it is).
pub const KEYS: [&str; 7] = [
    "37player.libraries", "37player.device", "37player.libTable", "37player.storage",
    "37player.autoRestore", "37player.driveSignIn", "37player.playLog",
];
/// Large enough for a long playback log; a page sending more is refused.
const MAX_BYTES: usize = 4 * 1024 * 1024;

pub struct Device { file: PathBuf, lock: Mutex<()> }

impl Device {
    pub fn new(file: PathBuf) -> Device { Device { file, lock: Mutex::new(()) } }

    /// What's stored: {key: value}, values as the page's localStorage strings.
    pub fn read(&self) -> Map<String, Value> {
        let _g = self.lock.lock().unwrap();
        read_file(&self.file).or_else(|| read_file(&bak(&self.file))).unwrap_or_default()
    }

    /// Replaces what's stored with these values (only known keys, strings).
    pub fn write(&self, values: &Map<String, Value>) -> Result<(), String> {
        let mut out = Map::new();
        for (k, v) in values {
            if !KEYS.contains(&k.as_str()) { return Err(format!("not a device key: {k}")); }
            match v { Value::String(_) => { out.insert(k.clone(), v.clone()); } _ => return Err(format!("{k}: not a string")) }
        }
        let bytes = serde_json::to_vec_pretty(&Value::Object(out)).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BYTES { return Err("too big".into()); }
        let _g = self.lock.lock().unwrap();
        if let Some(dir) = self.file.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
        let tmp = self.file.with_extension("json.tmp");
        std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        if self.file.exists() { let _ = std::fs::copy(&self.file, bak(&self.file)); }
        std::fs::rename(&tmp, &self.file).map_err(|e| e.to_string())
    }

    /// The script that hands the stored values to the page before it runs.
    pub fn init_script(&self) -> String {
        let json = serde_json::to_string(&Value::Object(self.read())).unwrap_or_else(|_| "{}".into());
        // As a JavaScript string, so nothing in a value can end the script.
        let quoted = serde_json::to_string(&json).unwrap_or_else(|_| "\"{}\"".into());
        format!("try{{ window.__p37Device = JSON.parse({quoted}); }}catch(e){{ window.__p37Device = {{}}; }}")
    }
}

fn bak(file: &Path) -> PathBuf { file.with_extension("json.bak") }

fn read_file(file: &Path) -> Option<Map<String, Value>> {
    let b = std::fs::read(file).ok()?;
    match serde_json::from_slice::<Value>(&b).ok()? {
        Value::Object(m) => Some(m.into_iter().filter(|(k, v)| KEYS.contains(&k.as_str()) && v.is_string()).collect()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("p37-device-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); d.join("device.json")
    }
    fn map(pairs: &[(&str, &str)]) -> Map<String, Value> { pairs.iter().map(|(k, v)| (k.to_string(), Value::String(v.to_string()))).collect() }

    #[test]
    fn kept_and_read_back() {
        let d = Device::new(tmp("kept"));
        assert!(d.read().is_empty(), "nothing yet");
        d.write(&map(&[("37player.libraries", "{\"list\":[]}"), ("37player.device", "{\"theme\":\"dark\"}")])).unwrap();
        let r = d.read();
        assert_eq!(r["37player.device"], "{\"theme\":\"dark\"}");
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn only_known_keys_and_strings() {
        let d = Device::new(tmp("keys"));
        assert!(d.write(&map(&[("something.else", "x")])).is_err());
        let mut m = Map::new(); m.insert("37player.device".into(), Value::Bool(true));
        assert!(d.write(&m).is_err());
        assert!(d.read().is_empty(), "nothing written");
    }

    #[test]
    fn a_damaged_file_falls_back_to_the_one_before() {
        let f = tmp("bak");
        let d = Device::new(f.clone());
        d.write(&map(&[("37player.device", "first")])).unwrap();
        d.write(&map(&[("37player.device", "second")])).unwrap();
        std::fs::write(&f, b"{ not json").unwrap();
        assert_eq!(d.read()["37player.device"], "first", "device.json.bak");
    }

    #[test]
    fn the_script_carries_any_value_safely() {
        let d = Device::new(tmp("script"));
        d.write(&map(&[("37player.playLog", "a \"quote\" </script> \\ and\nnew line")])).unwrap();
        let s = d.init_script();
        assert!(s.starts_with("try{ window.__p37Device = JSON.parse(\""));
        // The JSON inside the JS string parses back to the value.
        let inner: String = serde_json::from_str(&s["try{ window.__p37Device = JSON.parse(".len()..s.find("); }catch").unwrap()]).unwrap();
        let v: Value = serde_json::from_str(&inner).unwrap();
        assert_eq!(v["37player.playLog"], "a \"quote\" </script> \\ and\nnew line");
    }
}
