import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthError } from "./auth";
import { DriveHttpError } from "./drive";
import { INDEX_SHEET_HEADER } from "./sheets";

const extract = vi.fn();
vi.mock("./tagExtraction", () => ({ extractAndBuildIndexEntries: extract }));

function row(overrides: Partial<Record<"fileId" | "scanRunId" | "driveModifiedTime" | "extractionFailed", string>>): (string | number)[] {
  const values = Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(overrides)) {
    values[INDEX_SHEET_HEADER.indexOf(key as (typeof INDEX_SHEET_HEADER)[number])] = value;
  }
  return values;
}

describe("retryFailedExtractions", () => {
  beforeEach(() => extract.mockReset());

  test("削除済みとtrashedを除外して抽出する", async () => {
    extract.mockResolvedValue([]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const result = await retryFailedExtractions(
      ["gone", "trashed", "live"],
      async (id) => id === "gone" ? null : { id, name: `${id}.mp3`, mimeType: "audio/mpeg", trashed: id === "trashed" },
      () => async () => new Uint8Array(), () => {}
    );
    expect(result.removedFileIds).toEqual(["gone"]);
    expect(result.trashedFileIds).toEqual(["trashed"]);
    expect(extract.mock.calls[0][0]).toEqual([{ file: expect.objectContaining({ id: "live" }), folderPath: "" }]);
    expect(extract.mock.calls[0][3]).toBe("");
  });

  test("Driveメタデータ取得を4並列に制限する", async () => {
    extract.mockResolvedValue([]);
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { retryFailedExtractions } = await import("./retryExtraction");
    const pending = retryFailedExtractions(
      Array.from({ length: 10 }, (_, index) => `file-${index}`),
      async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate;
        active -= 1;
        return { id, name: `${id}.mp3`, mimeType: "audio/mpeg" };
      },
      () => async () => new Uint8Array(), () => {}
    );
    await vi.waitFor(() => expect(active).toBe(4));
    release();
    await pending;
    expect(maxActive).toBe(4);
  });

  test("認証エラー後、キュー済みの未着手files.getを打ち切る", async () => {
    extract.mockResolvedValue([]);
    const started: string[] = [];
    const { retryFailedExtractions } = await import("./retryExtraction");
    const fileIds = Array.from({ length: 10 }, (_, index) => `file-${index}`);
    await expect(
      retryFailedExtractions(
        fileIds,
        async (id) => {
          started.push(id);
          if (id === "file-0") throw new DriveHttpError(401, "unauthorized");
          return { id, name: `${id}.mp3`, mimeType: "audio/mpeg" };
        },
        () => async () => new Uint8Array(), () => {}
      )
    ).rejects.toBeInstanceOf(DriveHttpError);
    // 4並列のうち最初の1件が401で打ち切りを発火するため、キュー未着手だった残り6件
    // （file-4〜file-9）は決して開始されない。既に並行実行枠を使っていたfile-1〜file-3は
    // 打ち切り前に開始済みのため呼ばれうる。
    expect(started).not.toEqual(expect.arrayContaining(["file-9"]));
  });

  test("既存のscanRunIdを保持し空欄で上書きしない", async () => {
    const newRow = row({ fileId: "live", extractionFailed: "FALSE" });
    extract.mockResolvedValue([{ fileId: "live", row: newRow }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const result = await retryFailedExtractions(
      ["live"],
      async () => ({ id: "live", name: "live.mp3", mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {},
      new Map([["live", "scan-run-123"]])
    );
    expect(result.upsertEntries[0].row[INDEX_SHEET_HEADER.indexOf("scanRunId")]).toBe("scan-run-123");
  });

  test("既存のscanRunIdが無いfileIdは空欄のまま", async () => {
    const newRow = row({ fileId: "live" });
    extract.mockResolvedValue([{ fileId: "live", row: newRow }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const result = await retryFailedExtractions(
      ["live"],
      async () => ({ id: "live", name: "live.mp3", mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {}
    );
    expect(result.upsertEntries[0].row[INDEX_SHEET_HEADER.indexOf("scanRunId")]).toBe("");
  });

  test("200件単位でupsertし、trashed行を削除して重複マージは最後に1回だけ行う", async () => {
    const { persistRetryExtractionResult } = await import("./retryExtraction");
    const entries = Array.from({ length: 401 }, (_, index) => ({ fileId: `file-${index}`, row: [] }));
    const calls: string[] = [];
    const removed: string[][] = [];
    await persistRetryExtractionResult(
      { upsertEntries: entries, removedFileIds: ["missing"], trashedFileIds: ["trashed"], succeededCount: 401, stillFailedCount: 0 },
      async (batch) => { calls.push(`upsert:${batch.length}`); },
      async () => { calls.push("merge"); },
      async (ids) => { removed.push(ids); }
    );
    expect(calls).toEqual(["upsert:200", "upsert:200", "upsert:1", "merge"]);
    expect(removed).toEqual([["trashed"]]);
  });

  test("upsertEntriesが空ならmergeDuplicatesを呼ばない", async () => {
    const { persistRetryExtractionResult } = await import("./retryExtraction");
    const merge = vi.fn().mockResolvedValue(undefined);
    await persistRetryExtractionResult(
      { upsertEntries: [], removedFileIds: [], trashedFileIds: [], succeededCount: 0, stillFailedCount: 0 },
      async () => {},
      merge,
      async () => {}
    );
    expect(merge).not.toHaveBeenCalled();
  });

  test("再失敗した行をそのまま返して件数を数える", async () => {
    const failedRow = row({ fileId: "live", extractionFailed: "TRUE" });
    extract.mockResolvedValue([{ fileId: "live", row: failedRow }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const result = await retryFailedExtractions(["live"], async () => ({ id: "live", name: "live.mp3", mimeType: "audio/mpeg" }), () => async () => new Uint8Array(), () => {});
    expect(result.upsertEntries[0].row).toBe(failedRow);
    expect(result).toMatchObject({ succeededCount: 0, stillFailedCount: 1 });
  });

  test("認証エラーを再throwする", async () => {
    const authError = new AuthError("expired");
    const { retryFailedExtractions } = await import("./retryExtraction");
    await expect(retryFailedExtractions(["live"], async () => { throw authError; }, () => async () => new Uint8Array(), () => {})).rejects.toBe(authError);
  });
});

describe("filterStaleUpsertEntries", () => {
  test("driveModifiedTimeが一致し、現在の行もextractionFailed=TRUEのままなら残す", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" }) };
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows);
    expect(fresh).toEqual([entry]);
    expect(staleFileIds).toEqual([]);
  });

  test("driveModifiedTimeが他デバイスの差分同期で変わっていたら除外する", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" }) };
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-02-02T00:00:00Z", extractionFailed: "TRUE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows);
    expect(fresh).toEqual([]);
    expect(staleFileIds).toEqual(["a"]);
  });

  test("行が既に無くなっていたら除外する", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" }) };
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], []);
    expect(fresh).toEqual([]);
    expect(staleFileIds).toEqual(["a"]);
  });

  test("同一バージョンでも別デバイスのリトライが先に成功していたら除外する", async () => {
    // ファイル自体はDrive上で変更されていない（driveModifiedTime一致）が、別デバイスの
    // 同時リトライが先にextractionFailed=FALSEへ書き込んでいたケース。ここで自分の
    // （失敗した）結果を書き込むと、既に修正済みの行をTRUEへ巻き戻してしまう。
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" }) };
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "FALSE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows);
    expect(fresh).toEqual([]);
    expect(staleFileIds).toEqual(["a"]);
  });
});

describe("revalidateTrashedFileIds", () => {
  test("削除直前に再確認し、復元されていたファイルは対象から外す", async () => {
    const { revalidateTrashedFileIds } = await import("./retryExtraction");
    const result = await revalidateTrashedFileIds(["still-trashed", "restored", "deleted"], async (id) => {
      if (id === "restored") return { id, name: "restored.mp3", mimeType: "audio/mpeg", trashed: false };
      if (id === "deleted") return null;
      return { id, name: `${id}.mp3`, mimeType: "audio/mpeg", trashed: true };
    });
    expect(result.sort()).toEqual(["deleted", "still-trashed"]);
  });
});
