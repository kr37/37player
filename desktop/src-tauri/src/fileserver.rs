// Recordings over http://127.0.0.1 (shell 2.5.0; Gen Rinzin's T470, 13 Nov
// 2026). On Linux the webview is WebKitGTK, whose player (GStreamer) takes
// audio only from http(s) and blob: addresses:
//  - from a blob: it played the wrong part of a recording (an ordinary CBR
//    MP3: the clock ran from 0 while the sound came from the middle, with
//    dropouts), reproduced with nothing of 37 Player's in the page;
//  - from p37lib:// (the files' own protocol, used for recordings over
//    32 MB) it refuses outright ("FormatError").
// From http://127.0.0.1 it plays correctly, seeking included. So on Linux
// the shell serves the libraries' files there too: the same roots and the
// same checks as p37lib (files.rs), with Range, sent straight from the disk.
// Only this computer can reach it (127.0.0.1), and only with the address's
// secret first part, new at every start, which the page gets from
// p37_shell_info: another program or web page on the computer can't read a
// library by guessing.
use std::fs::File;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

pub struct FileServer { pub base: String }

fn secret() -> String {
    let part = || std::collections::hash_map::RandomState::new().build_hasher().finish();
    format!("{:016x}{:016x}", part(), part())
}

pub struct Request { pub method: String, pub path: String, pub range: Option<String> }

// The request line and the one header that matters.
pub fn read_request(r: &mut impl BufRead) -> Option<Request> {
    let mut line = String::new();
    r.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
    let mut range = None;
    for _ in 0..100 {
        let mut h = String::new();
        if r.read_line(&mut h).ok()? == 0 { break; }
        let h = h.trim_end();
        if h.is_empty() { break; }
        if let Some((k, v)) = h.split_once(':') { if k.eq_ignore_ascii_case("range") { range = Some(v.trim().to_string()); } }
    }
    Some(Request { method, path, range })
}

fn head(status: &str, extra: &[(&str, String)]) -> String {
    let mut s = format!("HTTP/1.1 {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Range\r\nAccess-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n", status);
    for (k, v) in extra { s.push_str(&format!("{}: {}\r\n", k, v)); }
    s.push_str("\r\n");
    s
}

// One request, answered. find: the file for "<root>/<path>" (the same roots
// and checks as p37lib), or why not.
pub fn answer(req: &Request, token: &str, find: &dyn Fn(&str, &str) -> Result<PathBuf, String>, out: &mut impl Write) -> std::io::Result<()> {
    if req.method == "OPTIONS" { return out.write_all(head("204 No Content", &[("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS".into()), ("Content-Length", "0".into())]).as_bytes()); }
    let refuse = |out: &mut dyn Write, status: &str| out.write_all(head(status, &[("Content-Length", "0".into())]).as_bytes());
    if req.method != "GET" && req.method != "HEAD" { return refuse(out, "405 Method Not Allowed"); }
    let path = req.path.split('?').next().unwrap_or("");
    let Some(rest) = path.strip_prefix('/').and_then(|p| p.strip_prefix(token)).and_then(|p| p.strip_prefix('/')) else { return refuse(out, "403 Forbidden") };
    let rest = crate::files::percent_decode(rest);
    let Some((root, rel)) = rest.split_once('/') else { return refuse(out, "404 Not Found") };
    let Ok(full) = find(root, rel) else { return refuse(out, "404 Not Found") };
    let len = match std::fs::metadata(&full) { Ok(m) if m.is_file() => m.len(), _ => return refuse(out, "404 Not Found") };
    let (start, end, partial) = match req.range.as_deref() {
        Some(h) => match crate::files::parse_range(h, len) {
            Some((s, e)) => (s, e, true),
            None => return out.write_all(head("416 Range Not Satisfiable", &[("Content-Range", format!("bytes */{}", len)), ("Content-Length", "0".into())]).as_bytes()),
        },
        None => (0, len, false),
    };
    let mut extra = vec![("Content-Type", crate::files::mime_for(rel).to_string()), ("Accept-Ranges", "bytes".to_string()), ("Content-Length", (end - start).to_string())];
    if partial { extra.push(("Content-Range", format!("bytes {}-{}/{}", start, end - 1, len))); }
    out.write_all(head(if partial { "206 Partial Content" } else { "200 OK" }, &extra).as_bytes())?;
    if req.method == "HEAD" { return Ok(()); }
    // Straight from the disk, a piece at a time: a long recording is never held whole.
    let mut f = File::open(&full)?;
    f.seek(SeekFrom::Start(start))?;
    let mut left = end - start;
    let mut buf = vec![0u8; 64 * 1024];
    while left > 0 {
        let want = left.min(buf.len() as u64) as usize;
        let n = f.read(&mut buf[..want])?;
        if n == 0 { break; }
        out.write_all(&buf[..n])?;
        left -= n as u64;
    }
    Ok(())
}

fn handle(stream: TcpStream, token: &str, find: &dyn Fn(&str, &str) -> Result<PathBuf, String>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let Ok(read_half) = stream.try_clone() else { return };
    let Some(req) = read_request(&mut BufReader::new(read_half)) else { return };
    let mut out = stream;
    let _ = answer(&req, token, find, &mut out); // (the player closing early, at a seek, is not an error)
    let _ = out.flush();
}

type Find = std::sync::Arc<dyn Fn(&str, &str) -> Result<PathBuf, String> + Send + Sync>;
// Answers on a listener until the app ends; each request on its own thread
// (the player keeps one open while it plays, and opens another to seek).
pub fn serve_on(listener: TcpListener, token: String, find: Find) {
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let (find, token) = (find.clone(), token.clone());
            std::thread::spawn(move || handle(stream, &token, &*find));
        }
    });
}
// Starts it; None if this computer won't give a port (the page then plays as before).
pub fn start(app: &tauri::AppHandle) -> Option<FileServer> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let port = listener.local_addr().ok()?.port();
    let token = secret();
    let base = format!("http://127.0.0.1:{}/{}", port, token);
    let app = app.clone();
    serve_on(listener, token, std::sync::Arc::new(move |root: &str, rel: &str| crate::files::file_for(&app, root, rel)));
    Some(FileServer { base })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ask(method: &str, path: &str, range: Option<&str>, dir: &std::path::Path) -> (String, Vec<u8>) {
        let req = Request { method: method.into(), path: path.into(), range: range.map(|r| r.to_string()) };
        let d = dir.to_path_buf();
        let mut out = vec![];
        answer(&req, "s3cret", &move |root, rel| if root == "lib-a" { crate::files::resolve(&d, rel) } else { Err("no such root".into()) }, &mut out).unwrap();
        let cut = out.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        (String::from_utf8_lossy(&out[..cut]).into_owned(), out[cut + 4..].to_vec())
    }
    #[test]
    fn serves_a_recording_whole_and_in_part_only_with_the_secret() {
        let d = std::env::temp_dir().join(format!("p37-fileserver-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("music/An album")).unwrap();
        let bytes: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
        std::fs::write(d.join("music/An album/01 A track.mp3"), &bytes).unwrap();
        let p = "/s3cret/lib-a/music/An%20album/01%20A%20track.mp3";
        let (h, b) = ask("GET", p, None, &d);
        assert!(h.starts_with("HTTP/1.1 200") && h.contains("Content-Type: audio/mpeg") && h.contains("Accept-Ranges: bytes") && h.contains("Content-Length: 200000"), "{}", h);
        assert_eq!(b, bytes);
        // A part, an open-ended part (all of the rest: never cut short), the end.
        let (h, b) = ask("GET", p, Some("bytes=100-199"), &d);
        assert!(h.starts_with("HTTP/1.1 206") && h.contains("Content-Range: bytes 100-199/200000"), "{}", h);
        assert_eq!(b, bytes[100..200]);
        let (h, b) = ask("GET", p, Some("bytes=150000-"), &d);
        assert!(h.contains("Content-Range: bytes 150000-199999/200000"), "{}", h);
        assert_eq!(b, bytes[150000..]);
        let (h, b) = ask("HEAD", p, None, &d);
        assert!(h.starts_with("HTTP/1.1 200") && b.is_empty());
        assert!(ask("GET", p, Some("bytes=200000-"), &d).0.starts_with("HTTP/1.1 416"));
        // Not without the secret, not another root, not outside the library, not by writing.
        assert!(ask("GET", "/wrong/lib-a/music/An%20album/01%20A%20track.mp3", None, &d).0.starts_with("HTTP/1.1 403"));
        assert!(ask("GET", "/lib-a/music/An%20album/01%20A%20track.mp3", None, &d).0.starts_with("HTTP/1.1 403"));
        assert!(ask("GET", "/s3cret/lib-b/music/x.mp3", None, &d).0.starts_with("HTTP/1.1 404"));
        assert!(ask("GET", "/s3cret/lib-a/../../etc/passwd", None, &d).0.starts_with("HTTP/1.1 404"));
        assert!(ask("PUT", p, None, &d).0.starts_with("HTTP/1.1 405"));
        assert!(ask("OPTIONS", p, None, &d).0.starts_with("HTTP/1.1 204"));
        let _ = std::fs::remove_dir_all(&d);
    }
    // By hand, against a real WebKitGTK window: P37_FS_DIR=<folder> cargo test --lib fileserver -- --ignored
    // serves that folder as root "lib-a" at http://127.0.0.1:8897/s3cret/lib-a/… for two minutes.
    #[test]
    #[ignore]
    fn by_hand() {
        let d = PathBuf::from(std::env::var("P37_FS_DIR").unwrap());
        serve_on(TcpListener::bind("127.0.0.1:8897").unwrap(), "s3cret".into(), std::sync::Arc::new(move |root: &str, rel: &str| if root == "lib-a" { crate::files::resolve(&d, rel) } else { Err("no".into()) }));
        std::thread::sleep(Duration::from_secs(120));
    }
    #[test]
    fn reads_the_request_and_its_range() {
        let raw = b"GET /s/lib-a/x.mp3 HTTP/1.1\r\nHost: 127.0.0.1:5\r\nrange: bytes=5-\r\n\r\n";
        let r = read_request(&mut BufReader::new(&raw[..])).unwrap();
        assert_eq!((r.method.as_str(), r.path.as_str(), r.range.as_deref()), ("GET", "/s/lib-a/x.mp3", Some("bytes=5-")));
        assert!(secret() != secret() && secret().len() == 32);
    }
}
