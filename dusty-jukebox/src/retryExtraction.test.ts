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
    expect(result.removedFileIds).toEqual(["gone", "trashed"]);
    expect(extract.mock.calls[0][0]).toEqual([{ file: expect.objectContaining({ id: "live" }), folderPath: "" }]);
    expect(extract.mock.calls[0][3]).toBe("");
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
