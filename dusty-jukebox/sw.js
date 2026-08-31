const CACHE_NAME = "dusty-jukebox-v0.1.3";
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

let nextTokenRequestId = 0;
const fileSizeCache = new Map();

function parseRange(range) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(range ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : null;
  if (!Number.isSafeInteger(start) || (requestedEnd !== null && (!Number.isSafeInteger(requestedEnd) || requestedEnd < start))) {
    return null;
  }
  return { start, requestedEnd };
}

async function fetchFileSize(fileId, token) {
  let sizeRequest = fileSizeCache.get(fileId);
  if (!sizeRequest) {
    sizeRequest = (async () => {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=size&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const size = Number((await response.json()).size);
      return Number.isSafeInteger(size) && size >= 0 ? size : null;
    })();
    fileSizeCache.set(fileId, sizeRequest);
  }

  try {
    const size = await sizeRequest;
    if (size === null && fileSizeCache.get(fileId) === sizeRequest) fileSizeCache.delete(fileId);
    return size;
  } catch {
    if (fileSizeCache.get(fileId) === sizeRequest) fileSizeCache.delete(fileId);
    return null;
  }
}

async function requestToken(clientId, fileId, playbackGeneration) {
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
      resolve({ token: typeof event.data?.token === "string" && event.data.token ? event.data.token : null, requestId });
    };
    const requestId = `${++nextTokenRequestId}`;
    client.postMessage({ type: "dusty-jukebox:get-token", fileId, requestId, playbackGeneration }, [channel.port2]);
  });
}

async function proxyStream(request, fileId, clientId) {
  const playbackGenerationParam = request.url ? new URL(request.url).searchParams.get("playbackGeneration") : null;
  // URLSearchParams always yields a string; the page side validates this field
  // with Number.isInteger(), so a numeric string must be converted here or
  // every get-token message is silently dropped and all playback 401s.
  const playbackGeneration = playbackGenerationParam === null ? null : Number(playbackGenerationParam);
  const tokenRequest = await requestToken(clientId, fileId, playbackGeneration);
  const token = tokenRequest?.token;
  if (!token) {
    // A missing page-side token is also an authentication failure.  Report it
    // with the request id so the page can offer the same user-gesture-only
    // continuation as it does for a Drive-rejected bearer token.
    if (clientId && tokenRequest) {
      const client = await self.clients.get(clientId);
      client?.postMessage({ type: "dusty-jukebox:stream-token-rejected", fileId, requestId: tokenRequest.requestId });
    }
    return unauthorizedResponse();
  }

  const headers = { Authorization: `Bearer ${token}` };
  const range = request.headers.get("Range");
  if (range) headers.Range = range;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers });
  // HTMLMediaElement#error does not reveal HTTP status. Tell only the page that
  // issued this request about a rejected bearer token so it can clear its cache
  // and offer the user-gesture-only continuation flow.
  if (response.status === 401 && clientId) {
    const client = await self.clients.get(clientId);
    client?.postMessage({ type: "dusty-jukebox:stream-token-rejected", fileId, requestId: tokenRequest.requestId });
  }
  const responseHeaders = new Headers();
  for (const header of ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]) {
    const value = response.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }
  if (response.status === 206) {
    const parsedRange = parseRange(range);
    const contentLength = Number(response.headers.get("Content-Length"));
    if (parsedRange && Number.isSafeInteger(contentLength) && contentLength > 0) {
      const totalSize = await fetchFileSize(fileId, token);
      if (totalSize !== null) {
        responseHeaders.set("Content-Range", `bytes ${parsedRange.start}-${parsedRange.start + contentLength - 1}/${totalSize}`);
        responseHeaders.set("Accept-Ranges", "bytes");
      }
    }
  } else if (response.status === 200) {
    responseHeaders.set("Accept-Ranges", "bytes");
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
