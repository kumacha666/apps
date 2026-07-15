const CACHE_NAME = "combrawl-v0.1.20";
const ASSETS = ["./", "./index.html", "./style.css", "./game.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  const requests = ASSETS.map((url) => new Request(url, { cache: "no-cache" }));
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(requests.map((req) => fetch(req).then((res) => cache.put(req, res))))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
