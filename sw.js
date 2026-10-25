// 37 Player's service worker: keeps a copy of the app page so it opens
// without an internet connection, and keeps it opening when the server
// sends something that isn't a working 37 Player.
//
// It looks after exactly two things — the app page itself and help.json —
// and lets every other request go straight to the network untouched (apart
// from files shared to the app, below). That matters because the app can
// share a site with other pages: at 37player.com the app is
// /37-player.html, next to an about page (/index.html) and the libraries/
// folder, none of which this should ever cache or intercept.
//
// Which page is "the app" comes from the registration scope, which the app
// sets when registering: its own file (e.g. /37-player.html) under the
// current layout, or a folder (e.g. /live/) under the older one, where the
// app is that folder's index.html.
//
// The app page is network-first: with a connection you get the latest
// version. But two copies are kept (1.4.091): the last version that started
// properly on this device ("good") and the newest one fetched ("new"), and
// the good copy opens instead whenever what the server sends can't be
// trusted:
//   - no connection, or no answer within NAV_TIMEOUT_MS;
//   - an error instead of the page (a 404 or 500: the droplet's site
//     partition unmounted gave "Page not found" at IKRC, 25 Oct 2026);
//   - a page without END_MARK as its last line (cut off: a half-finished
//     update on the server, a full disk);
//   - a version that didn't start: each page tells this worker "up" once it
//     has drawn its screen; one that hasn't within a minute tells it
//     "failed" (a watchdog at the top of the page, which runs even when the
//     rest of the page's script can't), and is then refused, until a
//     different file appears on the server. The page reloads into the good
//     copy and says why.
// help.json is network-first with a plain fallback, as before; it isn't
// pre-cached (it's optional).
const CACHE_NAME = "37player-shell-v5";
const NAV_TIMEOUT_MS = 8000;
const END_MARK = "<!-- 37 Player: end of file -->";

const SCOPE = new URL(self.registration.scope);
const SCOPE_IS_FILE = /\.html?$/i.test(SCOPE.pathname);
const APP_PATH = SCOPE_IS_FILE ? SCOPE.pathname : SCOPE.pathname + "index.html";
const FOLDER = SCOPE_IS_FILE ? SCOPE.pathname.replace(/[^/]*$/, "") : SCOPE.pathname;
const HELP_PATH = FOLDER + "help.json";
const GOOD_KEY = APP_PATH + "?37copy=good";
const NEW_KEY = APP_PATH + "?37copy=new";
const STATE_KEY = FOLDER + "__37player-sw-state";

self.addEventListener("install", (event) => {
  // A first copy, on a device that has none yet. A copy kept by an earlier
  // worker stays: it has run here, the page on the server may not have.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(GOOD_KEY) || await cache.match(APP_PATH)) return;
    try {
      const r = await fetch(APP_PATH, {cache: "no-cache"});
      if (r.ok) await cache.put(APP_PATH, htmlResponse(await r.text()));
    } catch (err) {}
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k)));
    // A copy kept by the worker before 1.4.091 ran on this device: the good one.
    const cache = await caches.open(CACHE_NAME);
    if (!(await cache.match(GOOD_KEY))) {
      const old = await cache.match(APP_PATH);
      if (old) {
        const text = await old.text();
        await cache.put(GOOD_KEY, htmlResponse(text));
        const st = await loadState();
        st.good = {v: versionOf(text), h: await hashOf(text)};
        await saveState(st);
      }
    }
    await self.clients.claim();
  })());
});

// ---- The two copies, and what's known about them
function complete(text) { return text.trimEnd().endsWith(END_MARK); }
function versionOf(text) { const m = text.slice(0, 2000).match(/<meta name="app-version" content="([^"]+)"/); return m ? m[1] : ""; }
async function hashOf(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}
function htmlResponse(text) { return new Response(text, {status: 200, headers: {"Content-Type": "text/html; charset=utf-8"}}); }
// {good: {v, h}, fresh: {v, h}, bad: [h…], reverted: {from, to} | null}
async function loadState() {
  try { const r = await (await caches.open(CACHE_NAME)).match(STATE_KEY); if (r) return Object.assign({bad: []}, await r.json()); } catch (err) {}
  return {bad: []};
}
async function saveState(st) {
  await (await caches.open(CACHE_NAME)).put(STATE_KEY, new Response(JSON.stringify(st), {headers: {"Content-Type": "application/json"}}));
}

async function appPage(req) {
  const cache = await caches.open(CACHE_NAME);
  const st = await loadState();
  let good = await cache.match(GOOD_KEY);
  if (!good) good = await cache.match(NEW_KEY) || await cache.match(APP_PATH);
  let text = null;
  // A request given up on is cancelled, not left hanging: the browser holds
  // later requests for the same page until it's done.
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), NAV_TIMEOUT_MS);
  try {
    const r = await fetch(req.url, {signal: ctl.signal, credentials: "same-origin", cache: "no-cache"});
    if (r.ok) text = await r.text();
    else if (!good) { clearTimeout(timer); return r; } // nothing saved: whatever the server says
  } catch (err) {
    if (!good) { clearTimeout(timer); return fetch(req); }
  }
  clearTimeout(timer);
  if (text != null && complete(text)) {
    const h = await hashOf(text);
    if (!st.bad.includes(h)) {
      if (!(st.good && st.good.h === h)) {
        await cache.put(NEW_KEY, htmlResponse(text));
        st.fresh = {v: versionOf(text), h};
        await saveState(st);
      }
      return htmlResponse(text);
    }
  }
  if (good) return good;
  return text != null ? htmlResponse(text) : fetch(req);
}

// ---- What pages tell it
self.addEventListener("message", (event) => {
  const m = event.data || {}, port = event.ports && event.ports[0];
  const reply = (v) => { if (port) port.postMessage(v); };
  if (m.type === "37-up") event.waitUntil((async () => {
    // The version that just started is the good one now.
    const st = await loadState(), cache = await caches.open(CACHE_NAME);
    if (st.fresh && st.fresh.v === m.version) {
      const r = await cache.match(NEW_KEY);
      if (r) { await cache.put(GOOD_KEY, r); st.good = st.fresh; st.fresh = null; await saveState(st); }
    }
    reply({reverted: st.reverted || null});
    if (st.reverted) { st.reverted = null; await saveState(st); }
  })());
  else if (m.type === "37-failed") event.waitUntil((async () => {
    // A new version that didn't start: refused, if there's a good one to go back to.
    const st = await loadState(), cache = await caches.open(CACHE_NAME);
    const canGoBack = st.fresh && st.fresh.v === m.version && (!st.good || st.good.h !== st.fresh.h) && await cache.match(GOOD_KEY);
    if (!canGoBack) { reply({reload: false}); return; }
    st.bad = st.bad.concat(st.fresh.h).slice(-10);
    st.reverted = {from: st.fresh.v, to: st.good ? st.good.v : ""};
    st.fresh = null;
    await cache.delete(NEW_KEY);
    await saveState(st);
    reply({reload: true});
  })());
});

// Files shared to 37 Player (Android's Share menu, from the manifest's
// share_target) arrive as a POST to the app with ?share-target. A static
// site can't take a POST, so they're kept here, in a cache of their own,
// and the app is opened with ?shared, which picks them up and empties it.
const SHARE_CACHE = "37player-share";
async function takeShare(req) {
  const form = await req.formData();
  const files = form.getAll("audio").filter((f) => f && typeof f === "object" && f.size);
  await caches.delete(SHARE_CACHE);
  const cache = await caches.open(SHARE_CACHE);
  await Promise.all(files.map((f, i) => cache.put(FOLDER + "__shared/" + i, new Response(f, {
    headers: {"Content-Type": f.type || "application/octet-stream", "X-Name": encodeURIComponent(f.name || ("shared-" + i)), "X-Modified": String(f.lastModified || Date.now())},
  }))));
  return Response.redirect(APP_PATH + "?shared=" + files.length, 303);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "POST" && new URL(req.url).pathname === APP_PATH && new URL(req.url).searchParams.has("share-target")) {
    event.respondWith(takeShare(req).catch(() => Response.redirect(APP_PATH, 303)));
    return;
  }
  if (req.method !== "GET" || req.headers.has("range")) return; // partial requests (update checks, library downloads) go straight through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isApp = url.pathname === APP_PATH || (!SCOPE_IS_FILE && url.pathname === FOLDER && req.mode === "navigate");
  const isHelp = url.pathname === HELP_PATH;
  if (!isApp && !isHelp) return; // everything else: not ours
  if (isApp && req.mode === "navigate") { event.respondWith(appPage(req)); return; }
  // help.json, and the app file fetched by the page itself (update checks
  // use a range request, above): network first, the saved copy if that fails.
  const key = isApp ? GOOD_KEY : HELP_PATH;
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (isHelp && response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
        }
        if (response && !response.ok) return caches.match(key).then((c) => c || response);
        return response;
      })
      .catch(() => caches.match(key))
  );
});
