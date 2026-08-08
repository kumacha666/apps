const CACHE_PREFIX = "marvel-checklist-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const ASSETS = [
  ".", "index.html", "style.css", "app.js", "logic.js", "manifest.json", "icon.svg",
  "data/movies.json"
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
      .catch(() => caches.match(e.request))
  );
});
