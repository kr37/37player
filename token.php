<?php
/*
 * 37 Player — Google sign-in helper for shared libraries on Google Drive.
 *
 * A web page alone gets only an hour of access to someone's Google Drive,
 * and renewing it silently doesn't work reliably (Safari, iPads). Google
 * gives a lasting "refresh token" only to an app that can keep a secret, so
 * this small script holds the app's OAuth client secret and does the
 * exchanges that need it. It stores nothing and logs nothing: the refresh
 * token goes back to the device that signed in, and is kept there.
 *
 * Signing in is a redirect, not a popup (popups are unreliable in an iPad
 * Home Screen app):
 *   GET  ?op=status                     {"configured": true|false}
 *   GET  ?op=start&return=URL&nonce=N   → Google's sign-in page
 *   GET  ?code=…&state=…  or ?error=…&state=…   (Google sends the person here) →
 *        back to URL#p37auth={"nonce","refresh_token","access_token","expires_in"}
 *        or URL#p37auth_error=…
 *   POST {"refresh_token": "..."}       → {"access_token", "expires_in"}
 * URL must be on one of ALLOWED_ORIGINS. This script's own address must be
 * an authorized redirect URI of the OAuth client, exactly (no query).
 *
 * Settings, in a PHP file OUTSIDE the web root (see GOOGLE-DRIVE-SETUP.md):
 *   /etc/37player/google-config.php, or the path in the environment
 *   variable P37_GOOGLE_CONFIG:
 *
 *     <?php
 *     define('GOOGLE_CLIENT_ID', '1234-abc.apps.googleusercontent.com');
 *     define('GOOGLE_CLIENT_SECRET', 'GOCSPX-...');
 *     define('ALLOWED_ORIGINS', ['https://37player.com', 'https://test.37player.com']);
 *     // optional: this script's address, if it can't be worked out
 *     define('TOKEN_URL', 'https://37player.com/token.php');
 */

$config = getenv('P37_GOOGLE_CONFIG') ?: '/etc/37player/google-config.php';
if (is_file($config)) require $config;
// Tests only: a fake Google (never set in production).
if (!defined('GOOGLE_TOKEN_ENDPOINT')) define('GOOGLE_TOKEN_ENDPOINT', getenv('P37_GOOGLE_TOKEN_ENDPOINT') ?: 'https://oauth2.googleapis.com/token');
if (!defined('GOOGLE_AUTH_ENDPOINT')) define('GOOGLE_AUTH_ENDPOINT', getenv('P37_GOOGLE_AUTH_ENDPOINT') ?: 'https://accounts.google.com/o/oauth2/v2/auth');
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

$allowed = defined('ALLOWED_ORIGINS') ? ALLOWED_ORIGINS : ['https://37player.com'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function out($code, $v) { http_response_code($code); header('Content-Type: application/json'); echo json_encode($v, JSON_UNESCAPED_SLASHES); exit; }
function self_url() {
    if (defined('TOKEN_URL')) return TOKEN_URL;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    return ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
}
// Where to send the person back to: only 37 Player's own pages.
function allowed_return($url, $allowed) {
    $p = parse_url($url);
    if (!$p || empty($p['scheme']) || empty($p['host'])) return false;
    $o = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    return in_array($o, $allowed, true);
}
function back($return, $key, $value) {
    header('Location: ' . strtok($return, '#') . '#' . $key . '=' . rawurlencode($value), true, 302);
    exit;
}
function google_token($form) {
    $form['client_id'] = GOOGLE_CLIENT_ID;
    $form['client_secret'] = GOOGLE_CLIENT_SECRET;
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query($form),
        'timeout' => 20,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents(GOOGLE_TOKEN_ENDPOINT, false, $ctx);
    if ($body === false) return [502, ['error' => 'google_unreachable']];
    $status = 502;
    foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $status = intval($m[1]);
    $g = json_decode($body, true);
    if (!is_array($g)) return [502, ['error' => 'bad_reply_from_google']];
    if ($status !== 200 || empty($g['access_token'])) return [$status === 400 || $status === 401 ? $status : 502, ['error' => $g['error'] ?? 'token_failed']];
    $reply = ['access_token' => $g['access_token'], 'expires_in' => intval($g['expires_in'] ?? 3600)];
    if (!empty($g['refresh_token'])) $reply['refresh_token'] = $g['refresh_token'];
    return [200, $reply];
}

$op = $_GET['op'] ?? '';
// Is Google Drive set up here? (37 Player asks before sending anyone to sign in.)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $op === 'status') out(200, ['configured' => defined('GOOGLE_CLIENT_ID') && defined('GOOGLE_CLIENT_SECRET')]);
if (!defined('GOOGLE_CLIENT_ID') || !defined('GOOGLE_CLIENT_SECRET')) out(503, ['error' => 'not_configured']);

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $op === 'start') {
    $return = $_GET['return'] ?? '';
    $nonce = $_GET['nonce'] ?? '';
    if (!allowed_return($return, $allowed) || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $nonce)) out(400, ['error' => 'bad_request']);
    $state = rtrim(strtr(base64_encode(json_encode(['r' => $return, 'n' => $nonce])), '+/', '-_'), '=');
    header('Location: ' . GOOGLE_AUTH_ENDPOINT . '?' . http_build_query([
        'client_id' => GOOGLE_CLIENT_ID,
        'redirect_uri' => self_url(),
        'response_type' => 'code',
        'scope' => DRIVE_SCOPE,
        'access_type' => 'offline',   // a refresh token…
        'prompt' => 'consent',        // …every time, not only the first
        'include_granted_scopes' => 'true',
        'state' => $state,
    ]), true, 302);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['state']) && (isset($_GET['code']) || isset($_GET['error']))) {
    $s = json_decode(base64_decode(strtr($_GET['state'] ?? '', '-_', '+/')), true);
    $return = is_array($s) ? ($s['r'] ?? '') : '';
    $nonce = is_array($s) ? ($s['n'] ?? '') : '';
    if (!allowed_return($return, $allowed)) out(400, ['error' => 'bad_state']);
    if (!empty($_GET['error'])) back($return, 'p37auth_error', $_GET['error']);
    if (empty($_GET['code'])) back($return, 'p37auth_error', 'no_code');
    [$code, $reply] = google_token(['grant_type' => 'authorization_code', 'code' => $_GET['code'], 'redirect_uri' => self_url()]);
    if ($code !== 200) back($return, 'p37auth_error', $reply['error'] ?? 'token_failed');
    $reply['nonce'] = $nonce;
    back($return, 'p37auth', json_encode($reply, JSON_UNESCAPED_SLASHES));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($origin !== '' && !in_array($origin, $allowed, true)) out(403, ['error' => 'origin_not_allowed']);
    $req = json_decode(file_get_contents('php://input', false, null, 0, 16384), true);
    if (!is_array($req) || !isset($req['refresh_token']) || !is_string($req['refresh_token'])) out(400, ['error' => 'bad_request']);
    [$code, $reply] = google_token(['grant_type' => 'refresh_token', 'refresh_token' => $req['refresh_token']]);
    out($code, $reply);
}

out(400, ['error' => 'unknown_request']);
