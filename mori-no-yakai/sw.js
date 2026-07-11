const CACHE = 'mori-no-yakai-v0.1.13';
const ASSETS = ['/mori-no-yakai/', '/mori-no-yakai/index.html', '/mori-no-yakai/style.css', '/mori-no-yakai/game.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('version.json')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
