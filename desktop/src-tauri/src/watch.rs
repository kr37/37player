// What the page can't see for itself (shell 2.5.3; kr37, 16 Nov 2026: Gen
// Palden's MacBook "would just crash completely, and other times he'd get
// the spinning wheel for 30 seconds", and his logs couldn't say which).
//  - The window not answering. The spinning wheel means the app's main
//    thread (which draws the window and takes the mouse) is held up; the
//    page runs in a process of its own and can't see it. A thread here asks
//    the main thread to note the time every 250 ms; a gap of over 2 s is a
//    stall, kept with when it began, how long it lasted and whether the
//    window was in front (a window in the background may be held back by
//    the system on purpose). When this thread's own ticks come late (the
//    computer asleep), nothing is counted.
//  - The app stopping without closing: "running.json" in the app's data
//    folder, with when it started and when it was last seen running
//    (every 30 s); a normal exit removes it. Found at the next start: the
//    session before ended unexpectedly (a crash, a force quit, the power).
//  - A Rust panic (the app aborts on one): its message goes into that file
//    first.
// p37_watch hands the page what's new, once; the page puts it in the
// playback log, so a feedback report carries it.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub const TICK_MS: u64 = 250;
pub const STALL_MS: u64 = 2000;
const ALIVE_EVERY_MS: u64 = 30_000;

pub fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Stall { pub at: u64, pub ms: u64, pub focused: bool }

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Session { pub started: u64, pub alive: u64, pub version: String, #[serde(default)] pub panic: Option<String> }

#[derive(serde::Serialize, Clone, Default)]
pub struct Report { pub stalls: Vec<Stall>, pub last_session: Option<Session> }

// The stall finder on its own, for tests: fed the time of each of its ticks
// and the main thread's last note.
#[derive(Default)]
pub struct Finder { prev_tick: u64, from: Option<(u64, bool)> }
impl Finder {
    // Returns a finished stall, if this tick ends one. `late`: this thread
    // itself was held up (asleep), so the gap says nothing.
    pub fn tick(&mut self, now: u64, beat: u64, focused: bool) -> (Option<Stall>, bool) {
        let late = self.prev_tick != 0 && now.saturating_sub(self.prev_tick) > TICK_MS + 1500;
        self.prev_tick = now;
        if late { self.from = None; return (None, true); }
        let gap = now.saturating_sub(beat);
        if gap > STALL_MS {
            if self.from.is_none() { self.from = Some((beat, focused)); }
            (None, false)
        } else if let Some((at, f)) = self.from.take() {
            (Some(Stall { at, ms: beat.saturating_sub(at), focused: f }), false)
        } else { (None, false) }
    }
}

pub struct Watch {
    beat: Arc<AtomicU64>,
    pub focused: AtomicBool,
    stalls: Mutex<Vec<Stall>>,
    last: Mutex<Option<Session>>,
    me: Mutex<Session>,
    file: Option<PathBuf>,
}
static WATCH: OnceLock<Arc<Watch>> = OnceLock::new();
pub fn get() -> Option<Arc<Watch>> { WATCH.get().cloned() }

impl Watch {
    fn write(&self) {
        let Some(f) = &self.file else { return };
        if let Ok(s) = serde_json::to_vec(&*self.me.lock().unwrap()) { let _ = std::fs::write(f, s); }
    }
    // A normal end: no "didn't close normally" at the next start.
    pub fn closing(&self) { if let Some(f) = &self.file { let _ = std::fs::remove_file(f); } }
    // After all (an update that didn't install): running again.
    pub fn running_again(&self) { self.write(); }
    pub fn take(&self) -> Report {
        Report { stalls: std::mem::take(&mut *self.stalls.lock().unwrap()), last_session: self.last.lock().unwrap().take() }
    }
}

// The last session's file, read before this one's replaces it.
pub fn read_session(file: &PathBuf) -> Option<Session> { serde_json::from_slice(&std::fs::read(file).ok()?).ok() }

pub fn start(app: &tauri::AppHandle) -> Arc<Watch> {
    let file = app.path().app_data_dir().ok().map(|d| { let _ = std::fs::create_dir_all(&d); d.join("running.json") });
    let last = file.as_ref().and_then(read_session);
    let now = now_ms();
    let w = Arc::new(Watch {
        beat: Arc::new(AtomicU64::new(now)), focused: AtomicBool::new(true),
        stalls: Mutex::new(vec![]), last: Mutex::new(last),
        me: Mutex::new(Session { started: now, alive: now, version: app.package_info().version.to_string(), panic: None }),
        file,
    });
    w.write();
    let _ = WATCH.set(w.clone());
    // A panic aborts the app: its message is kept for the next start.
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(w) = get() {
            let loc = info.location().map(|l| format!(" ({}:{})", l.file(), l.line())).unwrap_or_default();
            let msg = info.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| info.payload().downcast_ref::<String>().cloned()).unwrap_or_else(|| "panic".into());
            if let Ok(mut me) = w.me.try_lock() { me.panic = Some(format!("{}{}", msg, loc)); me.alive = now_ms(); }
            w.write();
        }
        prev(info);
    }));
    let (app2, w2) = (app.clone(), w.clone());
    std::thread::spawn(move || {
        let mut finder = Finder::default();
        let mut alive_at = now_ms();
        loop {
            std::thread::sleep(Duration::from_millis(TICK_MS));
            let now = now_ms();
            let beat = w2.beat.clone();
            let _ = app2.run_on_main_thread(move || beat.store(now_ms(), Ordering::SeqCst));
            let (stall, late) = finder.tick(now, w2.beat.load(Ordering::SeqCst), w2.focused.load(Ordering::SeqCst));
            if late { w2.beat.store(now, Ordering::SeqCst); }
            if let Some(s) = stall {
                let mut v = w2.stalls.lock().unwrap();
                v.push(s);
                let n = v.len(); if n > 50 { v.drain(0..n - 50); }
            }
            if now.saturating_sub(alive_at) >= ALIVE_EVERY_MS {
                alive_at = now;
                if let Ok(mut me) = w2.me.lock() { me.alive = now; }
                w2.write();
            }
        }
    });
    w
}

// What's new since the page last asked: stalls, and once, how the session
// before ended (None when it closed normally).
#[tauri::command]
pub fn p37_watch() -> Report { get().map(|w| w.take()).unwrap_or_default() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_held_up_main_thread_is_a_stall() {
        let mut f = Finder::default();
        let mut t = 1_000_000;
        // Notes keep coming: nothing.
        for _ in 0..8 { t += TICK_MS; assert_eq!(f.tick(t, t - 10, true), (None, false)); }
        let held = t;
        // 31 s without a note, the window in front.
        for _ in 0..124 { t += TICK_MS; assert_eq!(f.tick(t, held, true).0, None); }
        t += TICK_MS;
        let (s, late) = f.tick(t, t - 5, false);
        assert!(!late);
        let s = s.expect("a stall");
        assert_eq!(s.at, held);
        assert!(s.ms >= 31_000 && s.ms <= 31_500, "{}", s.ms);
        assert!(s.focused, "in front when it began");
        // A short wait (1.5 s) isn't one.
        let held = t;
        for _ in 0..6 { t += TICK_MS; assert_eq!(f.tick(t, held, true).0, None); }
        t += TICK_MS; assert_eq!(f.tick(t, t, true), (None, false));
    }
    #[test]
    fn the_computer_asleep_is_not_a_stall() {
        let mut f = Finder::default();
        let mut t = 5_000_000;
        for _ in 0..4 { t += TICK_MS; f.tick(t, t, true); }
        let before = t;
        t += 3_600_000; // an hour asleep: this thread's tick comes an hour late
        assert_eq!(f.tick(t, before, true), (None, true));
        // Back, the main thread's note comes at once: still nothing.
        t += TICK_MS; assert_eq!(f.tick(t, t - 10, true), (None, false));
    }
    #[test]
    fn a_session_file_reads_back() {
        let d = std::env::temp_dir().join(format!("p37-watch-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&d);
        let f = d.join("running.json");
        let s = Session { started: 1, alive: 2, version: "2.5.3".into(), panic: Some("boom (src/x.rs:1)".into()) };
        std::fs::write(&f, serde_json::to_vec(&s).unwrap()).unwrap();
        assert_eq!(read_session(&f), Some(s));
        std::fs::write(&f, br#"{"started":1,"alive":2,"version":"2.5.2"}"#).unwrap();
        assert_eq!(read_session(&f).unwrap().panic, None, "an older file, without panic");
        assert_eq!(read_session(&d.join("none.json")), None);
    }
}
