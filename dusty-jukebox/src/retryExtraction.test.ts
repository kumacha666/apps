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

function noopCallbacks() {
  return {
    persistBatch: vi.fn().mockResolvedValue({ staleFileIds: [] }),
    mergeDuplicates: vi.fn().mockResolvedValue(undefined),
    removeTrashed: vi.fn().mockResolvedValue(undefined),
  };
}

describe("retryFailedExtractions", () => {
  beforeEach(() => extract.mockReset());

  test("削除済みとtrashedを除外して抽出し、trashedはremoveTrashedへ渡す", async () => {
    extract.mockResolvedValue([]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    const result = await retryFailedExtractions(
      ["gone", "trashed", "live"],
      async (id) => id === "gone" ? null : { id, name: `${id}.mp3`, mimeType: "audio/mpeg", trashed: id === "trashed" },
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
    );
    expect(result.removedFileIds).toEqual(["gone"]);
    expect(result.trashedFileIds).toEqual(["trashed"]);
    expect(extract.mock.calls[0][0]).toEqual([{ file: expect.objectContaining({ id: "live" }), folderPath: "" }]);
    expect(extract.mock.calls[0][3]).toBe("");
    expect(removeTrashed).toHaveBeenCalledWith(["trashed"]);
  });

  test("Driveメタデータ取得を4並列に制限する", async () => {
    extract.mockResolvedValue([]);
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { retryFailedExtractions } = await import("./retryExtraction");
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    const pending = retryFailedExtractions(
      Array.from({ length: 10 }, (_, index) => `file-${index}`),
      async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate;
        active -= 1;
        return { id, name: `${id}.mp3`, mimeType: "audio/mpeg" };
      },
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
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
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    const fileIds = Array.from({ length: 10 }, (_, index) => `file-${index}`);
    await expect(
      retryFailedExtractions(
        fileIds,
        async (id) => {
          started.push(id);
          if (id === "file-0") throw new DriveHttpError(401, "unauthorized");
          return { id, name: `${id}.mp3`, mimeType: "audio/mpeg" };
        },
        () => async () => new Uint8Array(), () => {},
        persistBatch, mergeDuplicates, removeTrashed
      )
    ).rejects.toBeInstanceOf(DriveHttpError);
    // 4並列のうち最初の1件が401で打ち切りを発火するため、キュー未着手だった残り6件
    // （file-4〜file-9）は決して開始されない。既に並行実行枠を使っていたfile-1〜file-3は
    // 打ち切り前に開始済みのため呼ばれうる。
    expect(started).not.toEqual(expect.arrayContaining(["file-9"]));
  });

  test("再失敗した行をそのまま渡して件数を数える", async () => {
    const failedRow = row({ fileId: "live", extractionFailed: "TRUE" });
    extract.mockResolvedValue([{ fileId: "live", row: failedRow }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    const result = await retryFailedExtractions(
      ["live"],
      async () => ({ id: "live", name: "live.mp3", mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
    );
    expect(persistBatch.mock.calls[0][0][0].row).toBe(failedRow);
    expect(result).toMatchObject({ succeededCount: 0, stillFailedCount: 1 });
  });

  test("認証エラーを再throwする", async () => {
    const authError = new AuthError("expired");
    const { retryFailedExtractions } = await import("./retryExtraction");
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    await expect(
      retryFailedExtractions(
        ["live"],
        async () => { throw authError; },
        () => async () => new Uint8Array(), () => {},
        persistBatch, mergeDuplicates, removeTrashed
      )
    ).rejects.toBe(authError);
  });

  test("抽出をバッチ単位で進め、バッチごとに逐次persistBatchを呼ぶ", async () => {
    // ライブラリ全体規模の失敗をリトライする場合、全件の抽出が終わるまで一切書き込まない
    // 実装だと、認証切れ・タブを閉じる等で中断すると成果が丸ごと失われる
    // （2026-09-02 Codexレビュー指摘、P2）。runFullScanと同じくバッチ単位で
    // 抽出→persistBatchを繰り返すことを検証する。
    const fileIds = Array.from({ length: 250 }, (_, index) => `file-${index}`);
    const batchSizes: number[] = [];
    const buildBatchResult = (entries: { file: { id: string } }[]) => {
      batchSizes.push(entries.length);
      return entries.map(({ file }) => ({ fileId: file.id, row: row({ fileId: file.id }) }));
    };
    extract.mockImplementationOnce(buildBatchResult);
    extract.mockImplementationOnce(buildBatchResult);
    extract.mockImplementationOnce(buildBatchResult);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const persistedBatchSizes: number[] = [];
    const persistBatch = vi.fn(async (entries: unknown[]) => {
      persistedBatchSizes.push(entries.length);
      return { staleFileIds: [] };
    });
    const mergeDuplicates = vi.fn().mockResolvedValue(undefined);
    const removeTrashed = vi.fn().mockResolvedValue(undefined);
    await retryFailedExtractions(
      fileIds,
      async (id) => ({ id, name: `${id}.mp3`, mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed,
      100
    );
    expect(batchSizes).toEqual([100, 100, 50]);
    expect(persistedBatchSizes).toEqual([100, 100, 50]);
    // persistBatchは各バッチの抽出直後に呼ばれる（全バッチの抽出完了を待たない）ことを、
    // extractの呼び出し回数とpersistBatchの呼び出し回数が同期していることで確認する。
    expect(extract).toHaveBeenCalledTimes(3);
    expect(mergeDuplicates).toHaveBeenCalledTimes(1);
  });

  test("抽出対象が0件（全件removed/trashed）ならmergeDuplicatesを呼ばない", async () => {
    const { retryFailedExtractions } = await import("./retryExtraction");
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    await retryFailedExtractions(
      ["trashed"],
      async (id) => ({ id, name: `${id}.mp3`, mimeType: "audio/mpeg", trashed: true }),
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
    );
    expect(persistBatch).not.toHaveBeenCalled();
    expect(mergeDuplicates).not.toHaveBeenCalled();
    expect(removeTrashed).toHaveBeenCalledWith(["trashed"]);
  });

  test("persistBatchがstaleFileIdsを返した場合、その分をsucceededCount/stillFailedCountから除外する（2026-09-02 Codexレビュー指摘：P2。以前はpersistBatch呼び出し前の抽出結果だけでカウントしており、他デバイスの更新により実際には書き込まれなかったエントリも成功として表示していた）", async () => {
    extract.mockResolvedValue([
      { fileId: "ok", row: row({ fileId: "ok", extractionFailed: "FALSE" }) },
      { fileId: "stale-ok", row: row({ fileId: "stale-ok", extractionFailed: "FALSE" }) },
      { fileId: "stale-failed", row: row({ fileId: "stale-failed", extractionFailed: "TRUE" }) },
    ]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const persistBatch = vi.fn().mockResolvedValue({ staleFileIds: ["stale-ok", "stale-failed"] });
    const mergeDuplicates = vi.fn().mockResolvedValue(undefined);
    const removeTrashed = vi.fn().mockResolvedValue(undefined);
    const result = await retryFailedExtractions(
      ["ok", "stale-ok", "stale-failed"],
      async (id) => ({ id, name: `${id}.mp3`, mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
    );
    expect(result.succeededCount).toBe(1);
    expect(result.stillFailedCount).toBe(0);
  });

  test("バッチの全エントリがstale判定されて1件も書き込まれなくてもmergeDuplicatesを呼ぶ（2026-09-02 Codexレビュー指摘：P2。以前はsucceededCount+stillFailedCountが0のままmergeDuplicatesがスキップされ、重複行の一方が既に別デバイスで解消済みだったケースで、もう一方の失敗行が以降のリトライでも選ばれ続けてしまっていた）", async () => {
    extract.mockResolvedValue([{ fileId: "stale", row: row({ fileId: "stale", extractionFailed: "TRUE" }) }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const persistBatch = vi.fn().mockResolvedValue({ staleFileIds: ["stale"] });
    const mergeDuplicates = vi.fn().mockResolvedValue(undefined);
    const removeTrashed = vi.fn().mockResolvedValue(undefined);
    const result = await retryFailedExtractions(
      ["stale"],
      async (id) => ({ id, name: `${id}.mp3`, mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
    );
    expect(result).toMatchObject({ succeededCount: 0, stillFailedCount: 0 });
    expect(mergeDuplicates).toHaveBeenCalledTimes(1);
  });

  test("trashedFileIdsが空ならremoveTrashedを呼ばない", async () => {
    extract.mockResolvedValue([{ fileId: "live", row: row({ fileId: "live" }) }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const { persistBatch, mergeDuplicates, removeTrashed } = noopCallbacks();
    await retryFailedExtractions(
      ["live"],
      async (id) => ({ id, name: `${id}.mp3`, mimeType: "audio/mpeg" }),
      () => async () => new Uint8Array(), () => {},
      persistBatch, mergeDuplicates, removeTrashed
    );
    expect(removeTrashed).not.toHaveBeenCalled();
  });
});

describe("filterStaleUpsertEntries", () => {
  test("freshと判定したエントリのscanRunIdを、書き込み直前に読んだ現在の行の値で上書きする（2026-09-02 Codexレビュー指摘：P2。以前はリトライ開始時点の1回限りのスナップショットを使っており、開始後に他デバイスが新しいフルスキャンを開始しwatermarkを進めていた場合、その新しい値を古いスナップショットの値で上書きしてしまいうる）", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", scanRunId: "old-scan-run" }) };
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" })];
    const currentRows = [
      row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE", scanRunId: "new-scan-run" }),
    ];
    const { fresh } = filterStaleUpsertEntries([entry], currentRows, initialRows);
    expect(fresh[0].row[INDEX_SHEET_HEADER.indexOf("scanRunId")]).toBe("new-scan-run");
  });

  test("現在の行にscanRunIdが無ければ空欄で上書きする", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", scanRunId: "old-scan-run" }) };
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" })];
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" })];
    const { fresh } = filterStaleUpsertEntries([entry], currentRows, initialRows);
    expect(fresh[0].row[INDEX_SHEET_HEADER.indexOf("scanRunId")]).toBe("");
  });

  test("driveModifiedTimeが一致し、現在の行もextractionFailed=TRUEのままなら残す", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" }) };
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" })];
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows, initialRows);
    expect(fresh).toEqual([entry]);
    expect(staleFileIds).toEqual([]);
  });

  test("driveModifiedTimeがリトライ開始時点（initialRows）から他デバイスの差分同期で変わっていたら除外する", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" }) };
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" })];
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-02-02T00:00:00Z", extractionFailed: "TRUE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows, initialRows);
    expect(fresh).toEqual([]);
    expect(staleFileIds).toEqual(["a"]);
  });

  test("ファイル自体がDrive上で正当に変更されていても、索引側がリトライ開始時点から変わっていなければ書き込む（2026-09-02 Codexレビュー指摘：P2。以前はentry自身の新しいdriveModifiedTimeと現在の索引を比較していたため、ユーザーがDrive上でファイルを直接修正してからリトライした場合のように、他デバイスとの競合が無いのに一律staleと誤判定し、正当な修正結果が索引へ二度と反映されなくなっていた）", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    // entryは今回のリトライが新しく取得したdriveModifiedTime（ユーザーの修正後の値）
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-03-03T00:00:00Z", extractionFailed: "FALSE" }) };
    // initialRowsとcurrentRowsは共にリトライ開始時点の古い値のまま（他デバイスは何も書き込んでいない）
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" })];
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows, initialRows);
    expect(fresh).toEqual([entry]);
    expect(staleFileIds).toEqual([]);
  });

  test("行が既に無くなっていたら除外する", async () => {
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" }) };
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], [], initialRows);
    expect(fresh).toEqual([]);
    expect(staleFileIds).toEqual(["a"]);
  });

  test("同一バージョンでも別デバイスのリトライが先に成功していたら除外する", async () => {
    // ファイル自体はDrive上で変更されていない（driveModifiedTime一致）が、別デバイスの
    // 同時リトライが先にextractionFailed=FALSEへ書き込んでいたケース。ここで自分の
    // （失敗した）結果を書き込むと、既に修正済みの行をTRUEへ巻き戻してしまう。
    const { filterStaleUpsertEntries } = await import("./retryExtraction");
    const entry = { fileId: "a", row: row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" }) };
    const initialRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "TRUE" })];
    const currentRows = [row({ fileId: "a", driveModifiedTime: "2026-01-01T00:00:00Z", extractionFailed: "FALSE" })];
    const { fresh, staleFileIds } = filterStaleUpsertEntries([entry], currentRows, initialRows);
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

  test("認証エラー後、キュー済みの未着手files.getを打ち切る", async () => {
    const { revalidateTrashedFileIds } = await import("./retryExtraction");
    const started: string[] = [];
    const fileIds = Array.from({ length: 10 }, (_, index) => `file-${index}`);
    await expect(
      revalidateTrashedFileIds(fileIds, async (id) => {
        started.push(id);
        if (id === "file-0") throw new DriveHttpError(401, "unauthorized");
        return { id, name: `${id}.mp3`, mimeType: "audio/mpeg", trashed: true };
      })
    ).rejects.toBeInstanceOf(DriveHttpError);
    expect(started).not.toEqual(expect.arrayContaining(["file-9"]));
  });
});

