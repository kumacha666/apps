import type { Song } from "./catalog";

// 再生リストの手動並び替え機能（普通の音楽プレイヤーにある「並び替え」に相当）。
// catalog.tsのsortSongs()（絞り込みで新規に再生リストを作る際に自動適用される既定の並び
// ＝releaseYear→artist→album→discNumber→trackNumber）とは別物：こちらはユーザーが
// 既存の再生リストに対して都度選ぶ、明示的な並び替え操作。

export const QUEUE_SORT_FIELDS = ["title", "artist", "album", "releaseYear", "track"] as const;
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];
export type QueueSortDirection = "asc" | "desc";

// localeCompareは使わず単純な文字コード順にする（caseNormalization.ts等、本リポジトリの
// 既存の慣例と同じ理由：localeCompareの結果はICUデータの有無・バージョンに依存し
// 環境によって変わりうるため）。空欄は昇順・降順どちらでも常に末尾に置く
// （アーティスト/アルバム不明の曲がソート方向によって先頭に来ないようにするため）。
function compareStrings(a: string, b: string, direction: QueueSortDirection): number {
  const aEmpty = a === "";
  const bEmpty = b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return direction === "asc" ? cmp : -cmp;
}

function numericValue(value: string): number {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

// 数値フィールド（リリース年等）も文字列フィールドと同じ「不明な値は常に末尾」方針にする。
function compareNumeric(a: string, b: string, direction: QueueSortDirection): number {
  const av = numericValue(a);
  const bv = numericValue(b);
  const aUnknown = !Number.isFinite(av);
  const bUnknown = !Number.isFinite(bv);
  if (aUnknown && bUnknown) return 0;
  if (aUnknown) return 1;
  if (bUnknown) return -1;
  return direction === "asc" ? av - bv : bv - av;
}

// アーティスト・アルバムでソートする際の副次キー：同じアルバム内はディスク番号→トラック番号→
// タイトルの順で安定させる（普通の音楽プレイヤーの「アーティスト別」「アルバム別」表示と同じ
// 挙動）。並び替え方向（昇順/降順）の影響は受けない＝グループ内は常に自然な再生順を保つ。
function albumOrderTiebreak(a: Song, b: Song): number {
  const albumCmp = compareStrings(a.album, b.album, "asc");
  if (albumCmp !== 0) return albumCmp;
  const discCmp = compareNumeric(a.discNumber, b.discNumber, "asc");
  if (discCmp !== 0) return discCmp;
  const trackCmp = compareNumeric(a.trackNumber, b.trackNumber, "asc");
  if (trackCmp !== 0) return trackCmp;
  return compareStrings(a.title, b.title, "asc");
}

// 単一フィールドのみの比較（副次キー・最終的な決定性の付与はcompareSongsForQueueSort側で行う）。
function compareByFieldOnly(a: Song, b: Song, field: QueueSortField, direction: QueueSortDirection): number {
  switch (field) {
    case "title":
      return compareStrings(a.title, b.title, direction);
    case "artist":
      return compareStrings(a.artist, b.artist, direction);
    case "album":
      return compareStrings(a.album, b.album, direction);
    case "releaseYear":
      return compareNumeric(a.releaseYear, b.releaseYear, direction);
    case "track":
      return compareNumeric(a.trackNumber, b.trackNumber, direction);
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

// リリース年でソートする際、同じ年の曲を常にアルバム名でグループ化する
// （2026-09-08、ユーザー指摘：アーティストの活動歴を追いたい場合、同じ年に複数アルバムが
// あると、アルバム名でのグループ化すら無いためトラック番号やタイトルで曲がバラバラに
// 混ざってしまい実用にならなかった）。
// **releaseTypeはグループ化に使わない**（2026-09-08、ChatGPTレビュー指摘：P2、2ラウンド。
// 1ラウンド目の指摘「releaseTypeを先に比較すると同じアルバム内で一部の曲だけreleaseType
// 入力済みの場合に分断される」を受け、いったん「アルバム名が同じ場合はreleaseTypeが両方とも
// 入力済みの場合に限り比較する」という曲ペアごとの条件付き比較に直したが、2ラウンド目の指摘で
// この条件付き比較がcomparatorの推移律を壊すこと（例：A=releaseType空欄/track2、
// B=releaseType"Album"/track3、C=releaseType"Single"/track1のとき、A-B間・C-A間は
// releaseTypeを比較せずtrackで決着しA<B・C<Aとなるが、B-C間は両方入力済みのためreleaseTypeで
// 比較しB<Cとなり、結果A<B<C<Aの循環が生じ`Array.prototype.sort()`の前提を満たさず
// ソート結果が不安定になる）が判明した。releaseTypeはタグから自動抽出されないユーザー入力欄
// （catalog.ts参照）のため、そもそも曲ペアごとの条件比較ではなく、アルバム単位で一貫した
// グループキーを事前に用意する設計変更が必要になり、今回のバグ修正のスコープを超えるため、
// releaseTypeによるグループ化自体を撤回しアルバム名のみでグループ化するシンプルな実装に
// 戻した。なお元々releaseTypeが実際に比較へ影響していたのはアルバム名が完全一致する場合
// だけだった（アルバム名が異なれば比較はそこでreturnし、releaseTypeまで到達しないため）。
// 異なるアルバム名同士の順序には元から影響していなかったため、撤回による実質的な
// 機能低下は無い。
// シングル/アルバムの区分けという当初のユーザー要望自体は、releaseType・アルバム/シングル
// 通し番号等を外部検索によるカタログ補正で補完する別の新機能（設計は別途、`dusty-jukebox-tools`
// 側の拡張として検討）で改めて扱う。
// グループ間（異なるアルバム同士）の前後関係はアルバム名の文字列順になる（メタデータに
// 月日が無いため、同じ年内での実際のリリース順までは決定できない、既知の限界）。
// 第二候補・方向の指定（direction）には依存させず、常にこの安定順を先に適用する。
// **アルバム名だけでなく、アルバムアーティスト（無ければartist）→parentIdも比較する**
// （2026-09-08、ChatGPTレビュー指摘：P2、3ラウンド目。アルバム名のみをグループキーに
// すると、別アーティストの同名アルバム〈例：複数アーティストが同じ"Greatest Hits"という
// アルバム名を持つ〉が同じグループとして扱われてしまい、その後のトラック番号比較で
// 再びアルバムを跨いで曲が混ざる、今回直したかった問題と同型の不具合が残っていた。
// `catalog.ts`の`groupSongsByAlbum()`が採用しているアルバム同一性のキー
// （album + albumArtist||artist + parentId）に合わせることで、同名でも別アルバムは
// 区別されるようにした。3つとも単純な文字列比較のみで推移律は保たれる）。
function releaseYearGroupingTiebreak(a: Song, b: Song): number {
  const albumCmp = compareStrings(a.album, b.album, "asc");
  if (albumCmp !== 0) return albumCmp;
  const albumArtistCmp = compareStrings(
    a.albumArtist.trim() || a.artist,
    b.albumArtist.trim() || b.artist,
    "asc"
  );
  if (albumArtistCmp !== 0) return albumArtistCmp;
  return compareStrings(a.parentId, b.parentId, "asc");
}

// 第二候補のソートキー（開発体制#42、2026-09-08：単一アーティストで複数アルバムある場合に
// 「アルバムを古い順に、かつそのアルバム内はトラック順に」のような2段階の並べ替えをしたい、
// というユーザー要望を受けて追加）。第二候補を明示した場合は、第一候補が同値の曲同士を
// 第二候補のフィールド・方向で比較し、それでも同値ならタイトル→fileIdで決定性を確保する。
export function compareSongsForQueueSort(
  a: Song,
  b: Song,
  field: QueueSortField,
  direction: QueueSortDirection,
  secondaryField?: QueueSortField,
  secondaryDirection: QueueSortDirection = "asc"
): number {
  const primary = compareByFieldOnly(a, b, field, direction);
  if (primary !== 0) return primary;
  // リリース年が同値の場合、第二候補・既定の副次キーより先にアルバム名で
  // グループ化する（2026-09-08、ユーザー指摘）。ただし第二候補を明示した場合は、
  // 「第一候補が同値の曲同士を第二候補のフィールド・方向で直接比較する」という既存の契約
  // （CLAUDE.md・既存テストで明記）を壊さないよう、第二候補が未指定またはtrackの場合だけに
  // 限定する（2026-09-08、ChatGPTレビュー指摘：P2。当初は無条件に適用しており、releaseYear
  // primary＋artist/title等を第二候補に選んだ場合でも暗黙グループ化が先に確定してしまい、
  // 第二候補が事実上無視される回帰になっていた）。trackを第二候補にする組み合わせは、
  // アルバム内のトラック番号がアルバムを跨ぐと意味を持たない数値のため、グループ化との併用が
  // 前提の既存の使い方（CLAUDE.md「アルバムを古い順に、アルバム内はトラック順に」の例）であり、
  // 他のフィールド（artist/title/album）を第二候補にする場合は、ユーザーが明示的にその
  // フィールドでの直接比較を意図しているとみなし、暗黙グループ化を適用しない。
  if (field === "releaseYear" && (secondaryField === undefined || secondaryField === "track")) {
    const grouping = releaseYearGroupingTiebreak(a, b);
    if (grouping !== 0) return grouping;
  }
  if (secondaryField) {
    const secondary = compareByFieldOnly(a, b, secondaryField, secondaryDirection);
    if (secondary !== 0) return secondary;
    return compareStrings(a.title, b.title, "asc") || compareStrings(a.fileId, b.fileId, "asc");
  }
  // 第二候補を指定しない場合の既定の副次キー（後方互換）：アーティスト/アルバムは従来通り
  // アルバム→ディスク→トラック→タイトルの安定順、それ以外はタイトル→fileIdで決定性を確保する。
  if (field === "artist" || field === "album") {
    const tiebreak = albumOrderTiebreak(a, b);
    if (tiebreak !== 0) return tiebreak;
  }
  if (field === "releaseYear") {
    // グループ化後（同じアルバム内）は、ディスク→トラック→タイトルの
    // 自然な再生順で安定させる（アーティスト/アルバムの既定副次キーと同じ考え方）。
    const discCmp = compareNumeric(a.discNumber, b.discNumber, "asc");
    if (discCmp !== 0) return discCmp;
    const trackCmp = compareNumeric(a.trackNumber, b.trackNumber, "asc");
    if (trackCmp !== 0) return trackCmp;
  }
  return compareStrings(a.title, b.title, "asc") || compareStrings(a.fileId, b.fileId, "asc");
}

// 破壊的変更をしない純粋関数（呼び出し元、queue.tsのPlaybackQueue.sortBy()が配列を差し替える）。
export function sortSongsForQueue(
  songs: Song[],
  field: QueueSortField,
  direction: QueueSortDirection,
  secondaryField?: QueueSortField,
  secondaryDirection: QueueSortDirection = "asc"
): Song[] {
  return [...songs].sort((a, b) => compareSongsForQueueSort(a, b, field, direction, secondaryField, secondaryDirection));
}
