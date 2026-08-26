import { describe, expect, test, vi } from "vitest";
import { PlaybackQueue } from "./queue";
import { parseIndexRows, type Song } from "./catalog";
import { INDEX_SHEET_HEADER } from "./sheets";
const song = (fileId: string): Song => ({ fileId, parentId: "p", title: fileId, artist: "", album: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "" });
const indexRow = (values: Record<string, string>): string[] => INDEX_SHEET_HEADER.map((header) => values[header] ?? "");
class Audio { listener: (() => void) | undefined; addEventListener(_: "ended", listener: () => void) { this.listener = listener; } }
describe("PlaybackQueue", () => {
  test("除外、新しいリストでのリセット、next/previous/ended、最後で停止を扱う", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]); queue.exclude("b", true); expect(queue.list().map((s) => s.fileId)).toEqual(["a", "c"]);
    await queue.playAt(0); await queue.next(); await queue.next(); await queue.previous(); audio.listener?.();
    await vi.waitFor(() => expect(played).toEqual(["a", "c", "a", "c"])); queue.setList([song("b")]); expect(queue.list().map((s) => s.fileId)).toEqual(["b"]);
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
    await vi.waitFor(() => expect(played).toEqual(["a", "b"]));
    queue.notifyExternalPlaybackStarted(); audio.listener?.();
    expect(played).toEqual(["a", "b"]);
  });
  test("失敗した再生を再試行し、endedの失敗を通知する", async () => {
    const audio = new Audio(); const error = new Error("temporary"); const onError = vi.fn();
    const play = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
    const queue = new PlaybackQueue({ play }, audio, onError);
    queue.setList([song("a"), song("b")]); await expect(queue.next()).rejects.toThrow("temporary"); await queue.next();
    audio.listener?.(); await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(play.mock.calls.map(([id]) => id)).toEqual(["a", "a", "b"]);
  });
  test("再生開始中に次へを連続で押すと、異なる曲へ順に進む", async () => {
    const audio = new Audio(); let resolveFirst: (() => void) | undefined;
    const firstPlayback = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const play = vi.fn().mockImplementationOnce(() => firstPlayback).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("a"), song("b"), song("c")]);

    const firstNext = queue.next();
    const secondNext = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("a"));
    expect(play).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await Promise.all([firstNext, secondNext]);

    expect(play.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  });
  test("リスト差し替え後は、待機中だった旧リストの移動を反映しない", async () => {
    const audio = new Audio(); let resolvePlayback: (() => void) | undefined;
    const playback = new Promise<void>((resolve) => { resolvePlayback = resolve; });
    const play = vi.fn().mockImplementationOnce(() => playback).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("old-a"), song("old-b")]);

    const oldMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("old-a"));
    queue.setList([song("new-a"), song("new-b")]);
    resolvePlayback?.();
    await oldMove;
    audio.listener?.();
    expect(play).toHaveBeenCalledTimes(1);

    await queue.next();
    expect(play.mock.calls.map(([id]) => id)).toEqual(["old-a", "new-a"]);
  });
  test("リスト差し替え後の移動は、旧リストの未解決の再生を待たない", async () => {
    const audio = new Audio(); let resolveOldPlayback: (() => void) | undefined;
    const oldPlayback = new Promise<void>((resolve) => { resolveOldPlayback = resolve; });
    const play = vi.fn().mockImplementationOnce(() => oldPlayback).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("old-a")]);

    const oldMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("old-a"));
    queue.setList([song("new-a")]);
    const newMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("new-a"));
    await newMove;

    resolveOldPlayback?.();
    await expect(oldMove).resolves.toBeUndefined();
  });

  test("重複を除いたカタログなら次曲へ進める", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    const songs = parseIndexRows([indexRow({ fileId: "a", title: "first" }), indexRow({ fileId: "a", title: "duplicate" }), indexRow({ fileId: "b" })]);
    queue.setList(songs);
    await queue.next(); await queue.next();
    expect(played).toEqual(["a", "b"]);
  });
});
