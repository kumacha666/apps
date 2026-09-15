// バックグラウンド再生の不安定さ（実機フィードバック、2026-09-14）を切り分けるための
// 診断ログ。visibilitychange・Page Lifecycle（freeze/resume）・キューの自然終了・
// MediaSession（Bluetooth/OSメディアキー）操作・Service Worker経由のDrive 401通知といった、
// 再生が止まる瞬間の前後関係を実機で再現してもらい、テキストとしてコピーしてもらうための
// 一時的な調査用ツール（本体機能ではない）。リング状の履歴（上限を超えたら古い方から破棄）と
// 表示用の整形だけを純粋ロジックとして切り出し、localStorageへの永続化・DOM結線は
// main.tsが担う（drive.ts等のDI方針と同じ「ロジックはテスト可能な形に、I/Oは呼び出し元に」）。

export interface DiagLogEntry {
  t: number;
  event: string;
  detail?: string;
}

export const MAX_DIAG_LOG_ENTRIES = 300;

// entriesは呼び出し元の配列を書き換えない（他のリスト操作系関数と同じ非破壊の方針）。
export function appendDiagLogEntry(
  entries: DiagLogEntry[],
  entry: DiagLogEntry,
  maxEntries = MAX_DIAG_LOG_ENTRIES
): DiagLogEntry[] {
  const next = [...entries, entry];
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
}

export function formatDiagLogEntry(entry: DiagLogEntry): string {
  const time = new Date(entry.t).toISOString();
  return entry.detail ? `${time} ${entry.event} ${entry.detail}` : `${time} ${entry.event}`;
}

export function formatDiagLog(entries: DiagLogEntry[]): string {
  return entries.map(formatDiagLogEntry).join("\n");
}

// localStorageから読み込んだ生のJSON文字列をエントリ配列へ変換する。壊れたJSON・
// 想定外の形（配列でない・要素がt/eventを持たない）はいずれも空配列にフォールバックする
// （診断ログ自体の破損が本体の起動を妨げないようにするため）。
export function parseDiagLog(raw: string | null): DiagLogEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DiagLogEntry =>
        typeof item === "object" &&
        item !== null &&
        Number.isFinite((item as { t?: unknown }).t) &&
        typeof (item as { event?: unknown }).event === "string"
    );
  } catch {
    return [];
  }
}
