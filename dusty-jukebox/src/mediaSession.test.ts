import { describe, expect, test, vi } from "vitest";
import { mediaMetadataInit, registerActionHandlers, updateNowPlayingMetadata, updatePlaybackState, type MediaSessionLike } from "./mediaSession";
import type { Song } from "./catalog";

const song = (overrides: Partial<Song> = {}): Song => ({
  fileId: "f1", parentId: "p", title: "Title", artist: "Artist", album: "Album",
  composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", ...overrides,
});

function fakeMediaSession(): MediaSessionLike & { handlers: Record<string, (() => void) | null> } {
  const handlers: Record<string, (() => void) | null> = {};
  return {
    metadata: null,
    playbackState: "none",
    handlers,
    setActionHandler(action, handler) { handlers[action] = handler; },
  };
}

describe("mediaMetadataInit", () => {
  test("title/artist/albumをそのまま渡す", () => {
    expect(mediaMetadataInit(song())).toEqual({ title: "Title", artist: "Artist", album: "Album" });
  });

  test("タイトルが空ならfileIdへフォールバックする", () => {
    expect(mediaMetadataInit(song({ title: "" }))).toEqual({ title: "f1", artist: "Artist", album: "Album" });
  });
});

describe("updateNowPlayingMetadata", () => {
  test("曲がある場合、MediaMetadataコンストラクタで生成した値をmetadataへ設定する", () => {
    const mediaSession = fakeMediaSession();
    const Ctor = vi.fn(function (this: unknown, init: unknown) { Object.assign(this as object, init); }) as unknown as new (init: unknown) => unknown;
    updateNowPlayingMetadata(mediaSession, Ctor, song());
    expect(Ctor).toHaveBeenCalledWith({ title: "Title", artist: "Artist", album: "Album" });
    expect(mediaSession.metadata).toEqual({ title: "Title", artist: "Artist", album: "Album" });
  });

  test("曲が無い場合はmetadataをnullに戻す（OS側に古い曲名を残さない）", () => {
    const mediaSession = fakeMediaSession();
    mediaSession.metadata = "stale";
    updateNowPlayingMetadata(mediaSession, class {} as unknown as new (init: unknown) => unknown, undefined);
    expect(mediaSession.metadata).toBeNull();
  });

  test("mediaSession自体が無い（未対応ブラウザ）場合は何もしない", () => {
    expect(() => updateNowPlayingMetadata(undefined, undefined, song())).not.toThrow();
  });
});

describe("updatePlaybackState", () => {
  test("playbackStateを設定する", () => {
    const mediaSession = fakeMediaSession();
    updatePlaybackState(mediaSession, "playing");
    expect(mediaSession.playbackState).toBe("playing");
  });

  test("mediaSessionが無い場合は何もしない", () => {
    expect(() => updatePlaybackState(undefined, "paused")).not.toThrow();
  });
});

describe("registerActionHandlers", () => {
  test("play/pause/previoustrack/nexttrackの4種類を登録する", () => {
    const mediaSession = fakeMediaSession();
    const handlers = { play: vi.fn(), pause: vi.fn(), previoustrack: vi.fn(), nexttrack: vi.fn() };
    registerActionHandlers(mediaSession, handlers);
    expect(mediaSession.handlers.play).toBe(handlers.play);
    expect(mediaSession.handlers.pause).toBe(handlers.pause);
    expect(mediaSession.handlers.previoustrack).toBe(handlers.previoustrack);
    expect(mediaSession.handlers.nexttrack).toBe(handlers.nexttrack);
  });

  test("mediaSessionが無い場合は何もしない", () => {
    expect(() => registerActionHandlers(undefined, { play: vi.fn(), pause: vi.fn(), previoustrack: vi.fn(), nexttrack: vi.fn() })).not.toThrow();
  });
});
