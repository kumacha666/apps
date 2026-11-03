import { expect, test } from "vitest";
import { artFileName, thumbnailSize } from "./albumArtDrive";

test("thumbnailSize：長い辺を上限以下に縮め、小さい画像はそのまま", () => {
  expect(thumbnailSize(1200, 1000, 512)).toEqual({ width: 512, height: 427 });
  expect(thumbnailSize(300, 300, 512)).toEqual({ width: 300, height: 300 });
  expect(thumbnailSize(0, 10, 512)).toEqual({ width: 0, height: 0 });
});

test("artFileName：Driveで使えない文字を置き換え、フォルダIDの先頭を付ける", () => {
  expect(artFileName({ albumFolderId: "abcdefghij", album: 'A/B:"C"', artist: "", shelf: "unknown", tracks: [] })).toBe("A_B__C_ [abcdefgh].jpg");
});
