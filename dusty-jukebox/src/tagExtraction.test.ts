import { afterEach, describe, expect, test, vi } from "vitest";
import { computeTagExtractionTimeoutMs, extractYearFromCopyright } from "./tagExtraction";

// music-metadataの実パース処理は実際の音源バイト列が無いと成功しないため、外部ライブラリ呼び出し
// 自体はモックし（drive.tsのfetchモック・sheets.tsのフェイクIOと同じDI方針）、extractTags()の
// 結線・タイムアウト制御ロジックだけを検証する。
const parseFromTokenizerMock = vi.fn();
vi.mock("music-metadata", () => ({
  parseFromTokenizer: (...args: unknown[]) => parseFromTokenizerMock(...args),
}));

describe("computeTagExtractionTimeoutMs", () => {
  test("100MB以下は既定の30秒", () => {
    expect(computeTagExtractionTimeoutMs(undefined)).toBe(30_000);
    expect(computeTagExtractionTimeoutMs(50 * 1024 * 1024)).toBe(30_000);
    expect(computeTagExtractionTimeoutMs(100 * 1024 * 1024)).toBe(30_000);
  });

  test("100MB超過分は10MBごとに+3秒（CONCEPT.md 5節の例: 400MBなら120秒）", () => {
    expect(computeTagExtractionTimeoutMs(400 * 1024 * 1024)).toBe(120_000);
  });

  test("上限は180秒", () => {
    expect(computeTagExtractionTimeoutMs(2000 * 1024 * 1024)).toBe(180_000);
  });
});

describe("extractYearFromCopyright", () => {
  test("著作権表記から西暦4桁を抽出する", () => {
    expect(extractYearFromCopyright("2018 CAPCOM CO., LTD.")).toBe("2018");
  });

  test("西暦が見つからない場合はundefined", () => {
    expect(extractYearFromCopyright("CAPCOM CO., LTD.")).toBeUndefined();
    expect(extractYearFromCopyright(undefined)).toBeUndefined();
  });
});

describe("extractTags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    parseFromTokenizerMock.mockReset();
  });

  test("成功時: music-metadataのcommonブロックをIndexTagsLikeに変換して返す", async () => {
    parseFromTokenizerMock.mockResolvedValue({
      common: {
        title: "Theme",
        artist: "Michael Giacchino",
        albumartist: "Michael Giacchino",
        album: "Spider-Man: No Way Home",
        composer: ["Michael Giacchino"],
        genre: ["Soundtrack"],
        year: 2021,
        copyright: "2021 Sony Pictures",
        track: { no: 3 },
        disk: { no: 1 },
      },
    });
    const { extractTags } = await import("./tagExtraction");

    const fakeFetchRange = async () => new Uint8Array(0);
    const result = await extractTags({ id: "f1", name: "Theme.m4a", size: 1000 }, () => fakeFetchRange);

    expect(result.extractionFailed).toBe(false);
    expect(result.tags).toEqual({
      title: "Theme",
      artist: "Michael Giacchino",
      albumArtist: "Michael Giacchino",
      album: "Spider-Man: No Way Home",
      composer: ["Michael Giacchino"],
      genre: ["Soundtrack"],
      releaseYear: 2021,
      copyrightYear: "2021",
      trackNumber: 3,
      discNumber: 1,
    });
  });

  test("パースエラー時はextractionFailed=trueでtagsはnull", async () => {
    parseFromTokenizerMock.mockRejectedValue(new Error("invalid audio data"));
    const { extractTags } = await import("./tagExtraction");

    const fakeFetchRange = async () => new Uint8Array(0);
    const result = await extractTags({ id: "f1", name: "broken.mp3", size: 1000 }, () => fakeFetchRange);

    expect(result).toEqual({ tags: null, extractionFailed: true });
  });

  test("タイムアウト時はextractionFailed=trueになり、fetchRangeに渡したsignalをabortする（5節: 巨大ファイル対策）", async () => {
    vi.useFakeTimers();
    // 実際には解決しない（parseFromTokenizerが固まっているのと同等の状況を模す）
    parseFromTokenizerMock.mockReturnValue(new Promise(() => {}));
    const { extractTags } = await import("./tagExtraction");

    let capturedSignal: AbortSignal | undefined;
    const fakeFetchRange = async () => new Uint8Array(0);
    // sizeBytes未指定 => 既定タイムアウト30秒
    const resultPromise = extractTags({ id: "f1", name: "huge.flac" }, (signal) => {
      capturedSignal = signal;
      return fakeFetchRange;
    });

    await vi.advanceTimersByTimeAsync(30_000);
    const result = await resultPromise;

    expect(result).toEqual({ tags: null, extractionFailed: true });
    expect(capturedSignal?.aborted).toBe(true);
  });
});
