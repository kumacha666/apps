import { describe, expect, test } from "vitest";
import { PlaybackQueue } from "./queue";
import type { Song } from "./catalog";
const song = (fileId: string): Song => ({ fileId, parentId: "p", title: fileId, artist: "", album: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "" });
class Audio { listener: (() => void) | undefined; addEventListener(_: "ended", listener: () => void) { this.listener = listener; } }
describe("PlaybackQueue", () => {
  test("除外、新しいリストでのリセット、next/previous/ended、最後で停止を扱う", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]); queue.exclude("b", true); expect(queue.list().map((s) => s.fileId)).toEqual(["a", "c"]);
    await queue.playAt(0); await queue.next(); await queue.next(); await queue.previous(); audio.listener?.();
    expect(played).toEqual(["a", "c", "a", "c"]); queue.setList([song("b")]); expect(queue.list().map((s) => s.fileId)).toEqual(["b"]);
  });
  test("現在曲より前を除外しても次曲を飛ばさない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]); await queue.playAt(1); queue.exclude("a", true); await queue.next();
    expect(played).toEqual(["b", "c"]);
  });
  test("未再生のリストでpreviousを押しても何も再生しない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b")]); await queue.previous();
    expect(played).toEqual([]);
  });
  test("キュー再生の終了時だけ次の曲へ進み、単曲試聴後の終了では進まない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b")]); await queue.playAt(0); audio.listener?.();
    await Promise.resolve();
    queue.notifyExternalPlaybackStarted(); audio.listener?.();
    await Promise.resolve();
    expect(played).toEqual(["a", "b"]);
  });
});
