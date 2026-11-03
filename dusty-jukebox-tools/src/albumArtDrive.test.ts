import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthError } from "./auth";
import { artFileName, createEmbeddedExtractor, DriveHttpError, fetchWebImage, thumbnailSize } from "./albumArtDrive";
import { ImageFetchError } from "./albumArtCollect";
import { createWebArtSearch, WebSearchError } from "./albumArtSearch";

test("thumbnailSize：長い辺を上限以下に縮め、小さい画像はそのまま", () => {
  expect(thumbnailSize(1200, 1000, 512)).toEqual({ width: 512, height: 427 });
  expect(thumbnailSize(300, 300, 512)).toEqual({ width: 300, height: 300 });
  expect(thumbnailSize(0, 10, 512)).toEqual({ width: 0, height: 0 });
});

test("artFileName：Driveで使えない文字を置き換え、フォルダIDの先頭を付ける", () => {
  expect(artFileName({ albumFolderId: "abcdefghij", album: 'A/B:"C"', artist: "", shelf: "unknown", tracks: [] })).toBe("A_B__C_ [abcdefgh].jpg");
});

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
// ヘッダーは届くが、本文の受信中に接続が切れる応答
const brokenBody = (contentType: string) =>
  new Response(new ReadableStream({ start: (c) => c.error(new TypeError("connection reset")) }), { status: 200, headers: { "content-type": contentType } });

describe("埋め込み画像の読み出しでの認証の失敗", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("トークンが取れないときは例外のまま返す（全体を止める）", async () => {
    const extract = createEmbeddedExtractor(async () => {
      throw new AuthError("expired");
    });
    await expect(extract("f1")).rejects.toBeInstanceOf(AuthError);
  });

  test("ファイル情報の取得が401なら例外、404ならそのアルバムだけfailed", async () => {
    vi.stubGlobal("fetch", async () => new Response("unauthorized", { status: 401 }));
    await expect(createEmbeddedExtractor(async () => "t")("f1")).rejects.toMatchObject({ status: 401 });
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    await expect(createEmbeddedExtractor(async () => "t")("f1")).resolves.toEqual({ kind: "failed" });
  });

  test("曲の読み出し（Range）の途中で401になっても例外のまま返す", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("alt=media") ? new Response("unauthorized", { status: 401 }) : jsonResponse({ size: "5000", mimeType: "audio/mpeg" })
    );
    const err = await createEmbeddedExtractor(async () => "t")("f1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveHttpError);
    expect((err as DriveHttpError).status).toBe(401);
  });
});

describe("Webの応答の本文の受信中に切れた場合", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("画像はImageFetchError（そのアルバムだけ取れなかった扱い）", async () => {
    vi.stubGlobal("fetch", async () => brokenBody("image/png"));
    await expect(fetchWebImage("https://img")).rejects.toBeInstanceOf(ImageFetchError);
  });

  test("検索はWebSearchError", async () => {
    const search = createWebArtSearch(async () => brokenBody("application/json"));
    await expect(search.musicBrainz("Blue", "A")).rejects.toBeInstanceOf(WebSearchError);
    const notJson = createWebArtSearch(async () => new Response("<html>", { status: 200 }));
    await expect(notJson.iTunes("Blue", "A")).rejects.toBeInstanceOf(WebSearchError);
  });
});
