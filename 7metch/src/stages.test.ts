import { describe, it, expect, beforeEach } from "vitest";
import { G, PIECE_COLORS, PIECE_NAMES_JA } from "./state";
import { getMissionText, buildStages, boardSizeForStage, isStageUnlocked, getTotalStars } from "./stages";
import type { Mission, StageConfig } from "./types";

// ---------------------------------------------------------------------------
// getMissionText — 全ミッション種
// ---------------------------------------------------------------------------
describe("getMissionText", () => {
  it("score ミッション", () => {
    const m: Mission = { type: "score", target: 500 };
    expect(getMissionText(m)).toBe("500点 とろう");
  });

  it("clear ミッション", () => {
    const m: Mission = { type: "clear", count: 30 };
    expect(getMissionText(m)).toBe("30個 けそう");
  });

  it("color ミッション (text)", () => {
    const m: Mission = { type: "color", colorIndex: 0, count: 10 };
    expect(getMissionText(m)).toBe(`${PIECE_NAMES_JA[0]}を10個けそう`);
  });

  it("color ミッション (html)", () => {
    const m: Mission = { type: "color", colorIndex: 0, count: 10 };
    const html = getMissionText(m, true);
    expect(html).toContain("span");
    expect(html).toContain(PIECE_COLORS[0]);
    expect(html).toContain("10個けそう");
  });

  it("special ミッション", () => {
    const m: Mission = { type: "special", count: 5 };
    expect(getMissionText(m)).toBe("特殊ピースを5個つくろう");
  });

  it("chain ミッション", () => {
    const m: Mission = { type: "chain", count: 3 };
    expect(getMissionText(m)).toBe("3チェインしよう");
  });

  it("全色インデックスのcolorミッションが正しい日本語名を返す", () => {
    for (let i = 0; i < PIECE_NAMES_JA.length; i++) {
      const m: Mission = { type: "color", colorIndex: i, count: 5 };
      expect(getMissionText(m)).toBe(`${PIECE_NAMES_JA[i]}を5個けそう`);
    }
  });
});

// ---------------------------------------------------------------------------
// buildStages — 全500ステージ検証
// ---------------------------------------------------------------------------
describe("buildStages", () => {
  let stages: StageConfig[];

  beforeEach(() => {
    stages = buildStages();
  });

  it("500ステージ生成される", () => {
    expect(stages.length).toBe(500);
  });

  it("全ステージにname, moves, colors, missionが存在する", () => {
    for (const stg of stages) {
      expect(stg.name).toBeTruthy();
      expect(stg.moves).toBeGreaterThan(0);
      expect(stg.colors).toBeGreaterThanOrEqual(5);
      expect(stg.colors).toBeLessThanOrEqual(8);
      expect(stg.mission).toBeDefined();
      expect(stg.mission.type).toBeTruthy();
    }
  });

  it("手数が14以上", () => {
    for (const stg of stages) {
      expect(stg.moves).toBeGreaterThanOrEqual(14);
    }
  });

  it("star2moves < moves かつ star3moves < star2moves", () => {
    for (const stg of stages) {
      expect(stg.star2moves).toBeLessThanOrEqual(stg.moves);
      expect(stg.star3moves).toBeLessThanOrEqual(stg.star2moves);
    }
  });

  it("ミッション種別が有効な値のみ", () => {
    const validTypes = new Set(["score", "clear", "color", "special", "chain"]);
    for (const stg of stages) {
      expect(validTypes.has(stg.mission.type)).toBe(true);
    }
  });

  it("scoreミッションにはtargetが存在する", () => {
    for (const stg of stages) {
      if (stg.mission.type === "score") {
        expect(stg.mission.target).toBeGreaterThan(0);
      }
    }
  });

  it("clearミッションにはcountが存在する", () => {
    for (const stg of stages) {
      if (stg.mission.type === "clear") {
        expect(stg.mission.count).toBeGreaterThan(0);
      }
    }
  });

  it("colorミッションにはcolorIndexとcountが存在する", () => {
    for (const stg of stages) {
      if (stg.mission.type === "color") {
        expect(stg.mission.colorIndex).toBeDefined();
        expect(stg.mission.colorIndex).toBeGreaterThanOrEqual(0);
        expect(stg.mission.colorIndex!).toBeLessThan(stg.colors);
        expect(stg.mission.count).toBeGreaterThan(0);
      }
    }
  });

  it("specialミッションにはcountが存在する", () => {
    for (const stg of stages) {
      if (stg.mission.type === "special") {
        expect(stg.mission.count).toBeGreaterThan(0);
      }
    }
  });

  it("chainミッションにはcountが存在する", () => {
    for (const stg of stages) {
      if (stg.mission.type === "chain") {
        expect(stg.mission.count).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("氷はステージ100以降でのみ出現", () => {
    for (let i = 0; i < stages.length; i++) {
      if (i < 100) {
        expect(stages[i].iceCells).toBe(0);
      }
    }
    expect(stages[100].iceCells).toBeGreaterThan(0);
  });

  it("岩はステージ150以降でのみ出現", () => {
    for (let i = 0; i < stages.length; i++) {
      if (i < 150) {
        expect(stages[i].rockCells).toBe(0);
      }
    }
    expect(stages[150].rockCells).toBeGreaterThan(0);
  });

  it("穴はステージ250以降でのみ出現", () => {
    for (let i = 0; i < 250; i++) {
      expect(stages[i].holePattern).toBeNull();
    }
    expect(stages[250].holePattern).not.toBeNull();
  });

  it("カウントダウンはステージ300以降でのみ出現", () => {
    for (let i = 0; i < 300; i++) {
      expect(stages[i].countdownBombs).toBe(0);
    }
    expect(stages[300].countdownBombs).toBeGreaterThan(0);
  });

  it("全5ミッション種が使われている", () => {
    const types = new Set(stages.map((s) => s.mission.type));
    expect(types.has("score")).toBe(true);
    expect(types.has("clear")).toBe(true);
    expect(types.has("color")).toBe(true);
    expect(types.has("special")).toBe(true);
    expect(types.has("chain")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// boardSizeForStage
// ---------------------------------------------------------------------------
describe("boardSizeForStage", () => {
  it("ステージ0-9: 6x7", () => {
    for (let i = 0; i < 10; i++) {
      const size = boardSizeForStage(i);
      expect(size.cols).toBe(6);
      expect(size.rows).toBe(7);
    }
  });

  it("ステージ10-99: 7x8", () => {
    expect(boardSizeForStage(10)).toEqual({ cols: 7, rows: 8 });
    expect(boardSizeForStage(99)).toEqual({ cols: 7, rows: 8 });
  });

  it("ステージ100-249: 8x9", () => {
    expect(boardSizeForStage(100)).toEqual({ cols: 8, rows: 9 });
    expect(boardSizeForStage(249)).toEqual({ cols: 8, rows: 9 });
  });

  it("ステージ250+: 9x10", () => {
    expect(boardSizeForStage(250)).toEqual({ cols: 9, rows: 10 });
    expect(boardSizeForStage(499)).toEqual({ cols: 9, rows: 10 });
  });
});

// ---------------------------------------------------------------------------
// isStageUnlocked / getTotalStars
// ---------------------------------------------------------------------------
describe("isStageUnlocked", () => {
  beforeEach(() => {
    G.saveData = { cleared: {}, bestStars: {}, coins: 0 };
    G.STAGES = buildStages();
  });

  it("ステージ0は常にアンロック", () => {
    expect(isStageUnlocked(0)).toBe(true);
  });

  it("前ステージ未クリアだとアンロックされない", () => {
    expect(isStageUnlocked(1)).toBe(false);
  });

  it("前ステージクリア済みならアンロック", () => {
    G.saveData.cleared[0] = true;
    expect(isStageUnlocked(1)).toBe(true);
  });

  it("スターゲート: 星が足りないとアンロックされない", () => {
    for (let i = 0; i < 25; i++) G.saveData.cleared[i] = true;
    G.saveData.bestStars = {};
    expect(isStageUnlocked(25)).toBe(false);
  });

  it("スターゲート: 星が足りればアンロック", () => {
    for (let i = 0; i < 25; i++) {
      G.saveData.cleared[i] = true;
      G.saveData.bestStars[i] = 3;
    }
    expect(getTotalStars()).toBeGreaterThanOrEqual(30);
    expect(isStageUnlocked(25)).toBe(true);
  });
});
