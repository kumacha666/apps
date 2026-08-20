import { describe, expect, test } from "vitest";
import {
  isAudioFile,
  getExtension,
  detectGarbled,
  buildRow,
  guessMimeType,
  sheetRange,
  SHEET_HEADER,
  diffTagRows,
  deriveFallbackTitle,
} from "./lib";

describe("lib", () => {
  test("isAudioFile: 拡張子ベースで判定する（mimeTypeは見ない）", () => {
    expect(isAudioFile("song.mp3")).toBe(true);
    expect(isAudioFile("Spider-Man Theme.m4a")).toBe(true);
    expect(isAudioFile("cover.jpg")).toBe(false);
    expect(isAudioFile("readme.txt")).toBe(false);
    expect(isAudioFile("no-extension")).toBe(false);
  });

  test("getExtension: 大文字拡張子も小文字化する", () => {
    expect(getExtension("Track01.MP3")).toBe("mp3");
    expect(getExtension("archive.tar.gz")).toBe("gz");
    expect(getExtension("no-extension")).toBe("");
  });

  test("deriveFallbackTitle: 拡張子を除いたファイル名を返す（タイトルタグ欠落時のフォールバック用）", () => {
    expect(deriveFallbackTitle("Belinda Carlisle - Heaven Is A Place On Earth.mp3")).toBe(
      "Belinda Carlisle - Heaven Is A Place On Earth"
    );
    expect(deriveFallbackTitle("archive.tar.gz")).toBe("archive.tar");
    expect(deriveFallbackTitle("no-extension")).toBe("no-extension");
  });

  test("detectGarbled: 正常な日本語・英語タイトルは化けていないと判定する", () => {
    expect(detectGarbled("負けないで")).toBe(false);
    expect(detectGarbled("Heaven Is A Place On Earth")).toBe(false);
    expect(detectGarbled("")).toBe(false);
    expect(detectGarbled(undefined)).toBe(false);
  });

  test("detectGarbled: U+FFFD（デコード失敗マーカー）を含む場合は化けと判定する", () => {
    expect(detectGarbled("譁�蟄怜喧縺�")).toBe(true);
  });

  test("detectGarbled: 典型的なUTF-8/Shift_JIS誤変換パターンを検出する", () => {
    expect(detectGarbled("繧ｹ繝斐・繝峨Ρ繧ｴ繝ｳ")).toBe(true);
  });

  test("detectGarbled: マーカー文字が1回だけの偶然一致では化け扱いにしない", () => {
    // 「縺」が通常の日本語文章に単発で紛れ込むだけでは誤検出しないようにする（閾値2の意図）
    expect(detectGarbled("通常のテキストに縺が1回だけ含まれる")).toBe(false);
  });

  test("detectGarbled: 同じマーカー文字が繰り返し出現する典型パターンも検出する", () => {
    // 種類数ではなく出現回数で数えないと見逃すケース
    expect(detectGarbled("縺薙ｓ縺ｫ縺｡縺ｯ")).toBe(true);
  });

  test("buildRow: タグ欠落時も空文字で埋めて行を作る", () => {
    const row = buildRow({
      file: { id: "abc123", name: "Unknown - Track.mp3", size: "4200000", mimeType: "audio/mpeg" },
      folderPath: "VARIOUS",
      parentFolderId: "parent1",
      tags: null,
      parseErrorMessage: "",
      scannedAtIso: "2026-08-02T00:00:00.000Z",
    });
    expect(row.length).toBe(SHEET_HEADER.length);
    expect(row[0]).toBe("abc123");
    expect(row[2]).toBe("mp3");
    expect(row[7]).toBe(""); // tagArtist
    expect(row[17]).toBe("FALSE"); // garbledSuspect
  });

  test("buildRow: 配列タグ（composer/genre）はスラッシュ区切りの文字列に結合する", () => {
    const row = buildRow({
      file: { id: "xyz", name: "MH World Theme.m4a", size: "9000000", mimeType: "video/mp4" },
      folderPath: "Game/Monster Hunter World",
      parentFolderId: "parent2",
      tags: { composer: ["A", "B"], genre: ["Soundtrack", "Game"], artist: "Capcom Sound Team" },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-02T00:00:00.000Z",
    });
    expect(row[11]).toBe("A / B"); // tagComposer
    expect(row[12]).toBe("Soundtrack / Game"); // tagGenre
  });

  test("guessMimeType: 拡張子からDrive非依存でmimeTypeを推定する（m4aはvideo/mp4を返さない）", () => {
    expect(guessMimeType("Spider-Man Theme.m4a")).toBe("audio/mp4");
    expect(guessMimeType("track.mp3")).toBe("audio/mpeg");
    expect(guessMimeType("track.flac")).toBe("audio/flac");
    expect(guessMimeType("unknown.xyz")).toBeUndefined();
  });

  test("sheetRange: 通常のシート名はそのままクォートする", () => {
    expect(sheetRange("index", "A1")).toBe("'index'!A1");
  });

  test("sheetRange: スペース・アポストロフィを含むシート名も壊れないA1範囲にする", () => {
    expect(sheetRange("My Index", "A1")).toBe("'My Index'!A1");
    expect(sheetRange("O'Brien", "A1")).toBe("'O''Brien'!A1");
  });

  test("buildRow: composer/artist等に化けを検出したらgarbledSuspectをTRUEにする", () => {
    const row = buildRow({
      file: { id: "g1", name: "garbled.mp3", size: "1", mimeType: "audio/mpeg" },
      folderPath: "",
      parentFolderId: "",
      tags: { artist: "繧ｹ繝斐・繝峨Ρ繧ｴ繝ｳ" },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-02T00:00:00.000Z",
    });
    expect(row[17]).toBe("TRUE");
  });

  test("diffTagRows: タグ内容が完全一致していれば空配列を返す", () => {
    const rowA = buildRow({
      file: { id: "same", name: "Track.mp3", size: "1", mimeType: "audio/mpeg" },
      folderPath: "WANDS",
      parentFolderId: "p1",
      tags: { artist: "WANDS", title: "世界が終るまでは...", year: 1994 },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });
    const rowB = buildRow({
      file: { id: "same", name: "Track.mp3", size: "1", mimeType: "audio/mpeg" },
      folderPath: "違うフォルダパス", // 比較対象外の列（folderPath）が違っても影響しない
      parentFolderId: "p2",
      tags: { artist: "WANDS", title: "世界が終るまでは...", year: 1994 },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-03T12:00:00.000Z", // scannedAtも比較対象外
    });

    expect(diffTagRows(rowA, rowB)).toEqual([]);
  });

  test("diffTagRows: タグ列に差があればfield/expected/actualを報告する", () => {
    const rowA = buildRow({
      file: { id: "diff", name: "Track.m4a", size: "1", mimeType: "video/mp4" },
      folderPath: "",
      parentFolderId: "",
      tags: { artist: "Capcom Sound Team", composer: ["A"] },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });
    const rowB = buildRow({
      file: { id: "diff", name: "Track.m4a", size: "1", mimeType: "video/mp4" },
      folderPath: "",
      parentFolderId: "",
      tags: { artist: "Capcom Sound Team", composer: [] }, // Rangeトークナイザー側でcomposerが取れなかったケースを想定
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });

    expect(diffTagRows(rowA, rowB)).toEqual([{ field: "tagComposer", expected: "A", actual: "" }]);
  });

  test("diffTagRows: 数値と数値文字列（Sheetsからの読み戻し値）は一致扱いにする", () => {
    // expectedRow側はスプレッドシートからvalues.getで読み戻した想定＝年/トラック番号が文字列
    const expectedRow = buildRow({
      file: { id: "yr", name: "Track.mp3", size: "1", mimeType: "audio/mpeg" },
      folderPath: "",
      parentFolderId: "",
      tags: { year: "1994", track: { no: "3" } },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });
    // actualRow側はbuildRow()の直接の戻り値＝music-metadata由来の数値のまま
    const actualRow = buildRow({
      file: { id: "yr", name: "Track.mp3", size: "1", mimeType: "audio/mpeg" },
      folderPath: "",
      parentFolderId: "",
      tags: { year: 1994, track: { no: 3 } },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });

    expect(diffTagRows(expectedRow, actualRow)).toEqual([]);
  });

  test("diffTagRows: copyrightNoteの差も検出する", () => {
    const rowA = buildRow({
      file: { id: "cp", name: "Track.m4a", size: "1", mimeType: "video/mp4" },
      folderPath: "",
      parentFolderId: "",
      tags: { copyright: "2018 CAPCOM CO., LTD." },
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });
    const rowB = buildRow({
      file: { id: "cp", name: "Track.m4a", size: "1", mimeType: "video/mp4" },
      folderPath: "",
      parentFolderId: "",
      tags: {}, // Range方式でcopyrightだけ取得できなかったケースを想定
      parseErrorMessage: "",
      scannedAtIso: "2026-08-01T00:00:00.000Z",
    });

    expect(diffTagRows(rowA, rowB)).toEqual([
      { field: "copyrightNote", expected: "2018 CAPCOM CO., LTD.", actual: "" },
    ]);
  });
});
