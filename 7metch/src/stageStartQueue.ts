// startStage()（ui.ts）の直列化・「最新要求優先」ロジックを、DOM/非同期処理から
// 切り離して純粋にテストできるようにするためのヘルパー。startStage()は
// createBoard()/ensurePlayableBoard()等でGを直接書き換える非同期処理のため、
// 実行中に来た新しい開始要求を単純にreturnで破棄すると、離脱直後の再開始が
// 無言で無視される欠落になる（PR #361・9巡目・10巡目、/code-review指摘）。
// かといって並行実行を許すと、古い処理が新しいステージのGを後から上書きしうる。
// このクラスは「実行中は1つだけ・新しい要求は最新のものだけ保留し、実行中の処理が
// 完了してから1回だけ反映する」という直列化ルールだけを管理する（Gにもui.tsにも
// 依存しない）。各要求には呼び出し元が任意のcontext（ui.tsではnavigationEpoch）を
// 添えられる——要求が実際にキューから取り出されて実行されるのは「要求された瞬間」
// より後になりうるため、実行時ではなく要求された瞬間のcontextを保持しておく必要が
// ある（要求後・実行開始前にナビゲーションが起きたケースを実行側が検知できるように
// するため。11巡目、/code-review指摘）
export interface StageStartRequest<T> {
  index: number;
  context: T;
}

export class StageStartQueue<T> {
  private running = false;
  private pending: StageStartRequest<T> | null = null;

  // 実行中でなければ呼び出し元に実行許可を与えてtrueを返す（内部状態をrunning=trueに
  // する）。既に実行中なら{index, context}を「最新の保留要求」として記録するだけで
  // falseを返す（複数回連続で呼ばれても、常に最後に渡されたものだけが残る＝上書き）
  requestStart(index: number, context: T): boolean {
    if (this.running) {
      this.pending = { index, context };
      return false;
    }
    this.running = true;
    return true;
  }

  // 実行中セッションの1回分の処理が完了した直後に呼ぶ。保留要求があればそれを
  // 取り出して返す（running状態は維持したまま、呼び出し元は同じセッションで
  // 続けて次の要求を処理する）。保留要求が無ければrunning状態を解放しnullを返す
  takeNextOrFinish(): StageStartRequest<T> | null {
    if (this.pending !== null) {
      const next = this.pending;
      this.pending = null;
      return next;
    }
    this.running = false;
    return null;
  }

  // 現在保留中の要求があるか。実行中の処理が、続行しても無駄になる（＝新しい要求に
  // 取って代わられる）ことに気づくためのチェックに使う
  hasPending(): boolean {
    return this.pending !== null;
  }

  isRunning(): boolean {
    return this.running;
  }

  // 例外発生時など、通常のtakeNextOrFinish()経路を通らずに処理が終わった場合でも
  // 確実にrunning/pendingをクリアする（呼び出し元がtry/finallyで無条件に呼ぶ）
  reset(): void {
    this.running = false;
    this.pending = null;
  }
}
