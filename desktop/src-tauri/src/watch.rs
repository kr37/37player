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
//  - The page's process ending (shell 2.7.2; desktop/AUDIT-boundaries.md
//    1.14, the audit's fix 8, J): on the Mac, WebKit's page process crashing
//    or macOS ending it for memory. Tauri reloaded the page by itself and
//    nothing was logged; a page that died at every start would have reloaded
//    in a loop. Now each one is kept here (page_ended) and the window
//    reloaded, but after three in two minutes (should_reload) it stops and
//    the system's dialog asks (lib.rs).
//  - The page not answering (shell 2.7.3; the audit's fix 9, I). The page
//    asks p37_watch every 20 s; the time of its last ask is kept, and this
//    thread's loop notes when it's over PAGE_SILENT_MS old with the window
//    in front (PAGE_SILENT_AWAY_MS when it isn't: the system slows a hidden
//    window's timers). A page that's hidden and playing nothing says so as
//    it asks (may_sleep, shell 2.7.10): macOS puts such a page to sleep for
//    a quarter of an hour at a time, so its silence isn't counted until the
//    window comes to the front, and then from that moment; nor is the time
//    the computer was asleep (woke). Before, both were logged as "the page
//    didn't answer the app for 1650 s" (report 2026-11-26-103712, build
//    83d: up to 41442 s overnight). Only noted, never acted on (kr37, 23 Nov 2026: a
//    reload would very likely meet the same stuck media process, and a
//    restart by itself, perhaps mid-puja on a false alarm, is worse than a
//    frozen window someone can see): in running.json at once, so a force
//    quit still leaves when the page stopped answering, and for the page's
//    log if it answers again. A close or Quit while it's silent offers
//    "isn't responding" at once (lib.rs, closing.rs).
//  - Every 30 s running.json also says whether the main thread is held up
//    right now, and since when: a hang that never ended (Force Quit) then
//    leaves its start, not only "didn't close normally".
// p37_watch hands the page what's new, once; the page puts it in the
// playback log, so a feedback report carries it.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub const TICK_MS: u64 = 250;
pub const STALL_MS: u64 = 2000;
pub const PAGE_SILENT_MS: u64 = 60_000;
pub const PAGE_SILENT_AWAY_MS: u64 = 300_000;
const ALIVE_EVERY_MS: u64 = 30_000;

pub fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Stall { pub at: u64, pub ms: u64, pub focused: bool }

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Session { pub started: u64, pub alive: u64, pub version: String, #[serde(default)] pub panic: Option<String>,
    /// The page's last ask, when it had stopped asking (shell 2.7.3).
    #[serde(default)] pub page_silent_since: Option<u64>,
    /// When the main thread was last seen held up, still held up at the last note (shell 2.7.3).
    #[serde(default)] pub main_stalled_since: Option<u64> }

/// A time the page didn't ask for PAGE_SILENT_MS or more, ended by its asking again.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Silence { pub at: u64, pub ms: u64 }

/// Whether the page has been silent too long: its last ask `last` (0: it
/// hasn't asked yet), at `now`, the window in front or not.
pub fn page_silent(last: u64, now: u64, focused: bool) -> bool {
    last != 0 && now.saturating_sub(last) > if focused { PAGE_SILENT_MS } else { PAGE_SILENT_AWAY_MS }
}

#[derive(serde::Serialize, Clone, Default)]
pub struct Report { pub stalls: Vec<Stall>, pub last_session: Option<Session>, pub page_ended: Vec<u64>, pub page_silences: Vec<Silence> }

/// Page process ends kept for should_reload: those within RELOADS_WITHIN_MS.
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))] // the Mac only
pub const RELOADS_WITHIN_MS: u64 = 120_000;
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))] // the Mac only
pub const RELOADS_AT_MOST: usize = 2;
/// Whether the window should reload by itself after the page's process
/// ended at `now`, given the ends before it (kept, pruned, here): not after
/// a third within two minutes.
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))] // the Mac only
pub fn should_reload(ends: &mut Vec<u64>, now: u64) -> bool {
    ends.retain(|&t| now.saturating_sub(t) < RELOADS_WITHIN_MS);
    ends.push(now);
    ends.len() <= RELOADS_AT_MOST
}

// The stall finder on its own, for tests: fed the time of each of its ticks
// and the main thread's last note.
#[derive(Default)]
pub struct Finder { prev_tick: u64, from: Option<(u64, bool)> }
impl Finder {
    /// When the stall under way began, if the main thread is held up now.
    pub fn stalled_since(&self) -> Option<u64> { self.from.map(|(at, _)| at) }
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
    page_ended: Mutex<Vec<u64>>,
    /// The page's last p37_watch (ms; 0 before the first), and the silences ended since the page last asked.
    page_asked: AtomicU64,
    /// The page said at its last ask that it's hidden and playing nothing: the system may put it to sleep (shell 2.7.10).
    page_may_sleep: AtomicBool,
    /// When the window last came to the front (ms).
    front_since: AtomicU64,
    page_silences: Mutex<Vec<Silence>>,
    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))] // the Mac only
    pub recent_ends: Mutex<Vec<u64>>,
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
        self.page_asks(now_ms());
        Report { stalls: std::mem::take(&mut *self.stalls.lock().unwrap()), last_session: self.last.lock().unwrap().take(), page_ended: std::mem::take(&mut *self.page_ended.lock().unwrap()),
            page_silences: std::mem::take(&mut *self.page_silences.lock().unwrap()) }
    }
    /// The page asked (p37_watch) at `now`: a silence noted before it ends here.
    pub fn page_asks(&self, now: u64) {
        self.page_asked.store(now, Ordering::SeqCst);
        let ended = { let mut me = self.me.lock().unwrap(); me.page_silent_since.take() };
        if let Some(at) = ended {
            self.page_silences.lock().unwrap().push(Silence { at, ms: now.saturating_sub(at) });
            self.write();
        }
    }
    /// Notes a silence once it's too long (from this thread's loop): kept in running.json at once.
    /// A page that may sleep is counted only with the window in front, and from when it came there.
    pub fn check_page(&self, now: u64) {
        let last = self.page_asked.load(Ordering::SeqCst);
        if last == 0 { return; }
        let focused = self.focused.load(Ordering::SeqCst);
        let from = if self.page_may_sleep.load(Ordering::SeqCst) {
            if !focused { return; }
            last.max(self.front_since.load(Ordering::SeqCst))
        } else { last };
        if !page_silent(from, now, focused) { return; }
        let noted = { let mut me = self.me.lock().unwrap(); if me.page_silent_since.is_some() { false } else { me.page_silent_since = Some(from); true } };
        if noted { self.write(); }
    }
    /// The page's ask (p37_watch): whether it said it may sleep.
    pub fn page_says(&self, may_sleep: bool) { self.page_may_sleep.store(may_sleep, Ordering::SeqCst); }
    /// The window came to the front, or left it.
    pub fn set_focused(&self, focused: bool, now: u64) {
        if focused && !self.focused.load(Ordering::SeqCst) { self.front_since.store(now, Ordering::SeqCst); }
        self.focused.store(focused, Ordering::SeqCst);
    }
    /// This thread's tick came late: the computer was asleep. The page's
    /// silence is counted from now, not from before (unless already noted).
    pub fn woke(&self, now: u64) {
        if self.page_is_silent() { return; }
        let _ = self.page_asked.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |last| if last == 0 { None } else { Some(now) });
    }
    /// The page silent right now (noted): a close offers "isn't responding" at once.
    pub fn page_is_silent(&self) -> bool { self.me.lock().unwrap().page_silent_since.is_some() }
    /// The page's process ended at `at` (kept for the page's log, at most 20).
    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))] // the Mac only
    pub fn page_ended(&self, at: u64) {
        let mut v = self.page_ended.lock().unwrap();
        v.push(at);
        let n = v.len(); if n > 20 { v.drain(0..n - 20); }
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
        stalls: Mutex::new(vec![]), page_ended: Mutex::new(vec![]), page_asked: AtomicU64::new(0), page_may_sleep: AtomicBool::new(false), front_since: AtomicU64::new(now), page_silences: Mutex::new(vec![]), recent_ends: Mutex::new(vec![]), last: Mutex::new(last),
        me: Mutex::new(Session { started: now, alive: now, version: app.package_info().version.to_string(), panic: None, page_silent_since: None, main_stalled_since: None }),
        file,
    });
    w.write();
    let _ = WATCH.set(w.clone());
    // A panic aborts the app: its message is kept for the next start. The
    // first is kept, and a later one added after it (shell 2.5.7): a panic
    // where it can't unwind ends in a second, "panic in a function that
    // cannot unwind", which had replaced the first, the one that says why.
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(w) = get() {
            let loc = info.location().map(|l| format!(" ({}:{})", l.file(), l.line())).unwrap_or_default();
            let msg = info.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| info.payload().downcast_ref::<String>().cloned()).unwrap_or_else(|| "panic".into());
            if let Ok(mut me) = w.me.try_lock() {
                let this = format!("{}{}", msg, loc);
                me.panic = Some(match me.panic.take() { Some(first) if first.len() < 2000 => format!("{}; then: {}", first, this), Some(first) => first, None => this });
                me.alive = now_ms();
            }
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
            if late { w2.beat.store(now, Ordering::SeqCst); w2.woke(now); }
            if let Some(s) = stall {
                let mut v = w2.stalls.lock().unwrap();
                v.push(s);
                let n = v.len(); if n > 50 { v.drain(0..n - 50); }
            }
            w2.check_page(now);
            if now.saturating_sub(alive_at) >= ALIVE_EVERY_MS {
                alive_at = now;
                if let Ok(mut me) = w2.me.lock() { me.alive = now; me.main_stalled_since = finder.stalled_since(); }
                w2.write();
            }
        }
    });
    w
}

// What's new since the page last asked: stalls, and once, how the session
// before ended (None when it closed normally).
/// `may_sleep`: the page is hidden and playing nothing (a page before 2.7.016 doesn't say).
#[tauri::command]
pub fn p37_watch(may_sleep: Option<bool>) -> Report { get().map(|w| { w.page_says(may_sleep.unwrap_or(false)); w.take() }).unwrap_or_default() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_page_is_silent_after_a_minute_in_front_five_minutes_away() {
        assert!(!page_silent(0, 10_000_000, true), "it hasn't asked yet");
        assert!(!page_silent(1_000_000, 1_000_000 + PAGE_SILENT_MS, true));
        assert!(page_silent(1_000_000, 1_000_000 + PAGE_SILENT_MS + 1, true));
        assert!(!page_silent(1_000_000, 1_000_000 + PAGE_SILENT_MS + 1, false), "a window away from the front: its timers are slowed");
        assert!(page_silent(1_000_000, 1_000_000 + PAGE_SILENT_AWAY_MS + 1, false));
    }
    #[test]
    fn a_silence_is_noted_once_and_reported_when_the_page_asks_again() {
        // A folder of its own: a_session_file_reads_back writes a running.json
        // at the same time (tests run side by side), which failed this on Windows.
        let d = std::env::temp_dir().join(format!("p37-watch-silence-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&d);
        let f = d.join("running.json");
        let w = test_watch(Some(f.clone()));
        w.check_page(5_000_000);
        assert!(!w.page_is_silent(), "before the page's first ask, nothing");
        w.page_asks(1_000_000);
        w.check_page(1_000_000 + PAGE_SILENT_MS + 500);
        assert!(w.page_is_silent());
        assert_eq!(read_session(&f).and_then(|s| s.page_silent_since), Some(1_000_000), "in running.json at once (a force quit keeps it)");
        w.check_page(1_000_000 + PAGE_SILENT_MS + 9000);
        w.page_asks(1_000_000 + 95_000);
        assert!(!w.page_is_silent());
        assert_eq!(w.take().page_silences, vec![Silence { at: 1_000_000, ms: 95_000 }]);
        assert_eq!(read_session(&f).and_then(|s| s.page_silent_since), None, "cleared when it answers");
        assert!(w.take().page_silences.is_empty(), "said once");
    }
    #[test]
    fn a_page_that_may_sleep_is_counted_only_in_front_and_from_then() {
        let w = test_watch(None);
        w.set_focused(false, 900_000);
        w.page_says(true);
        w.page_asks(1_000_000);
        w.check_page(1_000_000 + 3_600_000);
        assert!(!w.page_is_silent(), "hidden and playing nothing: asleep for an hour is no silence");
        w.set_focused(true, 5_000_000);
        w.check_page(5_000_000 + PAGE_SILENT_MS - 1);
        assert!(!w.page_is_silent(), "in front: counted from then");
        w.check_page(5_000_000 + PAGE_SILENT_MS + 1);
        assert!(w.page_is_silent(), "still not answering a minute after it came to the front");
        w.page_asks(5_000_000 + 70_000);
        assert_eq!(w.take().page_silences, vec![Silence { at: 5_000_000, ms: 70_000 }], "from when it came to the front");
        // A page that's playing (may_sleep false) is counted as before, even away from the front.
        w.page_says(false);
        w.set_focused(false, 6_000_000);
        w.page_asks(6_000_000);
        w.check_page(6_000_000 + PAGE_SILENT_AWAY_MS + 1);
        assert!(w.page_is_silent());
    }
    #[test]
    fn the_computer_asleep_is_not_the_page_silent() {
        let w = test_watch(None);
        w.woke(2_000_000);
        w.check_page(2_000_000 + 10 * PAGE_SILENT_MS);
        assert!(!w.page_is_silent(), "before the page's first ask, nothing");
        w.page_asks(1_000_000);
        w.woke(1_000_000 + 11 * 3_600_000); // eleven hours asleep
        w.check_page(1_000_000 + 11 * 3_600_000 + 5_000);
        assert!(!w.page_is_silent(), "counted from the waking");
        w.check_page(1_000_000 + 11 * 3_600_000 + PAGE_SILENT_MS + 1);
        assert!(w.page_is_silent(), "and a page that then doesn't answer is noted");
    }
    fn test_watch(file: Option<std::path::PathBuf>) -> Watch {
        Watch { beat: Arc::new(AtomicU64::new(0)), focused: AtomicBool::new(true), stalls: Mutex::new(vec![]), page_ended: Mutex::new(vec![]),
            page_asked: AtomicU64::new(0), page_may_sleep: AtomicBool::new(false), front_since: AtomicU64::new(0), page_silences: Mutex::new(vec![]), recent_ends: Mutex::new(vec![]), last: Mutex::new(None),
            me: Mutex::new(Session::default()), file }
    }
    #[test]
    fn a_stall_under_way_has_its_start() {
        let mut f = Finder::default();
        let mut t = 1_000_000;
        for _ in 0..4 { t += TICK_MS; f.tick(t, t, true); }
        assert_eq!(f.stalled_since(), None);
        let held = t;
        for _ in 0..20 { t += TICK_MS; f.tick(t, held, true); }
        assert_eq!(f.stalled_since(), Some(held), "a hang still going: its start");
    }
    #[test]
    fn the_window_reloads_by_itself_twice_in_two_minutes_not_three_times() {
        let mut ends = vec![];
        assert!(should_reload(&mut ends, 1_000_000));
        assert!(should_reload(&mut ends, 1_030_000));
        assert!(!should_reload(&mut ends, 1_060_000), "a third within two minutes: stop and ask");
        assert!(should_reload(&mut vec![1_000_000, 1_030_000], 1_000_000 + RELOADS_WITHIN_MS + 30_001), "the first ones out of the window by then");
        let mut far = vec![];
        for i in 0..5 { assert!(should_reload(&mut far, 1_000_000 + i * (RELOADS_WITHIN_MS + 1)), "one every few minutes: always"); }
    }
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
        let s = Session { started: 1, alive: 2, version: "2.5.3".into(), panic: Some("boom (src/x.rs:1)".into()), ..Default::default() };
        std::fs::write(&f, serde_json::to_vec(&s).unwrap()).unwrap();
        assert_eq!(read_session(&f), Some(s));
        std::fs::write(&f, br#"{"started":1,"alive":2,"version":"2.5.2"}"#).unwrap();
        assert_eq!(read_session(&f).unwrap().panic, None, "an older file, without panic");
        assert_eq!(read_session(&d.join("none.json")), None);
    }
}
