// Signing in to Google from the desktop app (2.0), for shared libraries on
// Google Drive. Google refuses sign-in inside an app's own web view, so it
// happens in the person's browser, and the result comes back to a one-time
// address on this computer (a "loopback" address, as RFC 8252 says native
// apps should): the page's token.php sends the person to
// http://127.0.0.1:<port>/p37auth#p37auth=…, a page served here hands the
// part after # (which never reaches a server) to /done, and the command
// returns it to the page, which goes on as after the website's redirect.
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

// Opens a web address in the person's own browser.
pub fn open_in_browser(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") { return Err("only https addresses".into()); }
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(url).spawn();
    #[cfg(windows)]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

pub fn percent_encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{:02X}", b) }).collect()
}

const PAGE: &str = "<!DOCTYPE html><meta charset=utf-8><title>37 Player</title>\
<body style=\"font:17px system-ui,sans-serif;margin:3em;max-width:34em\"><p id=m>Signing in…</p>\
<script>fetch('/done?h='+encodeURIComponent(location.hash.slice(1))).then(function(){\
document.getElementById('m').textContent='Done. You can close this tab and go back to 37 Player.'})</script>";

fn answer(stream: &mut TcpStream, status: &str, kind: &str, body: &str) {
    let _ = write!(stream, "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}", status, kind, body.len(), body);
}

// Serves the loopback address until /done brings the result, or the time is up.
pub fn wait_for_signin(listener: TcpListener, limit: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let until = Instant::now() + limit;
    while Instant::now() < until {
        let (mut stream, _) = match listener.accept() {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => { std::thread::sleep(Duration::from_millis(50)); continue; }
            Err(e) => return Err(e.to_string()),
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buf = [0u8; 16384];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        let path = req.split_whitespace().nth(1).unwrap_or("");
        if path.starts_with("/p37auth") { answer(&mut stream, "200 OK", "text/html; charset=utf-8", PAGE); continue; }
        if let Some(h) = path.strip_prefix("/done?h=") {
            answer(&mut stream, "200 OK", "text/plain", "ok");
            return Ok(crate::files::percent_decode(h));
        }
        answer(&mut stream, "404 Not Found", "text/plain", "");
    }
    Err("no answer from the sign-in".into())
}

// url: token.php's start address, with "{return}" where the address to come
// back to goes. Returns what came after # ("p37auth=…" or "p37auth_error=…").
#[tauri::command]
pub async fn p37_google_signin(url: String) -> Result<String, String> {
    if !url.starts_with("https://") || !url.contains("/token.php?") || !url.contains("{return}") { return Err("not a sign-in address".into()); }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let back = format!("http://127.0.0.1:{}/p37auth", port);
    open_in_browser(&url.replace("{return}", &percent_encode(&back)))?;
    tauri::async_runtime::spawn_blocking(move || wait_for_signin(listener, Duration::from_secs(600))).await.map_err(|e| e.to_string())?
}

// A web page the person asked for (help, the website), in their browser.
#[tauri::command]
pub fn p37_open_url(url: String) -> Result<(), String> { open_in_browser(&url) }

#[cfg(test)]
mod tests {
    use super::*;
    fn get(port: u16, path: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        // In one write, as a browser sends it: write! sends each piece on its
        // own, and the server reads once, so it could answer "GET " alone and
        // close with the rest unread, which a Mac answers with a reset (the
        // d build of 12 Nov 2026 failed so).
        s.write_all(format!("GET {} HTTP/1.1\r\nHost: x\r\n\r\n", path).as_bytes()).unwrap();
        let mut out = String::new(); s.read_to_string(&mut out).unwrap(); out
    }
    #[test]
    fn the_result_comes_back_through_the_page() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || wait_for_signin(l, Duration::from_secs(10)));
        assert!(get(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
        assert!(get(port, "/p37auth").contains("location.hash"));
        get(port, "/done?h=p37auth%3D%7B%22nonce%22%3A%22abc%22%7D");
        assert_eq!(h.join().unwrap().unwrap(), "p37auth={\"nonce\":\"abc\"}");
    }
    #[test]
    fn encoding() { assert_eq!(percent_encode("http://127.0.0.1:5/p37auth"), "http%3A%2F%2F127.0.0.1%3A5%2Fp37auth"); }
}
