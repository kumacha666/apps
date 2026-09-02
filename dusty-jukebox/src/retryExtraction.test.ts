import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthError } from "./auth";
import { INDEX_SHEET_HEADER } from "./sheets";

const extract = vi.fn();
vi.mock("./tagExtraction", () => ({ extractAndBuildIndexEntries: extract }));

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

  test("200件単位でupsertと重複マージを行いtrashed行を削除する", async () => {
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
    expect(calls).toEqual(["upsert:200", "merge", "upsert:200", "merge", "upsert:1", "merge"]);
    expect(removed).toEqual([["trashed"]]);
  });

  test("再失敗した行をそのまま返して件数を数える", async () => {
    const row = Array(INDEX_SHEET_HEADER.length).fill("");
    row[INDEX_SHEET_HEADER.indexOf("extractionFailed")] = "TRUE";
    extract.mockResolvedValue([{ fileId: "live", row }]);
    const { retryFailedExtractions } = await import("./retryExtraction");
    const result = await retryFailedExtractions(["live"], async () => ({ id: "live", name: "live.mp3", mimeType: "audio/mpeg" }), () => async () => new Uint8Array(), () => {});
    expect(result.upsertEntries[0].row).toBe(row);
    expect(result).toMatchObject({ succeededCount: 0, stillFailedCount: 1 });
  });

  test("認証エラーを再throwする", async () => {
    const authError = new AuthError("expired");
    const { retryFailedExtractions } = await import("./retryExtraction");
    await expect(retryFailedExtractions(["live"], async () => { throw authError; }, () => async () => new Uint8Array(), () => {})).rejects.toBe(authError);
  });
});
