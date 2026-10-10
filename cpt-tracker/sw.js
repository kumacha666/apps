const CACHE_PREFIX = "cpt-tracker-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const ASSETS = [".", "index.html", "style.css", "app.js", "logic.js", "analytics.js", "manifest.json", "icon.svg", "data/config.json", "data/baseline.json"];

self.addEventListener("install", (e) => {
  // 事前保存もHTTPキャッシュ(GitHub Pagesは10分)を経由せず、常に最新を取る
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ネットワーク優先（オフライン時のみキャッシュ）。ライブAPI(GAS)などの別オリジンは一切関与しない。
// cache:"no-cache" で毎回サーバーに「更新されたか」を確かめる（未更新なら304で軽い）。これが無いと、
// GitHub Pagesの10分間のHTTPキャッシュのせいで、修正をデプロイしても利用者の画面が最大10分古いままになる。
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          e.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)));
        }
        return res;
      })
      .catch(async () => (await caches.match(e.request)) || (await caches.match("index.html")))
  );
});
