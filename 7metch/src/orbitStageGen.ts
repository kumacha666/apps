import type { CellPos, OrbitCell } from "./types";
import { DIRECTIONS8, hasEntrySource, orbitsHaveRequiredGap } from "./orbit";
import type { PatternShape } from "./patternClear";

// 第1章「軌道系」のステージ生成（Stage 501〜、7metch/CLAUDE.mdの「第1章『軌道系』」節・
// ai-workspace/projects/7metch/GIMMICK_REDESIGN.mdの「配置アルゴリズムの詳細」参照）
// このモジュールは盤面サイズ・オービット個数・シードだけを扱う純粋なジオメトリ/乱数ロジックで、
// 既存のゲームループ・実際のピース配置（createBoard()等）には一切依存・影響しない
// （Phase 3: レイアウト生成ロジックとステージパラメータ導出のみ。実際のcreateBoard()への統合・
// オービット制約適用後の合法手数チェックの実配線はPhase 4で行う）

// ---------------------------------------------------------------------------
// シード付き擬似乱数（mulberry32）。同じseedなら常に同じ数列を返す
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// オービット配置の一括生成（一括生成→一括検証、NGなら全体を破棄して再抽選）
// ---------------------------------------------------------------------------
const MAX_LAYOUT_ATTEMPTS = 100;

export interface OrbitLayoutResult {
  orbits: OrbitCell[];
  usedFallback: boolean;
}

function tryGenerateLayout(
  count: number, rows: number, cols: number, rng: () => number,
): OrbitCell[] | null {
  const positions: CellPos[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({ r: Math.floor(rng() * rows), c: Math.floor(rng() * cols) });
  }
  // 一括検証: 重複・隣接禁止（最低1マスの間隔、チェビシェフ距離）
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (!orbitsHaveRequiredGap(positions[i], positions[j])) return null;
    }
  }
  // 各オービットについて、進入元セルが盤内に実在する方向の中から重力方向を抽選
  const orbits: OrbitCell[] = [];
  for (const pos of positions) {
    const validDirs = DIRECTIONS8.filter((dir) => hasEntrySource(pos.r, pos.c, dir, rows, cols));
    if (validDirs.length === 0) return null;
    const dir = validDirs[Math.floor(rng() * validDirs.length)];
    orbits.push({ r: pos.r, c: pos.c, dir });
  }
  return orbits;
}

// 事前に人力で検証済みの固定レイアウト（盤面サイズ×オービット個数ごと）。
// 各エントリはorbitsHaveRequiredGap・hasEntrySourceの両方を満たすことを確認済み
// （src/orbitStageGen.test.tsで自動検証）
const FALLBACK_LAYOUTS: Record<string, readonly OrbitCell[]> = {
  "1:8x7": [
    { r: 3, c: 3, dir: [1, 0] },
  ],
  "2:8x7": [
    { r: 1, c: 3, dir: [-1, 0] },
    { r: 6, c: 3, dir: [1, 0] },
  ],
  "3:8x7": [
    { r: 1, c: 1, dir: [-1, -1] },
    { r: 1, c: 5, dir: [-1, 1] },
    { r: 6, c: 3, dir: [1, 0] },
  ],
};

function fallbackKey(count: number, rows: number, cols: number): string {
  return `${count}:${rows}x${cols}`;
}

// 事前検証済みの固定レイアウトを返す。用意が無い組み合わせはコンテンツ不足として明示的に例外を投げる
// （個数を勝手に減らすフォールバックは行わない。減らす判断は人間が明示的に行う場合のみ）
export function getFallbackOrbitLayout(count: number, rows: number, cols: number): OrbitCell[] {
  const layout = FALLBACK_LAYOUTS[fallbackKey(count, rows, cols)];
  if (!layout) {
    throw new Error(
      `オービット配置のフォールバックが未整備です(count=${count}, ${rows}x${cols})。` +
      `事前に検証済みの固定レイアウトをFALLBACK_LAYOUTSに追加するか、個数を人間が明示的に判断してください。`,
    );
  }
  return layout.map((o) => ({ r: o.r, c: o.c, dir: o.dir }));
}

export function generateOrbitLayout(
  count: number, rows: number, cols: number, seed: number,
): OrbitLayoutResult {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt++) {
    const candidate = tryGenerateLayout(count, rows, cols, rng);
    if (candidate) return { orbits: candidate, usedFallback: false };
  }
  return { orbits: getFallbackOrbitLayout(count, rows, cols), usedFallback: true };
}

// ---------------------------------------------------------------------------
// パイロット（Stage 501〜524、章内相対インデックス0〜23）のステージパラメータ導出
// ---------------------------------------------------------------------------

// 相対インデックス0始まり（相対Stage1 = 実Stage501 = chapterStageIndex 0）
export function orbitCountForStage(chapterStageIndex: number): number {
  if (chapterStageIndex < 8) return 1;
  if (chapterStageIndex < 16) return 2;
  return 3;
}

const PATTERN_SHAPE_ROTATION: readonly PatternShape[] = ["perimeter", "cross", "diagonal", "corners"];

export function patternShapeForStage(chapterStageIndex: number): PatternShape {
  return PATTERN_SHAPE_ROTATION[chapterStageIndex % PATTERN_SHAPE_ROTATION.length];
}
