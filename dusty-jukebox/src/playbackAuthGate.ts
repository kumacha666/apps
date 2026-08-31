// ポップアップを伴うGIS更新は、必ずボタンのclickハンドラからだけ始める。再生/キュー操作が
// 失効を検知した時点では続行したい操作だけを保留し、最後に要求された操作を更新後に実行する。
export class PlaybackAuthenticationGate {
  private pendingOperation: (() => Promise<void>) | null = null;
  private refreshInFlight: Promise<void> | null = null;

  constructor(private readonly refreshFromUserGesture: () => Promise<void>) {}

  defer(operation: () => Promise<void>): void {
    this.pendingOperation = operation;
  }

  hasPendingOperation(): boolean {
    return this.pendingOperation !== null;
  }

  continueFromUserGesture(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refresh = (async () => {
      await this.refreshFromUserGesture();
      const operation = this.pendingOperation;
      this.pendingOperation = null;
      await operation?.();
    })();
    this.refreshInFlight = refresh.finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }
}
