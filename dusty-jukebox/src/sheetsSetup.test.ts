import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureIndexAndSyncTabsExist, createSpreadsheetSetupIO, type SpreadsheetSetupIO } from "./sheetsSetup";
import { INDEX_SHEET_HEADER, INDEX_SHEET_NAME } from "./sheets";
import { SYNC_SHEET_NAME, SYNC_TAB_HEADER } from "./sync";

function makeFakeIO(
  existingTitles: string[],
  emptyTitles: string[] = []
): SpreadsheetSetupIO & { addCalls: string[]; headerCalls: { sheetName: string; header: readonly (string | number)[] }[] } {
  const addCalls: string[] = [];
  const headerCalls: { sheetName: string; header: readonly (string | number)[] }[] = [];
  const titles = [...existingTitles];
  const empty = new Set(emptyTitles);
  return {
    addCalls,
    headerCalls,
    async listSheetTitles() {
      return [...titles];
    },
    async addSheetTab(title) {
      addCalls.push(title);
      titles.push(title);
      empty.add(title); // 新規作成直後のタブは空
    },
    async writeHeaderRow(sheetName, header) {
      headerCalls.push({ sheetName, header });
      empty.delete(sheetName); // ヘッダーを書いたので以後は「空」ではない
    },
    async isTabEmpty(sheetName) {
      return empty.has(sheetName);
    },
  };
}

describe("ensureIndexAndSyncTabsExist", () => {
  test("両タブとも存在しない場合、両方作成しヘッダー行を書く", async () => {
    const io = makeFakeIO([]);
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([INDEX_SHEET_NAME, SYNC_SHEET_NAME]);
    expect(io.headerCalls).toEqual([
      { sheetName: INDEX_SHEET_NAME, header: INDEX_SHEET_HEADER },
      { sheetName: SYNC_SHEET_NAME, header: SYNC_TAB_HEADER },
    ]);
  });

  test("両タブとも既に存在し、かつ中身がある場合は何もしない（既存データには一切触れない）", async () => {
    const io = makeFakeIO([INDEX_SHEET_NAME, SYNC_SHEET_NAME], []); // emptyTitlesを空にする=どちらも中身あり扱い
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([]);
    expect(io.headerCalls).toEqual([]);
  });

  test("タブは存在するが完全に空の場合、ヘッダー行を書いて回復する（2026-08-20 Codexレビュー指摘：addSheetTab成功後にwriteHeaderRowだけ失敗して中断したケースの復旧）", async () => {
    const io = makeFakeIO([INDEX_SHEET_NAME, SYNC_SHEET_NAME], [INDEX_SHEET_NAME, SYNC_SHEET_NAME]);
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([]); // タブ自体は既に存在するため追加はしない
    expect(io.headerCalls).toEqual([
      { sheetName: INDEX_SHEET_NAME, header: INDEX_SHEET_HEADER },
      { sheetName: SYNC_SHEET_NAME, header: SYNC_TAB_HEADER },
    ]);
  });

  test("indexタブのみ存在する場合、syncタブだけ作成する", async () => {
    const io = makeFakeIO([INDEX_SHEET_NAME], []);
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([SYNC_SHEET_NAME]);
    expect(io.headerCalls).toEqual([{ sheetName: SYNC_SHEET_NAME, header: SYNC_TAB_HEADER }]);
  });

  test("addSheetTabが失敗しても、その後の一覧確認でタブが既に存在し空であればヘッダーを書く（他デバイスが同時作成したがヘッダーはまだ書いていないケース）", async () => {
    const io = makeFakeIO([], []);
    let addCallCount = 0;
    io.addSheetTab = async (title) => {
      addCallCount += 1;
      if (title === INDEX_SHEET_NAME) {
        // 他クライアントが同じタイミングでindexタブを作成済みだったケースを想定
        throw new Error('A sheet with the name "index" already exists');
      }
    };
    // listSheetTitlesを差し替えて、addSheetTabの失敗後は既に存在する状態を返すようにする
    let listCallCount = 0;
    io.listSheetTitles = async () => {
      listCallCount += 1;
      return listCallCount === 1 ? [] : [INDEX_SHEET_NAME];
    };
    io.isTabEmpty = async () => true; // 他クライアントはタブ作成のみでヘッダーはまだ書いていない

    await expect(ensureIndexAndSyncTabsExist(io)).resolves.toBeUndefined();
    expect(addCallCount).toBeGreaterThan(0);
    expect(io.headerCalls.some((c) => c.sheetName === INDEX_SHEET_NAME)).toBe(true);
    expect(io.headerCalls.some((c) => c.sheetName === SYNC_SHEET_NAME)).toBe(true);
  });

  test("addSheetTabが失敗し、他クライアントが既にヘッダーまで書いていた場合は上書きしない", async () => {
    const io = makeFakeIO([], []);
    io.addSheetTab = async () => {
      throw new Error('A sheet with the name "index" already exists');
    };
    let listCallCount = 0;
    io.listSheetTitles = async () => {
      listCallCount += 1;
      return listCallCount === 1 ? [] : [INDEX_SHEET_NAME, SYNC_SHEET_NAME];
    };
    io.isTabEmpty = async () => false; // 他クライアントが既にヘッダーを書き終えている

    await ensureIndexAndSyncTabsExist(io);
    expect(io.headerCalls.some((c) => c.sheetName === INDEX_SHEET_NAME)).toBe(false);
  });

  test("addSheetTabが失敗し、再確認でも存在しない場合は例外をそのまま伝える", async () => {
    const io = makeFakeIO([]);
    io.addSheetTab = async () => {
      throw new Error("permission denied");
    };
    await expect(ensureIndexAndSyncTabsExist(io)).rejects.toThrow("permission denied");
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

describe("createSpreadsheetSetupIO", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("listSheetTitlesはsheets.properties.titleの一覧を返す", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(200, { sheets: [{ properties: { title: "index" } }, { properties: { title: "playlists" } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    const titles = await io.listSheetTitles();
    expect(titles).toEqual(["index", "playlists"]);
  });

  test("addSheetTabはbatchUpdateでaddSheetリクエストを送る", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await io.addSheetTab("sync");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(":batchUpdate");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ requests: [{ addSheet: { properties: { title: "sync" } } }] });
  });

  test("writeHeaderRowはA1:<lastCol>1へPUTする", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await io.writeHeaderRow("sync", ["key", "value"]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(decodeURIComponent(url)).toContain("'sync'!A1:B1");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ values: [["key", "value"]] });
  });

  test("isTabEmptyはA1:Z5に値が無ければtrueを返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await expect(io.isTabEmpty("sync")).resolves.toBe(true);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("'sync'!A1:Z5");
  });

  test("isTabEmptyは何らかの値があればfalseを返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [["key", "value"]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await expect(io.isTabEmpty("sync")).resolves.toBe(false);
  });
});
