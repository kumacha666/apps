const CACHE_PREFIX = "marvel-checklist-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const ASSETS = [
  ".", "index.html", "style.css", "app.js", "logic.js", "manifest.json", "icon.svg",
  "data/movies.json", "data/characters.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          e.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        // A navigation request (e.g. opening a friend's `?share=...` link)
        // won't exact-match the precached "index.html" entry because of the
        // query string. The app only reads location.search client-side
        // after the document loads, so falling back to the cached document
        // itself is correct — this is what lets share links work offline.
        if (e.request.mode === "navigate") {
          return caches.match("index.html");
        }
        return undefined;
      })
  );
});
