import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

type FetchHandler = (event: { request: Request; clientId: string; respondWith: (response: Promise<Response> | Response) => void }) => void;
type LifecycleHandler = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;

interface Harness {
  handlers: Map<string, ((event: never) => void)[]>;
  cachePuts: string[];
  deleted: string[];
  fetchCalls: Array<{ input: unknown; init?: RequestInit }>;
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
  const handlers = new Map<string, ((event: never) => void)[]>();
  const cachePuts: string[] = [];
  const deleted: string[] = [];
  const fetchCalls: Array<{ input: unknown; init?: RequestInit }> = [];
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
    location: { href: scope },
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
      keys: async () => ["combrawl-v0.1.63", "dusty-jukebox-v0.0.9", "dusty-jukebox-v0.1.0"],
      delete: async (key: string) => { deleted.push(key); return true; },
      match: async () => undefined,
    },
    fetch: async (input: unknown, init?: RequestInit) => {
      fetchCalls.push({ input, init });
      return new Response("audio", { status: 206, headers: { "Content-Range": "bytes 0-4/5", "Accept-Ranges": "bytes", "Content-Length": "5", "Content-Type": "audio/mpeg" } });
    },
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
  };
  const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  return { handlers, cachePuts, deleted, fetchCalls, timers, clients, run: () => runInNewContext(source, context) };
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
    expect(harness.deleted).toEqual(["dusty-jukebox-v0.0.9"]);
  });

  test("トークン応答がタイムアウトしたストリームは401になる", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", { postMessage: () => {} });
    harness.run();

    const response = dispatchFetch(harness, "https://example.test/dusty-jukebox/stream/file-1");
    harness.timers[0]();

    expect((await response).status).toBe(401);
  });

  test("RangeとトークンをDriveへ転送し、共有ドライブ対応URLで部分レスポンスを返す", async () => {
    const harness = createHarness();
    harness.clients.set("tab-1", {
      postMessage: (_message, ports) => ports[0].postMessage({ token: "access-token" }),
    });
    harness.run();

    const response = await dispatchFetch(
      harness,
      "https://example.test/dusty-jukebox/stream/file%2Fid",
      new Headers({ Range: "bytes=0-4" })
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4/5");
    expect(String(harness.fetchCalls[0].input)).toContain("files/file%2Fid?alt=media&supportsAllDrives=true");
    expect(new Headers(harness.fetchCalls[0].init?.headers).get("Range")).toBe("bytes=0-4");
    expect(new Headers(harness.fetchCalls[0].init?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  test("登録スコープからストリームパスを導出し、ルート配信でも横取りする", async () => {
    const harness = createHarness("https://example.test/");
    harness.clients.set("tab-1", { postMessage: (_message, ports) => ports[0].postMessage({ token: "token" }) });
    harness.run();

    await dispatchFetch(harness, "https://example.test/stream/file-1");

    expect(harness.fetchCalls).toHaveLength(1);
  });
});
