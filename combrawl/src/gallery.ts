import type { StorageLike } from "./highscore";

/** HP/ATK/DEFそれぞれ独立に「これまでに到達したことのある最高tier」を記録する（1〜12、未到達は0） */
export interface GalleryProgress {
  hp: number;
  atk: number;
  def: number;
}

// v1→v2（2026-07-18）：見た目の段階解放しきい値をレア化(STEP_LOG2 1→3)したことで、
// v1時代に保存された記録は「古い簡単な基準で到達したtier」をそのまま格納している。
// mergeGalleryProgressは記録が下がることはない仕様のため、キーをそのままにすると
// 既存プレイヤーは新しい基準でも「もう全解放済み」に見えてしまう（Codexレビュー指摘）。
// キーのバージョンを上げて明示的に無効化する
const STORAGE_KEY = "combrawl.gallery.v2";
const EMPTY: GalleryProgress = { hp: 0, atk: 0, def: 0 };

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    // highscore.tsと同じ理由（プライベートブラウジング等でlocalStorage参照自体が例外を投げうる）で丸ごとtry/catchする
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // ギャラリーはオプショナル機能なので、握りつぶして「記録なし」として扱う
  }
  return null;
}

function clampTier(n: number): number {
  return Math.max(0, Math.min(12, Math.round(n)));
}

export function loadGalleryProgress(storage?: StorageLike): GalleryProgress {
  const s = resolveStorage(storage);
  if (!s) return { ...EMPTY };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<GalleryProgress>;
    return {
      hp: clampTier(parsed.hp ?? 0),
      atk: clampTier(parsed.atk ?? 0),
      def: clampTier(parsed.def ?? 0),
    };
  } catch {
    return { ...EMPTY };
  }
}

/** 現在の記録と、新たに観測したtier群を突き合わせ、各軸ごとの最高値を返す（各軸は独立、下がることはない） */
export function mergeGalleryProgress(
  current: GalleryProgress,
  observed: { hp: number; atk: number; def: number }[]
): GalleryProgress {
  let hp = current.hp;
  let atk = current.atk;
  let def = current.def;
  for (const o of observed) {
    hp = Math.max(hp, clampTier(o.hp));
    atk = Math.max(atk, clampTier(o.atk));
    def = Math.max(def, clampTier(o.def));
  }
  return { hp, atk, def };
}

/** 記録を更新する必要があるか（いずれかの軸が伸びたか）を返す */
export function isGalleryProgressAdvanced(before: GalleryProgress, after: GalleryProgress): boolean {
  return after.hp > before.hp || after.atk > before.atk || after.def > before.def;
}

export function saveGalleryProgress(progress: GalleryProgress, storage?: StorageLike): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // 保存に失敗しても致命的ではない（次回到達時に再度保存を試みるだけ）
  }
}

/** ギャラリーの記録を全軸0に戻し、その空の記録を返す（呼び出し側は戻り値をそのままgalleryProgressに反映する） */
export function resetGalleryProgress(storage?: StorageLike): GalleryProgress {
  saveGalleryProgress({ ...EMPTY }, storage);
  return { ...EMPTY };
}
