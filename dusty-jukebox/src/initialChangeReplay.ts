// 初回スキャンの開始時トークンからchanges.listを再生した後に、同期状態をどの順序で
// 確定させるかをまとめる。初回完了フラグを早く立てると、途中失敗でも以後は差分同期だけへ
// 切り替わり、初回一覧に含まれないファイルを恒久的に取りこぼすため、この順序は重要。

export interface InitialChangeReplayOps {
  advanceStartPageToken: () => Promise<void>;
  markInitialScanCompleted: () => Promise<void>;
  clearScanRunId: () => Promise<void>;
}

// trueなら、差分再生の結果を安全に初回スキャンの完了状態として確定できた。
// falseの場合は何も永続状態を進めず、次回も同じ初回スキャン実行を再開する。
export async function commitInitialChangeReplay(
  replaySucceeded: boolean,
  ops: InitialChangeReplayOps
): Promise<boolean> {
  if (!replaySucceeded) return false;

  await ops.advanceStartPageToken();
  await ops.markInitialScanCompleted();
  await ops.clearScanRunId();
  return true;
}
