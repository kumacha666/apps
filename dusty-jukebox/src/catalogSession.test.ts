import { describe, expect, test } from "vitest";
import { CatalogSession } from "./catalogSession";

describe("CatalogSession", () => {
  test("読み込み後にスキャンを開始すると、再読み込みまで再生リスト作成を拒否する", () => {
    const catalog = new CatalogSession<string>();

    catalog.replace(["stale-song"]);
    expect(catalog.createQueue((songs) => [...songs])).toEqual(["stale-song"]);

    // A scan may update or remove index rows, so its start invalidates the
    // previously loaded snapshot before any asynchronous work begins.
    catalog.invalidate();
    expect(catalog.createQueue((songs) => [...songs])).toBeNull();

    catalog.replace(["rescanned-song"]);
    expect(catalog.createQueue((songs) => [...songs])).toEqual(["rescanned-song"]);
  });

  // 検索ボタンの有効/無効など「読み込み済みか」だけを知りたい呼び出し元のための問い合わせ
  // （createQueue(() => [])がnullかどうかで代用すると、createQueueの意味が変わったときに壊れる）。
  test("isLoaded()は読み込み済みかどうかだけを返し、空のカタログでも読み込み済みならtrue", () => {
    const catalog = new CatalogSession<string>();
    expect(catalog.isLoaded()).toBe(false);
    catalog.replace([]);
    expect(catalog.isLoaded()).toBe(true);
    catalog.replace(["a"]);
    expect(catalog.isLoaded()).toBe(true);
    catalog.invalidate();
    expect(catalog.isLoaded()).toBe(false);
  });
});
