import { describe, expect, test, vi } from "vitest";
import { PlaybackQueue, queueRowViews, songDisplayLabel, nowPlayingLabel } from "./queue";
import { PlaybackAuthenticationRequiredError } from "./playback";
import { PlaybackAuthenticationGate } from "./playbackAuthGate";
import { PlaybackContinuationRegistry } from "./playbackContinuation";
import { parseIndexRows, type Song } from "./catalog";
import { INDEX_SHEET_HEADER } from "./sheets";
const song = (fileId: string): Song => ({ fileId, parentId: "p", title: fileId, artist: "", album: "", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "" });
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
    await expect(oldMove).resolves.toBe(false);
  });

  test("重複を除いたカタログなら次曲へ進める", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    const songs = parseIndexRows([indexRow({ fileId: "a", title: "first" }), indexRow({ fileId: "a", title: "duplicate" }), indexRow({ fileId: "b" })]);
    queue.setList(songs);
    await queue.next(); await queue.next();
    expect(played).toEqual(["a", "b"]);
  });

  test("曲を開始しなかった移動はfalseを返し、UIが再生中と誤表示しないための情報を渡す", async () => {
    const audio = new Audio();
    const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a")]);

    expect(await queue.previous()).toBe(false);
    expect(await queue.next()).toBe(true);
    expect(await queue.next()).toBe(false);
  });

  test("endedの自動送りを外側の認証ゲート経由ハンドラへ委譲できる", async () => {
    const audio = new Audio();
    const onEnded = vi.fn();
    const queue = new PlaybackQueue({ play: async () => {} }, audio, () => {}, onEnded);
    queue.setList([song("a"), song("b")]);
    await queue.next();

    audio.listener?.();

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test("現在のキュー曲を指定位置から再開できる", async () => {
    const audio = new Audio();
    const play = vi.fn(async () => {});
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("a")]);
    await queue.next();
    await queue.resumeCurrent(42.25);

    expect(play.mock.calls).toEqual([["a"], ["a", 42.25]]);
  });

  test("最初の曲のnative playが未解決でも、開始前フックが継続情報を登録できる", async () => {
    const audio = new Audio();
    let settlePlay!: () => void;
    const nativePlay = new Promise<void>((resolve) => { settlePlay = resolve; });
    const registry = new PlaybackContinuationRegistry();
    const beforePlay = vi.fn((fileId: string) => registry.register({ fileId, generation: 1, resume: async () => true }));
    const queue = new PlaybackQueue({ play: () => nativePlay }, audio, () => {}, null, beforePlay);
    queue.setList([song("a")]);

    const move = queue.next();
    await vi.waitFor(() => expect(beforePlay).toHaveBeenCalledWith("a"));
    expect(queue.currentPlayingFileId()).toBeNull();
    registry.recordTokenRequest("first-request", "a", 1, "rejected-token");
    expect(registry.acceptTokenRejection("first-request", "a", "rejected-token")).not.toBeNull();
    settlePlay();
    await expect(move).resolves.toBe(true);
  });

  test("認証継続は401後も未解決の元のキュー移動を待たずに再生する", async () => {
    const audio = new Audio();
    let settleOriginal!: () => void;
    const originalPlay = new Promise<void>((resolve) => { settleOriginal = resolve; });
    const play = vi.fn().mockImplementationOnce(() => originalPlay).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("a")]);

    const originalMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("a"));
    const resumed = queue.resume("a", 12.5);
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("a", 12.5));
    await expect(resumed).resolves.toBe(true);

    settleOriginal();
    await expect(originalMove).resolves.toBe(true);
  });

  test("自動送り中の認証待ちは次曲を保留し、明示的な継続後に同じ次曲を再開する", async () => {
    const audio = new Audio();
    const played: string[] = [];
    const gate = new PlaybackAuthenticationGate(async () => {});
    const player = {
      play: vi.fn(async (fileId: string) => {
        played.push(fileId);
        if (fileId === "b" && played.filter((id) => id === "b").length === 1) {
          throw new PlaybackAuthenticationRequiredError();
        }
      }),
    };
    let queue!: PlaybackQueue;
    const advance = async () => {
      try {
        await queue.next();
      } catch (error) {
        if (error instanceof PlaybackAuthenticationRequiredError) gate.defer(advance);
        else throw error;
      }
    };
    queue = new PlaybackQueue(player, audio, () => {}, () => void advance());
    queue.setList([song("a"), song("b")]);
    await queue.next();

    audio.listener?.();
    await vi.waitFor(() => expect(gate.hasPendingOperation()).toBe(true));
    await gate.continueFromUserGesture();

    expect(played).toEqual(["a", "b", "b"]);
    expect(queue.currentPlayingFileId()).toBe("b");
  });
});

describe("queueRowViews", () => {
  test("除外されていない曲だけがlistIndexを持ち、list()と同じ順序で採番される", () => {
    const songs = [song("a"), song("b"), song("c")];
    const excluded = new Set(["b"]);
    const views = queueRowViews(songs, (fileId) => excluded.has(fileId), null);
    expect(views.map((v) => ({ fileId: v.song.fileId, excluded: v.excluded, listIndex: v.listIndex }))).toEqual([
      { fileId: "a", excluded: false, listIndex: 0 },
      { fileId: "b", excluded: true, listIndex: null },
      { fileId: "c", excluded: false, listIndex: 1 },
    ]);
  });

  test("listIndexは実際にPlaybackQueue.playAt()が受け付けるインデックスと一致する", async () => {
    const played: string[] = [];
    const audio = new Audio();
    const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    const songs = [song("a"), song("b"), song("c")];
    queue.setList(songs);
    queue.exclude("a", true);
    const views = queueRowViews(songs, (fileId) => queue.isExcluded(fileId), queue.currentPlayingFileId());
    const cView = views.find((v) => v.song.fileId === "c")!;
    await queue.playAt(cView.listIndex!);
    expect(played).toEqual(["c"]);
  });

  test("currentFileIdと一致する曲のisCurrentがtrueになる", () => {
    const songs = [song("a"), song("b")];
    const views = queueRowViews(songs, () => false, "b");
    expect(views.map((v) => v.isCurrent)).toEqual([false, true]);
  });
});

describe("songDisplayLabel / nowPlayingLabel", () => {
  test("タイトルのみの曲はタイトルだけを表示する", () => {
    const bare: Song = { fileId: "x", parentId: "p", title: "Title", artist: "", album: "", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "" };
    expect(songDisplayLabel(bare)).toBe("Title");
  });

  test("アーティスト・アルバム・フォルダパスがあれば連結する", () => {
    const full: Song = { fileId: "x", parentId: "p", title: "Title", artist: "Artist", album: "Album", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", folderPath: "A / B" };
    expect(songDisplayLabel(full)).toBe("Title — Artist / Album [A / B]");
  });

  test("nowPlayingLabelは曲が無ければ空文字列、あれば「再生中: 」を前置する", () => {
    expect(nowPlayingLabel(undefined)).toBe("");
    expect(nowPlayingLabel(song("a"))).toBe("再生中: a");
  });
});
