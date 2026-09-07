// ライブラリ健全性チェック。表記ゆれ統一・文字化け修復（caseNormalization.ts/garbledRepair.ts）が
// 特定パターンの自動修正なのに対し、こちらは書き込みを一切行わない読み取り専用のレポート機能。
// 「自動では直せないが、人間の目で確認すれば分かる」異常を広く検知することが目的（2026-09-07、
// 実データの文字化け対応セッション中に見つかった問題——detectGarbled()が拾わない文字化け、
// Mp3tagの複数選択編集事故によるタイトル誤上書き等——を踏まえて設計）。
//
// 外部Web検索・音楽DB照会によるデータ補完は範囲外（ユーザーとの相談で明示的に切り離し済み）。
// ここでの「疑いあり」は必ず人間の確認を経てから対処する前提で、確信度の高い自動修正は
// caseNormalization.ts/garbledRepair.tsの役割のまま。

import { INDEX_SHEET_HEADER } from "./sheets";

type Row = (string | number)[];

const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();

function fileId(row: Row): string {
  return cell(row, "fileId");
}

// 表示用の実効値（override優先、"(none)"は明示的な空、それ以外は抽出値）。
// catalog.tsのreadOverride()と同じ規約。
function effective(
  row: Row,
  field: "title" | "artist" | "albumArtist" | "album" | "composer" | "releaseYear"
): string {
  const override = cell(row, `${field}_override` as (typeof INDEX_SHEET_HEADER)[number]);
  if (override === "(none)") return "";
  if (override !== "") return override;
  return cell(row, field);
}

// ===== ① 文字化けの疑い =====

// detectGarbled()（本体・このアプリのgarbledRepair.tsが使う判定）は特定の漢字・カタカナの
// 繰り返しだけを検出するため、実データで見つかった「Rë¡」「TEhgbN」のような文字化けを
// 見逃す（2026-09-07、実ライブラリの手動対応セッションで判明）。健全性チェックはここより
// 広く「Latin-1補助文字（U+0080-U+00FF）・半角カナ（U+FF61-U+FF9F）を含むか」で拾う
// （西欧人名のアクセント記号や"×"のような正当な使用も誤検知するが、これは自動修正ではなく
// 人間が確認するためのレポートなので、広めに拾う方を優先する）。
function hasSuspiciousBytes(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x80 && cp <= 0xff) return true;
    if (cp >= 0xff61 && cp <= 0xff9f) return true;
  }
  return false;
}

export interface GarbledSuspectEntry {
  fileId: string;
  field: "title" | "artist" | "albumArtist" | "album" | "composer" | "genre";
  value: string;
}

const GARBLED_CHECK_FIELDS = ["title", "artist", "albumArtist", "album", "composer"] as const;

export function findGarbledSuspects(rows: Row[]): GarbledSuspectEntry[] {
  const results: GarbledSuspectEntry[] = [];
  for (const row of rows) {
    const id = fileId(row);
    if (!id) continue;
    for (const field of GARBLED_CHECK_FIELDS) {
      const value = effective(row, field);
      if (value && hasSuspiciousBytes(value)) {
        results.push({ fileId: id, field, value });
      }
    }
    // genreはoverride列自体が無いため常に抽出値を見る。
    const genre = cell(row, "genre");
    if (genre && hasSuspiciousBytes(genre)) {
      results.push({ fileId: id, field: "genre", value: genre });
    }
  }
  return results;
}

// ===== ② 欠落フィールド =====

export interface MissingFieldEntry {
  fileId: string;
  field: "title" | "artist" | "album" | "genre";
}

const MISSING_CHECK_FIELDS = ["title", "artist", "album"] as const;

export function findMissingFields(rows: Row[]): MissingFieldEntry[] {
  const results: MissingFieldEntry[] = [];
  for (const row of rows) {
    const id = fileId(row);
    if (!id) continue;
    for (const field of MISSING_CHECK_FIELDS) {
      if (effective(row, field) === "") results.push({ fileId: id, field });
    }
    if (cell(row, "genre") === "") results.push({ fileId: id, field: "genre" });
  }
  return results;
}

// ===== ③ 同一フォルダ内でのタイトル重複 =====
// 2026-09-06の実機対応で発生した「Mp3tagで複数ファイルを選択編集した際、Title欄の値が
// 意図せず全選択ファイルへ一括適用されてしまう」事故（4曲が全て"Houston"になった）を
// 将来検知できるようにする。同一フォルダ内で完全に同じタイトルの曲が2件以上あれば疑いとして拾う
// （マルチディスク構成の同名イントロトラック等、正当なケースもあるため自動修正はしない）。

export interface DuplicateTitleGroup {
  parentId: string;
  title: string;
  fileIds: string[];
}

export function findDuplicateTitlesInFolder(rows: Row[]): DuplicateTitleGroup[] {
  const byFolder = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    const id = fileId(row);
    if (!id) continue;
    const parentId = cell(row, "parentId");
    const title = effective(row, "title");
    if (!parentId || !title) continue;
    let byTitle = byFolder.get(parentId);
    if (!byTitle) {
      byTitle = new Map();
      byFolder.set(parentId, byTitle);
    }
    const ids = byTitle.get(title);
    if (ids) ids.push(id);
    else byTitle.set(title, [id]);
  }
  const results: DuplicateTitleGroup[] = [];
  for (const [parentId, byTitle] of byFolder) {
    for (const [title, fileIds] of byTitle) {
      if (fileIds.length >= 2) results.push({ parentId, title, fileIds });
    }
  }
  return results;
}

// ===== ④ 同一アルバム内でのreleaseYearの外れ値 =====
// アルバムはcatalog.tsのgroupSongsByAlbum()と同じ「album(実効値)+albumArtist(空ならartist、実効値)
// +parentId」でグルーピングする（フォルダが異なる同名リリースを誤って束ねないため）。ここでの
// 「実効値」はeffective()経由（override優先、"(none)"は明示的な空）で、本体のreadOverride()と
// 同じ規約に揃えている（override補正済みの曲が別グループに分かれて外れ値を見逃す、または
// releaseYear_override="(none)"を文字列"(none)"のまま実在年として数えてしまう、といった
// 誤検知を防ぐため）。年が入っている曲のうち厳密な過半数（同数は含まない）が同じ年
// （かつ3件以上）の場合のみ、それ以外の年の曲を「外れ値」として報告する
// （オムニバス盤等、年がもともとバラバラなアルバムを誤検知しないための閾値）。

export interface YearOutlierEntry {
  fileId: string;
  album: string;
  year: string;
  majorityYear: string;
}

function albumGroupKey(row: Row): string {
  const album = effective(row, "album");
  const albumArtist = effective(row, "albumArtist") || effective(row, "artist");
  const parentId = cell(row, "parentId");
  // 空白区切りの単純連結だと、album/albumArtistの空白の位置が異なる別アルバム同士が
  // 同じキー文字列に衝突しうる（ChatGPT再レビュー指摘、PR #425）。catalog.tsの
  // groupSongsByAlbum()と同じくJSON.stringify()で境界を明確にする。
  return JSON.stringify([album, albumArtist, parentId]);
}

export function findYearOutliers(rows: Row[]): YearOutlierEntry[] {
  const groups = new Map<string, { album: string; entries: { fileId: string; year: string }[] }>();
  for (const row of rows) {
    const id = fileId(row);
    if (!id) continue;
    const album = effective(row, "album");
    if (!album) continue;
    const key = albumGroupKey(row);
    // "0"は「年不明」を表すID3タグの慣習的なプレースホルダーで、実在する年ではない
    // （実データで確認済み：あるアルバム内で"0"の曲数が実際の発売年の曲数を上回ることがあり、
    // "0"を有効な年として扱うと逆に正しい年の方を「外れ値」と誤判定してしまう）。空欄と同様に
    // 年不明として除外する。effective()はoverride="(none)"を""に正規化するため、
    // 文字列"(none)"自体が実在年として数えられることもない。
    const rawYear = effective(row, "releaseYear");
    const year = rawYear === "0" ? "" : rawYear;
    let group = groups.get(key);
    if (!group) {
      group = { album, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ fileId: id, year });
  }

  const results: YearOutlierEntry[] = [];
  for (const { album, entries } of groups.values()) {
    const withYear = entries.filter((e) => e.year !== "");
    if (withYear.length < 3) continue;
    const counts = new Map<string, number>();
    for (const e of withYear) counts.set(e.year, (counts.get(e.year) ?? 0) + 1);
    let majorityYear = "";
    let majorityCount = 0;
    for (const [year, count] of counts) {
      if (count > majorityCount) {
        majorityYear = year;
        majorityCount = count;
      }
    }
    if (majorityCount <= withYear.length / 2) continue; // ちょうど過半数（同数）も多数派とはみなさない
    for (const e of withYear) {
      if (e.year !== majorityYear) {
        results.push({ fileId: e.fileId, album, year: e.year, majorityYear });
      }
    }
  }
  return results;
}

export interface HealthCheckReport {
  garbledSuspects: GarbledSuspectEntry[];
  missingFields: MissingFieldEntry[];
  duplicateTitles: DuplicateTitleGroup[];
  yearOutliers: YearOutlierEntry[];
}

export function runHealthCheck(rows: Row[]): HealthCheckReport {
  return {
    garbledSuspects: findGarbledSuspects(rows),
    missingFields: findMissingFields(rows),
    duplicateTitles: findDuplicateTitlesInFolder(rows),
    yearOutliers: findYearOutliers(rows),
  };
}
