import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSyncTabIO,
  isValidSyncHeader,
  markInitialScanCompleted,
  parseSyncState,
  prepareSyncForScan,
  SYNC_TAB_HEADER,
  type SyncTabIO,
} from "./sync";

function makeFakeIO(
  existingRows: (string | number)[][]
): SyncTabIO & { updateCalls: { rowNumber: number; row: [string, string] }[][]; appendCalls: [string, string][][] } {
  const updateCalls: { rowNumber: number; row: [string, string] }[][] = [];
  const appendCalls: [string, string][][] = [];
  let rows = existingRows;
  return {
    updateCalls,
    appendCalls,
    async readAllRows() {
      return rows;
    },
    async readHeaderRow() {
      return [...SYNC_TAB_HEADER];
    },
    async writeRows(updates, appends) {
      if (updates.length > 0) {
        updateCalls.push(updates);
        for (const { rowNumber, row } of updates) rows[rowNumber - 2] = row;
      }
      if (appends.length > 0) {
        appendCalls.push(appends);
        rows = [...rows, ...appends];
      }
    },
  };
}

describe("parseSyncState", () => {
  test("key,value行をSyncStateへ変換する", () => {
    const state = parseSyncState([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"],
    ]);
    expect(state).toEqual({
      startPageToken: "T0",
      rootFolderId: "root1",
      initialScanCompletedAt: "2026-08-20T00:00:00.000Z",
    });
  });

  test("空文字列の値は未設定として扱う（クリアされた状態）", () => {
    const state = parseSyncState([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", ""],
    ]);
    expect(state.initialScanCompletedAt).toBeUndefined();
  });

  test("未知のキー・空行は無視する", () => {
    const state = parseSyncState([
      ["someFutureKey", "x"],
      [],
      ["rootFolderId", "root1"],
    ]);
    expect(state).toEqual({ rootFolderId: "root1" });
  });

  test("行が無い場合は全て未設定", () => {
    expect(parseSyncState([])).toEqual({});
  });
});

describe("prepareSyncForScan", () => {
  test("初回（sync タブが空）はrootFolderIdが無いため新規トークンを取得し、3項目をまとめて書く", async () => {
    const io = makeFakeIO([]);
    const getNewToken = vi.fn(async () => "T-new");

    const result = await prepareSyncForScan(io, getNewToken, "root1");

    expect(result).toEqual({ startPageToken: "T-new" });
    expect(getNewToken).toHaveBeenCalledTimes(1);
    expect(io.appendCalls).toEqual([
      [
        ["startPageToken", "T-new"],
        ["rootFolderId", "root1"],
        ["initialScanCompletedAt", ""],
      ],
    ]);
    expect(io.updateCalls).toEqual([]);
  });

  test("ルートフォルダIDが変わった場合、新規トークンを取得しrootFolderId/startPageToken/initialScanCompletedAtクリアを1回でまとめて書く（CONCEPT.md 4.3節）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-old"],
      ["rootFolderId", "root-old"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
    ]);
    const getNewToken = vi.fn(async () => "T-new");

    const result = await prepareSyncForScan(io, getNewToken, "root-new");

    expect(result).toEqual({ startPageToken: "T-new" });
    expect(getNewToken).toHaveBeenCalledTimes(1);
    expect(io.updateCalls).toEqual([
      [
        { rowNumber: 2, row: ["startPageToken", "T-new"] },
        { rowNumber: 3, row: ["rootFolderId", "root-new"] },
        { rowNumber: 4, row: ["initialScanCompletedAt", ""] },
      ],
    ]);
    expect(io.appendCalls).toEqual([]);
  });

  test("同じルートで初期化未完了（initialScanCompletedAt無し）の場合、既存のstartPageTokenを使い回し新規取得しない（4.3節：複数デバイスの取得し直し競合を避けるため）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-existing"],
      ["rootFolderId", "root1"],
    ]);
    const getNewToken = vi.fn(async () => "T-should-not-be-used");

    const result = await prepareSyncForScan(io, getNewToken, "root1");

    expect(result).toEqual({ startPageToken: "T-existing" });
    expect(getNewToken).not.toHaveBeenCalled();
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("同じルートで初回スキャン完了済みの場合も、既存のstartPageTokenをそのまま使う", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-existing"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
    ]);
    const getNewToken = vi.fn(async () => "T-should-not-be-used");

    const result = await prepareSyncForScan(io, getNewToken, "root1");

    expect(result).toEqual({ startPageToken: "T-existing" });
    expect(getNewToken).not.toHaveBeenCalled();
  });

  test("rootFolderIdは記録済みだがstartPageTokenが無い異常系では新規取得して補う", async () => {
    const io = makeFakeIO([["rootFolderId", "root1"]]);
    const getNewToken = vi.fn(async () => "T-recovered");

    const result = await prepareSyncForScan(io, getNewToken, "root1");

    expect(result).toEqual({ startPageToken: "T-recovered" });
    expect(getNewToken).toHaveBeenCalledTimes(1);
    expect(io.appendCalls).toEqual([[["startPageToken", "T-recovered"]]]);
  });
});

describe("markInitialScanCompleted", () => {
  test("initialScanCompletedAtが未設定なら追記する（現在のsync状態が準備時のroot/tokenと一致する場合）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.appendCalls).toEqual([[["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"]]]);
  });

  test("既存の行があれば更新する", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.updateCalls).toEqual([[{ rowNumber: 4, row: ["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"] }]]);
  });

  test("準備時と現在のrootFolderIdが異なる場合は書き込まない（2026-08-20 Codexレビュー指摘：長時間のスキャン中に別デバイスがルートを切り替えていた場合、無関係なルートを誤って完了扱いにしないため）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-new"],
      ["rootFolderId", "root-B"], // 別デバイスがrootAからrootBへ切り替え済み
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root-A", startPageToken: "T-old" });
    expect(io.appendCalls).toEqual([]);
    expect(io.updateCalls).toEqual([]);
  });

  test("rootFolderIdは一致するがstartPageTokenが異なる場合も書き込まない", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-changed"],
      ["rootFolderId", "root1"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T-original" });
    expect(io.appendCalls).toEqual([]);
    expect(io.updateCalls).toEqual([]);
  });
});

describe("isValidSyncHeader", () => {
  test("SYNC_TAB_HEADERと完全一致する場合はtrue", () => {
    expect(isValidSyncHeader([...SYNC_TAB_HEADER])).toBe(true);
  });

  test("無関係な既存タブ等でヘッダーが異なる・空の場合はfalse（2026-08-20 Codexレビュー指摘：無検証のままsyncタブとして読み書きするとデータ破損の恐れがあった）", () => {
    expect(isValidSyncHeader([])).toBe(false);
    expect(isValidSyncHeader(["foo", "bar"])).toBe(false);
    expect(isValidSyncHeader(["key"])).toBe(false);
  });
});

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("createSyncTabIO", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("readHeaderRowは1行目全体（列範囲を指定しない`1:1`記法）をそのまま返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [[...SYNC_TAB_HEADER]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([...SYNC_TAB_HEADER]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    // 列範囲（A1:B1等）を明示しない。sheets.tsのSheetsIndexIO.readHeaderRowと同じ理由
    // （2026-08-20 /code-review指摘：狭いグリッドに対する範囲超過エラーの同種バグを避ける）。
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("'sync'!1:1");
    expect(decoded).not.toMatch(/![A-Z]+\d*:[A-Z]/);
  });

  test("readHeaderRowはヘッダー行が空の場合は空配列を返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([]);
  });

  test("readAllRowsはA2:B以降を読む", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [["rootFolderId", "root1"]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    const rows = await io.readAllRows();

    expect(rows).toEqual([["rootFolderId", "root1"]]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("'sync'!A2:B");
  });

  test("appendは通信例外時にリトライしない（非冪等のため、sheets.tsのappendRowsと同じ方針）", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    await expect(io.writeRows([], [["rootFolderId", "root1"]])).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("updateは500等のHTTPエラー応答をリトライする（batchUpdateは冪等なため）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return fakeResponse(500, { error: { errors: [{ reason: "backendError" }] } });
      return fakeResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    const promise = io.writeRows([{ rowNumber: 2, row: ["rootFolderId", "root1"] }], []);
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
