import { describe, expect, test, vi } from "vitest";
import { FolderPathResolver } from "./folderPaths";
describe("FolderPathResolver", () => {
  test("祖先をルートまで辿り、同時要求でもPromiseを共有する", async () => {
    const get = vi.fn(async (id: string) => ({ child: { name: "Album", parentId: "artist" }, artist: { name: "Artist", parentId: "root" } }[id] ?? null));
    const resolver = new FolderPathResolver(get, "root");
    await expect(Promise.all([resolver.resolve("child"), resolver.resolve("child")])).resolves.toEqual(["Artist / Album", "Artist / Album"]);
    expect(get).toHaveBeenCalledTimes(2);
  });
  test("失敗した取得はキャッシュせず次回再取得する", async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue({ name: "Album", parentId: "root" }); const resolver = new FolderPathResolver(get, "root");
    await expect(resolver.resolve("child")).rejects.toThrow("temporary"); await expect(resolver.resolve("child")).resolves.toBe("Album"); expect(get).toHaveBeenCalledTimes(2);
  });  test("追加のショートカットルートでも祖先の連結を止める", async () => {
    const get = vi.fn(async (id: string) => ({ album: { name: "Album", parentId: "shortcut-root" }, "shortcut-root": { name: "Outside", parentId: "outside-parent" } }[id] ?? null));
    const resolver = new FolderPathResolver(get, ["root", "shortcut-root"]);
    await expect(resolver.resolve("album")).resolves.toBe("Album");
    expect(get).toHaveBeenCalledTimes(1);
  });
});
