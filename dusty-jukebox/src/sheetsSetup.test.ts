import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ensureIndexAndSyncTabsExist,
  ensureValidHeader,
  createSpreadsheetSetupIO,
  migrateLegacyIndexHeaderV1,
  migrateLegacyIndexHeaderV2,
  type SpreadsheetSetupIO,
} from "./sheetsSetup";
import { INDEX_SHEET_HEADER, INDEX_SHEET_NAME, LEGACY_INDEX_SHEET_HEADER_V1, LEGACY_INDEX_SHEET_HEADER_V2 } from "./sheets";
import { SYNC_SHEET_NAME, SYNC_TAB_HEADER } from "./sync";

function makeFakeIO(
  existingTitles: string[],
  emptyTitles: string[] = []
): SpreadsheetSetupIO & {
  addCalls: { title: string; columnCount: number }[];
  headerCalls: { sheetName: string; header: readonly (string | number)[] }[];
  isTabEmptyCalls: string[];
  expandColumnCountCalls: { sheetName: string; columnCount: number }[];
} {
  const addCalls: { title: string; columnCount: number }[] = [];
  const headerCalls: { sheetName: string; header: readonly (string | number)[] }[] = [];
  const isTabEmptyCalls: string[] = [];
  const expandColumnCountCalls: { sheetName: string; columnCount: number }[] = [];
  const titles = [...existingTitles];
  const empty = new Set(emptyTitles);
  return {
    addCalls,
    headerCalls,
    isTabEmptyCalls,
    expandColumnCountCalls,
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
    async expandColumnCount(sheetName, columnCount) {
      expandColumnCountCalls.push({ sheetName, columnCount });
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

  test("タブが真に空で回復する際、writeHeaderRowの前にグリッドをexpectedHeader.length分へ拡張する（2026-08-20 /code-review指摘：ユーザーが手作業で作った既定26列の空タブ等、writeHeaderRowが範囲超過エラーになるケースの回避。migrateLegacyIndexHeaderV1と同じ扱いをisTabEmptyフォールバックにも揃える）", async () => {
    let currentHeader: (string | number)[] = [];
    const headerIO = { readHeaderRow: async () => currentHeader };
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], [INDEX_SHEET_NAME]);
    const originalWrite = setupIO.writeHeaderRow.bind(setupIO);
    const callOrder: string[] = [];
    setupIO.expandColumnCount = async (sheetName, columnCount) => {
      callOrder.push("expand");
      setupIO.expandColumnCountCalls.push({ sheetName, columnCount });
    };
    setupIO.writeHeaderRow = async (sheetName, header) => {
      callOrder.push("write");
      await originalWrite(sheetName, header);
      currentHeader = [...header];
    };

    await ensureValidHeader(headerIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, (h) => h.join() === INDEX_SHEET_HEADER.join());

    expect(setupIO.expandColumnCountCalls).toEqual([{ sheetName: INDEX_SHEET_NAME, columnCount: INDEX_SHEET_HEADER.length }]);
    expect(callOrder).toEqual(["expand", "write"]);
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

  test("migrateLegacyコールバックが移行できた場合、isTabEmptyのフォールバックは呼ばずに再検証する（2026-08-20 Codexレビュー指摘：旧27列indexタブのマイグレーション）", async () => {
    let currentHeader: (string | number)[] = [...LEGACY_INDEX_SHEET_HEADER_V1];
    const headerIO = { readHeaderRow: async () => currentHeader };
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []); // データが入っている（空ではない）タブ想定
    const migrateLegacy = vi.fn(async (header: (string | number)[]) => {
      if (header.join() !== LEGACY_INDEX_SHEET_HEADER_V1.join()) return false;
      currentHeader = [...INDEX_SHEET_HEADER];
      return true;
    });

    await ensureValidHeader(headerIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, (h) => h.join() === INDEX_SHEET_HEADER.join(), migrateLegacy);

    expect(migrateLegacy).toHaveBeenCalledTimes(1);
    expect(setupIO.isTabEmptyCalls).toEqual([]); // 移行に成功したのでisTabEmptyのフォールバックは呼ばれない
  });

  test("migrateLegacyコールバックが移行できなかった場合（旧ヘッダーでもない）、通常のisTabEmptyフォールバックに進む", async () => {
    const headerIO = fakeHeaderIO(["foo", "bar"]);
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []); // 空ではない
    const migrateLegacy = vi.fn(async () => false);

    await expect(
      ensureValidHeader(
        headerIO,
        setupIO,
        INDEX_SHEET_NAME,
        INDEX_SHEET_HEADER,
        (h) => h.join() === INDEX_SHEET_HEADER.join(),
        migrateLegacy
      )
    ).rejects.toThrow(/ヘッダー行が想定と一致しません/);
    expect(migrateLegacy).toHaveBeenCalledTimes(1);
  });
});

describe("migrateLegacyIndexHeaderV1", () => {
  test("旧27列ヘッダーの場合、グリッドを拡張してから新ヘッダーを書き込みtrueを返す", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV1(setupIO, [...LEGACY_INDEX_SHEET_HEADER_V1]);

    expect(migrated).toBe(true);
    expect(setupIO.expandColumnCountCalls).toEqual([{ sheetName: INDEX_SHEET_NAME, columnCount: INDEX_SHEET_HEADER.length }]);
    expect(setupIO.headerCalls).toEqual([{ sheetName: INDEX_SHEET_NAME, header: INDEX_SHEET_HEADER }]);
  });

  test("旧27列ヘッダーと一致しない場合は何もせずfalseを返す", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV1(setupIO, ["foo", "bar"]);

    expect(migrated).toBe(false);
    expect(setupIO.expandColumnCountCalls).toEqual([]);
    expect(setupIO.headerCalls).toEqual([]);
  });

  test("既に現行ヘッダーの場合はfalseを返す（isValidIndexHeader側で既に有効と判定されるはずだが、念のため旧ヘッダーとは一致しないことを確認）", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV1(setupIO, [...INDEX_SHEET_HEADER]);

    expect(migrated).toBe(false);
  });
});

describe("migrateLegacyIndexHeaderV2", () => {
  test("旧45列ヘッダー（scanRunId列追加前）の場合、グリッドを拡張してから新ヘッダーを書き込みtrueを返す", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV2(setupIO, [...LEGACY_INDEX_SHEET_HEADER_V2]);

    expect(migrated).toBe(true);
    expect(setupIO.expandColumnCountCalls).toEqual([{ sheetName: INDEX_SHEET_NAME, columnCount: INDEX_SHEET_HEADER.length }]);
    expect(setupIO.headerCalls).toEqual([{ sheetName: INDEX_SHEET_NAME, header: INDEX_SHEET_HEADER }]);
  });

  test("旧45列ヘッダーと一致しない場合は何もせずfalseを返す", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV2(setupIO, ["foo", "bar"]);

    expect(migrated).toBe(false);
    expect(setupIO.expandColumnCountCalls).toEqual([]);
    expect(setupIO.headerCalls).toEqual([]);
  });

  test("旧27列ヘッダー（V1）とは一致しないためfalseを返す（V1はmigrateLegacyIndexHeaderV1が別途扱う）", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV2(setupIO, [...LEGACY_INDEX_SHEET_HEADER_V1]);

    expect(migrated).toBe(false);
  });

  test("既に現行ヘッダーの場合はfalseを返す", async () => {
    const setupIO = makeFakeIO([INDEX_SHEET_NAME], []);
    const migrated = await migrateLegacyIndexHeaderV2(setupIO, [...INDEX_SHEET_HEADER]);

    expect(migrated).toBe(false);
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

  test("expandColumnCountは現在の列数が不足している場合、sheetIdを取得してからupdateSheetPropertiesでgridProperties.columnCountを拡張する", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("fields=")) {
        return fakeResponse(200, { sheets: [{ properties: { sheetId: 42, title: "index", gridProperties: { columnCount: 27 } } }] });
      }
      return fakeResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await io.expandColumnCount("index", 45);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [batchUrl, batchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(batchUrl).toContain(":batchUpdate");
    const body = JSON.parse(batchInit.body as string);
    expect(body).toEqual({
      requests: [{ updateSheetProperties: { properties: { sheetId: 42, gridProperties: { columnCount: 45 } }, fields: "gridProperties.columnCount" } }],
    });
  });

  test("expandColumnCountは既に列数が十分な場合はbatchUpdateを呼ばない", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(200, { sheets: [{ properties: { sheetId: 42, title: "index", gridProperties: { columnCount: 45 } } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await io.expandColumnCount("index", 45);

    expect(fetchMock).toHaveBeenCalledTimes(1); // sheetId取得のみ、batchUpdateは呼ばれない
  });

  test("expandColumnCountは対象タブが見つからない場合エラーを投げる", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { sheets: [{ properties: { sheetId: 1, title: "other" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSpreadsheetSetupIO("sheet1", async () => "token");
    await expect(io.expandColumnCount("index", 45)).rejects.toThrow(/見つかりません/);
  });
});
