// 着手順の目安4の残り（changes.list消費・リコンサイル）：初回スキャン完了後の差分同期で、
// drive.tsのconsumeAllChangesが返したDriveChange[]から「タグ抽出・upsertが必要なファイル」
// 「索引から削除すべきfileId」「リコンサイル（reconcileIndexAgainstRoot）が必要かどうか」を
// 判定する純粋なオーケストレーション層。main.tsはDrive/Sheets APIの実際のHTTP呼び出しを
// 行わず、この結果に基づいてextractAndBuildIndexEntries/upsertIndexRows/removeIndexRows/
// reconcileIndexAgainstRootを呼ぶだけにする（Drive/Sheets呼び出し自体はplanDifferentialSync
// が受け取るDIされた関数に閉じ込め、ユニットテストではフェイクを渡す）。
//
// changes.listはユーザーのDrive全体（または共有ドライブ全体）の変更を返し、rootFolderId配下に
// 限定されない。そのため各変更が実際にrootFolderId配下かどうかを、変更のあったファイルの
// 直接の親ID群からdrive.tsのisDescendantOfRootで祖先チェーンを遡って判定する必要がある
// （CONCEPT.md 5節）。

import { FOLDER_MIME_TYPE, SHORTCUT_MIME_TYPE, type AudioFileEntry, type DriveChange } from "./drive";
import type { IndexRowScanState } from "./sheets";
import { isAudioFile } from "./lib";

export interface DifferentialSyncDeps {
  // 変更のあったファイル（またはフォルダ）自身の直接の親ID群を渡し、rootFolderId配下かどうかを
  // 判定する（main.tsはdrive.tsのisDescendantOfRootを束縛して渡す。ショートカット経由の
  // 到達性を含めるためextraRootFolderIdsも束縛済みのクロージャを渡す想定）。
  isDescendantOfRoot: (parentIds: string[] | undefined) => Promise<boolean>;
  // フォルダ変更イベント（リネーム・移動）を検知した際、そのフォルダの現在の配下を
  // 再帰走査する（main.tsはdrive.tsのlistAudioFilesRecursiveを束縛して渡す）。resourceKeyは
  // そのフォルダがリンク共有のセキュリティ更新が適用されたショートカット参照先の場合にのみ渡す
  // （2026-08-21 Codexレビュー指摘：P2。渡さないとfiles.listが404になり、差分同期がこの
  // フォルダ変更イベントを毎回再試行し続けてしまう）。
  listSubtree: (folderId: string, resourceKey?: string) => Promise<AudioFileEntry[]>;
  // 既存索引のfileId→{driveModifiedTime,...}（sheets.tsのindexRowsScanStateの戻り値）。
  // 既に同じdriveModifiedTimeで索引済みのファイルは再抽出をスキップする判定に使う
  // （フォルダのサブツリー再走査は「新しく含まれるようになったファイル」を拾うためのもので、
  // 変化していない既存ファイルまで毎回タグ抽出し直す必要は無いため）。
  existingScanState: Map<string, IndexRowScanState>;
}

export interface DifferentialSyncPlan {
  // タグ抽出→索引upsertが必要なエントリ
  entriesToProcess: AudioFileEntry[];
  // 索引から削除（行の空欄化）すべきfileId
  removedFileIds: string[];
  // フォルダの変更イベントを1件以上検知した場合true（削除・ゴミ箱移動されたファイル/フォルダの
  // 種別が変更イベント自体からは判定できない場合も、安全側でtrueにする）。フォルダが
  // rootFolderIdの外へ移動・削除されたケースは、そのフォルダ自身の変更イベントだけでは配下
  // ファイル1件1件の変更を検知できないため（CONCEPT.md 5節）、reconcileIndexAgainstRootによる
  // 事後の整合が必要になる。
  needsReconcile: boolean;
}

function isFolderLikeChange(file: NonNullable<DriveChange["file"]>): boolean {
  if (file.mimeType === FOLDER_MIME_TYPE) return true;
  return file.mimeType === SHORTCUT_MIME_TYPE && file.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE;
}

function folderTarget(file: NonNullable<DriveChange["file"]>): { id: string; resourceKey?: string } | undefined {
  if (file.mimeType === FOLDER_MIME_TYPE) return { id: file.id };
  if (!file.shortcutDetails?.targetId) return undefined;
  return { id: file.shortcutDetails.targetId, resourceKey: file.shortcutDetails.targetResourceKey };
}

function needsExtraction(entry: AudioFileEntry, existingScanState: Map<string, IndexRowScanState>): boolean {
  const existing = existingScanState.get(entry.file.id);
  if (!existing) return true;
  return existing.driveModifiedTime !== (entry.file.modifiedTime ?? "");
}

// 1件のfileIdに対する、この差分同期での最終的な扱い。change配列を時系列（＝Drive上での
// 発生順）に処理し、同じfileIdに対して複数の状態を後勝ち（最後の状態が勝つ）で上書きする
// （2026-08-21 Codexレビュー指摘：P1）。以前の実装は「削除対象の集合」と「処理対象の集合」を
// 別々に持ち、ループ終了後に「処理対象にあれば削除対象から機械的に除外する」という後処理を
// 行っていたため、同じ同期区間内で「更新→削除」の順にイベントが来た場合、更新イベントで
// 処理対象に入ったfileIdが、後から来た削除イベントの結果を（削除→処理対象という順で処理した
// にも関わらず）打ち消してしまっていた。1つのMapへの逐次set()に統一し、後に処理した
// イベントが常に勝つようにすることで、この種のイベント順序依存のバグを構造的に防ぐ。
type FileOutcome =
  | { action: "process"; entry: AudioFileEntry; skipIfUnchanged: boolean }
  | { action: "remove" };

// フルスキャンでのみ永続化されるextraRootFolderIds（sync.tsのshortcutRootFolderIds）は、
// 差分同期中に発生したフォルダショートカットの追加・削除・移動をまだ反映していない
// （2026-08-21 Codexレビュー指摘：P1）。これを更新しないと：
// ①差分同期中に新しく追加されたショートカットの参照先は「追加のルート」に含まれないため、
//   その配下をlistSubtreeでアップサートした直後にneedsReconcileが発火すると（楽曲の物理的な
//   親は通常rootFolderIdへ到達しないため）追加した行がすべて削除されてしまう
// ②逆にショートカットが削除・移動された場合は古い参照先が残り続け、配下だった行が
//   リコンサイルで削除されなくなる
// main.tsはplanDifferentialSync呼び出し前にこれを呼び、extraRootFolderIdsを直接書き換えたうえで
// isDescendantOfRoot・reconcileIndexAgainstRootの両方に使い回し、最後にsync タブへ永続化する。
export async function applyShortcutChangesToExtraRootFolderIds(
  changes: DriveChange[],
  extraRootFolderIds: Set<string>,
  isUnderRoot: (parentIds: string[] | undefined) => Promise<boolean>
): Promise<void> {
  for (const change of changes) {
    const file = change.file;
    if (!file) continue;
    const targetId =
      file.mimeType === SHORTCUT_MIME_TYPE && file.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE
        ? file.shortcutDetails.targetId
        : undefined;
    if (!targetId) continue;
    if (change.removed || file.trashed) {
      extraRootFolderIds.delete(targetId);
      continue;
    }
    if (await isUnderRoot(file.parents)) {
      extraRootFolderIds.add(targetId);
    } else {
      extraRootFolderIds.delete(targetId);
    }
  }
}

export async function planDifferentialSync(changes: DriveChange[], deps: DifferentialSyncDeps): Promise<DifferentialSyncPlan> {
  const outcomes = new Map<string, FileOutcome>();
  let needsReconcile = false;

  for (const change of changes) {
    const file = change.file;

    if (change.removed || file?.trashed) {
      // フォルダ自体が削除・ゴミ箱移動された場合、配下ファイル1件1件の変更イベントは
      // 発生しない（CONCEPT.md 5節）ため、それらは索引から取り除かれずに残ってしまう。
      // removed=trueの場合はfile情報自体が無くフォルダか音楽ファイルかを判定できないため、
      // 安全側（データを恒久的に取りこぼさない側）に倒してリコンサイルを実行する
      // （2026-08-21 Codexレビュー指摘：P1）。
      if (!file || isFolderLikeChange(file)) needsReconcile = true;
      outcomes.set(change.fileId, { action: "remove" });
      continue;
    }
    if (!file) continue;

    if (isFolderLikeChange(file)) {
      needsReconcile = true;
      const target = folderTarget(file);
      if (!target) continue;
      // このフォルダが現在rootFolderId配下にある場合のみサブツリーを再走査する。changes.listは
      // Drive全体（または共有ドライブ全体）の変更を返すため、この確認をしないとrootFolderIdと
      // 無関係なフォルダの変更でも配下全体を走査・タグ抽出してしまう（2026-08-21 Codexレビュー
      // 指摘：P2）。配下から外れた場合（rootFolderId内→外への移動）の索引側の後始末は、上で
      // 立てたneedsReconcileによるreconcileIndexAgainstRootに委ねる（サブツリー走査では
      // 「今どこにあるか」しか分からず「以前どこにあったか」は分からないため、外れたケースの
      // 検出自体はリコンサイル側の役目）。
      const stillUnderRoot = await deps.isDescendantOfRoot(file.parents);
      if (!stillUnderRoot) continue;
      const subtreeEntries = await deps.listSubtree(target.id, target.resourceKey);
      for (const entry of subtreeEntries) {
        outcomes.set(entry.file.id, { action: "process", entry, skipIfUnchanged: true });
      }
      continue;
    }

    if (!isAudioFile(file.name)) {
      // 索引済みの曲が対象外拡張子へリネームされた場合、以後このルートは差分同期のみに
      // 進むため（フルスキャンには戻らない）、ここで削除しないと恒久的に索引へ残ってしまう
      // （2026-08-21 Codexレビュー指摘：P1）。索引に無ければremoveIndexRowsが何もしないため、
      // 未索引のfileIdに対して無条件に発行しても安全。
      outcomes.set(file.id, { action: "remove" });
      continue;
    }

    const underRoot = await deps.isDescendantOfRoot(file.parents);
    if (!underRoot) {
      // 索引に既にあれば（rootFolderId外へ移動した等）除去対象、無ければ単に無関係な変更。
      outcomes.set(file.id, { action: "remove" });
      continue;
    }
    // changes.listが個別に通知した変更なので、driveModifiedTimeが変わっていなくても常に処理する
    // （skipIfUnchanged=false）。Driveはフォルダ間の純粋な移動だけではmodifiedTimeを更新しない
    // ことがあり、driveModifiedTime一致を理由にスキップすると、移動後の新しいparentIdが
    // 索引に反映されないまま残ってしまう（2026-08-21 Codexレビュー指摘：P1）。skipIfUnchangedを
    // 使うのはフォルダのサブツリー再走査で見つかったエントリ（Driveが「このファイルが変わった」
    // と個別に教えてくれたわけではない）だけに限定する。
    outcomes.set(file.id, { action: "process", entry: { file, folderPath: "" }, skipIfUnchanged: false });
  }

  const removedFileIds: string[] = [];
  const entriesToProcess: AudioFileEntry[] = [];
  for (const outcome of outcomes.values()) {
    if (outcome.action === "remove") continue;
    if (outcome.skipIfUnchanged && !needsExtraction(outcome.entry, deps.existingScanState)) continue;
    entriesToProcess.push(outcome.entry);
  }
  for (const [fileId, outcome] of outcomes) {
    if (outcome.action === "remove") removedFileIds.push(fileId);
  }

  return { entriesToProcess, removedFileIds, needsReconcile };
}
