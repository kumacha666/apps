const CACHE = 'lifelog-v2';
const ASSETS = ['./index.html', './logic.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('lifelog-') && k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // index.html / logic.js はネットワーク優先：最新版を取得し、オフライン時のみキャッシュ返却
  // （logic.js をキャッシュ優先にすると、更新後も古いロジックが使われ続けてしまう）
  if (e.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('logic.js') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // その他のアセットはキャッシュ優先
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
