import { afterEach, describe, expect, test, vi } from "vitest";
import { buildIndexRow, createSheetsIndexIO, INDEX_SHEET_HEADER, isValidIndexHeader, upsertIndexRows, type SheetsIndexIO } from "./sheets";

function makeFakeIO(
  existingRows: (string | number)[][]
): SheetsIndexIO & { updateCalls: { rowNumber: number; row: (string | number)[] }[][]; appendCalls: (string | number)[][][] } {
  const updateCalls: { rowNumber: number; row: (string | number)[] }[][] = [];
  const appendCalls: (string | number)[][][] = [];
  return {
    updateCalls,
    appendCalls,
    async listExistingRows() {
      return existingRows;
    },
    async readHeaderRow() {
      return [...INDEX_SHEET_HEADER];
    },
    async updateRows(updates) {
      updateCalls.push(updates);
    },
    async appendRows(rows) {
      appendCalls.push(rows);
    },
  };
}

function indexOf(name: (typeof INDEX_SHEET_HEADER)[number]): number {
  return INDEX_SHEET_HEADER.indexOf(name);
}

describe("buildIndexRow", () => {
  test("列数がINDEX_SHEET_HEADERと一致する", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "01 世界が終るまでは....mp3",
      parentId: "wands",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "世界が終るまでは...", artist: "WANDS", releaseYear: 1994 },
      extractionFailed: false,
    });
    expect(row).toHaveLength(INDEX_SHEET_HEADER.length);
  });

  test("抽出値を対応する列に書き込み、_override列は常に空欄で作成する（4.2節）", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "Theme.m4a",
      parentId: "folder1",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Theme", artist: "Michael Giacchino", composer: ["Michael Giacchino", "Others"], releaseYear: 2018 },
      extractionFailed: false,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.fileId).toBe("f1");
    expect(byName.extension).toBe("m4a");
    expect(byName.title).toBe("Theme");
    expect(byName.title_override).toBe("");
    expect(byName.composer).toBe("Michael Giacchino / Others");
    expect(byName.composer_override).toBe("");
    expect(byName.releaseYear).toBe(2018);
    expect(byName.releaseYear_override).toBe("");
    expect(byName.extractionFailed).toBe("FALSE");
  });

  test("文字化けマーカーを検出した場合garbledSuspectを立てるが、修復は行わずgarbledResolvedはFALSEのまま", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "junk.mp3",
      parentId: "various",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { composer: "縺薙ｓ縺ｫ縺｡縺ｯ" },
      extractionFailed: false,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.garbledSuspect).toBe("TRUE");
    expect(byName.garbledResolved).toBe("FALSE");
  });

  test("タグ抽出に失敗した場合extractionFailedを立てる（5節の巨大ファイルタイムアウト等）", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "huge-concert.flac",
      parentId: "orchestra",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: null,
      extractionFailed: true,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.extractionFailed).toBe("TRUE");
    expect(byName.title).toBe("");
  });
});

describe("upsertIndexRows", () => {
  test("既存のfileIdは該当行を上書きし、新規fileIdは末尾に追記する", async () => {
    // 2行目=f1(既存)、3行目=f2(既存)。f3は新規。
    const existingF1 = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const existingF2 = buildIndexRow({
      fileId: "f2",
      fileName: "old2.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([existingF1, existingF2]);
    const newF1 = buildIndexRow({
      fileId: "f1",
      fileName: "updated.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Updated Title" },
      extractionFailed: false,
    });
    const newF3 = buildIndexRow({
      fileId: "f3",
      fileName: "new.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Brand New" },
      extractionFailed: false,
    });
    await upsertIndexRows(io, [
      { fileId: "f1", row: newF1 },
      { fileId: "f3", row: newF3 },
    ]);

    expect(io.updateCalls).toHaveLength(1);
    expect(io.updateCalls[0]).toEqual([{ rowNumber: 2, row: newF1 }]);
    expect(io.appendCalls).toEqual([[newF3]]);
  });

  test("既存行の_override列は温存し、抽出値列だけ新しい値で上書きする（4.2節: スキャナはoverrideを書き換えない）", async () => {
    const existing = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: { title: "抽出タイトル(旧)", artist: "抽出アーティスト" },
      extractionFailed: false,
    });
    // ユーザーが手動でtitle_override/artist_overrideを補正済みと仮定
    existing[indexOf("title_override")] = "ユーザー補正タイトル";
    existing[indexOf("artist_override")] = "ユーザー補正アーティスト";

    const io = makeFakeIO([existing]);
    const rescanned = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "抽出タイトル(新)", artist: "抽出アーティスト" },
      extractionFailed: false,
    });

    await upsertIndexRows(io, [{ fileId: "f1", row: rescanned }]);

    const [update] = io.updateCalls[0];
    expect(update.row[indexOf("title")]).toBe("抽出タイトル(新)"); // 抽出値は更新される
    expect(update.row[indexOf("title_override")]).toBe("ユーザー補正タイトル"); // overrideは温存
    expect(update.row[indexOf("artist_override")]).toBe("ユーザー補正アーティスト");
  });

  test("再スキャンでタグ抽出に失敗した場合、既存のタグ列を保持しextractionFailedだけ更新する（5節: 巨大ファイルのタイムアウト等）", async () => {
    const existing = buildIndexRow({
      fileId: "f1",
      fileName: "huge-concert.flac",
      parentId: "orchestra",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: { title: "既存タイトル", artist: "既存アーティスト", releaseYear: 1994 },
      extractionFailed: false,
    });
    const io = makeFakeIO([existing]);
    const failedRescan = buildIndexRow({
      fileId: "f1",
      fileName: "huge-concert.flac",
      parentId: "orchestra",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: null, // タイムアウトでタグが取れなかった
      extractionFailed: true,
    });

    await upsertIndexRows(io, [{ fileId: "f1", row: failedRescan }]);

    const [update] = io.updateCalls[0];
    expect(update.row[indexOf("title")]).toBe("既存タイトル"); // タグ列は既存値を保持
    expect(update.row[indexOf("artist")]).toBe("既存アーティスト");
    expect(update.row[indexOf("releaseYear")]).toBe(1994);
    expect(update.row[indexOf("extractionFailed")]).toBe("TRUE"); // 失敗フラグ自体は更新される
    expect(update.row[indexOf("lastScannedAt")]).toBe("2026-08-20T00:00:00.000Z"); // 走査時刻も更新される
  });

  test("同一バッチ内に同じ新規fileIdが複数含まれる場合、重複行を作らず最後の値を採用する", async () => {
    const io = makeFakeIO([]);
    const first = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "1回目" },
      extractionFailed: false,
    });
    const second = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:01.000Z",
      tags: { title: "2回目" },
      extractionFailed: false,
    });
    await upsertIndexRows(io, [
      { fileId: "f1", row: first },
      { fileId: "f1", row: second },
    ]);
    expect(io.appendCalls).toEqual([[second]]);
  });

  test("空の入力は何もしない（listExistingRowsすら呼ばない）", async () => {
    let listCalled = false;
    const io: SheetsIndexIO = {
      async listExistingRows() {
        listCalled = true;
        return [];
      },
      async readHeaderRow() {
        return [...INDEX_SHEET_HEADER];
      },
      async updateRows() {},
      async appendRows() {},
    };
    await upsertIndexRows(io, []);
    expect(listCalled).toBe(false);
  });

  test("既存fileIdが1件も無い場合は全件追記になる（初回スキャン相当）", async () => {
    const io = makeFakeIO([]);
    const rowF1 = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const rowF2 = buildIndexRow({
      fileId: "f2",
      fileName: "b.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    await upsertIndexRows(io, [
      { fileId: "f1", row: rowF1 },
      { fileId: "f2", row: rowF2 },
    ]);
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([[rowF1, rowF2]]);
  });
});

describe("isValidIndexHeader", () => {
  test("INDEX_SHEET_HEADERと完全一致する場合はtrue", () => {
    expect(isValidIndexHeader([...INDEX_SHEET_HEADER])).toBe(true);
  });

  test("列が欠けている・列順が異なる場合はfalse", () => {
    expect(isValidIndexHeader(INDEX_SHEET_HEADER.slice(0, -1) as unknown as string[])).toBe(false);
    expect(isValidIndexHeader(["fileId", "parentId", "extension", ...INDEX_SHEET_HEADER.slice(3)])).toBe(false);
  });

  test("ヘッダー行が空（indexタブは存在するがヘッダー未作成）の場合はfalse", () => {
    expect(isValidIndexHeader([])).toBe(false);
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

describe("createSheetsIndexIO", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("fetch()自体が例外を投げる一時的な通信断もリトライし、最終的に成功する（2026-08-20 Codexレビュー指摘）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new TypeError("Failed to fetch");
      return fakeResponse(200, { values: [["f1"]] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const promise = io.listExistingRows();
    await vi.runAllTimersAsync();
    const rows = await promise;
    expect(rows).toEqual([["f1"]]);
  });

  test("通信断がリトライ上限まで続いた場合は最後の例外をそのまま投げる", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const promise = io.listExistingRows();
    promise.catch(() => {}); // unhandled rejection警告を避ける（下のexpectで実際にawaitして検証する）
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });

  test("readHeaderRowはA1:<lastCol>1の1行目をそのまま返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [[...INDEX_SHEET_HEADER]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const header = await io.readHeaderRow();
    expect(header).toEqual([...INDEX_SHEET_HEADER]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("A1:AA1"); // INDEX_SHEET_HEADERは27列=AA
  });

  test("readHeaderRowはヘッダー行が空の場合は空配列を返す（indexタブは存在するがヘッダー未作成のケース）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([]);
  });

  test("GETリクエスト（listExistingRows）にはContent-Typeヘッダーを付けない（不要なCORSプリフライトを避ける）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await io.listExistingRows();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  test("POSTリクエスト（appendRows）にはContent-Typeヘッダーを付ける", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await io.appendRows([["f1"]]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  test("appendRowsは通信例外が起きた場合リトライせず即座に例外を伝える（2026-08-20 Codexレビュー指摘：appendは非冪等なため）", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.appendRows([["f1"]])).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // リトライしていないことを確認
  });

  test("appendRowsは500等のHTTPエラー応答でもリトライせず即座に例外を伝える（2026-08-20 Codexレビュー指摘：通信例外だけでなくHTTPエラー経路もガードが必要だった）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(500, { error: { errors: [{ reason: "backendError" }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.appendRows([["f1"]])).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // リトライしていないことを確認
  });

  test("updateRowsは500等のHTTPエラー応答をリトライする（PUT/batchUpdateは冪等なため）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return fakeResponse(500, { error: { errors: [{ reason: "backendError" }] } });
      return fakeResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const promise = io.updateRows([{ rowNumber: 2, row: ["f1"] }]);
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
