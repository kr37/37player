const CACHE_NAME = "temple-sound-shell-v4";
// manifest.json and both icons are now inlined into index.html as data URIs
// (see index.html's <head>) rather than separate files, so there's nothing
// left to list here for them — caching a URL that no longer exists would
// make cache.addAll() reject outright and fail the whole install, since
// addAll is all-or-nothing. help.json (optional — only present for the
// markdown-driven help-topic dev workflow) is deliberately NOT listed here
// for the same reason: most deployments won't have it, and one missing
// file would otherwise take the entire offline install down with it. It's
// handled separately below instead, opportunistically.
const SHELL_ASSETS = ["./", "./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isAppDoc = event.request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/");
  // help.json gets the same network-first treatment as the app document
  // itself, not the generic cache-first bucket below — the whole point of
  // the markdown-driven dev workflow is edit-regenerate-refresh, and a
  // cache-first fetch would keep serving a stale copy after regenerating
  // until a hard refresh forced past the service worker entirely. Still
  // falls back to whatever's cached when there's genuinely no connection,
  // same as the app document.
  const isHelpJson = url.pathname.endsWith("/help.json");

  if (isAppDoc || isHelpJson) {
    // Network-first: whenever there's a connection, you always get
    // the latest version. Only falls back to the cached copy —
    // true offline use — when the network request fails entirely.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Anything else that isn't the app document itself — nothing currently
  // falls in this bucket (manifest/icons are inlined into index.html now),
  // but it's kept as a general-purpose cache-first fallback in case a
  // future version ever adds a genuinely separate static asset.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && event.request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
