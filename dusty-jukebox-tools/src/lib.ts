import Encoding from "encoding-japanese";

// dusty-jukebox（本体）のsrc/lib.tsから移植。A1記法のシート名はスペース・アポストロフィ等を
// 含む場合クォートが必須。
export function sheetRange(sheetName: string, cell: string): string {
  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  return `${quoted}!${cell}`;
}

// dusty-jukebox（本体）のsrc/lib.tsのdetectGarbledをそのまま移植（文字化け判定ロジック自体は
// 変更していない）。UTF-8の日本語文字列をShift_JIS/CP932で誤デコードした際に頻出する文字
// （いわゆる「文字化けマーカー」）と、デコード失敗を示すU+FFFDの出現を検出する簡易ヒューリスティック。
const MOJIBAKE_MARKERS = ["縺", "繧", "繝", "蟲", "繹", "荳", "隱"];
const MOJIBAKE_MARKER_REGEXES = MOJIBAKE_MARKERS.map((marker) => new RegExp(marker, "g"));

export function detectGarbled(text: string | undefined | null): boolean {
  if (!text) return false;
  if (text.includes("�")) return true;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) return true;
  let markerHits = 0;
  for (const regex of MOJIBAKE_MARKER_REGEXES) {
    const matches = text.match(regex);
    if (matches) markerHits += matches.length;
  }
  return markerHits >= 2;
}

// 文字化けの実際の発生経路（本アプリで実測・確認済み。ai-workspace CONCEPT.md 4.4節の
// 当初の想定〈Shift_JISをLatin1/CP1252に誤読〉とは逆方向）：UTF-8でエンコードされた
// 日本語テキストのバイト列が、何らかの過去の処理でShift_JIS/CP932として誤デコードされた。
// 修復は「その逆をたどる」：文字化けした文字列を再びShift_JIS/CP932のバイト列としてエンコード
// し直し、それをUTF-8としてデコードすれば元のテキストが復元できる。
//
// 例: "こんにちは世界" → (誤デコード) → "縺薙ｓ縺ｫ縺｡縺ｯ荳也阜" → (本関数) → "こんにちは世界"
//
// 修復に失敗した場合（結果が入力と同じ、UTF-8として不正なバイト列になる、または結果が
// 依然としてdetectGarbled()でtrueになる）はnullを返す。呼び出し元は元の値をそのまま残す。
export function repairGarbledText(text: string): string | null {
  if (!text) return null;
  try {
    const codes = Encoding.stringToCode(text);
    const sjisCodes = Encoding.convert(codes, { to: "SJIS", from: "UNICODE" });
    const bytes = Uint8Array.from(sjisCodes);
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (repaired === "" || repaired === text) return null;
    if (detectGarbled(repaired)) return null;
    return repaired;
  } catch {
    return null;
  }
}
