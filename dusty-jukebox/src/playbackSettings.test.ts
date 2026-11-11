import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYBACK_SETTINGS, parsePlaybackSettings, serializePlaybackSettings } from "./playbackSettings";

describe("playbackSettings", () => {
  it("保存が無ければ既定（どちらもオフ、3秒）", () => {
    expect(parsePlaybackSettings(null)).toEqual({ fadeOut: false, crossfade: false, crossfadeSec: 3 });
    expect(parsePlaybackSettings("")).toEqual(DEFAULT_PLAYBACK_SETTINGS);
  });

  it("保存した設定をそのまま読み戻せる", () => {
    const saved = { fadeOut: true, crossfade: true, crossfadeSec: 20 as const };
    expect(parsePlaybackSettings(serializePlaybackSettings(saved))).toEqual(saved);
  });

  it("壊れた保存は既定にする", () => {
    expect(parsePlaybackSettings("{not json")).toEqual(DEFAULT_PLAYBACK_SETTINGS);
    expect(parsePlaybackSettings("null")).toEqual(DEFAULT_PLAYBACK_SETTINGS);
    expect(parsePlaybackSettings("42")).toEqual(DEFAULT_PLAYBACK_SETTINGS);
  });

  it("読めない項目だけ既定にし、ほかの項目は引き継ぐ", () => {
    // 選べない長さ（4秒）・型の違う値
    expect(parsePlaybackSettings(JSON.stringify({ fadeOut: true, crossfade: "yes", crossfadeSec: 4 }))).toEqual({
      fadeOut: true,
      crossfade: false,
      crossfadeSec: 3,
    });
    expect(parsePlaybackSettings(JSON.stringify({ crossfade: true, crossfadeSec: 7 }))).toEqual({ fadeOut: false, crossfade: true, crossfadeSec: 7 });
  });
});
