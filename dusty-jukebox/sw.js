const CACHE_NAME = "dusty-jukebox-v0.1.167";
const CACHE_PREFIX = "dusty-jukebox-";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json", "./icon.svg"];
const APP_SHELL_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).href));
const STREAM_PATH_PREFIX = new URL("stream/", self.registration.scope).pathname;
const TOKEN_TIMEOUT_MS = 5_000;
const FILE_SIZE_TIMEOUT_MS = 5_000;

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
// クロスフェード中は主・先読み用の2本のaudio要素が同時にRangeストリーミングされ、
// ブラウザはそれぞれのバッファリングのために多数の小さなRangeリクエストを短時間に
// 連続発行する。従来は1リクエストごとに必ずrequestToken()（ページ側へのMessageChannel
// 往復）を行っていたため、この往復自体（IPC・メインスレッドのスケジューリングコストを
// 含む。requestToken()自体はDriveへのネットワークアクセスを一切行わない：ページ側の
// registerStreamAuthResponder()はauth.getAccessToken()相当の現在保持している値を
// そのまま返すだけで、実際のDriveアクセスはこの後proxyStream()内で別途行う）が
// クロスフェード中の2本同時ストリーミングの負荷源になり、実機録画の波形解析で確認
// された1秒超の再生停滞・音飛びの一因になっているのではという未検証の仮説（詳細は
// dusty-jukebox/CLAUDE.mdのクロスフェード節参照）。同一(clientId, fileId,
// playbackGeneration)への要求はトークンを問い合わせ直す
// 必要が無い（トークン自体はこの3つ組の生存期間中は変わらない前提でよく、実際に変わって
// いた場合は後続のDrive側401がこのキャッシュを破棄して通常の再認証フローに合流する）ため、
// Promiseそのものをキャッシュして往復を1回にまとめる。
// 2026-09-13、ChatGPTレビュー指摘：P2「成功エントリが世代終了後も削除されず増え続ける」。
// playbackGenerationが変わると新しいキーへ切り替わるだけで、古いキーはMapから自然には
// 消えない。成功したPromiseは401/missing/errorが起きない限り残り続けるため、長時間利用・
// 曲送りを繰り返すほどエントリ（Bearer tokenを間接的に保持するPromise）が蓄積する。
// Service Workerは本来トークンを一切保持しない設計方針（下記PWA・Service Worker
// ストリーミング節参照）のため、この最適化用キャッシュも上限付きLRUにして無制限には
// 保持しないようにする。上限を超えて追い出されたエントリは、次のRange要求で単に改めて
// ページへ問い合わせるだけで機能上は劣化しない（往復削減の効果が薄れるだけ）。
const tokenCache = new Map();
const MAX_TOKEN_CACHE_ENTRIES = 32;

function tokenCacheKey(clientId, fileId, playbackGeneration) {
  return `${clientId}:${fileId}:${playbackGeneration}`;
}

function getCachedOrRequestToken(clientId, fileId, playbackGeneration) {
  const key = tokenCacheKey(clientId, fileId, playbackGeneration);
  const cached = tokenCache.get(key);
  if (cached) {
    // LRU: 参照されたエントリをMapの末尾（最も新しい）へ移動する。Mapのキー順は挿入順の
    // ため、削除してから再設定するだけで順序を更新できる。
    tokenCache.delete(key);
    tokenCache.set(key, cached);
    return cached;
  }
  const promise = requestToken(clientId, fileId, playbackGeneration);
  tokenCache.set(key, promise);
  while (tokenCache.size > MAX_TOKEN_CACHE_ENTRIES) {
    const oldestKey = tokenCache.keys().next().value;
    tokenCache.delete(oldestKey);
  }
  // ページ側にトークンが無い（missing/timeout）結果はキャッシュしない：この3つ組への
  // 後続要求が、同じ「トークン無し」という古い答えをこの世代の残り期間ずっと再利用して
  // しまうと、page側でその後ログイン・トークン取得が完了しても反映されなくなるため。
  promise
    .then((result) => {
      if (!result?.token && tokenCache.get(key) === promise) tokenCache.delete(key);
    })
    .catch(() => {
      if (tokenCache.get(key) === promise) tokenCache.delete(key);
    });
  return promise;
}

// Drive側の401（トークン失効・拒否）を検知した時点でキャッシュを破棄する。以後の同じ
// (clientId, fileId, playbackGeneration)への要求は、古い（既に拒否された）トークンを
// 再利用し続けるのではなく、改めてページへ問い合わせる。
function invalidateTokenCache(clientId, fileId, playbackGeneration) {
  tokenCache.delete(tokenCacheKey(clientId, fileId, playbackGeneration));
}

function parseRange(range) {
  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(range ?? "");
  if (!match) return null;
  if (match[3] !== undefined) {
    const suffixLength = Number(match[3]);
    return Number.isSafeInteger(suffixLength) && suffixLength > 0
      ? { start: null, requestedEnd: null, suffixLength }
      : null;
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : null;
  if (!Number.isSafeInteger(start) || (requestedEnd !== null && (!Number.isSafeInteger(requestedEnd) || requestedEnd < start))) {
    return null;
  }
  return { start, requestedEnd, suffixLength: null };
}

async function fetchFileSize(fileId, token) {
  const cacheKey = `${fileId}:${token}`;
  let sizeRequest = fileSizeCache.get(cacheKey);
  if (!sizeRequest) {
    sizeRequest = (async () => {
      const controller = new AbortController();
      let timeout;
      try {
        return await Promise.race([
          (async () => {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=size&supportsAllDrives=true`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            });
            if (!response.ok) return { size: null, tokenRejected: response.status === 401 };
            const size = Number((await response.json()).size);
            return {
              size: Number.isSafeInteger(size) && size >= 0 ? size : null,
              tokenRejected: false,
            };
          })(),
          new Promise((resolve) => {
            timeout = setTimeout(() => {
              controller.abort();
              resolve({ size: null, tokenRejected: false });
            }, FILE_SIZE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    })();
    fileSizeCache.set(cacheKey, sizeRequest);
  }

  try {
    const result = await sizeRequest;
    if (result.size === null && fileSizeCache.get(cacheKey) === sizeRequest) fileSizeCache.delete(cacheKey);
    return result;
  } catch {
    if (fileSizeCache.get(cacheKey) === sizeRequest) fileSizeCache.delete(cacheKey);
    return { size: null, tokenRejected: false };
  }
}

async function notifyTokenRejected(clientId, fileId, requestId) {
  if (!clientId) return;
  const client = await self.clients.get(clientId);
  client?.postMessage({ type: "dusty-jukebox:stream-token-rejected", fileId, requestId });
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
  const tokenRequest = await getCachedOrRequestToken(clientId, fileId, playbackGeneration);
  const token = tokenRequest?.token;
  if (!token) {
    // A missing page-side token is also an authentication failure.  Report it
    // with the request id so the page can offer the same user-gesture-only
    // continuation as it does for a Drive-rejected bearer token.
    if (clientId && tokenRequest) {
      await notifyTokenRejected(clientId, fileId, tokenRequest.requestId);
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
    invalidateTokenCache(clientId, fileId, playbackGeneration);
    await notifyTokenRejected(clientId, fileId, tokenRequest.requestId);
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
      const sizeResult = await fetchFileSize(fileId, token);
      if (sizeResult.tokenRejected) {
        invalidateTokenCache(clientId, fileId, playbackGeneration);
        await notifyTokenRejected(clientId, fileId, tokenRequest.requestId);
      }
      if (sizeResult.size !== null) {
        const start = parsedRange.suffixLength === null
          ? parsedRange.start
          : Math.max(sizeResult.size - parsedRange.suffixLength, 0);
        responseHeaders.set("Content-Range", `bytes ${start}-${start + contentLength - 1}/${sizeResult.size}`);
        responseHeaders.set("Accept-Ranges", "bytes");
      }
    }
  } else if (response.status === 200) {
    responseHeaders.set("Accept-Ranges", "bytes");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

// ページ側（DriveAuth）のトークンが、ストリームの401を経ずに変化した通知（2026-09-13、
// Codexレビュー指摘：P2）。影響を受ける(clientId, fileId, playbackGeneration)を特定できない
// ため、tokenCache全体を破棄する。以後の要求は改めてページへ問い合わせるだけで機能上は
// 劣化しない。
self.addEventListener("message", (event) => {
  if (event.data?.type === "dusty-jukebox:token-rotated") tokenCache.clear();
});

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
