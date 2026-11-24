// Closing when the page doesn't answer (shell 2.7.1; desktop/AUDIT-boundaries.md
// 1.8, the audit's fix 4, F). Every close of the window, the app menu's Quit
// and the system asking the app to quit (a log-out or restart) are held back
// and the page is asked ("p37-close-requested"): it asks first if something
// would stop, saves, then says p37_quit. A frozen page never answers, so the
// window couldn't be closed, Quit did nothing, and a log-out waited until
// macOS gave up on it; only Force Quit worked.
//
// Now the page answers each ask at once (p37_close_seen), before its own
// question. When it doesn't, the system's own dialog offers "37 Player isn't
// responding. Quit anyway?" (Quit / Wait): at the next close or Quit once
// NO_ANSWER_MS have passed since the unanswered ask, or by itself SYSTEM_MS
// after the system asked. Only once this page has said it answers (at its
// start; each page load starts over), so a page too old to answer closes as
// before. The page hands over the dialog's words in its own language.
use std::sync::Mutex;

pub const NO_ANSWER_MS: u64 = 5000;
pub const SYSTEM_MS: u64 = 10_000;

// The words for the shell's own dialogs, in the page's language. The page's
// process ending (shell 2.7.2, lib.rs) has its own, sent from page 2.7.005;
// an earlier page's leave them empty and the English ones are used.
#[derive(serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Texts {
    pub title: String, pub body: String, pub quit: String, pub wait: String,
    #[serde(default)] pub ended_title: String, #[serde(default)] pub ended_body: String, #[serde(default)] pub reload: String,
}
impl Default for Texts {
    fn default() -> Texts {
        Texts { title: "37 Player isn't responding".into(), body: "Its window hasn't answered. Quit anyway? Changes not saved yet may be lost.".into(), quit: "Quit".into(), wait: "Wait".into(),
            ended_title: ENDED_TITLE.into(), ended_body: ENDED_BODY.into(), reload: "Reload".into() }
    }
}
const ENDED_TITLE: &str = "37 Player's window keeps stopping";
const ENDED_BODY: &str = "Its page has stopped three times in two minutes, so it hasn't been started again by itself. Reload it, or quit 37 Player.";

#[derive(Debug, PartialEq)]
pub enum Next { AskPage, Offer }

#[derive(Default)]
struct State { answers: bool, asked: Option<u64>, texts: Texts, offering: bool }

#[derive(Default)]
pub struct Closing { st: Mutex<State> }

impl Closing {
    /// A page started loading: it hasn't said it answers yet.
    pub fn page_started(&self) { let mut st = self.st.lock().unwrap(); st.answers = false; st.asked = None; }
    /// The page answered (or said at its start that it will), with the dialog's words.
    pub fn seen(&self, texts: Option<Texts>) {
        let mut st = self.st.lock().unwrap();
        st.answers = true; st.asked = None;
        if let Some(mut t) = texts.filter(|t| !t.title.is_empty() && !t.quit.is_empty() && !t.wait.is_empty()) {
            if t.ended_title.is_empty() || t.ended_body.is_empty() || t.reload.is_empty() { t.ended_title = ENDED_TITLE.into(); t.ended_body = ENDED_BODY.into(); t.reload = "Reload".into(); }
            st.texts = t;
        }
    }
    /// A close, Quit or the system's quit at `now` (ms): ask the page, or,
    /// when an earlier ask has gone unanswered NO_ANSWER_MS, offer the dialog.
    pub fn request(&self, now: u64) -> Next {
        let mut st = self.st.lock().unwrap();
        if st.answers { if let Some(at) = st.asked { if now.saturating_sub(at) >= NO_ANSWER_MS { return Next::Offer; } return Next::AskPage; } }
        st.asked = Some(now);
        Next::AskPage
    }
    /// When the ask at `since` is still unanswered (for the system's quit).
    pub fn unanswered_since(&self, since: u64) -> bool { let st = self.st.lock().unwrap(); st.answers && st.asked == Some(since) }
    /// The words for the dialog, if one isn't already showing.
    pub fn start_offer(&self) -> Option<Texts> { let mut st = self.st.lock().unwrap(); if st.offering { return None; } st.offering = true; Some(st.texts.clone()) }
    pub fn end_offer(&self) { self.st.lock().unwrap().offering = false; }
    pub fn asked_at(&self) -> Option<u64> { self.st.lock().unwrap().asked }
    /// The words now (for the page's process ending: no "one at a time" here).
    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))] // the Mac only
    pub fn texts(&self) -> Texts { self.st.lock().unwrap().texts.clone() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_page_that_answers_is_always_asked() {
        let c = Closing::default();
        c.seen(None);
        assert_eq!(c.request(1000), Next::AskPage);
        c.seen(None); // it answered
        assert_eq!(c.request(9000), Next::AskPage, "a new ask, not the old one");
    }
    #[test]
    fn unanswered_for_five_seconds_the_next_close_offers_to_quit() {
        let c = Closing::default();
        c.seen(None);
        assert_eq!(c.request(1000), Next::AskPage);
        assert_eq!(c.request(3000), Next::AskPage, "too soon: asked again");
        assert_eq!(c.request(1000 + NO_ANSWER_MS), Next::Offer);
        assert!(c.unanswered_since(1000));
        assert_eq!(c.start_offer().map(|t| t.quit), Some("Quit".into()));
        assert_eq!(c.start_offer(), None, "one dialog at a time");
        c.end_offer();
        assert!(c.start_offer().is_some());
    }
    #[test]
    fn a_page_too_old_to_answer_closes_as_before() {
        let c = Closing::default();
        for t in [1000, 20_000, 60_000] { assert_eq!(c.request(t), Next::AskPage); }
        assert!(!c.unanswered_since(1000));
    }
    #[test]
    fn a_page_load_starts_over_and_the_page_gives_its_words() {
        let c = Closing::default();
        c.seen(Some(Texts { title: "37 Player no responde".into(), body: "…".into(), quit: "Salir".into(), wait: "Esperar".into(), ended_title: "".into(), ended_body: "".into(), reload: "".into() }));
        assert_eq!(c.texts().reload, "Reload", "words a page before 2.7.005 doesn't send: English");
        c.request(1000);
        c.page_started();
        assert_eq!(c.request(1000 + NO_ANSWER_MS), Next::AskPage, "a reloaded page hasn't said it answers");
        c.seen(Some(Texts { title: "".into(), body: "".into(), quit: "".into(), wait: "".into(), ended_title: "".into(), ended_body: "".into(), reload: "".into() }));
        assert_eq!(c.start_offer().map(|t| t.wait), Some("Esperar".into()), "empty words are passed over");
    }
}
