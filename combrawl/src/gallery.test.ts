import { describe, expect, it } from "vitest";
import {
  isGalleryProgressAdvanced,
  loadGalleryProgress,
  mergeGalleryProgress,
  resetGalleryProgress,
  saveGalleryProgress,
  type GalleryProgress,
} from "./gallery";

function makeMemoryStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("loadGalleryProgress", () => {
  it("記録が無ければ全軸0を返す", () => {
    const storage = makeMemoryStorage();
    expect(loadGalleryProgress(storage)).toEqual({ hp: 0, atk: 0, def: 0 });
  });

  it("壊れたJSONが保存されていても全軸0にフォールバックする", () => {
    const storage = makeMemoryStorage();
    storage.data["combrawl.gallery.v1"] = "not json";
    expect(loadGalleryProgress(storage)).toEqual({ hp: 0, atk: 0, def: 0 });
  });

  it("保存済みの値をそのまま返す", () => {
    const storage = makeMemoryStorage();
    storage.data["combrawl.gallery.v1"] = JSON.stringify({ hp: 5, atk: 3, def: 8 });
    expect(loadGalleryProgress(storage)).toEqual({ hp: 5, atk: 3, def: 8 });
  });
});

describe("mergeGalleryProgress", () => {
  it("観測したユニット群のtierのうち各軸の最大値と、既存記録の大きい方を採用する", () => {
    const current: GalleryProgress = { hp: 3, atk: 2, def: 5 };
    const merged = mergeGalleryProgress(current, [
      { hp: 2, atk: 6, def: 1 },
      { hp: 5, atk: 4, def: 3 },
    ]);
    expect(merged).toEqual({ hp: 5, atk: 6, def: 5 }); // hp:5(観測)>3, atk:6(観測)>2, def:5(既存)>3や1
  });

  it("観測値が既存記録を下回っても、記録は下がらない", () => {
    const current: GalleryProgress = { hp: 10, atk: 10, def: 10 };
    const merged = mergeGalleryProgress(current, [{ hp: 1, atk: 1, def: 1 }]);
    expect(merged).toEqual({ hp: 10, atk: 10, def: 10 });
  });

  it("観測群が空でも既存記録をそのまま返す", () => {
    const current: GalleryProgress = { hp: 4, atk: 4, def: 4 };
    expect(mergeGalleryProgress(current, [])).toEqual(current);
  });
});

describe("isGalleryProgressAdvanced", () => {
  it("いずれかの軸が伸びていればtrue", () => {
    expect(isGalleryProgressAdvanced({ hp: 1, atk: 1, def: 1 }, { hp: 2, atk: 1, def: 1 })).toBe(true);
  });
  it("全軸変化なしならfalse", () => {
    expect(isGalleryProgressAdvanced({ hp: 1, atk: 1, def: 1 }, { hp: 1, atk: 1, def: 1 })).toBe(false);
  });
});

describe("saveGalleryProgress", () => {
  it("localStorageに保存し、loadGalleryProgressで読み戻せる", () => {
    const storage = makeMemoryStorage();
    saveGalleryProgress({ hp: 7, atk: 8, def: 9 }, storage);
    expect(loadGalleryProgress(storage)).toEqual({ hp: 7, atk: 8, def: 9 });
  });
});

describe("resetGalleryProgress", () => {
  it("全軸0に戻した記録を返し、storageにも保存する", () => {
    const storage = makeMemoryStorage();
    saveGalleryProgress({ hp: 7, atk: 8, def: 9 }, storage);
    const reset = resetGalleryProgress(storage);
    expect(reset).toEqual({ hp: 0, atk: 0, def: 0 });
    expect(loadGalleryProgress(storage)).toEqual({ hp: 0, atk: 0, def: 0 });
  });
});
