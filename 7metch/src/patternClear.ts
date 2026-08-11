import type { CellPos } from "./types";

// 第1章「軌道系」の新クリア条件「パターン消し」（Stage 501〜、7metch/CLAUDE.mdの
// 「第1章『軌道系』」節・ai-workspace/projects/7metch/GIMMICK_REDESIGN.md参照）
// このモジュールはStage 1〜500の既存ロジックには一切依存・影響しない（Phase 2: 判定ロジックとテストのみ）

export type PatternShape = "perimeter" | "cross" | "diagonal" | "corners";

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

// 外周（盤面の縁1周）
function perimeterCells(rows: number, cols: number): CellPos[] {
  const cells: CellPos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) cells.push({ r, c });
    }
  }
  return cells;
}

// 中央十字。中央列/中央行は、奇数なら1本・偶数なら2本になる
function crossCells(rows: number, cols: number): CellPos[] {
  const centerCols = cols % 2 === 0 ? [cols / 2 - 1, cols / 2] : [Math.floor(cols / 2)];
  const centerRows = rows % 2 === 0 ? [rows / 2 - 1, rows / 2] : [Math.floor(rows / 2)];
  const colSet = new Set(centerCols);
  const rowSet = new Set(centerRows);
  const cells: CellPos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (colSet.has(c) || rowSet.has(r)) cells.push({ r, c });
    }
  }
  return cells;
}

// 対角線。正方形でない盤面では行ごとに列をアスペクト比で按分する「階段状ライン」として定義する
function diagonalCells(rows: number, cols: number): CellPos[] {
  const cells: CellPos[] = [];
  for (let r = 0; r < rows; r++) {
    const c = Math.round((r * (cols - 1)) / (rows - 1));
    cells.push({ r, c });
  }
  return cells;
}

// 四隅3x3ブロック
function cornerBlockCells(rows: number, cols: number): CellPos[] {
  const blocks: [number, number, number, number][] = [
    [0, 2, 0, 2],
    [0, 2, cols - 3, cols - 1],
    [rows - 3, rows - 1, 0, 2],
    [rows - 3, rows - 1, cols - 3, cols - 1],
  ];
  const seen = new Set<string>();
  const cells: CellPos[] = [];
  for (const [r0, r1, c0, c1] of blocks) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = cellKey(r, c);
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ r, c });
      }
    }
  }
  return cells;
}

export function getPatternCells(shape: PatternShape, rows: number, cols: number): CellPos[] {
  switch (shape) {
    case "perimeter": return perimeterCells(rows, cols);
    case "cross": return crossCells(rows, cols);
    case "diagonal": return diagonalCells(rows, cols);
    case "corners": return cornerBlockCells(rows, cols);
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

export function targetCellSet(cells: readonly CellPos[]): Set<string> {
  return new Set(cells.map(({ r, c }) => cellKey(r, c)));
}

// 消去の発生原因。「プレイヤーの行動による消去」のみパターン進捗に計上する
export type ClearCause =
  | "match"             // 通常マッチ
  | "special_activate"  // 特殊ピース起動によるピース除去
  | "item";              // ピンポイント破壊・カラーボム等のアイテム使用

// パターン進捗に計上しない原因（プレイヤーの行動によるものではない）
export type ExcludedClearCause =
  | "recovery_shuffle"  // 詰み回復のための自動シャッフル
  | "recovery_regen"    // 詰み回復・配置生成の上限回数到達後の盤面作り直しフォールバック
  | "manual_shuffle";    // プレイヤーが使う既存のシャッフルアイテム（useShuffle）。
                          // プレイヤー操作ではあるが「盤面の並べ替え」でありマッチでも起動でもない

export function isCountedCause(cause: ClearCause | ExcludedClearCause): boolean {
  switch (cause) {
    case "match":
    case "special_activate":
    case "item":
      return true;
    case "recovery_shuffle":
    case "recovery_regen":
    case "manual_shuffle":
      return false;
    default: {
      const _exhaustive: never = cause;
      return _exhaustive;
    }
  }
}

// パターン進捗を記録する。累積判定（同一セルの複数回消去で二重カウントしない、Setで自然に防止）。
// 対象外の原因（recovery_shuffle/recovery_regen/manual_shuffle）は計上しない。
// clearedCellsには、実際に空になったセルだけでなく、マッチ解決時に4マッチ以上等で特殊ピースが
// 生成され「置き換わった」セル（見た目上は空にならない）も、呼び出し側が明示的に含めること
// （そのセルも「マッチに参加した」という事実自体は成立しているため）
export function recordClear(
  progress: Set<string>,
  clearedCells: readonly CellPos[],
  targetCells: ReadonlySet<string>,
  cause: ClearCause | ExcludedClearCause,
): void {
  if (!isCountedCause(cause)) return;
  for (const { r, c } of clearedCells) {
    const key = cellKey(r, c);
    if (targetCells.has(key)) progress.add(key);
  }
}

export function getProgressCount(progress: ReadonlySet<string>, targetCells: ReadonlySet<string>): number {
  let count = 0;
  for (const key of targetCells) {
    if (progress.has(key)) count++;
  }
  return count;
}

export function isPatternComplete(progress: ReadonlySet<string>, targetCells: ReadonlySet<string>): boolean {
  for (const key of targetCells) {
    if (!progress.has(key)) return false;
  }
  return true;
}
