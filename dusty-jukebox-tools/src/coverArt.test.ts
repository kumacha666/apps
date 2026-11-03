import { afterEach, describe, expect, test, vi } from "vitest";
import { pickCover } from "./coverArt";

// music-metadataの実パースは実際の音源が要るため、tagExtraction.test.tsと同じくモックし、
// extractCoverArt()の結線（画像の選び方・失敗の扱い・中断）だけを確かめる。
const parseFromTokenizerMock = vi.fn();
vi.mock("music-metadata", () => ({
  parseFromTokenizer: (...args: unknown[]) => parseFromTokenizerMock(...args),
}));

const bytes = (...values: number[]) => new Uint8Array(values);

describe("pickCover", () => {
  test("表紙（Cover (front)）を優先し、無ければ最初の画像", () => {
    const back = { format: "image/png", data: bytes(1), type: "Cover (back)" };
    const front = { format: "image/jpeg", data: bytes(2), type: "Cover (front)" };
    expect(pickCover([back, front])).toBe(front);
    expect(pickCover([back])).toBe(back);
  });
  test("中身の無い画像は使わず、何も無ければnull", () => {
    expect(pickCover([{ format: "image/png", data: bytes() }])).toBeNull();
    expect(pickCover(undefined)).toBeNull();
  });
});

describe("extractCoverArt", () => {
  afterEach(() => {
    parseFromTokenizerMock.mockReset();
  });

  test("画像を読み込むときはskipCoversを外して読み、表紙を返す", async () => {
    parseFromTokenizerMock.mockResolvedValue({ common: { picture: [{ format: "image/jpeg", data: bytes(9, 9), type: "Cover (front)" }] } });
    const { extractCoverArt } = await import("./coverArt");
    const result = await extractCoverArt({ id: "f1", size: 10, mimeType: "audio/mpeg" }, () => async () => bytes());
    expect(result).toEqual({ kind: "picture", format: "image/jpeg", data: bytes(9, 9) });
    expect(parseFromTokenizerMock.mock.calls[0][1]).toMatchObject({ skipCovers: false, duration: false });
  });

  test("画像が無ければnone、読み込みに失敗したらfailed（例外にしない）", async () => {
    const { extractCoverArt } = await import("./coverArt");
    parseFromTokenizerMock.mockResolvedValueOnce({ common: {} });
    await expect(extractCoverArt({ id: "f1" }, () => async () => bytes())).resolves.toEqual({ kind: "none" });
    parseFromTokenizerMock.mockRejectedValueOnce(new Error("401"));
    await expect(extractCoverArt({ id: "f1" }, () => async () => bytes())).resolves.toEqual({ kind: "failed" });
  });

  test("中断されたら、読み込みの完了を待たずにfailedで終わり、Range取得にも中断を伝える", async () => {
    parseFromTokenizerMock.mockReturnValue(new Promise(() => {}));
    const { extractCoverArt } = await import("./coverArt");
    const controller = new AbortController();
    let rangeSignal: AbortSignal | undefined;
    const promise = extractCoverArt({ id: "f1" }, (signal) => { rangeSignal = signal; return async () => bytes(); }, controller.signal);
    controller.abort();
    await expect(promise).resolves.toEqual({ kind: "failed" });
    expect(rangeSignal?.aborted).toBe(true);
  });

  test("最初から中断済みなら読み込まない", async () => {
    const { extractCoverArt } = await import("./coverArt");
    const controller = new AbortController();
    controller.abort();
    await expect(extractCoverArt({ id: "f1" }, () => async () => bytes(), controller.signal)).resolves.toEqual({ kind: "failed" });
    expect(parseFromTokenizerMock).not.toHaveBeenCalled();
  });
});
