import { describe, expect, it } from "vitest";
import { shouldResumeExternalPlayback } from "./externalPlayback";

describe("shouldResumeExternalPlayback", () => {
  it("同じfileIdを一時停止中なら再開する", () => {
    expect(shouldResumeExternalPlayback({ lastExternalFileId: "song-1", fileId: "song-1", audioPaused: true, audioEnded: false })).toBe(true);
  });

  it("直前に単曲試聴していない（lastExternalFileIdがnull）なら先頭から再生する", () => {
    expect(shouldResumeExternalPlayback({ lastExternalFileId: null, fileId: "song-1", audioPaused: true, audioEnded: false })).toBe(false);
  });

  it("別のfileIdなら先頭から再生する（キュー再生等でaudioが差し替わっている場合を含む）", () => {
    expect(shouldResumeExternalPlayback({ lastExternalFileId: "song-1", fileId: "song-2", audioPaused: true, audioEnded: false })).toBe(false);
  });

  it("一時停止中でない（再生中）なら再開の余地が無い", () => {
    expect(shouldResumeExternalPlayback({ lastExternalFileId: "song-1", fileId: "song-1", audioPaused: false, audioEnded: false })).toBe(false);
  });

  it("自然終了（ended）の場合は先頭から再生し直す", () => {
    expect(shouldResumeExternalPlayback({ lastExternalFileId: "song-1", fileId: "song-1", audioPaused: true, audioEnded: true })).toBe(false);
  });
});
