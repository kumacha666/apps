import type { StageConfig, Mission, StageFeatures, StarGate, CellStateType } from "./types";
import type { PatternShape } from "./patternClear";
import { G, STAR_GATES, PIECE_COLORS, PIECE_NAMES_JA } from "./state";
import { generateOrbitLayout, orbitCountForStage, patternShapeForStage } from "./orbitStageGen";

// "pattern"ミッションの表示用ラベル。第1章「軌道系」Stage 501〜専用
// (buildStages()自体はStage 1〜500のみを生成するため、現時点ではまだ到達しない)
const PATTERN_SHAPE_JA: Record<PatternShape, string> = {
  perimeter: "外周",
  cross: "十字",
  diagonal: "対角線",
  corners: "四隅",
};

// デバッグジャンプ(本番ビルドでも7タップで開ける)でStage 501〜524(プレビュー)を
// クリアするとG.saveData.cleared/bestStarsにbaseStageCount以上のキーが永続保存
// されるため、本編の集計（スターゲート判定・ステージ選択・つづきから）はどれも
// これらのキーを除外する必要がある(Codexレビュー指摘)。getTotalStars()と
// lastClearedRealStageIdx()で同じ「baseStageCount未満に絞る」処理が重複していたため
// 共通ヘルパーに一本化した
function realStageEntries<T>(record: Record<number, T>): [number, T][] {
  return Object.entries(record)
    .map(([k, v]) => [Number(k), v] as [number, T])
    .filter(([i]) => i < G.baseStageCount);
}

export function getTotalStars(): number {
  return realStageEntries(G.saveData.bestStars).reduce((sum, [, s]) => sum + s, 0);
}

export function isStageUnlocked(i: number): boolean {
  if (i === 0) return true;
  if (!G.saveData.cleared[i - 1]) return false;
  const gate = STAR_GATES.find((g) => g.stage === i);
  if (gate && getTotalStars() < gate.stars) return false;
  return true;
}

export function getGateFor(i: number): StarGate | null {
  return STAR_GATES.find((g) => g.stage === i) || null;
}

// 本編（Stage 1〜baseStageCount）でクリア済みの最大インデックス(-1=未クリア)。
// ステージ選択の表示範囲・「つづきから」の遷移先計算はどちらもこれを経由する
export function lastClearedRealStageIdx(): number {
  return realStageEntries(G.saveData.cleared).reduce((max, [i]) => Math.max(max, i), -1);
}

// 「次のステージ」の境界値。本編プレイ中(currentStage < baseStageCount)は
// baseStageCountを使い、本編の最終ステージ判定を汚染しない。一方、デバッグジャンプ後の
// プレビュー範囲内(currentStage >= baseStageCount)ではG.STAGES!.lengthを使うことで、
// Stage 501〜524のデバッグプレビューをNextボタンで連続確認できるようにする
// (Codexレビュー指摘: G.baseStageCountへの一律置き換えで、パイロットステージ内の
// Next進行が意図せず死んでいた。本編プレイヤー向けの境界を守りつつ、デバッグ専用の
// 動作は元通りにする)
export function nextStageBoundary(): number {
  return G.currentStage >= G.baseStageCount ? (G.STAGES?.length ?? G.baseStageCount) : G.baseStageCount;
}

// ステージインデックスiが本編（Stage 1〜baseStageCount）の範囲内かどうか。
// プレビュー範囲（デバッグジャンプ経由でのみ到達、Stage 501〜524）のクリアは
// 永続保存しない設計にしたため、通常のスターゲート判定・isStageUnlocked()判定
// （どちらも`cleared`の永続データを前提とする）をプレビュー範囲にそのまま適用すると
// 常に「未クリア」扱いになり、Nextボタンでの連続進行が止まってしまう
// (Codexレビュー指摘)。ui.tsのbtn-nextハンドラは、この関数がfalseを返す間は
// ゲート/アンロック判定自体をスキップする
export function isRealCampaignStage(i: number): boolean {
  return i < G.baseStageCount;
}

// 350面以降、special/chainミッションのcount。4以上にするとhole配置
// (i%5のバリアント)次第でクリア率が5%を割るステージが一定確率で発生する
// ことをシミュレーションで確認済み(2026-07-24)。350面到達直後の最低値
// (旧: slot1/2は2、slot5/6は3からスタート)を全slotとも安全な3で統一し、
// 固定する(伸び続けない設計は意図的)
const POST_350_SPECIAL_CHAIN_COUNT = 3;

// --- Stages ---
export function boardSizeForStage(i: number): { cols: number; rows: number } {
  if (i < 10) return { cols: 6, rows: 7 };
  if (i < 100) return { cols: 7, rows: 8 };
  if (i < 250) return { cols: 8, rows: 9 };
  if (i < 500) return { cols: 9, rows: 10 };
  // 第1章「軌道系」パイロット(Stage 501〜524、内部インデックス500〜523)は
  // Stage 1〜500のサイズ拡大傾向を引き継がず、固定7x8で作り直す(2026-08-12、
  // 人間との相談により決定。オービットPhase 3のレイアウト生成・フォールバック
  // データもこの8x7=[rows,cols]専用に作り込まれている、orbitStageGen.test.ts参照)
  if (i < 524) return { cols: 7, rows: 8 };
  // Stage 525以降の盤面サイズは別途人間が判断（オービットPhase 4e時点では未定）
  return { cols: 9, rows: 10 };
}

export function generateHolePattern(c: number, r: number, variant: number): [number, number][] {
  const holes: [number, number][] = [];
  switch (variant) {
    case 0:
      holes.push([0,0],[0,1],[1,0]);
      holes.push([0,c-1],[0,c-2],[1,c-1]);
      holes.push([r-1,0],[r-1,1],[r-2,0]);
      holes.push([r-1,c-1],[r-1,c-2],[r-2,c-1]);
      break;
    case 1:
      for (let rr = 0; rr < r; rr++) {
        for (let cc = 0; cc < c; cc++) {
          const dr = Math.abs(rr - Math.floor(r/2));
          const dc = Math.abs(cc - Math.floor(c/2));
          if (dr + dc <= 1 && !(dr === 0 && dc === 0)) holes.push([rr, cc]);
        }
      }
      break;
    case 2:
      holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
      holes.push([0, Math.floor(c/2)]);
      holes.push([r-1, Math.floor(c/2)]);
      break;
    case 3:
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = c-3; cc < c; cc++) {
          if (rr === 0 || cc === c-1) continue;
          holes.push([rr, cc]);
        }
      }
      break;
    case 4:
      holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
      holes.push([0,Math.floor(c/2)],[r-1,Math.floor(c/2)]);
      holes.push([Math.floor(r/2),0],[Math.floor(r/2),c-1]);
      break;
  }
  return holes;
}

// moves/colors導出。buildStages()(Stage 1〜500)とbuildOrbitPilotStages()
// (Stage 501〜524)で共有する(重複実装による定義のズレを防ぐ)
function movesAndColorsForStage(i: number, cols: number): { moves: number; colors: number } {
  const tier = Math.floor(i / 10);
  const baseMoves = Math.max(14, 22 - tier);
  let moves: number;
  if (i < 10) moves = 20;
  else if (cols >= 9) moves = Math.max(16, baseMoves);
  else if (cols >= 8) moves = Math.max(14, baseMoves);
  else moves = baseMoves;
  if (i >= 100) moves += 2;
  if (i >= 295) moves += 1;
  const baseColors = Math.min(7, 5 + Math.floor(i / 10));
  const colors = (i >= 200) ? 8 : baseColors;
  return { moves, colors };
}

function starMovesForStage(i: number, moves: number): { star2moves: number; star3moves: number } {
  const star2rate = i < 10 ? 0.65 : 0.6;
  const star3rate = i < 10 ? 0.45 : 0.35;
  return { star2moves: Math.floor(moves * star2rate), star3moves: Math.floor(moves * star3rate) };
}

export function buildStages(): StageConfig[] {
  const stages: StageConfig[] = [];
  for (let i = 0; i < 500; i++) {
    const size = boardSizeForStage(i);
    const { moves, colors } = movesAndColorsForStage(i, size.cols);
    const { star2moves, star3moves } = starMovesForStage(i, moves);

    const features: StageFeatures = {};
    features.diagonalLine = true;
    if (i >= 100) features.ice = true;
    if (i >= 150) features.rock = true;
    if (i >= 250) features.holes = true;
    if (i >= 300) features.countdown = true;

    let iceCells = 0, rockCells = 0, holePattern: [number, number][] | null = null, countdownBombs = 0;
    if (features.ice) {
      const progress = Math.min(1, (i - 100) / 100);
      iceCells = 1 + Math.floor(progress * 3);
    }
    if (features.rock) {
      const progress = Math.min(1, (i - 150) / 100);
      rockCells = 1 + Math.floor(progress * 2);
    }
    if (features.holes) {
      holePattern = generateHolePattern(size.cols, size.rows, i % 5);
    }
    if (features.countdown) {
      const progress = Math.min(1, (i - 300) / 50);
      countdownBombs = 1 + Math.floor(progress * 1);
    }

    let mission: Mission;
    if (i >= 350) {
      const slot = i % 7;
      if (slot === 0) {
        const targetColor = i % colors;
        mission = { type: "color", colorIndex: targetColor, count: Math.floor(moves * 0.8) };
      } else if (slot === 1 || slot === 5) {
        mission = { type: "special", count: POST_350_SPECIAL_CHAIN_COUNT };
      } else if (slot === 3) {
        mission = { type: "score", target: Math.floor(moves * Math.min(55, 30 + i * 0.2)) };
      } else if (slot === 4) {
        mission = { type: "clear", count: Math.floor(moves * Math.min(4.5, 2.5 + i * 0.01)) };
      } else {
        // slot === 2 || slot === 6
        mission = { type: "chain", count: POST_350_SPECIAL_CHAIN_COUNT };
      }
    } else if (i % 5 === 0 && i > 0) {
      const targetColor = i % colors;
      mission = { type: "color", colorIndex: targetColor, count: Math.floor(moves * Math.min(0.8, 0.4 + i * 0.005)) };
    } else if (i % 3 === 0) {
      mission = { type: "score", target: Math.floor(moves * Math.min(55, 30 + i * 0.2)) };
    } else {
      mission = { type: "clear", count: Math.floor(moves * Math.min(4.5, 2.5 + i * 0.01)) };
    }

    stages.push({
      name: `${i + 1}`,
      moves,
      colors,
      boardCols: size.cols,
      boardRows: size.rows,
      mission,
      star2moves,
      star3moves,
      features,
      iceCells,
      rockCells,
      holePattern,
      countdownBombs,
      orbits: [], // Stage 1〜500はオービット無し(第1章「軌道系」はStage 501〜、未着手)
    });
  }
  return stages;
}

// 第1章「軌道系」パイロット(Stage 501〜524、章内相対インデックス0〜23)のステージ定義を
// 生成する(オービットPhase 4e)。moves/colorsはStage 1〜500と同じ計算式を継続するが、
// 盤面サイズは固定7x8で作り直し(boardSizeForStage()参照)、氷・岩・カウントダウンボムは
// 意図的に付けない(人間との相談により決定、2026-08-12。オービット×パターン消しという
// 新ギミック単体の完成度を先に固める狙いで、既存ギミックとの組み合わせ検証は別課題として
// 切り出した)。**この関数はまだbuildStages()から呼ばれていない**（Phase 5の描画・Phase 6の
// チュートリアルが揃うまでStage 501は未公開のまま。7metch/CLAUDE.mdの「第1章『軌道系』」
// 節、Stage 501〜524の実公開タイミングの決定事項を参照）
export function buildOrbitPilotStages(): StageConfig[] {
  const stages: StageConfig[] = [];
  for (let chapterIndex = 0; chapterIndex < 24; chapterIndex++) {
    const i = 500 + chapterIndex;
    const size = boardSizeForStage(i);
    const { moves, colors } = movesAndColorsForStage(i, size.cols);
    const { star2moves, star3moves } = starMovesForStage(i, moves);

    // オービットPhase 3のレイアウト生成テスト(orbitStageGen.test.ts)がseed 0〜299・
    // count1〜3の全組み合わせでフォールバックに陥らないことを検証済みのため、
    // 章内相対インデックス(0〜23)をそのままseedに使う(検証済みの範囲に収まる)
    const { orbits } = generateOrbitLayout(orbitCountForStage(chapterIndex), size.rows, size.cols, chapterIndex);
    const mission: Mission = { type: "pattern", patternShape: patternShapeForStage(chapterIndex) };

    stages.push({
      name: `${i + 1}`,
      moves,
      colors,
      boardCols: size.cols,
      boardRows: size.rows,
      mission,
      star2moves,
      star3moves,
      features: { diagonalLine: true },
      iceCells: 0,
      rockCells: 0,
      holePattern: null,
      countdownBombs: 0,
      orbits,
    });
  }
  return stages;
}

export function getMissionText(m: Mission, html?: boolean): string {
  switch (m.type) {
    case "score": return `${m.target}点 とろう`;
    case "clear": return `${m.count}個 けそう`;
    case "color":
      if (html) {
        const c = PIECE_COLORS[m.colorIndex!];
        return `<span style="display:inline-block;width:1.3em;height:1.3em;border-radius:50%;background:${c};vertical-align:middle;margin:-2px 2px 0 0;box-shadow:inset -2px -2px 4px rgba(0,0,0,.3)"></span>を${m.count}個けそう`;
      }
      return `${PIECE_NAMES_JA[m.colorIndex!]}を${m.count}個けそう`;
    case "special": return `特殊ピースを${m.count}個つくろう`;
    case "chain": return `${m.count}チェインしよう`;
    case "pattern": return `${PATTERN_SHAPE_JA[m.patternShape]}のマスを全部けそう`;
    default: {
      const _exhaustive: never = m;
      return _exhaustive;
    }
  }
}

export function hasSquare(): boolean {
  const isHole = (r: number, c: number): boolean => G.cellState[r] && G.cellState[r][c] === "hole";
  const isRock = (r: number, c: number): boolean => G.cellState[r] && G.cellState[r][c] === "rock";
  for (let r = 0; r < G.rows - 1; r++) {
    for (let c = 0; c < G.cols - 1; c++) {
      const cells: [number, number][] = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
      if (cells.some(([cr,cc]) => !G.board[cr][cc] || isHole(cr,cc) || isRock(cr,cc))) continue;
      const color = G.board[r][c]!.color;
      if (cells.every(([cr,cc]) => G.board[cr][cc]!.color === color)) return true;
    }
  }
  return false;
}
