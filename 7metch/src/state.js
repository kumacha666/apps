export const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffd700", "#c0c8d8", "#ff8a5c", "#1e4fff", "#ff6bb3", "#88cc44"];
export const PIECE_SHAPES = ["circle", "diamond", "square", "triangle", "star", "hex", "cross", "octagon"];
export const PIECE_NAMES_JA = ["太陽", "月", "火星", "水星", "木星", "金星", "土星", "地球"];
export const PIECE_SYMBOLS = ["☀️", "🌙", "🔴", "💎", "🟠", "💙", "🪐", "🌍"];
export const MATCH_MIN = 3;

export const DEFAULT_OPTIONS = {
  bgmVol: 70, sfxVol: 100,
  saturation: 100, brightness: 100,
  bgAnim: true, screenShake: true,
};

export const ANIM = {
  CLEAR_FRAMES: 14,
  CLEAR_FRAME_MS: 35,
  DROP_SPEED: 0.22,
  DROP_FRAME_MS: 16,
  CHAIN_PAUSE_MS: 180,
  SWAP_FRAMES: 8,
  SWAP_FRAME_MS: 20,
};

export const STAR_GATES = [
  { stage: 25, stars: 30 },
  { stage: 50, stars: 80 },
  { stage: 75, stars: 140 },
  { stage: 100, stars: 190 },
  { stage: 150, stars: 290 },
  { stage: 200, stars: 390 },
  { stage: 250, stars: 490 },
  { stage: 300, stars: 590 },
  { stage: 350, stars: 690 },
  { stage: 400, stars: 790 },
  { stage: 450, stars: 890 },
];

export const SCORE_PER_PIECE = 10;

export const DRAG_THRESHOLD_RATIO = 0.15;

export const ITEM_COSTS = { pinpoint: 3, shuffle: 5, addmoves: 8, colorbomb: 12 };

export function loadOptions() {
  try {
    const d = JSON.parse(localStorage.getItem("7metch_options"));
    return d ? { ...DEFAULT_OPTIONS, ...d } : { ...DEFAULT_OPTIONS };
  } catch { return { ...DEFAULT_OPTIONS }; }
}

export function saveOptions() {
  localStorage.setItem("7metch_options", JSON.stringify(G.options));
}

export function applyVisualOptions() {
  const canvas = document.getElementById("game-canvas");
  if (canvas) {
    canvas.style.filter = `saturate(${G.options.saturation}%) brightness(${G.options.brightness}%)`;
  }
}

export function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem("7metch_save"));
    if (!d) return { cleared: {}, bestStars: {}, coins: 0 };
    if (d.coins === undefined) {
      d.coins = 0;
      for (const stars of Object.values(d.bestStars || {})) {
        d.coins += stars * 3;
      }
      for (const gate of STAR_GATES) {
        if (d.cleared && d.cleared[gate.stage]) {
          d.coins += 5;
        }
      }
    }
    return d;
  } catch { return { cleared: {}, bestStars: {}, coins: 0 }; }
}

export function writeSave() {
  localStorage.setItem("7metch_save", JSON.stringify(G.saveData));
}

export const G = {
  cols: 7,
  rows: 8,
  options: loadOptions(),
  board: [],
  cellState: [],
  selected: null,
  animating: false,
  currentStage: 0,
  movesLeft: 0,
  mission: {},
  missionProgress: {},
  saveData: loadSave(),
  itemMode: null,
  coinsEarned: 0,
  score: 0,
  totalCleared: 0,
  colorCleared: [],
  chainCount: 0,
  specialsCreated: 0,
  maxChain: 0,
  lastSwapTarget: null,
  debugSpawnType: null,
  hintTimer: null,
  hintData: null,
  hintAnimId: null,
  activeChainLabel: null,
  canvas: null,
  ctx: null,
  cellSize: 48,
  boardPixelW: 0,
  boardPixelH: 0,
  pieceCache: {},
  pieceCacheSize: 0,
  bgStars: [],
  bgShootingStar: null,
  bgAnimId: null,
  bgGradCache: null,
  bgGradSize: null,
  titleBgStars: [],
  titleBgAnimId: null,
  titleShootingStar: null,
  resultBgStars: [],
  resultBgAnimId: null,
  resultShootingStar: null,
  splashBgStars: [],
  splashBgAnimId: null,
  missionIconCache: {},
  dragStart: null,
  dragStartPx: null,
  restoreData: null,
  optionsReturnScreen: "title",
  debugTapCount: 0,
  debugTapTimer: null,
  debugMode: false,
  audioCtx: null,
  soundEnabled: true,
  masterGain: null,
  bgmGain: null,
  currentBgm: null,
  bgmInitialized: false,
  vfxParticles: [],
  vfxShockwaves: [],
  vfxFlashes: [],
  vfxComets: [],
  vfxTexts: [],
  shakeX: 0,
  shakeY: 0,
  shakeIntensity: 0,
  STAGES: null,
  screens: null,
  dom: null,
};
