// 37 Player's service worker: keeps a copy of the app page so it opens
// without an internet connection.
//
// It looks after exactly two things — the app page itself and help.json —
// and lets every other request go straight to the network untouched (apart
// from files shared to the app, below). That
// matters because the app can share a site with other pages: at
// 37player.com the app is /37-player.html, next to an about page
// (/index.html) and the libraries/ folder, none of which this should ever
// cache or intercept.
//
// Which page is "the app" comes from the registration scope, which the app
// sets when registering: its own file (e.g. /37-player.html) under the
// current layout, or a folder (e.g. /live/) under the older one, where the
// app is that folder's index.html.
//
// Both are network-first: with a connection you always get the latest
// version; the cached copy is used only when the network fails entirely.
// help.json isn't pre-cached (it's optional — a missing file would fail the
// whole install, since cache.addAll is all-or-nothing); it's cached the
// first time it loads.
const CACHE_NAME = "37player-shell-v5";

const SCOPE = new URL(self.registration.scope);
const SCOPE_IS_FILE = /\.html?$/i.test(SCOPE.pathname);
const APP_PATH = SCOPE_IS_FILE ? SCOPE.pathname : SCOPE.pathname + "index.html";
const FOLDER = SCOPE_IS_FILE ? SCOPE.pathname.replace(/[^/]*$/, "") : SCOPE.pathname;
const HELP_PATH = FOLDER + "help.json";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(APP_PATH)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
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

  const key = isApp ? APP_PATH : HELP_PATH; // one cached copy, whatever query string was used
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
        }
        return response;
      })
      .catch(() => caches.match(key))
  );
});
