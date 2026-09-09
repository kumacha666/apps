// 汎用のタイムアウト付きPromiseラッパー（開発体制#44、2026-09-08：強制リロード時、
// Service Workerが「まだこのページを制御していない」状態が続き`serviceWorkerReady`が
// 永久に解決せず、再生系のボタンが「押せるが何も起きない・エラーも出ない」まま固まる
// 不具合への対応）。setTimeout/clearTimeoutを注入可能にし、他のDI関数（fade.ts参照）と
// 同じ方針でフェイクタイマーにより実時間を待たずにユニットテストできるようにする。
export class TimeoutError extends Error {}

// setTimeoutの戻り値の型は実行環境（ブラウザ＝number、Node＝Timeoutオブジェクト）で異なるため、
// handleはunknownとして扱う（呼び出し元は中身を検査せず、そのままclearTimeoutへ渡すだけ）。
export interface TimerScheduler {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultScheduler: TimerScheduler = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
};

// promiseがtimeoutMs以内に解決/拒否すればその結果をそのまま返す。解決しなければ
// messageを持つTimeoutErrorで拒否する（元のpromiseは中断できないため裏で走り続けるが、
// 呼び出し元はこのタイムアウトによって先に進める）。
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  scheduler: TimerScheduler = defaultScheduler
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = scheduler.setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
    promise.then(
      (value) => { scheduler.clearTimeout(timer); resolve(value); },
      (err) => { scheduler.clearTimeout(timer); reject(err); }
    );
  });
}
