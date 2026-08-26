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
});
