import { describe, it, expect, beforeEach } from "vitest";
import { G, PIECE_COLORS, PIECE_NAMES_JA } from "./state";
import { getMissionText, buildStages, buildOrbitPilotStages, boardSizeForStage, isStageUnlocked, getTotalStars, lastClearedRealStageIdx, nextStageBoundary, isRealCampaignStage, stageConfigAt, totalReachableStageCount } from "./stages";
import { hasEntrySource, orbitsHaveRequiredGap } from "./orbit";
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

  // pattern ミッション（第1章「軌道系」Stage 501〜専用、Phase 4c: patternProgressの配線）
  it("pattern ミッション: 形状ごとに異なる表示文言を返す", () => {
    expect(getMissionText({ type: "pattern", patternShape: "perimeter" })).toBe("外周のマスを全部けそう");
    expect(getMissionText({ type: "pattern", patternShape: "cross" })).toBe("十字のマスを全部けそう");
    expect(getMissionText({ type: "pattern", patternShape: "diagonal" })).toBe("対角線のマスを全部けそう");
    expect(getMissionText({ type: "pattern", patternShape: "corners" })).toBe("四隅のマスを全部けそう");
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

  // 350面以降のspecial/chainミッションが最低値(旧: slot1/2は2、slot5/6は3)
  // に張り付いたまま152面分ほとんど伸びなかった問題の再発防止
  // （2026-07-24修正）。count=4まで上げるとhole配置次第でクリア率が
  // 5%を割るステージが一定確率で発生することをシミュレーションで
  // 確認したため、全slotとも安全な3で統一し、
  // 350〜499面を通して固定値3とする（伸び続けない設計は意図的）
  it("350面以降のspecial/chainミッションは全ステージでcount=3固定", () => {
    for (let i = 350; i < 500; i++) {
      const m = stages[i].mission;
      if (m.type === "special" || m.type === "chain") {
        expect(m.count).toBe(3);
      }
    }
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

  it("ステージ250-499: 9x10", () => {
    expect(boardSizeForStage(250)).toEqual({ cols: 9, rows: 10 });
    expect(boardSizeForStage(499)).toEqual({ cols: 9, rows: 10 });
  });

  // 第1章「軌道系」パイロット(Stage 501〜524、内部インデックス500〜523)は
  // Stage 1〜500のサイズ拡大傾向を引き継がず、固定7x8で作り直す
  it("ステージ500-523(第1章パイロット): 固定7x8", () => {
    for (let i = 500; i < 524; i++) {
      expect(boardSizeForStage(i)).toEqual({ cols: 7, rows: 8 });
    }
  });

  it("ステージ524+(Stage 525以降、未定): 暫定的に9x10を返す", () => {
    expect(boardSizeForStage(524)).toEqual({ cols: 9, rows: 10 });
  });
});

// ---------------------------------------------------------------------------
// buildOrbitPilotStages — 第1章「軌道系」パイロット(Stage 501〜524)、オービットPhase 4e
// この関数はまだbuildStages()から呼ばれていない(Phase 5・6完成後にまとめて有効化する
// 計画、7metch/CLAUDE.md参照)ため、buildStages()の500ステージには影響しない
// ---------------------------------------------------------------------------
describe("buildOrbitPilotStages", () => {
  let stages: StageConfig[];

  beforeEach(() => {
    stages = buildOrbitPilotStages();
  });

  it("24ステージ(Stage 501〜524)生成される", () => {
    expect(stages.length).toBe(24);
  });

  it("ステージ名がStage 501〜524と一致する", () => {
    stages.forEach((stg, idx) => {
      expect(stg.name).toBe(`${501 + idx}`);
    });
  });

  it("盤面サイズは全ステージ固定7x8", () => {
    for (const stg of stages) {
      expect(stg.boardCols).toBe(7);
      expect(stg.boardRows).toBe(8);
    }
  });

  it("氷・岩・カウントダウンボム・穴は一切出現しない(既存ギミックとの組み合わせ検証は別課題として意図的に除外)", () => {
    for (const stg of stages) {
      expect(stg.iceCells).toBe(0);
      expect(stg.rockCells).toBe(0);
      expect(stg.countdownBombs).toBe(0);
      expect(stg.holePattern).toBeNull();
      expect(stg.features.ice).toBeFalsy();
      expect(stg.features.rock).toBeFalsy();
      expect(stg.features.holes).toBeFalsy();
      expect(stg.features.countdown).toBeFalsy();
    }
  });

  it("全ステージがpatternミッションで、4形状を章内相対インデックス%4でローテーションする", () => {
    const expectedShapes = ["perimeter", "cross", "diagonal", "corners"];
    stages.forEach((stg, chapterIndex) => {
      expect(stg.mission.type).toBe("pattern");
      if (stg.mission.type === "pattern") {
        expect(stg.mission.patternShape).toBe(expectedShapes[chapterIndex % 4]);
      }
    });
  });

  it("オービット個数は相対Stage1-8=1個・9-16=2個・17-24=3個", () => {
    for (let i = 0; i < 8; i++) expect(stages[i].orbits.length).toBe(1);
    for (let i = 8; i < 16; i++) expect(stages[i].orbits.length).toBe(2);
    for (let i = 16; i < 24; i++) expect(stages[i].orbits.length).toBe(3);
  });

  it("全ステージのオービット配置が有効(進入元セルが実在し、互いに間隔条件を満たす)", () => {
    for (const stg of stages) {
      const orbits = stg.orbits;
      for (const o of orbits) {
        expect(o.r).toBeGreaterThanOrEqual(0);
        expect(o.r).toBeLessThan(stg.boardRows);
        expect(o.c).toBeGreaterThanOrEqual(0);
        expect(o.c).toBeLessThan(stg.boardCols);
        expect(hasEntrySource(o.r, o.c, o.dir, stg.boardRows, stg.boardCols)).toBe(true);
      }
      for (let i = 0; i < orbits.length; i++) {
        for (let j = i + 1; j < orbits.length; j++) {
          expect(orbitsHaveRequiredGap(orbits[i], orbits[j])).toBe(true);
        }
      }
    }
  });

  it("moves/colorsはStage 1〜500の計算式を継続する(500以降はtierが頭打ちのため全ステージ同一値)", () => {
    for (const stg of stages) {
      expect(stg.moves).toBe(17);
      expect(stg.colors).toBe(8);
    }
  });

  it("star2moves <= moves かつ star3moves <= star2moves", () => {
    for (const stg of stages) {
      expect(stg.star2moves).toBeLessThanOrEqual(stg.moves);
      expect(stg.star3moves).toBeLessThanOrEqual(stg.star2moves);
    }
  });

  it("章内相対インデックスをseedに使うため、呼び出すたびに同じレイアウトになる(決定的)", () => {
    const again = buildOrbitPilotStages();
    expect(again.map((s) => s.orbits)).toEqual(stages.map((s) => s.orbits));
  });

  it("buildStages()(Stage 1〜500)には影響しない", () => {
    const normalStages = buildStages();
    expect(normalStages.length).toBe(500);
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

  // デバッグジャンプでStage 501〜524(プレビュー)をクリアしても、本編のスターゲート判定・
  // 合計表示に混入しないことの回帰テスト(Codexレビュー指摘)
  it("プレビュー面(G.STAGES.length以上)のbestStarsは合計に含めない", () => {
    G.saveData.bestStars[10] = 3;
    G.saveData.bestStars[500] = 3; // Stage 501をデバッグジャンプでクリアした想定
    G.saveData.bestStars[523] = 3; // Stage 524も同様
    expect(getTotalStars()).toBe(3);
  });

  it("プレビュー面の星だけでは本編のスターゲートを解除できない", () => {
    G.saveData.cleared[24] = true;
    for (let i = 500; i < 524; i++) G.saveData.bestStars[i] = 3; // プレビュー24面満点
    expect(getTotalStars()).toBe(0);
    expect(isStageUnlocked(25)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lastClearedRealStageIdx — デバッグジャンプでStage 501〜524(プレビュー)を
// クリアしても、本編の進捗計算(ステージ選択・「つづきから」)を汚染しないことの検証
// (Codexレビュー指摘)
// ---------------------------------------------------------------------------
describe("lastClearedRealStageIdx", () => {
  beforeEach(() => {
    G.saveData = { cleared: {}, bestStars: {}, coins: 0 };
    G.STAGES = new Array(500).fill(null);
  });

  it("クリア済みステージが無ければ-1", () => {
    expect(lastClearedRealStageIdx()).toBe(-1);
  });

  it("本編クリア済みステージの最大インデックスを返す", () => {
    G.saveData.cleared[0] = true;
    G.saveData.cleared[49] = true;
    G.saveData.cleared[10] = true;
    expect(lastClearedRealStageIdx()).toBe(49);
  });

  it("G.STAGES.length以上(デバッグジャンプのプレビュー面)のクリア履歴は無視する", () => {
    G.saveData.cleared[49] = true;
    G.saveData.cleared[500] = true; // Stage 501をデバッグジャンプでクリアした想定
    G.saveData.cleared[523] = true; // Stage 524も同様
    expect(lastClearedRealStageIdx()).toBe(49);
  });

  it("プレビュー面しかクリアしていなければ-1(本編は未クリア扱い)", () => {
    G.saveData.cleared[500] = true;
    G.saveData.cleared[510] = true;
    expect(lastClearedRealStageIdx()).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// nextStageBoundary — 本編プレイ中はG.STAGES.lengthで最終ステージ判定を守りつつ、
// デバッグジャンプ後のプレビュー範囲内ではNextボタンでの連続確認を維持できることの検証
// ---------------------------------------------------------------------------
describe("nextStageBoundary", () => {
  beforeEach(() => {
    G.STAGES = new Array(500).fill(null); // 本編500ステージ相当
    G.debugPreviewStages = null;
  });

  it("本編プレイ中(currentStage < G.STAGES.length)はG.STAGES.lengthを返す", () => {
    G.debugPreviewStages = new Array(24).fill(null); // デバッグジャンプでプレビュー分が生成された想定
    G.currentStage = 10;
    expect(nextStageBoundary()).toBe(500);
  });

  it("本編最終ステージ(currentStage === G.STAGES.length-1)でもG.STAGES.lengthを返す(全ステージ制覇を汚染しない)", () => {
    G.debugPreviewStages = new Array(24).fill(null);
    G.currentStage = 499;
    expect(nextStageBoundary()).toBe(500);
  });

  it("プレビュー範囲内(currentStage >= G.STAGES.length)では本編+プレビューの合計を返す(Nextでの連続確認用)", () => {
    G.debugPreviewStages = new Array(24).fill(null);
    G.currentStage = 500; // Stage 501(デバッグジャンプ後)
    expect(nextStageBoundary()).toBe(524);
  });
});

// ---------------------------------------------------------------------------
// isRealCampaignStage — プレビュー範囲(Stage 501〜524)ではゲート/アンロック判定を
// スキップすべきかどうかの判定。プレビュー面のクリアはcleared/bestStarsへ永続保存
// しないため、通常のisStageUnlocked()判定をそのまま適用すると常にfalseになり、
// Nextでの連続進行が止まってしまう(Codexレビュー指摘)
// ---------------------------------------------------------------------------
describe("isRealCampaignStage", () => {
  beforeEach(() => {
    G.STAGES = new Array(500).fill(null);
  });

  it("本編範囲内(i < G.STAGES.length)はtrue", () => {
    expect(isRealCampaignStage(0)).toBe(true);
    expect(isRealCampaignStage(499)).toBe(true);
  });

  it("プレビュー範囲(i >= G.STAGES.length)はfalse", () => {
    expect(isRealCampaignStage(500)).toBe(false);
    expect(isRealCampaignStage(523)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stageConfigAt / totalReachableStageCount — G.STAGESを起動後決して変更しない設計
// (altitude角度の指摘を受けた設計変更)における、本編/プレビュー統合アクセサの検証
// ---------------------------------------------------------------------------
describe("stageConfigAt / totalReachableStageCount", () => {
  it("本編範囲(i < G.STAGES.length)ではG.STAGESから返す", () => {
    const real0 = { name: "1" } as StageConfig;
    const real1 = { name: "2" } as StageConfig;
    G.STAGES = [real0, real1];
    G.debugPreviewStages = null;
    expect(stageConfigAt(0)).toBe(real0);
    expect(stageConfigAt(1)).toBe(real1);
  });

  it("プレビュー範囲(i >= G.STAGES.length)ではG.debugPreviewStagesから返す", () => {
    const real0 = { name: "1" } as StageConfig;
    const preview0 = { name: "501" } as StageConfig;
    const preview1 = { name: "502" } as StageConfig;
    G.STAGES = [real0];
    G.debugPreviewStages = [preview0, preview1];
    expect(stageConfigAt(1)).toBe(preview0);
    expect(stageConfigAt(2)).toBe(preview1);
  });

  it("totalReachableStageCountは本編とプレビューの合計を返す", () => {
    G.STAGES = new Array(500).fill(null);
    G.debugPreviewStages = null;
    expect(totalReachableStageCount()).toBe(500);
    G.debugPreviewStages = new Array(24).fill(null);
    expect(totalReachableStageCount()).toBe(524);
  });
});
