<?php
/*
 * 37 Player — Wi-Fi share test: the noticeboard (a test only; remove later).
 *
 * Two devices running p2p-test.js meet in a "room" (a 4-digit code) and pass
 * each other the few small messages WebRTC needs to connect (its offer and
 * answer). The recordings themselves never come here: once connected, the
 * devices talk directly.
 *
 *   POST ?op=put&room=1234&to=a|b   body: one JSON message (≤ 64 KB)
 *   GET  ?op=get&room=1234&to=a|b&after=N   → {"msgs": [...], "next": M}
 *
 * Kept in the system's temp folder, one file per room and side; rooms not
 * touched for an hour are removed. Nothing here is private (connection
 * details only), so any origin may use it: the test page itself, and the
 * desktop app's page (tauri://localhost) with the test script loaded into it.
 */

header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function out($code, $v) { http_response_code($code); header('Content-Type: application/json'); echo json_encode($v, JSON_UNESCAPED_SLASHES); exit; }

$dir = rtrim(sys_get_temp_dir(), '/') . '/37player-p2p-test';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
if (!is_dir($dir) || !is_writable($dir)) out(500, ['error' => 'no_temp_dir']);

// Tidy: rooms untouched for an hour go.
foreach (glob("$dir/*.jsonl") ?: [] as $f) if (filemtime($f) < time() - 3600) @unlink($f);

$op = $_GET['op'] ?? '';
$room = $_GET['room'] ?? '';
$to = $_GET['to'] ?? '';
if ($op === 'ping') out(200, ['ok' => true, 'time' => microtime(true)]);
if (!preg_match('/^[0-9]{4}$/', $room) || !in_array($to, ['a', 'b'], true)) out(400, ['error' => 'bad_room']);
$file = "$dir/$room-$to.jsonl";

if ($op === 'put' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input', false, null, 0, 65537);
    if ($body === false || strlen($body) > 65536) out(413, ['error' => 'too_big']);
    if (!is_array(json_decode($body, true))) out(400, ['error' => 'bad_json']);
    if (is_file($file) && filesize($file) > 512 * 1024) out(413, ['error' => 'room_full']);
    $fh = fopen($file, 'a');
    flock($fh, LOCK_EX);
    fwrite($fh, str_replace("\n", ' ', $body) . "\n");
    flock($fh, LOCK_UN);
    fclose($fh);
    out(200, ['ok' => true]);
}

if ($op === 'get') {
    $after = max(0, intval($_GET['after'] ?? 0));
    $lines = is_file($file) ? file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];
    $msgs = [];
    foreach (array_slice($lines, $after) as $l) { $m = json_decode($l, true); if (is_array($m)) $msgs[] = $m; }
    out(200, ['msgs' => $msgs, 'next' => count($lines)]);
}

if ($op === 'clear' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    @unlink("$dir/$room-a.jsonl"); @unlink("$dir/$room-b.jsonl");
    out(200, ['ok' => true]);
}

out(400, ['error' => 'bad_request']);
