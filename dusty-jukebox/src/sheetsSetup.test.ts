import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureIndexAndSyncTabsExist, ensureValidHeader, createSpreadsheetSetupIO, type SpreadsheetSetupIO } from "./sheetsSetup";
import { INDEX_SHEET_HEADER, INDEX_SHEET_NAME } from "./sheets";
import { SYNC_SHEET_NAME, SYNC_TAB_HEADER } from "./sync";

function makeFakeIO(
  existingTitles: string[],
  emptyTitles: string[] = []
): SpreadsheetSetupIO & {
  addCalls: { title: string; columnCount: number }[];
  headerCalls: { sheetName: string; header: readonly (string | number)[] }[];
  isTabEmptyCalls: string[];
} {
  const addCalls: { title: string; columnCount: number }[] = [];
  const headerCalls: { sheetName: string; header: readonly (string | number)[] }[] = [];
  const isTabEmptyCalls: string[] = [];
  const titles = [...existingTitles];
  const empty = new Set(emptyTitles);
  return {
    addCalls,
    headerCalls,
    isTabEmptyCalls,
    async listSheetTitles() {
      return [...titles];
    },
    async addSheetTab(title, columnCount) {
      addCalls.push({ title, columnCount });
      titles.push(title);
      empty.add(title); // 新規作成直後のタブは空
    },
    async writeHeaderRow(sheetName, header) {
      headerCalls.push({ sheetName, header });
      empty.delete(sheetName); // ヘッダーを書いたので以後は「空」ではない
    },
    async isTabEmpty(sheetName) {
      isTabEmptyCalls.push(sheetName);
      return empty.has(sheetName);
    },
  };
}

describe("ensureIndexAndSyncTabsExist", () => {
  test("両タブとも存在しない場合、両方作成しヘッダー行を書く。indexタブは27列（AAまで）分のcolumnCountで作成する（2026-08-20 Codexレビュー指摘：既定26列だとINDEX_SHEET_HEADERが入らずグリッド超過エラーになる）", async () => {
    const io = makeFakeIO([]);
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([
      { title: INDEX_SHEET_NAME, columnCount: INDEX_SHEET_HEADER.length },
      { title: SYNC_SHEET_NAME, columnCount: SYNC_TAB_HEADER.length },
    ]);
    expect(io.headerCalls).toEqual([
      { sheetName: INDEX_SHEET_NAME, header: INDEX_SHEET_HEADER },
      { sheetName: SYNC_SHEET_NAME, header: SYNC_TAB_HEADER },
    ]);
  });

  test("両タブとも既に存在する場合は何もしない（既存タブには一切触れない。中身の検証・回復はensureValidHeaderに委ねる、2026-08-20 /code-review指摘）", async () => {
    const io = makeFakeIO([INDEX_SHEET_NAME, SYNC_SHEET_NAME], []);
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([]);
    expect(io.headerCalls).toEqual([]);
    expect(io.isTabEmptyCalls).toEqual([]); // 既存タブに対してisTabEmptyの重い呼び出しを行わない
  });

  test("indexタブのみ存在する場合、syncタブだけ作成する", async () => {
    const io = makeFakeIO([INDEX_SHEET_NAME], []);
    await ensureIndexAndSyncTabsExist(io);

    expect(io.addCalls).toEqual([{ title: SYNC_SHEET_NAME, columnCount: SYNC_TAB_HEADER.length }]);
    expect(io.headerCalls).toEqual([{ sheetName: SYNC_SHEET_NAME, header: SYNC_TAB_HEADER }]);
  });

  test("addSheetTabが失敗しても、その後の一覧確認でタブが既に存在すればエラーにしない（他デバイスが同時作成したケース）。ヘッダーの有無に関わらずここでは書き込まない（回復はensureValidHeaderに委ねる）", async () => {
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

    await expect(ensureIndexAndSyncTabsExist(io)).resolves.toBeUndefined();
    expect(addCallCount).toBeGreaterThan(0);
    // indexタブ側は競合再確認の経路を通るためヘッダーは書かない。syncタブ側は通常通り
    // 新規作成されるため、そちらのヘッダーは書かれる。
    expect(io.headerCalls).toEqual([{ sheetName: SYNC_SHEET_NAME, header: SYNC_TAB_HEADER }]);
    expect(io.isTabEmptyCalls).toEqual([]);
  });

  test("addSheetTabが失敗し、再確認でも存在しない場合は例外をそのまま伝える", async () => {
    const io = makeFakeIO([]);
    io.addSheetTab = async () => {
      throw new Error("permission denied");
    };
    await expect(ensureIndexAndSyncTabsExist(io)).rejects.toThrow("permission denied");
  });
});

describe("ensureValidHeader", () => {
  function fakeHeaderIO(header: (string | number)[]) {
    return { readHeaderRow: async () => header };
  }

  test("ヘッダーが既に有効な場合は何もしない（isTabEmptyの重い呼び出しを避ける、2026-08-20 /code-review指摘：以前はensureIndexAndSyncTabsExistが既存タブに対して毎回isTabEmptyを呼んでいた）", async () => {
    const headerIO = fakeHeaderIO([...INDEX_SHEET_HEADER]);
    const setupIO = makeFakeIO([INDEX_SHEET_NAME]);

    await ensureValidHeader(headerIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, (h) => h.join() === INDEX_SHEET_HEADER.join());

    expect(setupIO.isTabEmptyCalls).toEqual([]);
    expect(setupIO.headerCalls).toEqual([]);
  });

  test("ヘッダーが無効かつタブが真に空の場合、ヘッダーを書いて回復する（addSheetTab成功後にwriteHeaderRowだけ失敗して中断したケースの復旧）", async () => {
    let currentHeader: (string | number)[] = [];
    const headerIO = { readHeaderRow: async () => currentHeader };
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], [INDEX_SHEET_NAME]);
    const originalWrite = setupIO.writeHeaderRow.bind(setupIO);
    setupIO.writeHeaderRow = async (sheetName, header) => {
      await originalWrite(sheetName, header);
      currentHeader = [...header];
    };

    await ensureValidHeader(headerIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, (h) => h.join() === INDEX_SHEET_HEADER.join());

    expect(setupIO.headerCalls).toEqual([{ sheetName: INDEX_SHEET_NAME, header: INDEX_SHEET_HEADER }]);
  });

  test("ヘッダーが無効でタブに中身がある場合は上書きせずエラーを投げる（無関係な既存タブの誤検出）", async () => {
    const headerIO = fakeHeaderIO(["foo", "bar"]);
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []); // 空ではない

    await expect(
      ensureValidHeader(headerIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, (h) => h.join() === INDEX_SHEET_HEADER.join())
    ).rejects.toThrow(/ヘッダー行が想定と一致しません/);
    expect(setupIO.headerCalls).toEqual([]);
  });

  test("回復を試みても依然として無効な場合はエラーを投げる", async () => {
    const headerIO = fakeHeaderIO([]); // writeHeaderRow後もfakeHeaderIOは固定値を返すため無効なまま
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], [INDEX_SHEET_NAME]);

    await expect(
      ensureValidHeader(headerIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, (h) => h.join() === INDEX_SHEET_HEADER.join())
    ).rejects.toThrow(/ヘッダー行が想定と一致しません/);
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

  test("addSheetTabはbatchUpdateでgridProperties.columnCountを指定したaddSheetリクエストを送る（2026-08-20 Codexレビュー指摘：既定26列だと27列のindexヘッダーが入らない）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await io.addSheetTab("index", 27);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(":batchUpdate");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ requests: [{ addSheet: { properties: { title: "index", gridProperties: { columnCount: 27 } } } }] });
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

  test("isTabEmptyはシート名のみを範囲として指定し（列・行どちらの上限も付けない）、値が無ければtrueを返す（2026-08-20 Codexレビュー指摘：呼び出し元のヘッダー幅に列範囲を限定していたため、それを超える列にしかデータが無い既存タブを見逃していた）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await expect(io.isTabEmpty("index")).resolves.toBe(true);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("/values/'index'");
    expect(decodeURIComponent(url)).not.toContain("!"); // セル参照を付けていないこと
  });

  test("isTabEmptyは何らかの値があればfalseを返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [["key", "value"]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await expect(io.isTabEmpty("sync")).resolves.toBe(false);
  });
});
