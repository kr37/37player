<?php
/*
 * 37 Player — automatic restore (1.4.093).
 *
 * A browser can erase a website's storage, and 37 Player's library with it:
 * Safari after 7 days without a visit, any browser when the disk is nearly
 * full, cleanup tools. What 37 Player would need to bring a library back (a
 * shared library's join code, which Drive library, where the backups were)
 * was in that storage too. This script keeps those details where those
 * erasures don't reach: in a cookie this server sets, which the page's own
 * scripts can't read or write (HttpOnly). Safari's 7-day rule removes only
 * what scripts wrote, and browsers clear storage under disk pressure
 * separately from cookies; only someone clearing browsing data on purpose
 * removes it.
 *
 * Nothing is stored on the server. The details are sealed with a key only
 * this server has (authenticated encryption), so the cookie means nothing
 * to anyone else, and it's sent only to this script (its Path).
 *
 * Only for 37 Player's own pages on this site (same origin), opt-in from
 * Settings → Backups → Automatic restore:
 *   GET  ?op=status                       {"available": true}
 *   GET  ?op=get                          {"libraries": {id: entry, …}}
 *   POST ?op=put   {"id": "...", "entry": {...} | null}   adds, replaces or removes one
 *   POST ?op=clear                        forgets everything
 * An entry is whatever the app sends (at most 1500 bytes of JSON); the whole
 * cookie stays under browsers' 4 KB limit, the oldest entries ("at") going
 * first if it wouldn't.
 *
 * The key: 32 random bytes in a file outside the web root, made the first
 * time it's needed: P37_RESTORE_KEY_FILE, or restore.key in sync.php's data
 * folder (sync-config.php's DATA_DIR, or SYNC37_DATA_DIR, /var/lib/37player
 * by default), which the web server can already write. A new key forgets every device's details.
 */

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

const COOKIE = 'p37restore';
const MAX_ENTRY = 1500;
const MAX_COOKIE = 3800; // the value, after sealing and base64
const LIFETIME = 400 * 86400; // the longest Chrome keeps a cookie

function out($code, $v) { http_response_code($code); header('Content-Type: application/json'); echo json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function is_https() { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'; }

// Same origin only: no other site can read or change these details.
$self = (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
if (($origin !== '' && $origin !== $self) || ($site !== '' && $site !== 'same-origin' && $site !== 'none')) out(403, ['error' => 'same_origin_only']);

function restore_key() {
    if (!defined('DATA_DIR') && is_file(__DIR__ . '/sync-config.php')) require __DIR__ . '/sync-config.php';
    $dir = defined('DATA_DIR') ? DATA_DIR : (getenv('SYNC37_DATA_DIR') ?: '/var/lib/37player');
    $file = getenv('P37_RESTORE_KEY_FILE') ?: rtrim($dir, '/') . '/restore.key';
    if (is_file($file)) { $k = @file_get_contents($file); if (is_string($k) && strlen($k) === 32) return $k; }
    if (!is_dir(dirname($file)) || !is_writable(dirname($file))) return null;
    $k = random_bytes(32);
    $tmp = $file . '.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $k) !== 32) { @unlink($tmp); return null; }
    @chmod($tmp, 0600);
    if (!@rename($tmp, $file)) { @unlink($tmp); return null; }
    $k = @file_get_contents($file); // another request may have made it first
    return (is_string($k) && strlen($k) === 32) ? $k : null;
}
function b64u_enc($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec($s) { $r = base64_decode(strtr($s, '-_', '+/'), true); return $r === false ? null : $r; }
function seal($key, $plain) {
    if (function_exists('sodium_crypto_secretbox')) {
        $n = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return 's' . b64u_enc($n . sodium_crypto_secretbox($plain, $n, $key));
    }
    $iv = random_bytes(12); $tag = '';
    $c = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return 'g' . b64u_enc($iv . $tag . $c);
}
function unseal($key, $v) {
    if (!is_string($v) || strlen($v) < 2) return null;
    $raw = b64u_dec(substr($v, 1));
    if ($raw === null) return null;
    if ($v[0] === 's' && function_exists('sodium_crypto_secretbox_open')) {
        $nb = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
        if (strlen($raw) <= $nb) return null;
        $p = sodium_crypto_secretbox_open(substr($raw, $nb), substr($raw, 0, $nb), $key);
        return $p === false ? null : $p;
    }
    if ($v[0] === 'g') {
        if (strlen($raw) <= 28) return null;
        $p = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $p === false ? null : $p;
    }
    return null;
}
function read_libraries($key) {
    $p = unseal($key, $_COOKIE[COOKIE] ?? '');
    $v = $p === null ? null : json_decode($p, true);
    return is_array($v) && isset($v['libraries']) && is_array($v['libraries']) ? $v['libraries'] : [];
}
function cookie_path() { return strtok($_SERVER['REQUEST_URI'] ?? '/restore.php', '?'); }
function write_libraries($key, $libs) {
    // Oldest first out until it fits.
    uasort($libs, function ($a, $b) { return ($b['at'] ?? 0) <=> ($a['at'] ?? 0); });
    while (true) {
        $v = seal($key, json_encode(['v' => 1, 'libraries' => $libs], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        if (strlen($v) <= MAX_COOKIE || !$libs) break;
        array_pop($libs);
    }
    $opts = ['expires' => time() + LIFETIME, 'path' => cookie_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict'];
    if (!$libs) { $opts['expires'] = time() - 3600; setcookie(COOKIE, '', $opts); }
    else setcookie(COOKIE, $v, $opts);
    return count($libs);
}

$op = $_GET['op'] ?? '';
$key = restore_key();
if ($op === 'status') out(200, ['available' => $key !== null]);
if ($key === null) out(503, ['error' => 'not_configured']);

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $op === 'get') out(200, ['libraries' => (object) read_libraries($key)]);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $op === 'put') {
    $body = json_decode(file_get_contents('php://input', false, null, 0, 8192), true);
    $id = is_array($body) ? ($body['id'] ?? '') : '';
    if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) out(400, ['error' => 'bad_id']);
    $entry = $body['entry'] ?? null;
    if ($entry !== null && (!is_array($entry) || strlen(json_encode($entry)) > MAX_ENTRY)) out(400, ['error' => 'bad_entry']);
    $libs = read_libraries($key);
    if ($entry === null) unset($libs[$id]);
    else { $entry['at'] = time(); $libs[$id] = $entry; }
    out(200, ['ok' => true, 'count' => write_libraries($key, $libs)]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $op === 'clear') { write_libraries($key, []); out(200, ['ok' => true]); }

out(400, ['error' => 'bad_request']);
