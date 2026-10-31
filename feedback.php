<?php
/*
 * 37 Player — feedback to its developer (1.4.136).
 *
 * The app's Send feedback form posts here. Each message:
 *   - is mailed to FEEDBACK_TO only (rinzin@kr37.net), through this server's
 *     own mail (PHP's mail(), so Postfix's sendmail), subject
 *     "37-Player: <first line>", with the chosen logs attached. A reply
 *     address, if given, goes in Reply-To and nowhere else: this script can
 *     never be used to mail anyone but FEEDBACK_TO;
 *   - is kept in DATA_DIR/feedback/<when>-<id>/ (message.txt and the logs),
 *     so nothing is lost if mail fails;
 *   - is filed, if a GitHub token is set up, in a private repository
 *     (FEEDBACK_REPO, kr37/37player-reports) as reports/<when>-<id>/, where
 *     a Claude session can read it.
 *
 *   GET  ?op=status   {"available": true}
 *   POST ?op=send     JSON {message, reply, version, device, library, browser,
 *                     logs: [{name, text}]} → {"ok": true, "id", "mailed", "filed"}
 *
 * Limits: 3 MB a message, 1 MB a log, 8 logs; 6 messages an hour and 20 a day
 * from one address (kept only as a hash). Same origin only, as restore.php.
 *
 * Settings, in sync-config.php beside sync.php (optional):
 *   define('FEEDBACK_TO', 'rinzin@kr37.net');
 *   define('FEEDBACK_FROM', 'feedback@37player.com');   // default: feedback@ this site
 *   define('FEEDBACK_REPO', 'kr37/37player-reports');
 * The GitHub token (fine-grained, only that repository, Contents: read and
 * write) goes in a file of its own, never in git: DATA_DIR/feedback-github-token,
 * owned by the web server's user, mode 0600. No file, no filing.
 */

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

if (is_file(__DIR__ . '/sync-config.php')) require_once __DIR__ . '/sync-config.php';
if (!defined('DATA_DIR')) define('DATA_DIR', getenv('SYNC37_DATA_DIR') ?: '/var/lib/37player');
if (!defined('FEEDBACK_TO')) define('FEEDBACK_TO', getenv('P37_FEEDBACK_TO') ?: 'rinzin@kr37.net');
if (!defined('FEEDBACK_REPO')) define('FEEDBACK_REPO', 'kr37/37player-reports');
const MAX_BODY = 3 * 1024 * 1024, MAX_LOG = 1024 * 1024, MAX_LOGS = 8, PER_HOUR = 6, PER_DAY = 20;

function out($code, $v) { http_response_code($code); header('Content-Type: application/json'); echo json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function is_https() { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'; }

// Same origin only: no other site can send through this.
$host = $_SERVER['HTTP_HOST'] ?? '';
$self = (is_https() ? 'https' : 'http') . '://' . $host;
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
if (($origin !== '' && $origin !== $self) || ($site !== '' && $site !== 'same-origin' && $site !== 'none')) out(403, ['error' => 'same_origin_only']);

$op = $_GET['op'] ?? '';
$store = rtrim(DATA_DIR, '/') . '/feedback';
if ($op === 'status') out(200, ['available' => is_dir(DATA_DIR) && is_writable(DATA_DIR)]);
if ($op !== 'send' || $_SERVER['REQUEST_METHOD'] !== 'POST') out(400, ['error' => 'bad_request']);

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) out(413, ['error' => 'too_big']);
$in = json_decode($raw, true);
if (!is_array($in)) out(400, ['error' => 'bad_json']);
$clean = function ($s, $max) { $s = is_string($s) ? $s : ''; $s = preg_replace('/[^\P{C}\n\t]/u', '', $s) ?? ''; return mb_substr($s, 0, $max); };
$message = trim($clean($in['message'] ?? '', 20000));
if ($message === '') out(400, ['error' => 'empty']);
$reply = trim(str_replace(["\r", "\n"], '', (string)($in['reply'] ?? '')));
if ($reply !== '' && !filter_var($reply, FILTER_VALIDATE_EMAIL)) $reply = '';
$about = [];
foreach (['version' => 'Version', 'device' => 'Device', 'library' => 'Library', 'browser' => 'Browser'] as $k => $label) {
    $v = trim($clean($in[$k] ?? '', 300));
    if ($v !== '') $about[] = "$label: " . str_replace("\n", ' ', $v);
}
$logs = [];
foreach (array_slice(is_array($in['logs'] ?? null) ? $in['logs'] : [], 0, MAX_LOGS) as $l) {
    if (!is_array($l)) continue;
    $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($l['name'] ?? 'log.txt'));
    if (!preg_match('/\.txt$/', $name)) $name .= '.txt';
    $text = is_string($l['text'] ?? null) ? $l['text'] : '';
    if (strlen($text) > MAX_LOG) $text = substr($text, -MAX_LOG); // the newest part
    $logs[] = ['name' => substr($name, 0, 120), 'text' => $text];
}

// ---- rate limit, by a hash of the address
if (!is_dir("$store/rate")) @mkdir("$store/rate", 0770, true);
if (!is_dir("$store/rate")) out(500, ['error' => 'no_storage']);
$who = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|37player-feedback');
$rf = "$store/rate/$who";
$now = time();
$fh = @fopen($rf, 'c+');
if ($fh) {
    flock($fh, LOCK_EX);
    $times = array_values(array_filter(array_map('intval', explode("\n", stream_get_contents($fh))), function ($t) use ($now) { return $t > $now - 86400; }));
    $hour = count(array_filter($times, function ($t) use ($now) { return $t > $now - 3600; }));
    if ($hour >= PER_HOUR || count($times) >= PER_DAY) { flock($fh, LOCK_UN); fclose($fh); out(429, ['error' => 'too_many']); }
    $times[] = $now;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, implode("\n", $times));
    flock($fh, LOCK_UN); fclose($fh);
}

// ---- the copy kept here
$id = gmdate('Y-m-d-His', $now) . '-' . bin2hex(random_bytes(3));
$dir = "$store/$id";
if (!@mkdir($dir, 0770, true)) out(500, ['error' => 'no_storage']);
$first = trim(strtok($message, "\n"));
$text = $message . "\n\n----\n" . implode("\n", $about) . ($reply !== '' ? "\nReply to: $reply" : '') . "\nReceived: " . gmdate('Y-m-d H:i:s', $now) . " UTC\n";
file_put_contents("$dir/message.txt", $text);
foreach ($logs as $l) file_put_contents("$dir/" . $l['name'], $l['text']);

// ---- mail, only ever to FEEDBACK_TO
$from = defined('FEEDBACK_FROM') ? FEEDBACK_FROM : 'feedback@' . preg_replace('/:\d+$/', '', $host ?: 'localhost');
$subject = '=?UTF-8?B?' . base64_encode('37-Player: ' . mb_substr($first, 0, 70)) . '?=';
$boundary = 'p37-' . bin2hex(random_bytes(8));
$headers = "From: 37 Player <$from>\r\n" . ($reply !== '' ? "Reply-To: $reply\r\n" : '') . "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$boundary\"";
$body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text . "Kept as: $dir\n"));
foreach ($logs as $l) {
    $body .= "--$boundary\r\nContent-Type: text/plain; charset=UTF-8; name=\"{$l['name']}\"\r\nContent-Disposition: attachment; filename=\"{$l['name']}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($l['text']));
}
$body .= "--$boundary--\r\n";
$mailed = @mail(FEEDBACK_TO, $subject, $body, $headers);
if (!$mailed) @file_put_contents("$dir/NOT-MAILED", "mail() failed\n");

// ---- filed on GitHub, if a token is set up
$filed = false;
$tokenFile = rtrim(DATA_DIR, '/') . '/feedback-github-token';
$token = is_file($tokenFile) ? trim((string)@file_get_contents($tokenFile)) : '';
if ($token !== '') {
    $filed = true;
    $files = [['message.md', "# " . $first . "\n\n" . $text]];
    foreach ($logs as $l) $files[] = [$l['name'], $l['text']];
    foreach ($files as [$name, $content]) {
        $ctx = stream_context_create(['http' => [
            'method' => 'PUT', 'ignore_errors' => true, 'timeout' => 20,
            'header' => "Authorization: Bearer $token\r\nUser-Agent: 37player-feedback\r\nAccept: application/vnd.github+json\r\nContent-Type: application/json\r\n",
            'content' => json_encode(['message' => "Feedback $id: " . mb_substr($first, 0, 60), 'content' => base64_encode($content)]),
        ]]);
        $r = @file_get_contents('https://api.github.com/repos/' . FEEDBACK_REPO . '/contents/reports/' . rawurlencode($id) . '/' . rawurlencode($name), false, $ctx);
        $status = isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m) ? intval($m[1]) : 0;
        if ($r === false || $status < 200 || $status >= 300) { $filed = false; @file_put_contents("$dir/NOT-FILED", "GitHub answered $status for $name\n", FILE_APPEND); }
    }
}

out(200, ['ok' => true, 'id' => $id, 'mailed' => $mailed, 'filed' => $filed]);
