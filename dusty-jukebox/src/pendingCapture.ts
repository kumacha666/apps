// 単一のコールバックスロットに対する「まだ自分が所有しているものだけを解放する」操作を
// 提供する汎用ヘルパー（2026-09-16、main.tsのpendingQueueTransitionCapture向けにCodex
// レビュー指摘：P2「Clear only the capture owned by this recovery」への対応で切り出した）。
//
// 複数の非同期呼び出しが同じ1つのコールバックスロットへ順に登録・上書きしうる状況
// （例：attemptBackgroundPlaybackRecovery()の同じ分岐が短時間に複数回呼ばれ、それぞれが
// queue.resume()の直前にこのスロットへ「次回の登録で発行されたトークンを教えてほしい」という
// コールバックを設置する）で、失敗した呼び出しの後始末が「自分が設置したコールバックが、
// まだそこにあるかどうか」を確認してからでなければ解放できないようにする（他の呼び出しが
// 既に上書きしていた場合、それを誤って消さない）。
//
// main.tsはDOM結線のみを担う薄い層としてユニットテスト対象外とする既存方針のため、この
// スロット自体の状態遷移ロジックをここへ切り出してテスト可能にした。
export class PendingCapture<T> {
  private current: ((value: T) => void) | null = null;

  install(callback: (value: T) => void): void {
    this.current = callback;
  }

  // 現在設置されているコールバックがあれば消費して呼び出し、スロットを空にする。
  // 何も設置されていなければ何もしない。
  consume(value: T): void {
    const callback = this.current;
    if (!callback) return;
    this.current = null;
    callback(value);
  }

  // 渡されたコールバックが依然として現在の設置物である場合のみ解放する。既に別の
  // コールバックへ差し替わっている（または既に消費済みでnullの）場合は何もしない。
  releaseIfOwnedBy(callback: (value: T) => void): void {
    if (this.current === callback) {
      this.current = null;
    }
  }
}
