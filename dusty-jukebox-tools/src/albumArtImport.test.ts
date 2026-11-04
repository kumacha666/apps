import { describe, expect, test } from "vitest";
import { ImageFetchError, runInBatches } from "./albumArtCollect";
import { CANDIDATES_SHEET_HEADER, candidatesToImport, importCandidate, parseCandidateRows, type ImportCandidate } from "./albumArtImport";
import { albumArtKey, type AlbumArtRecord } from "./albumArtSheet";

const header = [...CANDIDATES_SHEET_HEADER];
const row = (album: string, fields: Partial<Record<"imageUrl" | "source" | "match" | "folder", string>> = {}) => [
  fields.folder ?? "f1",
  album,
  fields.imageUrl ?? `https://cdn.example/${album}.jpg`,
  fields.source ?? "deezer",
  "id-" + album,
  fields.match ?? "ai-exact",
  "メモ",
];
const rec = (album: string, fields: Partial<AlbumArtRecord> = {}): AlbumArtRecord => ({
  albumFolderId: "f1",
  album,
  artist: "Artist",
  embedded: "no",
  artFileId: "",
  source: "notfound",
  sourceId: "",
  checkedFileId: "t1",
  updatedAt: "before",
  match: "",
  reviewedAt: "",
  ...fields,
});
const existing = (...records: AlbumArtRecord[]) => new Map(records.map((r, i) => [albumArtKey(r.albumFolderId, r.album), { rowNumber: i + 2, record: r }]));

describe("parseCandidateRows", () => {
  test("候補を読む。形の合わない行（https以外・知らない取得元・知らない確からしさ・重複）は飛ばして数える", () => {
    const { candidates, skipped } = parseCandidateRows([
      header,
      row("A"),
      row("B", { source: "itunes", match: "ai-guess" }),
      row("W", { source: "web", match: "ai-close" }),
      row("C", { imageUrl: "http://insecure/c.jpg" }),
      row("D", { source: "google" }),
      row("E", { match: "sure" }),
      row("A", { match: "ai-close" }),
      ["", "", ""],
    ]);
    expect(candidates.map((c) => [c.album, c.source, c.match])).toEqual([
      ["A", "deezer", "ai-exact"],
      ["B", "itunes", "ai-guess"],
      ["W", "web", "ai-close"],
    ]);
    expect(candidates[0]).toMatchObject({ albumFolderId: "f1", sourceId: "id-A", note: "メモ" });
    expect(skipped).toBe(4);
  });
  test("見出しが違えば例外", () => {
    expect(() => parseCandidateRows([["x"], row("A")])).toThrow("albumArtCandidates");
    expect(() => parseCandidateRows([])).toThrow();
  });
});

test("candidatesToImport：いまも見つからない（画像の無い）アルバムだけ。表紙のある・外した・記録の無いアルバムは入れない", () => {
  const { candidates } = parseCandidateRows([header, row("Missing"), row("Found"), row("Rejected"), row("Unknown"), row("Error")]);
  const items = candidatesToImport(
    candidates,
    existing(rec("Missing"), rec("Found", { source: "itunes", artFileId: "img" }), rec("Rejected", { source: "rejected" }), rec("Error", { source: "error" }))
  );
  expect(items.map((i) => i.candidate.album)).toEqual(["Missing"]);
  expect(items[0].record.album).toBe("Missing");
});

describe("importCandidate", () => {
  const candidate: ImportCandidate = { albumFolderId: "f1", album: "A", imageUrl: "https://cdn.example/a.jpg", source: "deezer", sourceId: "42", match: "ai-variant", note: "" };
  const deps = (image: { data: Uint8Array; format: string } | null | Error, thumb: Blob | null = new Blob(["t"])) => {
    const uploads: string[] = [];
    return {
      uploads,
      d: {
        fetchImage: async () => {
          if (image instanceof Error) throw image;
          return image;
        },
        makeThumbnail: async () => thumb,
        upload: async (album: { album: string }) => {
          uploads.push(album.album);
          return "img-new";
        },
        now: () => "now",
      },
    };
  };
  const png = { data: new Uint8Array([1]), format: "image/png" };

  test("画像を縮めてDriveへ置き、取得元とどう見つけたかを記録する（埋め込みの有無・調べた曲はそのまま）", async () => {
    const { d, uploads } = deps(png);
    expect(await importCandidate({ candidate, record: rec("A") }, d)).toEqual(
      rec("A", { artFileId: "img-new", source: "deezer", sourceId: "42", match: "ai-variant", updatedAt: "now" })
    );
    expect(uploads).toEqual(["A"]);
  });

  test("画像が無い・取れない・読めないときは記録しない（見つからないまま）。Driveへの送信を始めない", async () => {
    for (const t of [deps(null), deps(new ImageFetchError("x")), deps(png, null)]) {
      expect(await importCandidate({ candidate, record: rec("A") }, t.d)).toBeNull();
      expect(t.uploads).toEqual([]);
    }
  });

  test("それ以外の失敗（Driveへの送信など）は例外のまま返す", async () => {
    const { d } = deps(png);
    await expect(importCandidate({ candidate, record: rec("A") }, { ...d, upload: async () => { throw new Error("401"); } })).rejects.toThrow("401");
    await expect(importCandidate({ candidate, record: rec("A") }, deps(new TypeError("boom")).d)).rejects.toThrow("boom");
  });
});

test("runInBatches：記録しない（null）分は書かずに進み、まとめて書き込む", async () => {
  const flushed: string[][] = [];
  const progress: (string | null)[] = [];
  const result = await runInBatches({
    items: ["a", "b", "c"],
    collect: async (x) => (x === "b" ? null : rec(x)),
    flush: async (records) => void flushed.push(records.map((r) => r.album)),
    flushEvery: 10,
    concurrency: 1,
    shouldStop: () => false,
    onProgress: (_done, _total, last) => progress.push(last?.album ?? null),
  });
  expect(result).toEqual({ done: 3, stopped: false });
  expect(progress).toEqual(["a", null, "c"]);
  expect(flushed).toEqual([["a", "c"]]);
});
