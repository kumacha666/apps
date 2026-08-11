import type { OrbitCell, OrbitDirection } from "./types";

// 第1章「軌道系」（Stage 501〜想定、ai-workspace/projects/7metch/GIMMICK_REDESIGN.md参照）
// このモジュールはStage 1〜500の既存ロジックには一切依存・影響しない（Phase 1: 判定ロジックとテストのみ）

export const DIRECTIONS8: readonly OrbitDirection[] = [
  [-1, 0], [-1, 1], [0, 1], [1, 1],
  [1, 0], [1, -1], [0, -1], [-1, -1],
];

// 影響範囲: オービットセルを中心としたチェビシェフ距離1以内（3x3、盤端で欠ける）
export function inInfluenceArea(orbit: Pick<OrbitCell, "r" | "c">, r: number, c: number): boolean {
  return Math.max(Math.abs(r - orbit.r), Math.abs(c - orbit.c)) <= 1;
}

// 進入判定の共有関数。isSwapLegal(r1,c1,r2,c2,orbits) === isSwapLegal(r2,c2,r1,c1,orbits) が常に成立する
// （各セルが影響範囲の内か外かという実体で判定し、引数の順序には依存しない）
export function isSwapLegal(
  r1: number, c1: number, r2: number, c2: number,
  orbits: readonly OrbitCell[],
): boolean {
  for (const orbit of orbits) {
    const in1 = inInfluenceArea(orbit, r1, c1);
    const in2 = inInfluenceArea(orbit, r2, c2);
    if (in1 === in2) continue; // 両方内側 or 両方外側: このオービットからの制約は無し

    const [outsideR, outsideC, insideR, insideC] = in1 ? [r2, c2, r1, c1] : [r1, c1, r2, c2];
    const dr = insideR - outsideR;
    const dc = insideC - outsideC;
    if (dr !== orbit.dir[0] || dc !== orbit.dir[1]) return false;
  }
  return true;
}

// 生成時バリデーション: 影響範囲の外側にあり、その方向に1マス進むと影響範囲内に入る
// 「進入元セル」が盤内に実在するか。影響範囲(半径1)の外側1マスの環にのみ存在しうるため、
// 中心から半径2の範囲を総当たりすれば十分（式の導出ミスを避けるため走査で判定する）
export function hasEntrySource(
  r: number, c: number, dir: OrbitDirection, rows: number, cols: number,
): boolean {
  const [dr, dc] = dir;
  for (let r0 = r - 2; r0 <= r + 2; r0++) {
    for (let c0 = c - 2; c0 <= c + 2; c0++) {
      if (r0 < 0 || r0 >= rows || c0 < 0 || c0 >= cols) continue;
      if (inInfluenceArea({ r, c }, r0, c0)) continue; // 外側であること
      const r1 = r0 + dr, c1 = c0 + dc;
      if (inInfluenceArea({ r, c }, r1, c1)) return true; // 進入先が影響範囲内
    }
  }
  return false;
}

// 2つのオービットの影響範囲が、重複も隣接もせず最低1マスの間隔を空けているか
// （チェビシェフ距離。斜め接触も「隣接」とみなし不可とする。第13回レビュー対応）
export function orbitsHaveRequiredGap(
  o1: Pick<OrbitCell, "r" | "c">, o2: Pick<OrbitCell, "r" | "c">,
): boolean {
  return Math.abs(o1.r - o2.r) >= 4 || Math.abs(o1.c - o2.c) >= 4;
}
