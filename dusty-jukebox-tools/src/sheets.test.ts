import { afterEach, describe, expect, test, vi } from "vitest";
import {
  columnLetter,
  createSheetsIndexIO,
  INDEX_SHEET_HEADER,
  INDEX_SHEET_NAME,
  isValidIndexHeader,
  SheetsHttpError,
} from "./sheets";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("isValidIndexHeader", () => {
  test("INDEX_SHEET_HEADERと完全一致する場合はtrue", () => {
    expect(isValidIndexHeader([...INDEX_SHEET_HEADER])).toBe(true);
  });

  test("列が欠けている・列順が異なる場合はfalse", () => {
    expect(isValidIndexHeader(INDEX_SHEET_HEADER.slice(0, -1))).toBe(false);
    expect(isValidIndexHeader(["wrong", ...INDEX_SHEET_HEADER.slice(1)])).toBe(false);
  });

  test("ヘッダー行が空（indexタブは存在するがヘッダー未作成）の場合はfalse", () => {
    expect(isValidIndexHeader([])).toBe(false);
  });
});

describe("columnLetter", () => {
  test("1-indexed列番号をA1記法の列文字に変換する", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
    expect(columnLetter(46)).toBe("AT"); // INDEX_SHEET_HEADER.length（46列目）
  });
});

describe("createSheetsIndexIO", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("fetch()自体が例外を投げる一時的な通信断もリトライし、最終的に成功する", async () => {
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
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });

  test("readHeaderRowは1行目全体（列範囲を指定しない`1:1`記法）をそのまま返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [[...INDEX_SHEET_HEADER]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const header = await io.readHeaderRow();
    expect(header).toEqual([...INDEX_SHEET_HEADER]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain(`${INDEX_SHEET_NAME}'!1:1`);
    expect(decoded).not.toMatch(/![A-Z]+\d*:[A-Z]/);
  });

  test("readHeaderRowはヘッダー行が空の場合は空配列を返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([]);
  });

  test("updateCellsは複数セルを1回のvalues:batchUpdateにまとめ、行全体ではなく対象セルだけを指定する", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await io.updateCells([
      { rowNumber: 5, columnIndex: 8, value: "Queen" },
      { rowNumber: 9, columnIndex: 10, value: "Queen" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(":batchUpdate");
    const body = JSON.parse(init.body as string) as { data: { range: string; values: unknown[][] }[] };
    expect(body.data).toHaveLength(2);
    expect(decodeURIComponent(body.data[0].range)).toContain("!I5"); // columnIndex 8 → 1-indexed 9 → "I"
    expect(body.data[0].values).toEqual([["Queen"]]);
  });

  test("updateCellsは空配列ならAPIを呼ばない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const io = createSheetsIndexIO("sheet1", async () => "token");
    await io.updateCells([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("HTTPエラー応答はSheetsHttpErrorとしてステータスを保持する（リトライ対象外の4xx）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(401, { error: "unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);
    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.listExistingRows()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("SheetsHttpError", () => {
  test("statusとmessageを保持する", () => {
    const err = new SheetsHttpError(500, "boom");
    expect(err.status).toBe(500);
    expect(err.message).toBe("boom");
  });
});
