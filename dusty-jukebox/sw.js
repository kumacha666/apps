const CACHE_NAME = "dusty-jukebox-v0.1.2";
const CACHE_PREFIX = "dusty-jukebox-";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json", "./icon.svg"];
const APP_SHELL_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).href));
const STREAM_PATH_PREFIX = new URL("stream/", self.registration.scope).pathname;
const TOKEN_TIMEOUT_MS = 5_000;

self.addEventListener("install", (event) => {
  const requests = ASSETS.map((url) => new Request(url, { cache: "no-cache" }));
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(requests.map((request) => fetch(request).then((response) => cache.put(request, response))))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

function unauthorizedResponse() {
  return new Response("Unauthorized", { status: 401, statusText: "Unauthorized" });
}

async function requestToken(clientId) {
  if (!clientId) return null;
  const client = await self.clients.get(clientId);
  if (!client) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, TOKEN_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(typeof event.data?.token === "string" && event.data.token ? event.data.token : null);
    };
    client.postMessage({ type: "dusty-jukebox:get-token" }, [channel.port2]);
  });
}

async function proxyStream(request, fileId, clientId) {
  const token = await requestToken(clientId);
  if (!token) return unauthorizedResponse();

  const headers = { Authorization: `Bearer ${token}` };
  const range = request.headers.get("Range");
  if (range) headers.Range = range;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers });
  const responseHeaders = new Headers();
  for (const header of ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]) {
    const value = response.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(STREAM_PATH_PREFIX)) {
    const fileId = decodeURIComponent(url.pathname.slice(STREAM_PATH_PREFIX.length));
    event.respondWith(fileId ? proxyStream(event.request, fileId, event.clientId) : unauthorizedResponse());
    return;
  }

  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !APP_SHELL_URLS.has(url.href)
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
