// 開発体制#42③（プレイヤーのUI見直し、2026-09-09）：ネイティブ<audio controls>と
// アプリ独自の黄色ボタン群との見た目・操作感の差をなくすため、シークバー自体も独自UIへ
// 一本化する。ここでは純粋ロジックのみを切り出し、main.tsから<audio>要素・<input type="range">に
// 結線する（DOM結線自体はmain.tsが担う既存方針、mediaSession.ts等と同じ）。

// 秒数を"分:秒"（1時間以上は"時:分:秒"）表記へ変換する。NaN/Infinity/負値は未確定として"0:00"を返す。
export function formatSeekTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

// durationがシーク可能な有限の正数かどうか。ストリーミング開始直後（メタデータ未確定・
// Content-Rangeから総サイズが分からない場合）はNaN/Infinityになりうるため、その間は
// シークバーを無効化する判定に使う。
export function isSeekableDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}
