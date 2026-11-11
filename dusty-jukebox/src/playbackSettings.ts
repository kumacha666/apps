// フェード・クロスフェードの設定（設定タブのチェックボックス・長さ）を、次に開いたときも引き継ぐための
// 読み書き（画面に依存しない部分）。保存先はブラウザのlocalStorage（端末・ブラウザごと。アルバム一覧の
// 並べ方と同じ扱い）。読めない・知らない値は、その項目だけ既定へ戻す（壊れた保存で設定画面が開けなく
// ならないように）。

import { DEFAULT_CROSSFADE_DURATION_SEC, isCrossfadeDurationSec, type CrossfadeDurationSec } from "./crossfade";

export const PLAYBACK_SETTINGS_STORAGE_KEY = "dusty-jukebox-playback-settings";

export interface PlaybackSettings {
  /** 手動スキップ・一時停止・シークのときのフェードアウト（と再開・シーク後のフェードイン）。 */
  fadeOut: boolean;
  /** 曲間のクロスフェード。 */
  crossfade: boolean;
  /** クロスフェードの長さ（秒）。 */
  crossfadeSec: CrossfadeDurationSec;
}

/** 何も保存していないときの設定（これまでの既定と同じ：どちらもオフ、3秒）。 */
export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  fadeOut: false,
  crossfade: false,
  crossfadeSec: DEFAULT_CROSSFADE_DURATION_SEC,
};

/** 保存した文字列 → 設定。項目ごとに確かめ、読めない項目は既定にする。 */
export function parsePlaybackSettings(raw: string | null): PlaybackSettings {
  if (!raw) return { ...DEFAULT_PLAYBACK_SETTINGS };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PLAYBACK_SETTINGS };
  }
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PLAYBACK_SETTINGS };
  const v = value as Record<string, unknown>;
  return {
    fadeOut: typeof v.fadeOut === "boolean" ? v.fadeOut : DEFAULT_PLAYBACK_SETTINGS.fadeOut,
    crossfade: typeof v.crossfade === "boolean" ? v.crossfade : DEFAULT_PLAYBACK_SETTINGS.crossfade,
    crossfadeSec:
      typeof v.crossfadeSec === "number" && isCrossfadeDurationSec(v.crossfadeSec) ? v.crossfadeSec : DEFAULT_PLAYBACK_SETTINGS.crossfadeSec,
  };
}

export function serializePlaybackSettings(settings: PlaybackSettings): string {
  return JSON.stringify({ fadeOut: settings.fadeOut, crossfade: settings.crossfade, crossfadeSec: settings.crossfadeSec });
}
