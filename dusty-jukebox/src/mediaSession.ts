// Bluetoothスピーカー・OSのメディアキー（曲送り・戻し・再生・一時停止）対応（2026-09-05、
// 実機利用フィードバック：開発体制#39の指摘③）。ブラウザのMedia Session API
// （`navigator.mediaSession`）へ現在再生中の曲情報とアクションハンドラを登録する。
//
// drive.ts/folderPaths.tsと同じDI方針：`navigator.mediaSession`・`MediaMetadata`は
// テスト環境（vitestのnode環境）に存在しないため、呼び出し元（main.ts）が実ブラウザの値を
// 渡す薄いラッパーとして実装し、ロジック自体はフェイクを渡してユニットテストする。

import type { Song } from "./catalog";

export interface MediaImageInit { src: string; sizes?: string; type?: string }
export interface MediaMetadataInit {
  title: string;
  artist: string;
  album: string;
  // アルバムアート（R17）。画像がまだ無い曲では付けない。
  artwork?: MediaImageInit[];
}

// 曲タイトルが空（抽出失敗等）の場合はfileIdへフォールバックする。catalog.tsのparseIndexRows
// が同様のフォールバックをfolderPath表示等で行っているのと同じ方針。
export function mediaMetadataInit(song: Song, artworkUrl?: string | null): MediaMetadataInit {
  const init: MediaMetadataInit = { title: song.title || song.fileId, artist: song.artist, album: song.album };
  if (artworkUrl) init.artwork = [{ src: artworkUrl, type: artworkUrl.match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg" }];
  return init;
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
  song: Song | undefined,
  artworkUrl?: string | null
): void {
  if (!mediaSession) return;
  mediaSession.metadata = song && MediaMetadataCtor ? new MediaMetadataCtor(mediaMetadataInit(song, artworkUrl)) : null;
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
// 各actionを個別にtry/catchする。navigator.mediaSession自体は存在しても、個々のactionへの
// 対応状況はブラウザ実装によって差があり、未対応actionでsetActionHandler()が例外を投げる
// 実装があるため、1つの失敗が残りのaction登録や呼び出し元（init()）の後続処理を止めないようにする
// （2026-09-05、ChatGPTレビュー指摘：修正前は最初にthrowしたactionで残り全てが未登録になり、
// かつinit()内のこの呼び出し直後にあるログイン・スキャン・再生等のボタンイベント登録も
// 実行されなくなっていた）。
export function registerActionHandlers(mediaSession: MediaSessionLike | undefined, handlers: MediaSessionActionHandlers): void {
  if (!mediaSession) return;
  const entries: [MediaSessionAction, () => void][] = [
    ["play", handlers.play],
    ["pause", handlers.pause],
    ["previoustrack", handlers.previoustrack],
    ["nexttrack", handlers.nexttrack],
  ];
  for (const [action, handler] of entries) {
    try {
      mediaSession.setActionHandler(action, handler);
    } catch {
      // 未対応action。他のactionの登録・呼び出し元の後続処理は継続する。
    }
  }
}
