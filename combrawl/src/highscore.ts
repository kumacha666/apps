export interface RunRecord {
  /** 到達ラウンド。10層未満で敗北した場合はその到達ラウンド、10層クリア後エンドレスに進めばそれ以上の値になる */
  endlessRound: number;
  maxCombo: number;
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
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function loadBestRecord(storage?: StorageLike): RunRecord | null {
  const s = resolveStorage(storage);
  if (!s) return null;
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
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
    s.setItem(STORAGE_KEY, JSON.stringify(record));
  }
  return { saved: true, best: record };
}
