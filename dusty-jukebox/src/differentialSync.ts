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
  // 変更のあったファイル自身の直接の親ID群（file.parents）を渡し、rootFolderId配下かどうかを
  // 判定する（main.tsはdrive.tsのisDescendantOfRootを束縛して渡す）。
  isDescendantOfRoot: (parentIds: string[] | undefined) => Promise<boolean>;
  // フォルダ変更イベント（リネーム・移動）を検知した際、そのフォルダの現在の配下を
  // 再帰走査する（main.tsはdrive.tsのlistAudioFilesRecursiveを束縛して渡す）。
  listSubtree: (folderId: string) => Promise<AudioFileEntry[]>;
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
  // フォルダの変更イベントを1件以上検知した場合true。フォルダがrootFolderIdの外へ移動した
  // ケースは、そのフォルダ自身の変更イベントだけでは配下ファイル1件1件の変更を検知できない
  // ため（CONCEPT.md 5節）、reconcileIndexAgainstRootによる事後の整合が必要になる。
  needsReconcile: boolean;
}

function isFolderLikeChange(file: NonNullable<DriveChange["file"]>): boolean {
  if (file.mimeType === FOLDER_MIME_TYPE) return true;
  return file.mimeType === SHORTCUT_MIME_TYPE && file.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE;
}

function folderTargetId(file: NonNullable<DriveChange["file"]>): string | undefined {
  if (file.mimeType === FOLDER_MIME_TYPE) return file.id;
  return file.shortcutDetails?.targetId;
}

function needsExtraction(entry: AudioFileEntry, existingScanState: Map<string, IndexRowScanState>): boolean {
  const existing = existingScanState.get(entry.file.id);
  if (!existing) return true;
  return existing.driveModifiedTime !== (entry.file.modifiedTime ?? "");
}

export async function planDifferentialSync(changes: DriveChange[], deps: DifferentialSyncDeps): Promise<DifferentialSyncPlan> {
  const removedFileIds = new Set<string>();
  const entriesByFileId = new Map<string, AudioFileEntry>();
  let needsReconcile = false;

  for (const change of changes) {
    if (change.removed || change.file?.trashed) {
      removedFileIds.add(change.fileId);
      continue;
    }
    const file = change.file;
    if (!file) continue;

    if (isFolderLikeChange(file)) {
      needsReconcile = true;
      const targetId = folderTargetId(file);
      if (!targetId) continue;
      const subtreeEntries = await deps.listSubtree(targetId);
      for (const entry of subtreeEntries) entriesByFileId.set(entry.file.id, entry);
      continue;
    }

    if (!isAudioFile(file.name)) continue;
    const underRoot = await deps.isDescendantOfRoot(file.parents);
    if (!underRoot) {
      // 索引に既にあれば（rootFolderId外へ移動した等）除去対象、無ければ単に無関係な
      // 変更（removeIndexRows/reconcileIndexAgainstRootはfileIdが存在しなければ何もしない）。
      removedFileIds.add(file.id);
      continue;
    }
    entriesByFileId.set(file.id, { file, folderPath: "" });
  }

  // フォルダのサブツリー再走査、または個々のファイル変更イベントの両方でentriesByFileIdに
  // 追加されたファイルは、rootFolderId配下に「今ある」ことが確認できているため、同じfileIdが
  // removedFileIdsにも入っていた場合（例：一度rootFolderId外への変更イベントが来た後、
  // 別の変更イベント経由で戻ってきた等の順序）は削除対象から除外する。
  for (const fileId of entriesByFileId.keys()) removedFileIds.delete(fileId);

  const entriesToProcess = [...entriesByFileId.values()].filter((entry) => needsExtraction(entry, deps.existingScanState));

  return { entriesToProcess, removedFileIds: [...removedFileIds], needsReconcile };
}
