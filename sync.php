<?php
/*
 * 37 Player — shared library sync server.
 *
 * One file, plain PHP (7.4+), no database. It keeps each shared library in
 * its own folder outside the web root:
 *
 *   DATA_DIR/<library>/
 *     meta.json            name, hash of the join code, created
 *     latest               current version number
 *     lock                 held briefly while a new version is written
 *     state/000123.json.gz the library document at each version (its history)
 *     audio/<id>.<rev>     audio files, never overwritten
 *     artwork/<id>.<rev>   artwork files, never overwritten
 *     peaks/<id>.<rev>     waveform data for each audio file (small JSON)
 *
 * Every request carries the library's join code in an "X-Library" header:
 * "<library>-<secret>". Only a hash of the secret is stored here.
 *
 * Web requests (all on this file, chosen by ?op=):
 *   GET  op=state                 current document; version in X-Version (0 = empty)
 *   GET  op=state&version=N       an earlier version
 *   POST op=state&base=N          save a new document, only if the current
 *                                 version is still N; otherwise 409 with
 *                                 {"version": current}
 *   GET  op=list                  names of every stored audio/artwork/peaks file
 *   GET  op=file&kind=K&name=X    download one (Range requests supported)
 *   PUT  op=file&kind=K&name=X    upload one (kept as-is if it already exists)
 *   POST op=peaks                 {"names":[...]} → {"name": peaks, ...}
 *   GET  op=history               recent versions: number, time, size
 *
 * Command line (as the web server's user, e.g. sudo -u www-data php sync.php …):
 *   php sync.php create <library> ["Display name"]   make a library; prints its join code
 *   php sync.php newcode <library>                   replace its join code (old one stops working)
 *   php sync.php list                                list libraries
 *   php sync.php cleanup [days]                      prune old versions and unused files
 *
 * Settings: DATA_DIR below, or a sync-config.php beside this file that
 * defines it (so updating this file never loses the setting), or the
 * SYNC37_DATA_DIR environment variable.
 */

if (is_file(__DIR__ . '/sync-config.php')) require __DIR__ . '/sync-config.php';
if (!defined('DATA_DIR')) define('DATA_DIR', getenv('SYNC37_DATA_DIR') ?: '/var/lib/37player');
if (!defined('KEEP_DAYS')) define('KEEP_DAYS', 30);       // every version from the last 30 days is kept
if (!defined('KEEP_VERSIONS')) define('KEEP_VERSIONS', 300); // and at least the last 300, however old
if (!defined('MAX_DOC_BYTES')) define('MAX_DOC_BYTES', 50 * 1024 * 1024);

const KINDS = ['audio', 'artwork', 'peaks'];

if (PHP_SAPI === 'cli') { exit(cli($argv)); }

// ---------- web ----------
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: X-Library, Content-Type, Range');
header('Access-Control-Expose-Headers: X-Version, X-Library-Name, Content-Range, Content-Length, Accept-Ranges');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$lib = authenticate();
$dir = DATA_DIR . '/' . $lib;
$op = $_GET['op'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($op === 'state' && $method === 'GET') {
    $v = isset($_GET['version']) ? intval($_GET['version']) : latest($dir);
    $meta = json_decode(file_get_contents("$dir/meta.json"), true);
    header('X-Library-Name: ' . rawurlencode($meta['name'] ?? $lib));
    header('X-Version: ' . latest($dir));
    if ($v <= 0) { json_out(null); }
    $f = state_file($dir, $v);
    if (!is_file($f)) fail(404, 'No such version');
    header('Content-Type: application/json');
    header('X-Version: ' . $v);
    send_gz($f);
}

if ($op === 'state' && $method === 'POST') {
    $base = intval($_GET['base'] ?? -1);
    $body = file_get_contents('php://input', false, null, 0, MAX_DOC_BYTES + 1);
    if ($body === false || strlen($body) > MAX_DOC_BYTES) fail(413, 'Too large');
    $doc = json_decode($body, true);
    if (!is_array($doc) || !isset($doc['tracks']) || !isset($doc['tree'])) fail(400, 'Not a library document');
    $lock = fopen($dir . '/lock', 'c');
    flock($lock, LOCK_EX);
    $cur = latest($dir);
    if ($cur !== $base) { flock($lock, LOCK_UN); http_response_code(409); header('X-Version: ' . $cur); json_out(['version' => $cur]); }
    $new = $cur + 1;
    $tmp = state_file($dir, $new) . '.tmp';
    file_put_contents($tmp, gzencode($body, 6));
    rename($tmp, state_file($dir, $new));
    file_put_contents($dir . '/latest.tmp', (string)$new);
    rename($dir . '/latest.tmp', $dir . '/latest');
    flock($lock, LOCK_UN);
    header('X-Version: ' . $new);
    json_out(['version' => $new]);
}

if ($op === 'list' && $method === 'GET') {
    $out = [];
    foreach (KINDS as $k) {
        $names = [];
        foreach (scandir($dir . '/' . $k) ?: [] as $n) if ($n[0] !== '.' && substr($n, -4) !== '.tmp') $names[] = $n;
        $out[$k] = $names;
    }
    json_out($out);
}

if ($op === 'file') {
    $kind = $_GET['kind'] ?? '';
    $name = $_GET['name'] ?? '';
    if (!in_array($kind, KINDS, true) || !valid_name($name)) fail(400, 'Bad file name');
    $f = "$dir/$kind/$name";
    if ($method === 'PUT') {
        if (is_file($f)) json_out(['stored' => false, 'exists' => true]);
        $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $in = fopen('php://input', 'rb'); $out = fopen($tmp, 'wb');
        stream_copy_to_stream($in, $out); fclose($in); fclose($out);
        if (!filesize($tmp)) { unlink($tmp); fail(400, 'Empty file'); }
        rename($tmp, $f);
        json_out(['stored' => true]);
    }
    if ($method === 'GET' || $method === 'HEAD') {
        if (!is_file($f)) fail(404, 'Not found');
        send_file($f, $method === 'HEAD');
    }
}

if ($op === 'peaks' && $method === 'POST') {
    $req = json_decode(file_get_contents('php://input'), true);
    $out = [];
    foreach (($req['names'] ?? []) as $n) {
        if (!is_string($n) || !valid_name($n)) continue;
        $f = "$dir/peaks/$n";
        if (is_file($f)) $out[$n] = json_decode(file_get_contents($f), true);
    }
    json_out($out);
}

if ($op === 'history' && $method === 'GET') {
    $rows = [];
    foreach (versions($dir) as $v) {
        $f = state_file($dir, $v);
        $rows[] = ['version' => $v, 'time' => filemtime($f) * 1000, 'size' => filesize($f)];
    }
    usort($rows, fn($a, $b) => $b['version'] - $a['version']);
    json_out(array_slice($rows, 0, 500));
}

fail(400, 'Unknown request');

// ---------- helpers ----------
function authenticate() {
    $code = $_SERVER['HTTP_X_LIBRARY'] ?? '';
    if (!preg_match('/^([a-z0-9]{1,40})-([A-Za-z0-9-]{8,80})$/', $code, $m)) fail(401, 'Missing or malformed join code');
    $lib = $m[1]; $secret = str_replace('-', '', $m[2]);
    $metaF = DATA_DIR . "/$lib/meta.json";
    $meta = is_file($metaF) ? json_decode(file_get_contents($metaF), true) : null;
    if (!$meta || !hash_equals($meta['hash'], hash('sha256', $secret))) { usleep(300000); fail(403, 'Unknown library or wrong join code'); }
    return $lib;
}
function latest($dir) { $f = "$dir/latest"; return is_file($f) ? intval(trim(file_get_contents($f))) : 0; }
function state_file($dir, $v) { return sprintf('%s/state/%06d.json.gz', $dir, $v); }
function versions($dir) {
    $vs = [];
    foreach (scandir("$dir/state") ?: [] as $n) if (preg_match('/^(\d+)\.json\.gz$/', $n, $m)) $vs[] = intval($m[1]);
    sort($vs); return $vs;
}
function valid_name($n) { return is_string($n) && preg_match('/^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9_-]{1,40}$/', $n); }
function json_out($v) { header('Content-Type: application/json'); echo json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function fail($code, $msg) { http_response_code($code); json_out(['error' => $msg]); }
// Sends a stored .gz as-is when the browser accepts gzip (they all do).
function send_gz($f) {
    if (stripos($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip') !== false) {
        header('Content-Encoding: gzip');
        header('Content-Length: ' . filesize($f));
        readfile($f);
    } else {
        echo gzdecode(file_get_contents($f));
    }
    exit;
}
// One file, with single-range support (what audio players and the app ask for).
function send_file($f, $headOnly) {
    $size = filesize($f);
    header('Accept-Ranges: bytes');
    header('Content-Type: application/octet-stream');
    $start = 0; $end = $size - 1;
    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
        if ($m[1] === '' && $m[2] !== '') { $start = max(0, $size - intval($m[2])); }
        else { $start = intval($m[1]); if ($m[2] !== '') $end = min($end, intval($m[2])); }
        if ($start > $end || $start >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Length: ' . ($end - $start + 1));
    if ($headOnly) exit;
    $fh = fopen($f, 'rb'); fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh)) { $chunk = fread($fh, min(1 << 16, $left)); echo $chunk; $left -= strlen($chunk); }
    fclose($fh);
    exit;
}

// ---------- command line ----------
function cli($argv) {
    $cmd = $argv[1] ?? '';
    if ($cmd === 'create' || $cmd === 'newcode') {
        $lib = $argv[2] ?? '';
        if (!preg_match('/^[a-z0-9]{1,40}$/', $lib)) { fwrite(STDERR, "Library name: lowercase letters and digits only, e.g. ikrc\n"); return 1; }
        $dir = DATA_DIR . "/$lib";
        $metaF = "$dir/meta.json";
        if ($cmd === 'create' && is_file($metaF)) { fwrite(STDERR, "$lib already exists (use newcode to replace its join code)\n"); return 1; }
        if ($cmd === 'newcode' && !is_file($metaF)) { fwrite(STDERR, "No library called $lib\n"); return 1; }
        foreach (['', '/state', '/audio', '/artwork', '/peaks'] as $sub) if (!is_dir($dir . $sub)) mkdir($dir . $sub, 0770, true);
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $secret = ''; for ($i = 0; $i < 16; $i++) $secret .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        $meta = is_file($metaF) ? json_decode(file_get_contents($metaF), true) : ['name' => $argv[3] ?? $lib, 'created' => date('c')];
        $meta['hash'] = hash('sha256', $secret);
        file_put_contents($metaF, json_encode($meta, JSON_PRETTY_PRINT));
        echo "Join code for $lib: $lib-" . implode('-', str_split($secret, 4)) . "\n";
        return 0;
    }
    if ($cmd === 'list') {
        foreach (scandir(DATA_DIR) ?: [] as $lib) {
            $metaF = DATA_DIR . "/$lib/meta.json";
            if ($lib[0] === '.' || !is_file($metaF)) continue;
            $meta = json_decode(file_get_contents($metaF), true);
            echo str_pad($lib, 16) . str_pad('v' . latest(DATA_DIR . "/$lib"), 8) . ($meta['name'] ?? '') . "\n";
        }
        return 0;
    }
    if ($cmd === 'cleanup') {
        $days = intval($argv[2] ?? KEEP_DAYS);
        foreach (scandir(DATA_DIR) ?: [] as $lib) {
            $dir = DATA_DIR . "/$lib";
            if ($lib[0] === '.' || !is_file("$dir/meta.json")) continue;
            cleanup_library($dir, $days);
        }
        return 0;
    }
    fwrite(STDERR, "Usage: php sync.php create <library> [\"Name\"] | newcode <library> | list | cleanup [days]\n");
    return 1;
}
// Keeps every version from the last $days days and the newest KEEP_VERSIONS;
// then deletes files no kept version uses, unless they're newer than $days
// (an upload whose version hasn't been saved yet, or one undone recently).
function cleanup_library($dir, $days) {
    $cutoff = time() - $days * 86400;
    $vs = versions($dir);
    $keepFrom = max(0, count($vs) - KEEP_VERSIONS);
    $kept = [];
    foreach ($vs as $i => $v) {
        $f = state_file($dir, $v);
        if ($i >= $keepFrom || filemtime($f) >= $cutoff) $kept[] = $v; else unlink($f);
    }
    $used = ['audio' => [], 'artwork' => [], 'peaks' => []];
    foreach ($kept as $v) {
        $doc = json_decode(gzdecode(file_get_contents(state_file($dir, $v))), true);
        foreach (($doc['tracks'] ?? []) as $t) {
            $a = $t['id'] . '.' . ($t['audioRev'] ?? '0');
            $used['audio'][$a] = 1; $used['peaks'][$a] = 1;
            if (!empty($t['hasArtwork'])) $used['artwork'][$t['id'] . '.' . ($t['artRev'] ?? '0')] = 1;
        }
    }
    $removed = 0;
    foreach (KINDS as $k) foreach (scandir("$dir/$k") ?: [] as $n) {
        if ($n[0] === '.') continue;
        $f = "$dir/$k/$n";
        if (!isset($used[$k][$n]) && filemtime($f) < $cutoff) { unlink($f); $removed++; }
    }
    echo basename($dir) . ': kept ' . count($kept) . ' versions, removed ' . $removed . " unused files\n";
}
