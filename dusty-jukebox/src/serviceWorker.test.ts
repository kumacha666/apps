import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

type FetchHandler = (event: { request: Request; clientId: string; respondWith: (response: Promise<Response> | Response) => void }) => void;
type LifecycleHandler = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;

interface Harness {
  handlers: Map<string, ((event: never) => void)[]>;
  cacheKeys: string[];
  cacheName: string;
  cachePrefix: string;
  cachePuts: string[];
  deleted: string[];
  fetchCalls: Array<{ input: unknown; init?: RequestInit }>;
  setFetchImplementation: (implementation: (input: unknown, init?: RequestInit) => Promise<Response>) => void;
  setDriveResponseStatus: (status: number) => void;
  timers: Array<() => void>;
  clients: Map<string, { postMessage: (message: unknown, ports: FakePort[]) => void }>;
  run: () => void;
}

class FakePort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  peer: FakePort | null = null;
  postMessage(data: unknown): void {
    this.peer?.onmessage?.({ data });
  }
  close(): void {}
}

function createHarness(scope = "https://example.test/dusty-jukebox/"): Harness {
  const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const cacheName = source.match(/^const CACHE_NAME = "([^"]+)";/m)?.[1];
  const cachePrefix = source.match(/^const CACHE_PREFIX = "([^"]+)";/m)?.[1];
  if (!cacheName || !cachePrefix) throw new Error("Service worker cache constants are unavailable");

  const handlers = new Map<string, ((event: never) => void)[]>();
  const cacheKeys = ["combrawl-v0.1.63", "dusty-jukebox-v0.0.9", "dusty-jukebox-v0.1.0"];
  const cachePuts: string[] = [];
  const deleted: string[] = [];
  const fetchCalls: Array<{ input: unknown; init?: RequestInit }> = [];
  let driveResponseStatus = 206;
  let fetchImplementation: (input: unknown, init?: RequestInit) => Promise<Response> = async () => new Response("audio", { status: driveResponseStatus, headers: { "Content-Range": "bytes 0-4/5", "Accept-Ranges": "bytes", "Content-Length": "5", "Content-Type": "audio/mpeg" } });
  const timers: Array<() => void> = [];
  const clients = new Map<string, { postMessage: (message: unknown, ports: FakePort[]) => void }>();

  class FakeMessageChannel {
    port1 = new FakePort();
    port2 = new FakePort();
    constructor() {
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
    }
  }

  const self = {
    registration: { scope },
    location: { href: scope, origin: new URL(scope).origin },
    addEventListener(type: string, listener: (event: never) => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), listener]);
    },
    skipWaiting() {},
    clients: {
      claim: async () => {},
      get: async (id: string) => clients.get(id),
    },
  };
  const context = {
    self,
    URL,
    Headers,
    Response,
    Request: class {
      constructor(public readonly url: string) {}
    },
    MessageChannel: FakeMessageChannel,
    caches: {
      open: async () => ({ put: async (request: { url: string }) => { cachePuts.push(request.url); } }),
      keys: async () => cacheKeys,
      delete: async (key: string) => { deleted.push(key); return true; },
      match: async () => undefined,
    },
    fetch: async (input: unknown, init?: RequestInit) => {
      fetchCalls.push({ input, init });
      return fetchImplementation(input, init);
    },
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
  };
  return { handlers, cacheKeys, cacheName, cachePrefix, cachePuts, deleted, fetchCalls, setFetchImplementation: (implementation) => { fetchImplementation = implementation; }, setDriveResponseStatus: (status) => { driveResponseStatus = status; }, timers, clients, run: () => runInNewContext(source, context) };
}

async function dispatchLifecycle(harness: Harness, type: "install" | "activate"): Promise<void> {
  const waits: Promise<unknown>[] = [];
  (harness.handlers.get(type)?.[0] as unknown as LifecycleHandler)({ waitUntil: (promise) => waits.push(promise) });
  await Promise.all(waits);
}

function dispatchFetch(harness: Harness, url: string, headers: Headers = new Headers(), clientId = "tab-1"): Promise<Response> {
  let response: Promise<Response> | Response | undefined;
  (harness.handlers.get("fetch")?.[0] as unknown as FetchHandler)({
    request: new Request(url, { headers }),
    clientId,
    respondWith: (next) => { response = next; },
  });
  if (!response) throw new Error("Service Worker did not respond");
  return Promise.resolve(response);
}

describe("service worker", () => {
  test("installはアプリシェルをキャッシュし、activateはDustyJukeboxの旧キャッシュだけ削除する", async () => {
    const harness = createHarness();
    harness.run();

    await dispatchLifecycle(harness, "install");
    await dispatchLifecycle(harness, "activate");

    expect(harness.cachePuts).toEqual(["./", "./index.html", "./app.js", "./manifest.json", "./icon.svg"]);
    expect(harness.deleted).toEqual(
      harness.cacheKeys.filter((key) => key.startsWith(harness.cachePrefix) && key !== harness.cacheName)
    );
  });

  test("トークン応答がタイムアウトしたストリームは401になる", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", { postMessage: () => {} });
    harness.run();

    const response = dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.timers[0]();

    expect((await response).status).toBe(401);
  });

  test("ページ側にトークンが無いストリームも要求元タブへ拒否を通知する", async () => {
    const harness = createHarness();
    const messages: unknown[] = [];
    harness.clients.set("tab-1", {
      postMessage: (message, ports = []) => {
        messages.push(message);
        ports[0]?.postMessage({ token: null });
      },
    });
    harness.run();

    const response = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/missing-token");

    expect(response.status).toBe(401);
    expect(messages).toContainEqual({ type: "dusty-jukebox:stream-token-rejected", fileId: "missing-token", requestId: "1" });
  });

  test("RangeとトークンをDriveへ転送し、共有ドライブ対応URLで部分レスポンスを返す", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", {
      postMessage: (_message, ports) => ports[0].postMessage({ token: "access-token" }),
    });
    harness.setFetchImplementation(async (input) => String(input).includes("fields=size")
      ? Response.json({ size: "532739" })
      : new Response("audio", { status: 206, headers: { "Content-Length": "5", "Content-Type": "audio/mpeg" } }));
    harness.run();

    const response = await dispatchFetch(
      harness,
      "https://example.test/dusty-jukebox/stream/file%2Fid",
      new Headers({ Range: "bytes=0-4" })
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4/532739");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(String(harness.fetchCalls[0].input)).toContain("files/file%2Fid?alt=media&supportsAllDrives=true");
    expect(new Headers(harness.fetchCalls[0].init?.headers).get("Range")).toBe("bytes=0-4");
    expect(new Headers(harness.fetchCalls[0].init?.headers).get("Authorization")).toBe("Bearer access-token");
    expect(String(harness.fetchCalls[1].input)).toContain("files/file%2Fid?fields=size&supportsAllDrives=true");
    expect(new Headers(harness.fetchCalls[1].init?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  test("同じファイルへの複数のRange要求でファイルサイズを一度だけ取得する", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", { postMessage: (_message, ports) => ports[0].postMessage({ token: "token" }) });
    harness.setFetchImplementation(async (input, init) => {
      if (String(input).includes("fields=size")) return Response.json({ size: "1000" });
      expect(new Headers(init?.headers).get("Range")).toMatch(/^bytes=(0-99|500-)$/);
      return new Response("audio", { status: 206, headers: { "Content-Length": "100" } });
    });
    harness.run();

    const first = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1", new Headers({ Range: "bytes=0-99" }));
    const second = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1", new Headers({ Range: "bytes=500-" }));

    expect(first.headers.get("Content-Range")).toBe("bytes 0-99/1000");
    expect(second.headers.get("Content-Range")).toBe("bytes 500-599/1000");
    expect(harness.fetchCalls.filter(({ input }) => String(input).includes("fields=size"))).toHaveLength(1);
  });

  test.each(["error response", "network error"])("ファイルサイズ取得の%sでは不完全な206を例外なく中継する", async (failure) => {
    const harness = createHarness();
    const messages: unknown[] = [];
    harness.clients.set("tab-1", { postMessage: (message, ports) => {
      messages.push(message);
      ports[0]?.postMessage({ token: "token" });
    } });
    harness.setFetchImplementation(async (input) => {
      if (!String(input).includes("fields=size")) return new Response("audio", { status: 206, headers: { "Content-Length": "5", "Content-Type": "audio/mpeg" } });
      if (failure === "network error") throw new Error("offline");
      return new Response("Unauthorized", { status: 401 });
    });
    harness.run();

    const response = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1", new Headers({ Range: "bytes=0-" }));

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(response.headers.get("Accept-Ranges")).toBeNull();
    expect(messages).not.toContainEqual(expect.objectContaining({ type: "dusty-jukebox:stream-token-rejected" }));
  });

  test("同時Range要求で共有したファイルサイズ取得が失敗しても両方を中継し、後続要求で再取得する", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", { postMessage: (_message, ports) => ports[0].postMessage({ token: "token" }) });
    let rejectSizeRequest: ((reason: Error) => void) | undefined;
    const failedSizeRequest = new Promise<Response>((_resolve, reject) => { rejectSizeRequest = reject; });
    let sizeRequestCount = 0;
    harness.setFetchImplementation(async (input) => {
      if (!String(input).includes("fields=size")) {
        return new Response("audio", { status: 206, headers: { "Content-Length": "5", "Content-Type": "audio/mpeg" } });
      }
      sizeRequestCount += 1;
      return sizeRequestCount === 1 ? failedSizeRequest : Response.json({ size: "1000" });
    });
    harness.run();

    const first = dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1", new Headers({ Range: "bytes=0-4" }));
    const second = dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1", new Headers({ Range: "bytes=5-9" }));
    await vi.waitFor(() => expect(sizeRequestCount).toBe(1));
    rejectSizeRequest?.(new Error("offline"));

    const settledResponses = await Promise.allSettled([first, second]);
    expect(settledResponses.map(({ status }) => status)).toEqual(["fulfilled", "fulfilled"]);
    const responses = settledResponses.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    expect(responses.map((response) => response.status)).toEqual([206, 206]);
    expect(responses.map((response) => response.headers.get("Content-Range"))).toEqual([null, null]);
    expect(responses.map((response) => response.headers.get("Accept-Ranges"))).toEqual([null, null]);

    const retry = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1", new Headers({ Range: "bytes=10-14" }));
    expect(retry.headers.get("Content-Range")).toBe("bytes 10-14/1000");
    expect(sizeRequestCount).toBe(2);
  });

  test("Range無しの200レスポンスにはAccept-Rangesを付与する", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", { postMessage: (_message, ports) => ports[0].postMessage({ token: "token" }) });
    harness.setFetchImplementation(async () => new Response("audio", { status: 200, headers: { "Content-Length": "5" } }));
    harness.run();

    const response = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1");

    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(harness.fetchCalls).toHaveLength(1);
  });

  test("Driveが401を返したストリームは要求元タブへトークン拒否を通知する", async () => {
    const harness = createHarness();
    const messages: unknown[] = [];
    harness.setDriveResponseStatus(401);
    harness.clients.set("tab-1", {
      postMessage: (message, ports = []) => {
        messages.push(message);
        ports[0]?.postMessage({ token: "access-token" });
      },
    });
    harness.run();

    const response = await dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/revoked-file");

    expect(response.status).toBe(401);
    expect(messages).toContainEqual({ type: "dusty-jukebox:stream-token-rejected", fileId: "revoked-file", requestId: "1" });
  });

  test("登録スコープからストリームパスを導出し、ルート配信でも横取りする", async () => {
    const harness = createHarness("https://example.test/");
    harness.clients.set("tab-1", { postMessage: (_message, ports) => ports[0].postMessage({ token: "token" }) });
    harness.run();

    await dispatchFetch(harness, "https://example.test/stream/file-1");

    expect(harness.fetchCalls).toHaveLength(1);
  });
});
