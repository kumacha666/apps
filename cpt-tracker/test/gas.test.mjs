// gas/Code.gs を、GASのサービス（Cache/Lock/UrlFetch等）を模したモック上で実行して挙動を検証する。
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../gas/Code.gs", import.meta.url), "utf8");

function makeEnv({ token = "TKN", lockResults = [true], fetchImpl } = {}) {
  const store = new Map();
  const calls = { fetch: 0, tryLock: [], released: 0 };
  const locks = [...lockResults];
  const env = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => ({ STARTGG_TOKEN: token, EVENT_ID: "1602225" })[k] ?? null }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (store.has(k) ? store.get(k) : null), put: (k, v) => store.set(k, v) }) },
    LockService: {
      getScriptLock: () => ({
        tryLock: (ms) => { calls.tryLock.push(ms); return locks.length ? locks.shift() : true; },
        releaseLock: () => { calls.released++; },
      }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return this.text; } }),
    },
    Utilities: { sleep() {} },
    Logger: { log() {} },
    UrlFetchApp: {
      fetch: (_url, opts) => {
        calls.fetch++;
        if (fetchImpl) return fetchImpl(JSON.parse(opts.payload).query);
        return defaultFetch(JSON.parse(opts.payload).query);
      },
    },
  };
  const ctx = vm.createContext(env);
  vm.runInContext(SRC, ctx);
  return { ctx, store, calls, run: () => JSON.parse(ctx.doGet().getContent()) };
}

const resp = (data) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ data }) });
function defaultFetch(query) {
  if (query.includes("standings(")) {
    return resp({ event: { standings: { pageInfo: { totalPages: 1 }, nodes: [
      { placement: 9, entrant: { id: 1, name: "ZETA | A", participants: [{ player: { gamerTag: "A" } }] } },
      { placement: 33, entrant: { id: 2, name: "B", participants: [{ player: { gamerTag: "B" } }] } },
    ] } } });
  }
  if (query.includes("sets(")) {
    return resp({ event: { sets: { pageInfo: { totalPages: 1 }, nodes: [{ slots: [{ entrant: { id: 1 } }, { entrant: null }] }] } } });
  }
  return resp({ event: { id: 1602225, name: "SF6", state: "ACTIVE", numEntrants: 2, phases: [{ name: "TOP 24", state: "ACTIVE" }] } });
}

test("トークン未設定ならエラーを返しstart.ggを呼ばない", () => {
  const e = makeEnv({ token: null });
  const out = e.run();
  assert.equal(out.ok, false);
  assert.equal(e.calls.fetch, 0);
});

test("キャッシュ切れ: 更新担当になれたら取得し、fresh と stale の両方に保存する", () => {
  const e = makeEnv();
  const out = e.run();
  assert.equal(out.ok, true);
  assert.deepEqual(out.aliveIds, ["1"]);
  assert.equal(out.standings.length, 2);
  assert.ok(e.store.has("live:1602225") && e.store.has("stale:1602225"));
  assert.equal(e.calls.released, 1);
  const before = e.calls.fetch;
  const again = e.run(); // 2回目はキャッシュ命中。start.ggは呼ばない
  assert.equal(again.ok, true);
  assert.equal(e.calls.fetch, before);
});

test("他の人が更新中（ロックが取れない）なら、待たずに前回の応答を stale:true で即返す", () => {
  const e = makeEnv({ lockResults: [true] });
  e.run(); // 前回の応答を作る
  e.store.delete("live:1602225"); // キャッシュ切れを再現
  const e2fetch = e.calls.fetch;
  // 次のtryLockは失敗させる
  e.ctx.LockService = { getScriptLock: () => ({ tryLock: (ms) => { e.calls.tryLock.push(ms); return false; }, releaseLock: () => { e.calls.released++; } }) };
  const out = e.run();
  assert.equal(out.ok, true);
  assert.equal(out.stale, true);
  assert.equal(e.calls.fetch, e2fetch, "ロックが取れない人はstart.ggを呼ばない");
  assert.equal(e.calls.tryLock.at(-1), 500, "長く待たない（0.5秒だけ試す）");
});

test("古い応答がまだ無い最初の1回だけは、更新担当の完了を待つ（2回目のtryLock）", () => {
  const e = makeEnv({ lockResults: [false, true] });
  const out = e.run();
  assert.equal(out.ok, true);
  assert.deepEqual(e.calls.tryLock, [500, 20000]);
  assert.equal(e.calls.released, 1);
});

test("待っても取れず古い応答も無ければ、混雑エラーを返す（ロックを解放しようとしない）", () => {
  const e = makeEnv({ lockResults: [false, false] });
  const out = e.run();
  assert.equal(out.ok, false);
  assert.match(out.error, /混雑/);
  assert.equal(e.calls.released, 0);
});

test("start.ggが失敗しても、前回の応答があればそれを stale:true と理由つきで返す", () => {
  const e = makeEnv();
  e.run();
  e.store.delete("live:1602225");
  e.ctx.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 500, getContentText: () => "boom" }) };
  const out = e.run();
  assert.equal(out.ok, true);
  assert.equal(out.stale, true);
  assert.ok(out.staleReason);
  assert.equal(out.aliveIds.length, 1, "前回のデータが残っている");
});

test("start.ggが失敗し前回の応答も無ければ ok:false", () => {
  const e = makeEnv({ fetchImpl: () => ({ getResponseCode: () => 500, getContentText: () => "boom" }) });
  const out = e.run();
  assert.equal(out.ok, false);
});

test("大会終了(COMPLETED)なら生存者は空で aliveCount=0", () => {
  const e = makeEnv({ fetchImpl: (q) => (q.includes("standings(") || q.includes("sets(") ? defaultFetch(q) : resp({ event: { id: 1, name: "SF6", state: "COMPLETED", numEntrants: 2, phases: [] } })) });
  const out = e.run();
  assert.equal(out.aliveCount, 0);
  assert.deepEqual(out.aliveIds, []);
});
