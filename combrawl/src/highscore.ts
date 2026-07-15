export interface RunRecord {
  /** 到達ラウンド。10層未満で敗北した場合はその到達ラウンド、10層クリア後エンドレスに進めばそれ以上の値になる */
  endlessRound: number;
  score: number;
  maxTurnDamage: number;
  maxTurnKills: number;
  clearedTenFloors: boolean;
  achievedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "combrawl.bestRecord.v1";

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    // プライベートブラウジングやサンドボックス化されたiframe等、localStorageへの
    // アクセス自体（プロパティ参照だけ）が例外を投げる環境があるため、丸ごとtry/catchする
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // 自己ベスト機能はオプショナルなので、握りつぶして「記録なし」として扱う
  }
  return null;
}

export function loadBestRecord(storage?: StorageLike): RunRecord | null {
  const s = resolveStorage(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

/**
 * 自分の中だけの記録（ランキングというより「自己ベスト」）。
 * 到達ラウンドが上回った時、または同ラウンドで新たに10層クリアを達成した時に更新する
 * （例: 先に「10層目で敗北(endlessRound=10, clearedTenFloors=false)」を記録した後、
 * 別のランで「10層クリア(endlessRound=10, clearedTenFloors=true)」しても正しく上書きする）
 */
export function saveRecordIfBetter(record: RunRecord, storage?: StorageLike): { saved: boolean; best: RunRecord } {
  const s = resolveStorage(storage);
  const current = loadBestRecord(storage);
  const isBetter =
    !current ||
    record.endlessRound > current.endlessRound ||
    (record.endlessRound === current.endlessRound && record.clearedTenFloors && !current.clearedTenFloors);
  if (!isBetter) {
    return { saved: false, best: current as RunRecord };
  }
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // 保存に失敗しても、今回のセッション内の表示用にはこの記録をそのまま返す（下のreturn参照）
    }
  }
  return { saved: true, best: record };
}

const SCORE_STORAGE_KEY = "combrawl.bestScore.v1";

/**
 * HIGH SCORE（自分の中だけの累積SCORE自己ベスト）。到達ラウンドの自己ベスト（RunRecord）とは
 * 別軸の記録で、ラウンド進行度に関わらず「そのランで稼いだSCORE」が過去最高を更新した時だけ保存する。
 */
export function loadBestScore(storage?: StorageLike): number {
  const s = resolveStorage(storage);
  if (!s) return 0;
  try {
    const raw = s.getItem(SCORE_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBestScoreIfBetter(score: number, storage?: StorageLike): { saved: boolean; best: number } {
  const current = loadBestScore(storage);
  if (score <= current) {
    return { saved: false, best: current };
  }
  const s = resolveStorage(storage);
  if (s) {
    try {
      s.setItem(SCORE_STORAGE_KEY, String(score));
    } catch {
      // 保存に失敗しても、今回のセッション内の表示用にはこのスコアをそのまま返す
    }
  }
  return { saved: true, best: score };
}
