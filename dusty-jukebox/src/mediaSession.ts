// Bluetoothスピーカー・OSのメディアキー（曲送り・戻し・再生・一時停止）対応（2026-09-05、
// 実機利用フィードバック：開発体制#39の指摘③）。ブラウザのMedia Session API
// （`navigator.mediaSession`）へ現在再生中の曲情報とアクションハンドラを登録する。
//
// drive.ts/folderPaths.tsと同じDI方針：`navigator.mediaSession`・`MediaMetadata`は
// テスト環境（vitestのnode環境）に存在しないため、呼び出し元（main.ts）が実ブラウザの値を
// 渡す薄いラッパーとして実装し、ロジック自体はフェイクを渡してユニットテストする。

import type { Song } from "./catalog";

export interface MediaMetadataInit {
  title: string;
  artist: string;
  album: string;
}

// 曲タイトルが空（抽出失敗等）の場合はfileIdへフォールバックする。catalog.tsのparseIndexRows
// が同様のフォールバックをfolderPath表示等で行っているのと同じ方針。
export function mediaMetadataInit(song: Song): MediaMetadataInit {
  return { title: song.title || song.fileId, artist: song.artist, album: song.album };
}

export type MediaSessionPlaybackState = "playing" | "paused" | "none";
export type MediaSessionAction = "play" | "pause" | "previoustrack" | "nexttrack";

export interface MediaSessionLike {
  metadata: unknown;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: (() => void) | null): void;
}

export type MediaMetadataConstructorLike = new (init: MediaMetadataInit) => unknown;

// 現在再生中の曲情報をMedia Sessionへ反映する。曲が無い（キュー未作成・全曲除外後の停止時等）
// 場合はmetadataをnullに戻す（OS側のロック画面・Bluetoothディスプレイに古い曲名を残さないため）。
export function updateNowPlayingMetadata(
  mediaSession: MediaSessionLike | undefined,
  MediaMetadataCtor: MediaMetadataConstructorLike | undefined,
  song: Song | undefined
): void {
  if (!mediaSession) return;
  mediaSession.metadata = song && MediaMetadataCtor ? new MediaMetadataCtor(mediaMetadataInit(song)) : null;
}

export function updatePlaybackState(mediaSession: MediaSessionLike | undefined, state: MediaSessionPlaybackState): void {
  if (!mediaSession) return;
  mediaSession.playbackState = state;
}

export interface MediaSessionActionHandlers {
  play: () => void;
  pause: () => void;
  previoustrack: () => void;
  nexttrack: () => void;
}

// 一度だけ呼ぶ想定（アプリ初期化時）。play/pauseは`<audio>`要素のネイティブ再生・一時停止に
// 委ねる（PlaybackController.pause()は状態を完全に破棄する設計＝アプリの「一時停止」ボタンと
// 同じ扱いにすると、Bluetoothの一時停止ボタンを押すたびに再生が完全に停止してしまい、
// 同じボタンでの再開ができなくなる。既知の制限「アプリの一時停止ボタン→ネイティブ再開での
// 認証相関ロス」と同種のトレードオフとして、Bluetoothの一時停止／再生はネイティブの
// pause/play相当として扱う）。previoustrack/nexttrackはキューの次へ/前へと同じ経路を使う。
export function registerActionHandlers(mediaSession: MediaSessionLike | undefined, handlers: MediaSessionActionHandlers): void {
  if (!mediaSession) return;
  mediaSession.setActionHandler("play", handlers.play);
  mediaSession.setActionHandler("pause", handlers.pause);
  mediaSession.setActionHandler("previoustrack", handlers.previoustrack);
  mediaSession.setActionHandler("nexttrack", handlers.nexttrack);
}
