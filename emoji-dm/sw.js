importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBEcJVfrNeK_q5pf1tGTJDosGn-Fw7dvq4",
  authDomain: "emoji-dm.firebaseapp.com",
  databaseURL: "https://emoji-dm-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "emoji-dm",
  storageBucket: "emoji-dm.firebasestorage.app",
  messagingSenderId: "125384370581",
  appId: "1:125384370581:web:6a23a3b5e83442af106e9c"
});

const messaging = firebase.messaging();

// notification payload is auto-displayed by FCM; no manual showNotification needed
messaging.onBackgroundMessage(() => {});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/emoji-dm/') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/emoji-dm/');
    })
  );
});

const CACHE = 'emoji-dm-1.1.1';
const ASSETS = ['/emoji-dm/', '/emoji-dm/index.html', '/emoji-dm/style.css', '/emoji-dm/app.js'];

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
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
