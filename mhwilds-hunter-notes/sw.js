const CACHE_NAME = "hunter-notes-v2";
const ASSETS = [
  ".", "index.html", "style.css", "app.js", "manifest.json",
  "data/weapons/insect-glaive.json", "data/weapons/sword-and-shield.json",
  "data/monsters/chatacabra.json", "data/monsters/doshaguma.json", "data/monsters/rathalos.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
