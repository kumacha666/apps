// 初回スキャンの開始時トークンからchanges.listを再生した後に、同期状態をどの順序で
// 確定させるかをまとめる。初回完了フラグを早く立てると、途中失敗でも以後は差分同期だけへ
// 切り替わり、初回一覧に含まれないファイルを恒久的に取りこぼすため、この順序は重要。
//
// 各段階はsync.ts側でscanRunId込みの条件付き書き込みとして実装されており、この実行の所有権
// （同じroot/token・同じscanRunId）が保たれている場合のみ実際に書き込む。所有権を失った場合は
// falseを返す（2026-08-24 Codexレビュー指摘：P1）。以前はadvanceStartPageTokenがこの照合を
// 持たずPromise<void>を返していたため、所有権を失った実行でもこの段階は無条件に「成功」した
// ように見え、続くmarkInitialScanCompleted・clearScanRunIdがscanRunId不一致で静かに
// スキップされても、commitInitialChangeReplayは各段階の実際の適用有無を確認せず無条件でtrueを
// 返していた。各段階の戻り値を確認し、falseになった時点で後続の段階へ進まず停止する。

export interface InitialChangeReplayOps {
  advanceStartPageToken: () => Promise<boolean>;
  markInitialScanCompleted: () => Promise<boolean>;
  clearScanRunId: () => Promise<boolean>;
}

// trueなら、差分再生の結果を安全に初回スキャンの完了状態として確定できた
// （advance→mark→clearの3段階すべてが実際に適用された）。falseの場合は何も永続状態を
// 進めず、次回も同じ初回スキャン実行を再開する（途中の段階までは適用されている可能性が
// あるが、いずれにせよ次回の再確認・再実行で安全に収束する設計のため、途中状態を巻き戻す
// 必要は無い）。
export async function commitInitialChangeReplay(
  replaySucceeded: boolean,
  ops: InitialChangeReplayOps
): Promise<boolean> {
  if (!replaySucceeded) return false;

  if (!(await ops.advanceStartPageToken())) return false;
  if (!(await ops.markInitialScanCompleted())) return false;
  if (!(await ops.clearScanRunId())) return false;
  return true;
}

// consumeAllChangesが410 Gone（保存済みstartPageTokenが変更履歴保持期間切れで拒否された）を
// 検知した際、sync.tsのresetForFullRescanへ渡すべきexpectedパラメータを算出する。初回差分再生
// 中（initialScanRunIdが渡された場合）はこの実行のscanRunIdを含め、通常の差分同期
// （initialScanRunIdが省略された場合）は含めない。
//
// この判定自体をmain.tsから切り出してテストするのは、scanRunIdが省略可能な引数のため、
// main.ts側の呼び出しがscanRunIdを渡し忘れても型検査を通過してしまい、所有権を失った初回実行が
// 別デバイスの正当な状態をリセットする回帰を検出できないため（2026-08-24 Codexレビュー指摘：
// P1）。main.tsはユニットテスト対象外の既存方針のため、この判定ロジックだけを純粋関数として
// 切り出し、main.tsからは薄く呼び出すだけにする。
export function build410ResetExpected(
  rootFolderId: string,
  startPageToken: string,
  initialScanRunId?: string
): { rootFolderId: string; startPageToken: string; scanRunId?: string } {
  return initialScanRunId === undefined
    ? { rootFolderId, startPageToken }
    : { rootFolderId, startPageToken, scanRunId: initialScanRunId };
}
