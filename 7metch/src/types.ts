export type SpecialType = "line_h" | "line_v" | "line_d" | "bomb" | "rainbow" | "countdown";

import type { PatternShape } from "./patternClear";

export type CellStateType = "hole" | "rock" | "ice1" | "ice2" | null;

// 第1章「軌道系」（Stage 501〜、7metch/CLAUDE.mdの「軌道系（オービット）」節・
// ai-workspace/projects/7metch/GIMMICK_REDESIGN.md参照）
// 重力方向: 8方向の単位ベクトル[dr,dc]のみを許可するunion(exhaustive)。
// [number,number]のような緩い型にすると[0,0]や[2,0]のような無効値も型チェックを通過し、
// isSwapLegalの進入判定が常に不一致になる(境界スワップが全滅する)バグを型で防げなくなる
export type OrbitDirection =
  | [-1, 0] | [-1, 1] | [0, 1] | [1, 1]
  | [1, 0] | [1, -1] | [0, -1] | [-1, -1];

export interface OrbitCell {
  r: number;
  c: number;
  dir: OrbitDirection;
}

export type ComboType =
  | "cross"
  | "star_cross"
  | "triple_line"
  | "big_bomb"
  | "rainbow_line"
  | "rainbow_bomb"
  | "board_clear";

export interface Piece {
  color: number;
  special: SpecialType | null;
  countdown?: number;
}

// 判別可能なunion(discriminated union)。typeごとに必須フィールドが異なるため、
// 各バリアントの必須プロパティを型で強制する(例: "pattern"はpatternShapeが無いと
// コンパイルエラーになる。旧: 全フィールドが任意のフラットな1つのinterfaceだった
// ため、patternShapeを設定し忘れてもコンパイルが通ってしまっていた。/code-review指摘、
// PR #355)
export type Mission =
  | { type: "score"; target: number }
  | { type: "clear"; count: number }
  | { type: "color"; colorIndex: number; count: number }
  | { type: "special"; count: number }
  | { type: "chain"; count: number }
  | { type: "pattern"; patternShape: PatternShape };

export type MissionType = Mission["type"];

export interface StageFeatures {
  diagonalLine?: boolean;
  ice?: boolean;
  rock?: boolean;
  holes?: boolean;
  countdown?: boolean;
}

export interface StageConfig {
  name: string;
  moves: number;
  colors: number;
  boardCols: number;
  boardRows: number;
  mission: Mission;
  star2moves: number;
  star3moves: number;
  features: StageFeatures;
  iceCells: number;
  rockCells: number;
  holePattern: [number, number][] | null;
  countdownBombs: number;
  // 第1章「軌道系」（Stage 501〜、7metch/CLAUDE.mdの「第1章『軌道系』」節参照）。
  // Stage 1〜500は常に空配列（オービット無し、既存の挙動に一切影響しない）
  orbits: OrbitCell[];
}

export interface StarGate {
  stage: number;
  stars: number;
}

export interface SaveData {
  cleared: Record<number, boolean>;
  bestStars: Record<number, number>;
  coins: number;
  tutorialDone?: Record<number, boolean>;
}

export interface Options {
  bgmVol: number;
  sfxVol: number;
  saturation: number;
  brightness: number;
  bgAnim: boolean;
  screenShake: boolean;
}

export interface CellPos {
  r: number;
  c: number;
}

export interface SpecialCreation {
  r: number;
  c: number;
  type: SpecialType;
  color: number;
}

export interface SpecialInfo {
  r: number;
  c: number;
  type: string;
  color: number;
  primaryCells?: [number, number][];
}

export interface FallEntry {
  c: number;
  fromR: number;
  toR: number;
  piece: Piece;
  isNew?: boolean;
}

export interface HintData {
  mover: CellPos;
  pattern: CellPos[];
}

export interface BgStar {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinkle: number;
}

export interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface VfxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  decay: number;
  size: number;
  sizeDecay: number;
  alpha: number;
  rotation: number;
}

export interface VfxShockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  frame: number;
  duration: number;
  color: string;
}

export interface VfxFlash {
  x: number;
  y: number;
  r: number;
  maxR: number;
  frame: number;
  duration: number;
  color: string;
}

export interface VfxComet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  color: string;
  trail: { x: number; y: number }[];
  trailLength: number;
  life: number;
  active: boolean;
}

export interface VfxText {
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  life: number;
  decay: number;
  vy: number;
}

export interface ChainLabel {
  chain: number;
  label: string;
  startTime: number;
  duration: number;
}

export type ScreenName = "splash" | "title" | "stageSelect" | "help" | "game" | "result" | "options";

export interface GameScreens {
  splash: HTMLElement;
  title: HTMLElement;
  stageSelect: HTMLElement;
  help: HTMLElement;
  game: HTMLElement;
  result: HTMLElement;
  options: HTMLElement;
}

export interface GameDom {
  hudStage: HTMLElement;
  hudMoves: HTMLElement;
  hudMissionLabel: HTMLElement;
  hudMissionProgress: HTMLElement;
  hudStars: HTMLElement;
  resultTitle: HTMLElement;
  resultStars: HTMLElement;
  resultDetails: HTMLElement;
  btnNext: HTMLElement;
  btnRescue: HTMLElement;
  itemCoinCount: HTMLElement;
}

export type ItemType = "pinpoint" | "shuffle" | "addmoves" | "colorbomb";

export interface GameState {
  cols: number;
  rows: number;
  options: Options;
  board: (Piece | null)[][];
  cellState: CellStateType[][];
  selected: CellPos | null;
  animating: boolean;
  // startStage()専用の再入防止フラグ。animatingは通常のマッチ演出・アイテム処理の
  // 進行中を示す汎用フラグのため、これをstartStage()の再入ガードにも流用すると、
  // 直前の手のマッチ演出がまだ解決中の間にリトライ・やめる等を押した場合、演出とは
  // 無関係のstartStage()呼び出しまで黙って無視されてしまう回帰があった
  // (/code-review指摘)。startStage()専用の別フラグにすることで、両者の関心を分離する
  stageStarting: boolean;
  currentStage: number;
  movesLeft: number;
  mission: Mission;
  missionProgress: Record<string, number>;
  // "pattern"ミッションの累積進捗。セルキー("r,c"、patternClear.tsのcellKey()参照)の集合。
  // ステージ開始時にリセットする(ui.tsのstartStage()参照)
  patternProgress: Set<string>;
  saveData: SaveData;
  itemMode: ItemType | null;
  coinsEarned: number;
  score: number;
  totalCleared: number;
  colorCleared: number[];
  chainCount: number;
  specialsCreated: number;
  maxChain: number;
  lastSwapTarget: CellPos | null;
  debugSpawnType: string | null;
  hintTimer: ReturnType<typeof setTimeout> | null;
  hintData: HintData | null;
  hintAnimId: number | null;
  activeChainLabel: ChainLabel | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  cellSize: number;
  boardPixelW: number;
  boardPixelH: number;
  pieceCache: Record<number, HTMLCanvasElement>;
  pieceCacheSize: number;
  bgStars: BgStar[];
  bgShootingStar: ShootingStar | null;
  bgAnimId: number | null;
  bgGradCache: CanvasGradient | null;
  bgGradSize: string | null;
  titleBgStars: BgStar[];
  titleBgAnimId: number | null;
  titleShootingStar: ShootingStar | null;
  resultBgStars: BgStar[];
  resultBgAnimId: number | null;
  resultShootingStar: ShootingStar | null;
  splashBgStars: BgStar[];
  splashBgAnimId: number | null;
  dragStart: CellPos | null;
  dragStartPx: { x: number; y: number } | null;
  restoreData: SaveData | null;
  optionsReturnScreen: ScreenName;
  debugTapCount: number;
  debugTapTimer: ReturnType<typeof setTimeout> | null;
  debugMode: boolean;
  audioCtx: AudioContext | null;
  soundEnabled: boolean;
  masterGain: GainNode | null;
  bgmGain: GainNode | null;
  currentBgm: string | null;
  bgmInitialized: boolean;
  vfxParticles: VfxParticle[];
  vfxShockwaves: VfxShockwave[];
  vfxFlashes: VfxFlash[];
  vfxComets: VfxComet[];
  vfxTexts: VfxText[];
  shakeX: number;
  shakeY: number;
  shakeIntensity: number;
  STAGES: StageConfig[] | null;
  // 第1章「軌道系」パイロット(Stage 501〜524)のデバッグプレビュー用。デバッグジャンプ
  // (ui.tsのbtn-debug-jumpハンドラ)で要求された時に一度だけ遅延生成する。G.STAGES自体は
  // 起動後決して変更しない(常にbuildStages()の結果=本編の実ステージ数のまま)ことで、
  // G.STAGES.lengthが「本編の実ステージ数」であるという不変条件を維持し、プレビュー面を
  // 含めた見かけ上のステージ数管理を別の変数に閉じ込める設計(altitude角度の指摘を受けた
  // 設計変更、旧`G.baseStageCount`/`G.STAGES!.push()`方式は廃止。詳細は7metch/CLAUDE.md参照)
  debugPreviewStages: StageConfig[] | null;
  screens: GameScreens | null;
  dom: GameDom | null;
}
