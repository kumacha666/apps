import { describe, expect, test, vi } from "vitest";
import { FolderPathResolver } from "./folderPaths";
import { decodeFolderIdList } from "./sync";
describe("FolderPathResolver", () => {
  test("祖先をルートまで辿り、同時要求でもPromiseを共有する", async () => {
    const get = vi.fn(async (id: string) => ({ child: { name: "Album", parentId: "artist" }, artist: { name: "Artist", parentId: "root" } }[id] ?? null));
    const resolver = new FolderPathResolver(get, "root");
    await expect(Promise.all([resolver.resolve("child"), resolver.resolve("child")])).resolves.toEqual(["Artist / Album", "Artist / Album"]);
    expect(get).toHaveBeenCalledTimes(2);
  });
  test("失敗した祖先は同一カタログ読み込み中に兄弟パスから再取得しない", async () => {
    const get = vi.fn(async (id: string) => {
      if (id === "album-a" || id === "album-b") return { name: id, parentId: "artist" };
      if (id === "artist") throw new Error("temporary");
      return null;
    });
    const resolver = new FolderPathResolver(get, "root");
    await expect(resolver.resolve("album-a")).rejects.toThrow("temporary");
    await expect(resolver.resolve("album-b")).rejects.toThrow("temporary");
    expect(get).toHaveBeenCalledWith("artist");
    expect(get.mock.calls.filter(([id]) => id === "artist")).toHaveLength(1);
  });
  test("syncタブのショートカットルートをデコードして祖先の連結を止める", async () => {
    const get = vi.fn(async (id: string) => ({ album: { name: "Album", parentId: "shortcut-root" }, "shortcut-root": { name: "Outside", parentId: "outside-parent" } }[id] ?? null));
    // SyncState stores this value as a comma-separated string. Spreading that
    // raw string would produce one-character root IDs instead.
    const resolver = new FolderPathResolver(get, ["root", ...decodeFolderIdList("shortcut-root")]);
    await expect(resolver.resolve("album")).resolves.toBe("Album");
    expect(get).toHaveBeenCalledTimes(1);
  });

  test("resolvedEntries()は実際にgetFolderが返した値を保持し、失敗・null応答は含まない", async () => {
    const get = vi.fn(async (id: string) => {
      if (id === "child") return { name: "Album", parentId: "artist" };
      if (id === "artist") return { name: "Artist", parentId: "root" };
      if (id === "missing") return null;
      throw new Error("boom");
    });
    const resolver = new FolderPathResolver(get, "root");
    await resolver.resolve("child");
    await expect(resolver.resolve("missing")).resolves.toBe("");
    await expect(resolver.resolve("failing")).rejects.toThrow("boom");

    expect(resolver.resolvedEntries()).toEqual(
      new Map([
        ["child", { name: "Album", parentId: "artist" }],
        ["artist", { name: "Artist", parentId: "root" }],
      ])
    );
  });
});
