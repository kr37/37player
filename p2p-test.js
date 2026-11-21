/*
 * 37 Player — Wi-Fi share test (a test only, on the wifitest branch).
 *
 * Answers, on real devices and networks, what the Wi-Fi share design depends on:
 *   1. Does this browser / the desktop app's web view have WebRTC at all?
 *   2. Can two devices on the same Wi-Fi connect directly with NO outside
 *      server for the connection itself (no STUN, no TURN)? If not, does
 *      adding STUN help? Does using real local addresses (microphone
 *      permission) help?
 *   3. How fast does data go, each way? (A real recording too, played back.)
 *   4. Does the connection survive a screen being locked or the window hidden?
 *
 * Runs two ways:
 *   - as a page: p2p-test.html (Safari, Chrome, Brave, a phone);
 *   - inside the desktop app: paste into its console (right-click → Inspect
 *     Element → Console)
 *       var s=document.createElement('script');s.src='https://test.37player.com/p2p-test.js?'+Date.now();document.body.append(s)
 *     and it opens over the app as a panel.
 * Devices meet through p2p-test.php beside this file (a 4-digit room code).
 * Results go to feedback.php (filed in kr37/37player-reports) or Copy.
 */
(function () {
  'use strict';
  if (window.__p37p2p) { window.__p37p2p.show(); return; }

  var VERSION = 'p2p-test 6';
  var SRC = (document.currentScript && document.currentScript.src) || location.href;
  var BASE = new URL('.', SRC).href;
  var MAILBOX = BASE + 'p2p-test.php';
  var IN_APP = location.protocol === 'tauri:' || location.hostname === 'tauri.localhost' || !!window.__TAURI__;
  var FEEDBACK = IN_APP ? 'https://37player.com/feedback.php' : BASE + 'feedback.php';
  var STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
  var CHUNK = 64 * 1024;
  var T0 = Date.now();

  // ---------- small helpers ----------
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }
  function secs(ms) { return (ms / 1000).toFixed(1) + ' s'; }
  function rate(bytes, ms) { var r = bytes / 1048576 / (ms / 1000); return r.toFixed(1) + ' MB/s (' + (r * 8.39).toFixed(0) + ' Mbit/s)'; }
  function withTimeout(p, ms, what) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(what + ': no answer after ' + secs(ms))); }, ms); })]);
  }
  function where() {
    var ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1;
    if (IN_APP) return /Windows/.test(ua) ? 'Windows app' : /Mac/.test(ua) ? 'Mac app' : 'desktop app';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android ' + (/Chrome/.test(ua) ? 'Chrome' : 'browser');
    var b = navigator.brave ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'browser';
    var os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    return (os ? os + ' ' : '') + b;
  }
  function osVersion() {
    var ua = navigator.userAgent, m;
    if ((m = ua.match(/Mac OS X ([0-9_]+)/))) return 'macOS ' + m[1].replace(/_/g, '.') + ' (as reported)';
    if ((m = ua.match(/Android ([0-9.]+)/))) return 'Android ' + m[1];
    if ((m = ua.match(/OS ([0-9_]+) like Mac/))) return 'iOS ' + m[1].replace(/_/g, '.');
    return '';
  }

  // ---------- the log ----------
  var lines = [];
  var summary = {};    // key results, shown at the top of the report
  function L(msg, cls) {
    var t = ((Date.now() - T0) / 1000).toFixed(1).padStart(6, ' ');
    var line = t + '  ' + msg;
    lines.push(line);
    if (ui.log) {
      var d = document.createElement('div');
      d.textContent = line;
      if (cls) d.className = cls;
      ui.log.appendChild(d);
      ui.log.scrollTop = ui.log.scrollHeight;
    }
    try { console.log('[p2p-test] ' + msg); } catch (e) {}
  }
  function S(key, val) { summary[key] = val; renderSummary(); }

  // ---------- UI ----------
  var ui = {};
  var css = [
    '#p37p2p{position:fixed;inset:0;z-index:2147483000;background:#15181d;color:#e8e8e8;font:15px/1.4 -apple-system,system-ui,sans-serif;overflow:auto;padding:14px;box-sizing:border-box}',
    '#p37p2p *{box-sizing:border-box}',
    '#p37p2p h1{font-size:20px;margin:0 0 4px}',
    '#p37p2p h2{font-size:16px;margin:16px 0 6px;color:#f0c674}',
    '#p37p2p .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}',
    '#p37p2p button{font:inherit;padding:9px 14px;border-radius:8px;border:1px solid #5a6270;background:#2b313b;color:#fff;cursor:pointer;min-height:40px}',
    '#p37p2p button.go{background:#2d5a8a;border-color:#4b84c4}',
    '#p37p2p button:disabled{opacity:.4;cursor:default}',
    '#p37p2p input[type=text]{font:inherit;padding:8px;border-radius:6px;border:1px solid #5a6270;background:#0f1216;color:#fff;width:11em}',
    '#p37p2p input.code{width:5.5em;font-size:20px;letter-spacing:.15em;text-align:center}',
    '#p37p2p .big{font-size:22px;font-weight:600;margin:8px 0}',
    '#p37p2p .ok{color:#7ddc7d}#p37p2p .bad{color:#ff7b72}#p37p2p .warn{color:#f0c674}',
    '#p37p2p .log{background:#0b0d10;border:1px solid #333;border-radius:6px;font:12px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;max-height:40vh;overflow:auto;padding:6px;margin-top:6px}',
    '#p37p2p .sum{background:#1d2229;border-radius:6px;padding:8px;font-size:14px}',
    '#p37p2p .sum div{margin:2px 0}',
    '#p37p2p .muted{color:#9aa3ad;font-size:13px}',
    '#p37p2p .close{position:absolute;top:10px;right:12px}',
    '#p37p2p audio{width:100%;max-width:480px}',
    '#p37p2p code{background:#0b0d10;padding:2px 4px;border-radius:4px;font-size:12px;word-break:break-all}'
  ].join('\n');

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, fn, cls) { var b = el('button', cls ? { class: cls } : null, label); b.addEventListener('click', fn); return b; }

  function build() {
    var st = el('style'); st.textContent = css; document.head.appendChild(st);
    var root = el('div', { id: 'p37p2p' });
    ui.root = root;
    // Keys typed here mustn't reach the app's shortcuts (Space plays, letters edit).
    ['keydown', 'keyup', 'keypress'].forEach(function (k) { root.addEventListener(k, function (e) { e.stopPropagation(); }); });

    if (IN_APP) root.appendChild(btn('Close', function () { root.style.display = 'none'; }, 'close'));
    root.appendChild(el('h1', null, 'Wi-Fi share test'));
    root.appendChild(el('div', { class: 'muted' }, VERSION + ' · ' + where() + (osVersion() ? ' · ' + osVersion() : '')));

    var nameRow = el('div', { class: 'row' });
    nameRow.appendChild(el('span', null, 'This device:'));
    ui.name = el('input', { type: 'text' });
    var saved = ''; try { saved = localStorage.getItem('p37p2p.name') || ''; } catch (e) {}
    ui.name.value = saved || where();
    ui.name.addEventListener('change', function () { try { localStorage.setItem('p37p2p.name', ui.name.value); } catch (e) {} });
    nameRow.appendChild(ui.name);
    nameRow.appendChild(el('span', { class: 'muted' }, '(e.g. "Mac mini app", "MacBook Safari", "Pixel")'));
    root.appendChild(nameRow);

    root.appendChild(el('h2', null, '1. This device'));
    ui.check = el('div', { class: 'big' }, 'Checking…');
    root.appendChild(ui.check);
    var r1 = el('div', { class: 'row' });
    r1.appendChild(btn('Check again', function () { checkDevice(); }));
    root.appendChild(r1);

    root.appendChild(el('h2', null, '2. Connect to another device'));
    root.appendChild(el('div', { class: 'muted' }, 'On one device press Start and read out the code; on the other type the code and press Join. Same Wi-Fi.'));
    var r2 = el('div', { class: 'row' });
    ui.start = btn('Start (show a code)', startRoom, 'go');
    r2.appendChild(ui.start);
    r2.appendChild(el('span', null, 'or'));
    ui.code = el('input', { type: 'text', class: 'code', inputmode: 'numeric', maxlength: '4', placeholder: '0000' });
    r2.appendChild(ui.code);
    ui.join = btn('Join', joinRoom, 'go');
    r2.appendChild(ui.join);
    root.appendChild(r2);
    var r2b = el('div', { class: 'row' });
    ui.mic = el('input', { type: 'checkbox', id: 'p37p2p-mic' });
    var lab = el('label', { for: 'p37p2p-mic' }, ' Use real local addresses (asks for the microphone; only if connecting fails)');
    r2b.appendChild(ui.mic); r2b.appendChild(lab);
    root.appendChild(r2b);
    ui.status = el('div', { class: 'big' }, 'Not connected');
    root.appendChild(ui.status);
    ui.again = btn('Connect again', function () { if (role === 'b') sendHello(); else L('Press Connect again on the device that joined.', 'warn'); });
    ui.again.disabled = true;
    var r2c = el('div', { class: 'row' });
    r2c.appendChild(ui.again);
    r2c.appendChild(btn('Start over (pair with another device)', startOver));
    root.appendChild(r2c);

    root.appendChild(el('h2', null, '3. Tests (once connected)'));
    var r3 = el('div', { class: 'row' });
    ui.speed = btn('Speed test: 100 MB each way', function () { speedTest(100); }, 'go');
    ui.speedSmall = btn('Quick: 20 MB each way', function () { speedTest(20); });
    r3.appendChild(ui.speed); r3.appendChild(ui.speedSmall);
    root.appendChild(r3);
    var r4 = el('div', { class: 'row' });
    ui.file = el('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.webm' });
    ui.file.style.display = 'none';
    ui.file.addEventListener('change', function () { var f = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (f) sendFile(f); });
    ui.sendFile = btn('Send a recording…', function () { ui.file.click(); });
    r4.appendChild(ui.sendFile); r4.appendChild(ui.file);
    ui.lock = btn('Screen-lock test (60 s)', lockTest);
    r4.appendChild(ui.lock);
    root.appendChild(r4);
    ui.received = el('div');
    root.appendChild(ui.received);

    root.appendChild(el('h2', null, '4. Results'));
    ui.sum = el('div', { class: 'sum' });
    root.appendChild(ui.sum);
    var r5 = el('div', { class: 'row' });
    ui.send = btn('Send results to Claude', sendResults, 'go');
    r5.appendChild(ui.send);
    r5.appendChild(btn('Copy results', copyResults));
    ui.sent = el('span', { class: 'muted' });
    r5.appendChild(ui.sent);
    root.appendChild(r5);
    root.appendChild(el('div', { class: 'muted' }, 'Send on one device of each pair: it brings the other device\'s log along.'));
    ui.log = el('div', { class: 'log' });
    root.appendChild(ui.log);

    if (!IN_APP) {
      root.appendChild(el('h2', null, 'For the desktop app'));
      root.appendChild(el('div', { class: 'muted' }, 'In 37 Player (the app): right-click → Inspect Element → Console, paste this line, press Return:'));
      var line = "var s=document.createElement('script');s.src='" + BASE + "p2p-test.js?'+Date.now();document.body.append(s)";
      var c = el('code', null, line);
      root.appendChild(c);
      root.appendChild(btn('Copy that line', function () { copyText(line); L('Copied the line for the app.'); }));
    }

    (document.getElementById('p2p-standalone') || document.body).appendChild(root);
    setConnectedUI(false);
    renderSummary();
  }

  function renderSummary() {
    if (!ui.sum) return;
    ui.sum.textContent = '';
    var keys = Object.keys(summary);
    if (!keys.length) { ui.sum.appendChild(el('div', { class: 'muted' }, 'Nothing yet.')); return; }
    keys.forEach(function (k) { ui.sum.appendChild(el('div', null, k + ': ' + summary[k])); });
  }
  function setStatus(text, cls) { ui.status.textContent = text; ui.status.className = 'big ' + (cls || ''); }
  function setConnectedUI(on) {
    [ui.speed, ui.speedSmall, ui.sendFile, ui.lock].forEach(function (b) { b.disabled = !on; });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); });
    fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = el('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }

  // ---------- 1. this device ----------
  function candInfo(c) {
    // "candidate:… 1 udp 2113937151 abcd.local 54321 typ host …"
    var p = (c || '').split(' ');
    var addr = p[4] || '', type = (p[7] || '');
    var kind = /\.local$/.test(addr) ? 'mDNS name' : /:/.test(addr) ? 'IPv6' : /^\d+\.\d+\.\d+\.\d+$/.test(addr) ? 'IPv4 ' + addr : addr;
    return { type: type, proto: (p[2] || '').toLowerCase(), kind: kind };
  }
  function waitGather(pc, ms) {
    return new Promise(function (res) {
      if (pc.iceGatheringState === 'complete') return res();
      var t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  async function checkDevice() {
    ui.check.textContent = 'Checking…'; ui.check.className = 'big';
    L('— Device check — ' + where() + ' · ' + navigator.userAgent);
    L('Secure context: ' + window.isSecureContext + ' · page: ' + location.protocol + '//' + location.host);
    var has = typeof window.RTCPeerConnection === 'function';
    L('RTCPeerConnection: ' + (has ? 'yes' : 'NO') + ' · RTCDataChannel: ' + (typeof window.RTCDataChannel));
    if (!has) {
      ui.check.textContent = '✗ No WebRTC here'; ui.check.className = 'big bad';
      S('WebRTC on ' + ui.name.value, 'NOT AVAILABLE');
      return;
    }
    // Which addresses would this device offer, with no outside server?
    try {
      var pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('probe');
      var cands = [];
      pc.onicecandidate = function (e) { if (e.candidate && e.candidate.candidate) cands.push(candInfo(e.candidate.candidate)); };
      await pc.setLocalDescription(await pc.createOffer());
      await waitGather(pc, 5000);
      pc.close();
      var desc = cands.map(function (c) { return c.type + '/' + c.proto + '/' + c.kind; });
      L('Own addresses offered (no server): ' + (desc.join(', ') || 'none'));
      S('Own addresses (' + ui.name.value + ')', desc.length ? desc.join(', ') : 'none');
    } catch (e) { L('Gathering failed: ' + e, 'bad'); }
    // Loopback: two connections inside this page, so we know WebRTC itself works here.
    try {
      var r = await loopback(32 * 1048576);
      L('Loopback inside this device: 32 MB in ' + secs(r.ms) + ' = ' + rate(32 * 1048576, r.ms) + (r.max ? ' · max message ' + r.max : ''), 'ok');
      ui.check.textContent = '✓ WebRTC works here (' + rate(32 * 1048576, r.ms).split(' (')[0] + ' within the device)'; ui.check.className = 'big ok';
      S('WebRTC on ' + ui.name.value, 'yes; loopback ' + rate(32 * 1048576, r.ms));
    } catch (e) {
      L('Loopback failed: ' + (e && e.message || e), 'bad');
      ui.check.textContent = '⚠ WebRTC is here but a test connection inside this device failed'; ui.check.className = 'big warn';
      S('WebRTC on ' + ui.name.value, 'present, loopback FAILED: ' + (e && e.message || e));
    }
  }

  async function loopback(total) {
    var a = new RTCPeerConnection({ iceServers: [] }), b = new RTCPeerConnection({ iceServers: [] });
    try {
      var da = a.createDataChannel('t', { ordered: true });
      da.binaryType = 'arraybuffer';
      var dbP = new Promise(function (res) { b.ondatachannel = function (e) { res(e.channel); }; });
      await a.setLocalDescription(await a.createOffer()); await waitGather(a, 5000);
      await b.setRemoteDescription(a.localDescription);
      await b.setLocalDescription(await b.createAnswer()); await waitGather(b, 5000);
      await a.setRemoteDescription(b.localDescription);
      await withTimeout(new Promise(function (res) { if (da.readyState === 'open') res(); da.onopen = res; }), 10000, 'loopback connect');
      var db = await withTimeout(dbP, 5000, 'loopback channel');
      db.binaryType = 'arraybuffer';
      var got = 0, t0 = performance.now();
      var done = new Promise(function (res) { db.onmessage = function (e) { got += e.data.byteLength || e.data.size || 0; if (got >= total) res(); }; });
      await pump(da, total, null);
      await withTimeout(done, 120000, 'loopback transfer');
      return { ms: performance.now() - t0, max: a.sctp && a.sctp.maxMessageSize };
    } finally { a.close(); b.close(); }
  }

  // ---------- data: generated chunks, checked on arrival ----------
  function makeChunk(idx, n) {
    var words = new Uint32Array(Math.ceil(n / 4));
    var x = (idx + 1) * 2654435761 >>> 0 || 1;
    for (var i = 0; i < words.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; words[i] = x; }
    words[0] = idx;
    return words.buffer.byteLength === n ? words.buffer : words.buffer.slice(0, n);
  }
  function checkChunk(buf, expectIdx) {
    var w = new Uint32Array(buf, 0, Math.min(16, buf.byteLength >> 2));
    if (w[0] !== expectIdx) return false;
    var x = (expectIdx + 1) * 2654435761 >>> 0 || 1;
    for (var i = 0; i < w.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; if (i > 0 && w[i] !== x) return false; }
    return true;
  }
  async function waitLow(dc) {
    if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) return;
    await new Promise(function (res) {
      var done = false; function f() { if (done) return; done = true; dc.removeEventListener('bufferedamountlow', f); res(); }
      dc.addEventListener('bufferedamountlow', f); setTimeout(f, 1000);
    });
  }
  // Sends `total` bytes of generated data (or the parts of a file).
  async function pump(dc, total, progress, file) {
    dc.bufferedAmountLowThreshold = 1 << 20;
    var sent = 0, idx = 0, lastP = 0;
    while (sent < total) {
      if (dc.readyState !== 'open') throw new Error('channel closed after ' + mb(sent));
      if (dc.bufferedAmount > (4 << 20)) { await waitLow(dc); continue; }
      var n = Math.min(CHUNK, total - sent), data;
      if (file) data = await file.slice(sent, sent + n).arrayBuffer();
      else data = makeChunk(idx, n);
      dc.send(data);
      sent += n; idx++;
      if (progress && performance.now() - lastP > 250) { lastP = performance.now(); progress(sent); }
    }
    if (progress) progress(sent);
  }

  // ---------- 2. connecting ----------
  var role = null, room = null, inboxAfter = 0, polling = false, attempt = 0;
  var pc = null, dc = null, connectedAt = 0, peer = {};
  var hbTimer = null, lastHeard = 0, gaps = [];

  async function post(to, msg) {
    var r = await fetch(MAILBOX + '?op=put&room=' + room + '&to=' + to, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
    if (!r.ok) throw new Error('noticeboard said ' + r.status);
  }
  async function poll() {
    if (polling) return; polling = true;
    var fails = 0;
    while (room) {
      try {
        var r = await fetch(MAILBOX + '?op=get&room=' + room + '&to=' + role + '&after=' + inboxAfter, { cache: 'no-store' });
        var j = await r.json();
        fails = 0;
        inboxAfter = j.next;
        for (var i = 0; i < j.msgs.length; i++) await onSignal(j.msgs[i]);
      } catch (e) { if (++fails === 3) L('Noticeboard unreachable: ' + e, 'bad'); }
      await sleep(dc && dc.readyState === 'open' ? 2000 : 700);
    }
    polling = false;
  }

  function startOver() {
    attempt++;                       // any pending attempt timer now does nothing
    var was = room; room = null; role = null; inboxAfter = 0;
    stopHeartbeat();
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null; dc = null; rx = null; busy = false; peer = {}; lastHeard = 0;
    ui.start.disabled = false; ui.join.disabled = false; ui.again.disabled = true; ui.code.value = '';
    setConnectedUI(false); setStatus('Not connected');
    ui.received.textContent = '';
    L('— Started over' + (was ? ' (left room ' + was + ')' : '') + ' —');
  }

  async function startRoom() {
    room = String(Math.floor(1000 + Math.random() * 9000)); role = 'a'; inboxAfter = 0;
    try { await fetch(MAILBOX + '?op=clear&room=' + room + '&to=a', { method: 'POST' }); }
    catch (e) { L('Can\'t reach the noticeboard (' + MAILBOX + '): ' + e, 'bad'); setStatus('Can\'t reach the noticeboard', 'bad'); return; }
    ui.code.value = room; ui.start.disabled = true; ui.join.disabled = true;
    setStatus('Code: ' + room + ' — type it on the other device', 'warn');
    L('Started room ' + room + ' as the first device. Waiting for the other device…');
    poll();
  }
  function joinRoom() {
    var c = (ui.code.value || '').replace(/\D/g, '');
    if (c.length !== 4) { setStatus('Type the 4-digit code first', 'warn'); return; }
    room = c; role = 'b'; inboxAfter = 0; ui.start.disabled = true; ui.join.disabled = true; ui.again.disabled = false;
    L('Joining room ' + room + '…');
    poll();
    sendHello();
  }
  async function sendHello(stun) {
    attempt++;
    var a = attempt;
    var useStun = !!stun;
    setStatus('Connecting' + (useStun ? ' (with STUN)' : ' (local only)') + '…', 'warn');
    L('Attempt ' + a + ': ' + (useStun ? 'with a STUN server' : 'local only, no outside server') + (ui.mic.checked ? ', real local addresses' : ''));
    try { await post('a', { t: 'hello', attempt: a, stun: useStun, name: ui.name.value, where: where() }); }
    catch (e) { L('Couldn\'t reach the noticeboard: ' + e, 'bad'); return; }
    // The joiner decides when an attempt has failed and tries the next way.
    setTimeout(function () {
      if (attempt !== a || (dc && dc.readyState === 'open')) return;
      L('Attempt ' + a + ' didn\'t connect within 20 s.', 'bad');
      S('Attempt ' + a + (useStun ? ' (STUN)' : ' (local only)'), 'FAILED (no connection in 20 s)');
      if (!useStun) sendHello(true);
      else setStatus('Couldn\'t connect. Try "Use real local addresses" on both, then Connect again.', 'bad');
    }, 20000);
  }

  async function maybeMic() {
    if (!ui.mic.checked) return;
    try {
      var s = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 15000, 'microphone permission');
      s.getTracks().forEach(function (t) { t.stop(); });
      L('Microphone allowed: real local addresses will be used.');
    } catch (e) { L('Microphone not allowed (' + (e && e.message || e) + '): carrying on with hidden addresses.', 'warn'); }
  }

  function newPc(useStun, a) {
    if (pc) { try { pc.close(); } catch (e) {} }
    dc = null; setConnectedUI(false);
    pc = new RTCPeerConnection({ iceServers: useStun ? STUN : [] });
    var started = performance.now();
    pc.onconnectionstatechange = function () { L('Connection: ' + pc.connectionState + ' (attempt ' + a + ')'); if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus('Connection ' + pc.connectionState, 'bad'); };
    pc.oniceconnectionstatechange = function () { L('ICE: ' + pc.iceConnectionState); };
    pc._started = started; pc._attempt = a; pc._stun = useStun;
    return pc;
  }

  async function onSignal(m) {
    if (m.t === 'hello' && role === 'a') {
      attempt = m.attempt;
      peer.name = m.name;
      L('“' + m.name + '” (' + m.where + ') asked to connect: attempt ' + m.attempt + (m.stun ? ' with STUN' : ' local only'));
      setStatus('Connecting to ' + m.name + '…', 'warn');
      await maybeMic();
      var p = newPc(m.stun, m.attempt);
      var d = p.createDataChannel('p37', { ordered: true });
      setupChannel(d, p);
      await p.setLocalDescription(await p.createOffer());
      await waitGather(p, m.stun ? 8000 : 4000);
      await post('b', { t: 'offer', attempt: m.attempt, stun: !!m.stun, sdp: p.localDescription.sdp, name: ui.name.value, where: where() });
      L('Sent the offer (' + countCands(p.localDescription.sdp) + ').');
    } else if (m.t === 'offer' && role === 'b') {
      if (m.attempt !== attempt) return;
      peer.name = m.name;
      await maybeMic();
      var q = newPc(!!m.stun, m.attempt);
      q.ondatachannel = function (e) { setupChannel(e.channel, q); };
      await q.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await q.setLocalDescription(await q.createAnswer());
      await waitGather(q, 6000);
      await post('a', { t: 'answer', attempt: m.attempt, sdp: q.localDescription.sdp });
      L('Got the offer from “' + m.name + '” (' + countCands(m.sdp) + '); sent the answer (' + countCands(q.localDescription.sdp) + ').');
    } else if (m.t === 'answer' && role === 'a') {
      if (!pc || pc._attempt !== m.attempt) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      L('Got the answer (' + countCands(m.sdp) + ').');
    }
  }
  function countCands(sdp) {
    var c = (sdp.match(/^a=candidate:.*$/gm) || []).map(function (l) { return candInfo(l.slice(2)); });
    if (!c.length) return 'no addresses';
    var kinds = {}; c.forEach(function (x) { var k = x.type + ' ' + (x.kind.indexOf('IPv4') === 0 ? 'IPv4' : x.kind); kinds[k] = (kinds[k] || 0) + 1; });
    return Object.keys(kinds).map(function (k) { return kinds[k] + '× ' + k; }).join(', ');
  }

  function setupChannel(d, p) {
    dc = d; dc.binaryType = 'arraybuffer';
    dc.onopen = async function () {
      connectedAt = Date.now();
      var ms = performance.now() - p._started;
      setConnectedUI(true); ui.again.disabled = role !== 'b';
      dc.send(JSON.stringify({ t: 'info', name: ui.name.value, where: where(), ua: navigator.userAgent }));
      var path = await describePath(p);
      setStatus('✓ Connected to ' + (peer.name || 'the other device') + ' (' + path.short + ')', 'ok');
      L('CONNECTED in ' + secs(ms) + ' on attempt ' + p._attempt + (p._stun ? ' (with STUN)' : ' (local only)') + ' · path: ' + path.long + (p.sctp && p.sctp.maxMessageSize ? ' · max message ' + p.sctp.maxMessageSize : ''), 'ok');
      S('Connected ' + ui.name.value + ' ↔ ' + (peer.name || '?'), 'yes, attempt ' + p._attempt + (p._stun ? ' (STUN)' : ' (local only)') + ', ' + secs(ms) + ', ' + path.long);
      startHeartbeat();
    };
    dc.onclose = function () { L('Channel closed.', 'bad'); setConnectedUI(false); setStatus('Disconnected', 'bad'); stopHeartbeat(); ui.again.disabled = role !== 'b'; };
    dc.onerror = function (e) { L('Channel error: ' + (e && e.error && e.error.message || e), 'bad'); };
    dc.onmessage = onMessage;
  }

  async function describePath(p) {
    try {
      var st = await p.getStats(), pair = null, byId = {};
      st.forEach(function (r) { byId[r.id] = r; });
      st.forEach(function (r) { if (r.type === 'transport' && r.selectedCandidatePairId) pair = byId[r.selectedCandidatePairId]; });
      if (!pair) st.forEach(function (r) { if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = pair || r; });
      if (!pair) return { short: 'path unknown', long: 'path unknown' };
      var lc = byId[pair.localCandidateId] || {}, rc = byId[pair.remoteCandidateId] || {};
      var rtt = pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) + ' ms' : '?';
      function c(x) { return (x.candidateType || '?') + (x.address || x.ip ? ' ' + (x.address || x.ip) : '') + (x.networkType ? ' ' + x.networkType : ''); }
      var proto = lc.protocol || rc.protocol || '?';
      var direct = lc.candidateType === 'host' && rc.candidateType === 'host';
      return { short: direct ? 'direct on the local network' : lc.candidateType + '↔' + rc.candidateType, long: c(lc) + ' ↔ ' + c(rc) + ' over ' + proto + ', round trip ' + rtt };
    } catch (e) { return { short: 'path unknown', long: 'stats failed: ' + e }; }
  }

  // ---------- heartbeat: is the connection alive through a lock or a hidden window? ----------
  function startHeartbeat() {
    stopHeartbeat(); lastHeard = Date.now();
    hbTimer = setInterval(function () {
      if (!dc || dc.readyState !== 'open') return;
      try { dc.send(JSON.stringify({ t: 'hb', at: Date.now() })); } catch (e) {}
    }, 1000);
  }
  function stopHeartbeat() { if (hbTimer) clearInterval(hbTimer); hbTimer = null; }
  document.addEventListener('visibilitychange', function () { L('This page is now ' + document.visibilityState + '.'); });
  window.addEventListener('pagehide', function () { L('pagehide'); });
  window.addEventListener('pageshow', function () { L('pageshow'); });

  // ---------- messages ----------
  var rx = null;          // what binary data is arriving: {kind:'bulk'|'file', …}
  var waiters = {};
  function waitFor(t, ms) { return withTimeout(new Promise(function (res) { waiters[t] = res; }), ms, t); }

  function onMessage(e) {
    if (typeof e.data !== 'string') return onBinary(e.data);
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    var now = Date.now();
    if (now - lastHeard > 3000 && lastHeard && !busy && !rx) { var g = now - lastHeard; gaps.push(g); L('Heard nothing from the other device for ' + secs(g) + ' (now back).', 'warn'); }
    lastHeard = now;
    if (m.t === 'hb') return;
    if (m.t === 'info') { peer.name = m.name; peer.where = m.where; peer.ua = m.ua; L('Other device: “' + m.name + '” · ' + m.where + ' · ' + m.ua); return; }
    if (m.t === 'bulk-start') { rx = { kind: 'bulk', total: m.total, got: 0, idx: 0, bad: 0, t0: performance.now(), id: m.id }; L('Receiving ' + mb(m.total) + ' of test data…'); return; }
    if (m.t === 'file-start') { rx = { kind: 'file', total: m.size, got: 0, parts: [], t0: performance.now(), name: m.name, type: m.type }; L('Receiving “' + m.name + '” (' + mb(m.size) + ')…'); return; }
    if (m.t === 'speed-request') { speedSend(m.mb, m.id).catch(function (x) { L('Sending failed: ' + x, 'bad'); }); return; }
    if (m.t === 'log-request') { dc.send(JSON.stringify({ t: 'log', text: reportText(false) })); return; }
    if (m.t === 'lock-start') { L('LOCK TEST started by the other device: if this is a phone, lock its screen now for about 20 s, then unlock.', 'warn'); setStatus('Lock test: lock this screen for ~20 s, then unlock', 'warn'); return; }
    if (waiters[m.t]) { var w = waiters[m.t]; delete waiters[m.t]; w(m); return; }
  }
  function onBinary(buf) {
    lastHeard = Date.now();
    if (!rx) return;
    if (buf instanceof Blob) { L('Got a Blob, not an ArrayBuffer: unexpected.', 'bad'); return; }
    if (rx.kind === 'bulk') {
      if (!checkChunk(buf, rx.idx)) rx.bad++;
      rx.idx++; rx.got += buf.byteLength;
      if (rx.got >= rx.total) {
        var ms = performance.now() - rx.t0;
        L('Received ' + mb(rx.got) + ' in ' + secs(ms) + ' = ' + rate(rx.got, ms) + (rx.bad ? ' · ' + rx.bad + ' DAMAGED pieces' : ' · every piece checked OK'), rx.bad ? 'bad' : 'ok');
        dc.send(JSON.stringify({ t: 'bulk-done', id: rx.id, bytes: rx.got, bad: rx.bad }));
        rx = null;
      }
    } else if (rx.kind === 'file') {
      rx.parts.push(buf); rx.got += buf.byteLength;
      if (rx.got >= rx.total) {
        var ms2 = performance.now() - rx.t0;
        var blob = new Blob(rx.parts, { type: rx.type || 'audio/mpeg' });
        L('Received “' + rx.name + '”: ' + mb(rx.got) + ' in ' + secs(ms2) + ' = ' + rate(rx.got, ms2), 'ok');
        S('Recording received on ' + ui.name.value, rx.name + ', ' + mb(rx.got) + ', ' + rate(rx.got, ms2) + ' (play it to check)');
        showAudio(blob, rx.name);
        dc.send(JSON.stringify({ t: 'file-done', bytes: rx.got }));
        rx = null;
      }
    }
  }
  function showAudio(blob, name) {
    ui.received.textContent = '';
    ui.received.appendChild(el('div', null, 'Received: ' + name + ' — press play to check it sounds right:'));
    var a = el('audio', { controls: '' });
    a.src = URL.createObjectURL(blob);
    a.addEventListener('playing', function () { L('Received recording is playing.', 'ok'); S('Received recording plays on ' + ui.name.value, 'yes'); });
    a.addEventListener('error', function () { L('Received recording would NOT play: ' + (a.error && a.error.code), 'bad'); S('Received recording plays on ' + ui.name.value, 'NO (error ' + (a.error && a.error.code) + ')'); });
    ui.received.appendChild(a);
  }

  // ---------- 3. tests ----------
  var busy = false;
  async function speedSend(n, id) {
    var total = n * 1048576;
    dc.send(JSON.stringify({ t: 'bulk-start', total: total, id: id }));
    var t0 = performance.now();
    var doneP = waitFor('bulk-done', 600000);
    await pump(dc, total, function (s) { setStatus('Sending ' + mb(s) + ' of ' + mb(total) + '…', 'warn'); });
    var d = await doneP;
    var ms = performance.now() - t0;
    var line = ui.name.value + ' → ' + (peer.name || 'other');
    L('SENT ' + mb(total) + ' ' + line + ' in ' + secs(ms) + ' = ' + rate(total, ms) + (d.bad ? ' · ' + d.bad + ' damaged on arrival' : ' · arrived intact'), d.bad ? 'bad' : 'ok');
    S('Speed ' + line, rate(total, ms) + ' (' + n + ' MB' + (d.bad ? ', ' + d.bad + ' damaged' : ', intact') + ')');
    setStatus('✓ Connected to ' + (peer.name || 'the other device'), 'ok');
    dc.send(JSON.stringify({ t: 'speed-sent', id: id, ms: ms, mb: n }));
  }
  async function speedTest(n) {
    if (busy || !dc) return; busy = true; setConnectedUI(false);
    try {
      var id = Date.now();
      L('— Speed test, ' + n + ' MB each way —');
      await speedSend(n, id);
      L('Now asking the other device to send ' + n + ' MB back…');
      var back = waitFor('speed-sent', 600000);
      dc.send(JSON.stringify({ t: 'speed-request', mb: n, id: id + 1 }));
      var b = await back;
      S('Speed ' + (peer.name || 'other') + ' → ' + ui.name.value, rate(n * 1048576, b.ms) + ' (' + n + ' MB)');
      setStatus('✓ Speed test done', 'ok');
    } catch (e) { L('Speed test stopped: ' + (e && e.message || e), 'bad'); S('Speed test', 'STOPPED: ' + (e && e.message || e)); }
    busy = false; setConnectedUI(dc && dc.readyState === 'open');
  }
  async function sendFile(f) {
    if (busy || !dc) return; busy = true; setConnectedUI(false);
    try {
      L('— Sending the recording “' + f.name + '” (' + mb(f.size) + ', ' + (f.type || 'no type') + ') —');
      dc.send(JSON.stringify({ t: 'file-start', name: f.name, size: f.size, type: f.type }));
      var t0 = performance.now(), doneP = waitFor('file-done', 600000);
      await pump(dc, f.size, function (s) { setStatus('Sending ' + mb(s) + ' of ' + mb(f.size) + '…', 'warn'); }, f);
      await doneP;
      var ms = performance.now() - t0;
      L('Recording delivered in ' + secs(ms) + ' = ' + rate(f.size, ms) + '. Play it on the other device.', 'ok');
      S('Recording sent ' + ui.name.value + ' → ' + (peer.name || 'other'), f.name + ', ' + mb(f.size) + ', ' + rate(f.size, ms));
      setStatus('✓ Recording sent: play it on the other device', 'ok');
    } catch (e) { L('Sending the recording stopped: ' + (e && e.message || e), 'bad'); }
    busy = false; setConnectedUI(dc && dc.readyState === 'open');
  }
  async function lockTest() {
    if (!dc) return;
    gaps = [];
    L('— Screen-lock test: 60 s. Lock the OTHER device\'s screen (or hide this app/close the lid on a Mac) for about 20 s, then wake it. —', 'warn');
    try { dc.send(JSON.stringify({ t: 'lock-start' })); } catch (e) {}
    var end = Date.now() + 60000;
    while (Date.now() < end) {
      setStatus('Lock test: ' + Math.ceil((end - Date.now()) / 1000) + ' s left · channel ' + (dc ? dc.readyState : 'gone'), 'warn');
      await sleep(1000);
    }
    var alive = dc && dc.readyState === 'open';
    var res = (alive ? 'connection survived' : 'connection LOST') + (gaps.length ? '; silent for ' + gaps.map(secs).join(', ') : '; no silences over 3 s');
    L('Lock test: ' + res, alive ? 'ok' : 'bad');
    S('Lock test (' + (peer.name || 'other') + ' locked)', res);
    setStatus(alive ? '✓ Connected' : 'Disconnected: press Connect again on the joining device', alive ? 'ok' : 'bad');
  }

  // ---------- 4. results ----------
  function reportText(withPeer) {
    var head = [VERSION + ' · ' + new Date().toISOString(), 'Device: ' + ui.name.value + ' · ' + where() + ' · ' + navigator.userAgent, ''];
    Object.keys(summary).forEach(function (k) { if (k[0] !== '_') head.push('* ' + k + ': ' + summary[k]); });
    return head.concat(['', '--- log ---']).concat(lines).join('\n');
  }
  async function sendResults() {
    ui.send.disabled = true; ui.sent.textContent = 'Sending…';
    var other = '';
    if (dc && dc.readyState === 'open') {
      try { var p = waitFor('log', 5000); dc.send(JSON.stringify({ t: 'log-request' })); other = (await p).text; }
      catch (e) { other = '(the other device\'s log didn\'t arrive: ' + e + ')'; }
    }
    var body = {
      message: 'Wi-Fi share test results (' + VERSION + ') from ' + ui.name.value + (peer.name ? ' with ' + peer.name : '') + '\n\n' + Object.keys(summary).filter(function (k) { return k[0] !== '_'; }).map(function (k) { return k + ': ' + summary[k]; }).join('\n'),
      version: VERSION, device: ui.name.value, browser: navigator.userAgent, library: '',
      logs: [{ name: 'p2p-this-device.txt', text: reportText() }].concat(other ? [{ name: 'p2p-other-device.txt', text: other }] : [])
    };
    try {
      var r = await fetch(FEEDBACK + '?op=send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.ok) { ui.sent.textContent = '✓ Sent (' + (j.id || '') + (j.filed ? ', filed for Claude' : ', mailed only') + ')'; L('Results sent: ' + JSON.stringify(j), 'ok'); }
      else { ui.sent.textContent = '✗ Not sent (' + r.status + ' ' + (j.error || '') + '): use Copy'; L('Sending results failed: ' + r.status + ' ' + JSON.stringify(j), 'bad'); }
    } catch (e) { ui.sent.textContent = '✗ Not sent (' + e + '): use Copy'; L('Sending results failed: ' + e, 'bad'); }
    ui.send.disabled = false;
  }
  async function copyResults() {
    var other = '';
    if (dc && dc.readyState === 'open') {
      try { var p = waitFor('log', 5000); dc.send(JSON.stringify({ t: 'log-request' })); other = '\n\n=== other device ===\n' + (await p).text; } catch (e) {}
    }
    copyText(reportText() + other);
    ui.sent.textContent = 'Copied: paste it into the chat.';
  }

  // ---------- start ----------
  function show() { if (ui.root) ui.root.style.display = ''; }
  window.__p37p2p = { show: show };
  build();
  L(VERSION + ' loaded in ' + where() + ' · noticeboard ' + MAILBOX + ' · results to ' + FEEDBACK);
  fetch(MAILBOX + '?op=ping', { cache: 'no-store' }).then(function (r) { return r.json(); })
    .then(function () { L('Noticeboard reachable.'); })
    .catch(function (e) { L('Noticeboard NOT reachable: ' + e, 'bad'); });
  checkDevice();
})();
