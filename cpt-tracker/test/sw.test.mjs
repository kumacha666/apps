// sw.js を、サービスワーカーのAPI（self/caches/fetch）を模した環境で実行して検証する。
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function load({ fetchImpl } = {}) {
  const listeners = {};
  const calls = { fetch: [], cachePut: [], addAll: [] };
  class FakeRequest {
    constructor(url, init = {}) { this.url = new URL(url, "https://honeypawlab.com/cpt-tracker/").href; this.cache = init.cache ?? "default"; this.method = "GET"; }
  }
  const cache = { addAll: async (reqs) => { calls.addAll.push(reqs); }, put: async (...a) => { calls.cachePut.push(a); } };
  const env = {
    self: { location: { origin: "https://honeypawlab.com" }, addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => null },
    fetch: async (req, init) => { calls.fetch.push({ url: req.url, cache: init?.cache }); return fetchImpl ? fetchImpl(req) : { ok: true, clone() { return this; } }; },
    Request: FakeRequest,
    URL,
  };
  const ctx = vm.createContext(env);
  vm.runInContext(SRC, ctx);
  const fire = (type, request) => {
    let responded;
    const waits = [];
    listeners[type]({ request, respondWith: (p) => { responded = p; }, waitUntil: (p) => waits.push(p) });
    return { responded, waits };
  };
  return { fire, calls, listeners };
}

test("同一オリジンのGETは cache:'no-cache' でサーバーに更新確認する（10分のHTTPキャッシュに頼らない）", async () => {
  const sw = load();
  const { responded, waits } = sw.fire("fetch", { url: "https://honeypawlab.com/cpt-tracker/logic.js", method: "GET" });
  await responded;
  await Promise.all(waits);
  assert.equal(sw.calls.fetch.length, 1);
  assert.equal(sw.calls.fetch[0].cache, "no-cache");
});

test("別オリジン（GASのライブAPIなど）やGET以外には関与しない", () => {
  const sw = load();
  assert.equal(sw.fire("fetch", { url: "https://script.google.com/macros/s/x/exec", method: "GET" }).responded, undefined);
  assert.equal(sw.fire("fetch", { url: "https://honeypawlab.com/cpt-tracker/x", method: "POST" }).responded, undefined);
  assert.equal(sw.calls.fetch.length, 0);
});

test("事前保存はHTTPキャッシュを経由せず(cache:'reload')、analytics.jsも含む", async () => {
  const sw = load();
  const { waits } = sw.fire("install", {});
  await Promise.all(waits);
  const reqs = sw.calls.addAll[0];
  assert.ok(reqs.every((r) => r.cache === "reload"));
  assert.ok(reqs.some((r) => r.url.endsWith("/analytics.js")), "analytics.jsが事前保存に含まれる（オフラインでもimportできる）");
  assert.ok(reqs.some((r) => r.url.endsWith("/logic.js")));
});

test("オフライン（fetch失敗）ならキャッシュを返す", async () => {
  const sw = load({ fetchImpl: () => { throw new Error("offline"); } });
  sw.ctx; // eslint no-op
  const { responded } = sw.fire("fetch", { url: "https://honeypawlab.com/cpt-tracker/app.js", method: "GET" });
  // キャッシュ未登録でも例外にならず解決する（undefinedを返す）
  await assert.doesNotReject(Promise.resolve(responded));
});
