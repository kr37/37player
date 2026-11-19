<?php
/*
 * 37 Player — the website's manifest, with choices carried in its start
 * address (page 2.5.051; kr37, 19 Nov 2026).
 *
 * An iPhone or iPad's Home Screen app has storage of its own, apart from
 * Safari's, so it started as a new install and asked the language again
 * (kr37 watched someone set it up and think something had gone wrong). When
 * Install is chosen in a Safari tab, the page reloads with those choices in
 * its address and points its manifest here with the same ones; iOS makes the
 * Home Screen app from this manifest, so the app opens at
 * ./37-player.html?<the same choices> and takes them on its first start.
 *
 * Everything else is manifest.webmanifest, unchanged (its id stays
 * ./37-player.html, so installs made before carry on). Only these are let
 * through, each checked; anything else is dropped:
 *   lang  the language (two letters)
 *   sk    a shared library's kind: s (a join code) or g (Google Drive)
 *   sc    its join code;  su  its server, when not 37player.com's
 *   sf    the Google Drive library's folder ID
 *   sd    this device's name in it;  sn  the shared library's name
 * No sign-in or account is ever passed: the address ends up in the Home
 * Screen icon and in the web server's log.
 *
 *   GET ?lang=it&sk=s&sc=…  → application/manifest+json
 */
$m = json_decode((string)@file_get_contents(__DIR__ . '/manifest.webmanifest'), true);
if (!is_array($m)) { http_response_code(500); header('Content-Type: text/plain'); echo "manifest.webmanifest missing"; exit; }

function p37_text($v, $max) {
  if (!is_string($v)) return null;
  $v = trim($v);
  if ($v === '' || strlen($v) > $max || !mb_check_encoding($v, 'UTF-8') || preg_match('/[\x00-\x1f\x7f]/', $v)) return null;
  return $v;
}
$keep = [];
if (isset($_GET['lang']) && is_string($_GET['lang']) && preg_match('/^[a-z]{2}$/', $_GET['lang'])) $keep['lang'] = $_GET['lang'];
$sk = isset($_GET['sk']) && is_string($_GET['sk']) ? $_GET['sk'] : '';
if ($sk === 's' && ($code = p37_text($_GET['sc'] ?? null, 200)) !== null) {
  $keep['sk'] = 's'; $keep['sc'] = $code;
  $url = p37_text($_GET['su'] ?? null, 200);
  if ($url !== null && preg_match('#^https://[^\s/]+(/\S*)?$#', $url)) $keep['su'] = $url;
} elseif ($sk === 'g' && isset($_GET['sf']) && is_string($_GET['sf']) && preg_match('/^[A-Za-z0-9_-]{1,100}$/', $_GET['sf'])) {
  $keep['sk'] = 'g'; $keep['sf'] = $_GET['sf'];
}
if (isset($keep['sk'])) {
  if (($d = p37_text($_GET['sd'] ?? null, 60)) !== null) $keep['sd'] = $d;
  if (($n = p37_text($_GET['sn'] ?? null, 100)) !== null) $keep['sn'] = $n;
}
if ($keep) $m['start_url'] = './37-player.html?' . http_build_query($keep, '', '&', PHP_QUERY_RFC3986);

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
echo json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
