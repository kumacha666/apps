import { afterEach, describe, expect, test, vi } from "vitest";
import { computeTagExtractionTimeoutMs, extractYearFromCopyright } from "./tagExtraction";
import { DriveHttpError } from "./drive";
import { AuthError } from "./auth";
import type { DriveRangeTokenizer } from "./rangeTokenizer";

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

  test("認証エラー（401）はextractionFailedとして握りつぶさず、そのまま呼び出し元へ再throwする（2026-08-20 Codexレビュー指摘：main.tsのisAuthFailure()がスキャン中断・トークンクリアを判断できるようにするため）", async () => {
    const authError = new DriveHttpError(401, "invalid_token");
    // music-metadataは内部でtokenizer.readBuffer/peekBufferを呼び、そこで投げたI/Oエラーを
    // 独自の例外型にラップしうる。ここではtokenizerを実際に読ませてfetchRange経由でエラーを
    // 発生させ、extractTags側がparseFromTokenizerの例外の型に頼らず判定できることを検証する。
    parseFromTokenizerMock.mockImplementation(async (tokenizer: DriveRangeTokenizer) => {
      await tokenizer.readBuffer(new Uint8Array(4), { position: 0, length: 4 });
      throw new Error("unreachable");
    });
    const { extractTags } = await import("./tagExtraction");

    const fetchRange = async () => {
      throw authError;
    };
    await expect(extractTags({ id: "f1", name: "song.mp3", size: 1000 }, () => fetchRange)).rejects.toBe(authError);
  });

  test("AuthError（GISのサイレント再取得失敗）も同様に再throwする", async () => {
    const authError = new AuthError("再ログインが必要です");
    parseFromTokenizerMock.mockImplementation(async (tokenizer: DriveRangeTokenizer) => {
      await tokenizer.readBuffer(new Uint8Array(4), { position: 0, length: 4 });
      throw new Error("unreachable");
    });
    const { extractTags } = await import("./tagExtraction");

    const fetchRange = async () => {
      throw authError;
    };
    await expect(extractTags({ id: "f1", name: "song.mp3", size: 1000 }, () => fetchRange)).rejects.toBe(authError);
  });

  test("401以外のエラー（例: 500）はこれまで通りextractionFailed=trueとして扱う（走査は継続する）", async () => {
    const serverError = new DriveHttpError(500, "internal error");
    parseFromTokenizerMock.mockImplementation(async (tokenizer: DriveRangeTokenizer) => {
      await tokenizer.readBuffer(new Uint8Array(4), { position: 0, length: 4 });
      throw new Error("unreachable");
    });
    const { extractTags } = await import("./tagExtraction");

    const fetchRange = async () => {
      throw serverError;
    };
    const result = await extractTags({ id: "f1", name: "song.mp3", size: 1000 }, () => fetchRange);
    expect(result).toEqual({ tags: null, extractionFailed: true });
  });
});

describe("extractAndBuildIndexEntries", () => {
  afterEach(() => {
    parseFromTokenizerMock.mockReset();
  });

  function makeEntries(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      file: { id: `f${i}`, name: `song${i}.mp3`, mimeType: "audio/mpeg", size: "10" },
      folderPath: "",
    }));
  }

  test("認証エラー発生時、ConcurrencyLimiterのキューに残っていた未着手ファイルの抽出を打ち切る（2026-08-20 Codexレビュー指摘: Promise.all自体は最初のrejectで確定するが、main.tsがトークンをクリアした後もキュー済みタスクがバックグラウンドで無効なトークンのままAPIを叩き続けないようにする）", async () => {
    parseFromTokenizerMock.mockImplementation(async (tokenizer: DriveRangeTokenizer) => {
      await tokenizer.readBuffer(new Uint8Array(1), { position: 0, length: 1 });
      return { common: { title: "ok" } };
    });
    const { extractAndBuildIndexEntries } = await import("./tagExtraction");

    const authError = new DriveHttpError(401, "invalid_token");
    // 内部の同時実行数(MAX_CONCURRENT_EXTRACTIONS=4)より多いファイル数にして、
    // 少なくとも1件はConcurrencyLimiterのキューで待機する状況を作る
    const entries = makeEntries(6);
    const calledFileIds: string[] = [];
    const createFetchRangeForFile = (fileId: string) => {
      calledFileIds.push(fileId);
      return async (): Promise<Uint8Array> => {
        if (fileId === "f0") throw authError;
        return new Uint8Array(1);
      };
    };

    await expect(extractAndBuildIndexEntries(entries, createFetchRangeForFile, () => {})).rejects.toBe(authError);

    // 同時実行数の枠内で既に開始済みだったファイルは呼ばれるが、キューに並んでいた最後尾の
    // ファイルは打ち切りシグナルにより一度もfetchRangeファクトリを呼ばれない
    expect(calledFileIds).toContain("f0");
    expect(calledFileIds).not.toContain("f5");
    expect(calledFileIds.length).toBeLessThan(6);
  });

  test("認証エラーが無ければ全ファイル分のUpsertIndexEntryを返す", async () => {
    parseFromTokenizerMock.mockImplementation(async (tokenizer: DriveRangeTokenizer) => {
      await tokenizer.readBuffer(new Uint8Array(1), { position: 0, length: 1 });
      return { common: { title: "ok" } };
    });
    const { extractAndBuildIndexEntries } = await import("./tagExtraction");

    const entries = makeEntries(3);
    const progressCalls: [number, number][] = [];
    const results = await extractAndBuildIndexEntries(
      entries,
      () => async () => new Uint8Array(1),
      (done, total) => progressCalls.push([done, total])
    );

    expect(results.map((r) => r.fileId).sort()).toEqual(["f0", "f1", "f2"]);
    expect(progressCalls).toHaveLength(3);
    expect(progressCalls[2]).toEqual([3, 3]);
  });
});
