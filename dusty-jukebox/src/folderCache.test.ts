import { describe, expect, test, vi } from "vitest";
import {
  buildFolderCacheRow,
  createCacheFirstFolderGetFn,
  FOLDERS_SHEET_HEADER,
  isValidFoldersHeader,
  parseFolderCacheEntries,
  parseFolderCacheRows,
  upsertFolderCacheEntries,
  type FolderCacheEntry,
  type FolderCacheIO,
} from "./folderCache";

describe("isValidFoldersHeader", () => {
  test("正しいヘッダーはtrue", () => {
    expect(isValidFoldersHeader([...FOLDERS_SHEET_HEADER])).toBe(true);
  });
  test("列数や中身が違えばfalse", () => {
    expect(isValidFoldersHeader(["folderId", "name"])).toBe(false);
    expect(isValidFoldersHeader(["a", "b", "c"])).toBe(false);
  });
});

describe("parseFolderCacheRows / parseFolderCacheEntries", () => {
  test("folderId列が空の行は無視する", () => {
    const rows = [
      ["f1", "Artist", "root"],
      ["", "ignored", "x"],
      ["f2", "Album", "f1"],
    ];
    const parsed = parseFolderCacheRows(rows);
    expect(parsed.size).toBe(2);
    expect(parsed.get("f1")).toEqual({ rowNumber: 2, entry: { name: "Artist", parentId: "root" } });
    expect(parsed.get("f2")).toEqual({ rowNumber: 4, entry: { name: "Album", parentId: "f1" } });

    const entries = parseFolderCacheEntries(rows);
    expect(entries.get("f1")).toEqual({ name: "Artist", parentId: "root" });
    expect(entries.size).toBe(2);
  });
});

describe("buildFolderCacheRow", () => {
  test("folderId, name, parentIdの順で1行を作る", () => {
    expect(buildFolderCacheRow("f1", { name: "Artist", parentId: "root" })).toEqual(["f1", "Artist", "root"]);
  });
});

function makeFakeIO(existingRows: (string | number)[][]): FolderCacheIO & {
  updateCalls: { rowNumber: number; row: (string | number)[] }[][];
  appendCalls: (string | number)[][][];
} {
  const updateCalls: { rowNumber: number; row: (string | number)[] }[][] = [];
  const appendCalls: (string | number)[][][] = [];
  return {
    updateCalls,
    appendCalls,
    async readHeaderRow() {
      return [...FOLDERS_SHEET_HEADER];
    },
    async listExistingRows() {
      return existingRows;
    },
    async updateRows(updates) {
      updateCalls.push(updates);
    },
    async appendRows(rows) {
      appendCalls.push(rows);
    },
  };
}

describe("upsertFolderCacheEntries", () => {
  test("新規folderIdは追記、既存かつ変化があるものは更新、変化が無いものはAPIを呼ばない", async () => {
    const io = makeFakeIO([
      ["f1", "Artist", "root"],
      ["f2", "OldAlbumName", "f1"],
    ]);
    const discovered = new Map<string, FolderCacheEntry>([
      ["f1", { name: "Artist", parentId: "root" }], // 変化なし
      ["f2", { name: "NewAlbumName", parentId: "f1" }], // 名前が変わった
      ["f3", { name: "NewSong", parentId: "f1" }], // 新規
    ]);

    await upsertFolderCacheEntries(io, discovered);

    expect(io.updateCalls).toEqual([[{ rowNumber: 3, row: ["f2", "NewAlbumName", "f1"] }]]);
    expect(io.appendCalls).toEqual([[["f3", "NewSong", "f1"]]]);
  });

  test("discoveredが空ならAPIを一切呼ばない", async () => {
    const io = makeFakeIO([]);
    await upsertFolderCacheEntries(io, new Map());
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("大量件数はWRITE_BATCH_SIZE単位に分割して書き込む", async () => {
    const io = makeFakeIO([]);
    const discovered = new Map<string, FolderCacheEntry>();
    for (let i = 0; i < 450; i++) discovered.set(`f${i}`, { name: `Folder${i}`, parentId: "root" });

    await upsertFolderCacheEntries(io, discovered);

    expect(io.appendCalls.length).toBe(3); // 200 + 200 + 50
    expect(io.appendCalls[0].length).toBe(200);
    expect(io.appendCalls[2].length).toBe(50);
  });

  test("insertOnly=trueの場合、既存folderIdは値が異なっていても更新しない。新規folderIdの追記のみ行う", async () => {
    const io = makeFakeIO([
      ["f1", "Artist", "root"],
      ["f2", "OldAlbumName", "f1"],
    ]);
    const discovered = new Map<string, FolderCacheEntry>([
      ["f2", { name: "NewAlbumName", parentId: "f1" }], // 既存だが値が異なる → insertOnlyでは更新しない
      ["f3", { name: "NewSong", parentId: "f1" }], // 新規 → 追記する
    ]);

    await upsertFolderCacheEntries(io, discovered, undefined, true);

    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([[["f3", "NewSong", "f1"]]]);
  });

  test("existingRowsSnapshotを渡した場合はlistExistingRowsを呼ばない", async () => {
    const io = makeFakeIO([]);
    const listSpy = vi.spyOn(io, "listExistingRows");
    await upsertFolderCacheEntries(io, new Map([["f1", { name: "A", parentId: "root" }]]), [["f1", "A", "root"]]);
    expect(listSpy).not.toHaveBeenCalled();
    expect(io.appendCalls).toEqual([]); // スナップショット内で既に同じ値のため書き込み不要
  });
});

describe("createCacheFirstFolderGetFn", () => {
  test("キャッシュに無ければfallbackを呼ぶ", async () => {
    const cache = new Map<string, FolderCacheEntry>([["f1", { name: "Cached", parentId: "root" }]]);
    const fallback = vi.fn(async (id: string) => ({ name: `Live-${id}`, parentId: "root" }));
    const getFolder = createCacheFirstFolderGetFn(cache, fallback);

    await expect(getFolder("f1")).resolves.toEqual({ name: "Cached", parentId: "root" });
    expect(fallback).not.toHaveBeenCalled();

    await expect(getFolder("f2")).resolves.toEqual({ name: "Live-f2", parentId: "root" });
    expect(fallback).toHaveBeenCalledWith("f2");
  });
});
