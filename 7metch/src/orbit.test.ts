import { describe, it, expect } from "vitest";
import { inInfluenceArea, isSwapLegal, hasEntrySource, orbitsHaveRequiredGap, orbitDoorCells, DIRECTIONS8 } from "./orbit";
import type { OrbitCell } from "./types";

// ---------------------------------------------------------------------------
// inInfluenceArea
// ---------------------------------------------------------------------------
describe("inInfluenceArea", () => {
  const orbit = { r: 5, c: 5 };

  it("中心セル自身は影響範囲内", () => {
    expect(inInfluenceArea(orbit, 5, 5)).toBe(true);
  });

  it("直交隣接セルは影響範囲内", () => {
    expect(inInfluenceArea(orbit, 4, 5)).toBe(true);
    expect(inInfluenceArea(orbit, 6, 5)).toBe(true);
    expect(inInfluenceArea(orbit, 5, 4)).toBe(true);
    expect(inInfluenceArea(orbit, 5, 6)).toBe(true);
  });

  it("斜め隣接セルも影響範囲内", () => {
    expect(inInfluenceArea(orbit, 4, 4)).toBe(true);
    expect(inInfluenceArea(orbit, 6, 6)).toBe(true);
    expect(inInfluenceArea(orbit, 4, 6)).toBe(true);
    expect(inInfluenceArea(orbit, 6, 4)).toBe(true);
  });

  it("距離2以上のセルは影響範囲外", () => {
    expect(inInfluenceArea(orbit, 3, 5)).toBe(false);
    expect(inInfluenceArea(orbit, 5, 7)).toBe(false);
    expect(inInfluenceArea(orbit, 3, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSwapLegal
// ---------------------------------------------------------------------------
describe("isSwapLegal", () => {
  it("オービットが無い場合は常に合法", () => {
    expect(isSwapLegal(0, 0, 0, 1, [])).toBe(true);
  });

  it("両方が影響範囲の内側にあるスワップは無制限", () => {
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    // (4,4)と(4,5)はどちらも影響範囲内(隣接セル)
    expect(isSwapLegal(4, 4, 4, 5, [orbit])).toBe(true);
    // 中心セル自身を含むスワップも内部扱い
    expect(isSwapLegal(5, 5, 5, 6, [orbit])).toBe(true);
  });

  it("両方が影響範囲の外側にあるスワップは無制限", () => {
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    expect(isSwapLegal(0, 0, 0, 1, [orbit])).toBe(true);
  });

  it("境界をまたぐスワップは進入方向が重力方向と一致すれば合法", () => {
    // 重力方向 = 南(dr=1,dc=0)。外側(3,5)→内側(4,5)への変位は(1,0)で一致
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    expect(isSwapLegal(3, 5, 4, 5, [orbit])).toBe(true);
  });

  it("境界をまたぐスワップは進入方向が重力方向と不一致なら不可", () => {
    // 外側(4,3)→内側(4,4)への変位は(0,1)。重力方向(1,0)とは不一致
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    expect(isSwapLegal(4, 3, 4, 4, [orbit])).toBe(false);
  });

  it("退出側の変位は判定に使われない(進入側の変位のみで判定)", () => {
    // 内側(4,5)→外側(3,5)の退出は、進入側から見れば(3,5)が外側・(4,5)が内側で
    // 外側→内側の変位(1,0)は重力方向(1,0)と一致するため合法
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    expect(isSwapLegal(4, 5, 3, 5, [orbit])).toBe(true);
  });

  it("引数の順序に依存しない(isSwapLegal(a,b) === isSwapLegal(b,a))", () => {
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    const cases: [number, number, number, number][] = [
      [3, 5, 4, 5], // 合法な境界越え
      [4, 3, 4, 4], // 不合法な境界越え
      [4, 4, 4, 5], // 内部
      [0, 0, 0, 1], // 外部
    ];
    for (const [r1, c1, r2, c2] of cases) {
      expect(isSwapLegal(r1, c1, r2, c2, [orbit])).toBe(isSwapLegal(r2, c2, r1, c1, [orbit]));
    }
  });

  it("複数オービットが存在する場合、無関係なスワップは各オービットの制約を受けない", () => {
    const orbitA: OrbitCell = { r: 1, c: 1, dir: [1, 0] };
    const orbitB: OrbitCell = { r: 8, c: 8, dir: [-1, 0] };
    expect(isSwapLegal(4, 4, 4, 5, [orbitA, orbitB])).toBe(true);
  });

  it("8方向すべてで、進入方向とオービットの重力方向が一致する場合のみ合法になる", () => {
    // swapDirで決まる境界越えスワップ(外側→内側)を、8通りのオービット重力方向それぞれに対して判定し、
    // 一致する場合のみ合法・それ以外は不可であることを確認する
    for (const swapDir of DIRECTIONS8) {
      const outsideR = 5 - swapDir[0] * 2;
      const outsideC = 5 - swapDir[1] * 2;
      const insideR = outsideR + swapDir[0];
      const insideC = outsideC + swapDir[1];
      for (const orbitDir of DIRECTIONS8) {
        const orbit: OrbitCell = { r: 5, c: 5, dir: orbitDir };
        const expectLegal = orbitDir[0] === swapDir[0] && orbitDir[1] === swapDir[1];
        expect(isSwapLegal(outsideR, outsideC, insideR, insideC, [orbit])).toBe(expectLegal);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// hasEntrySource
// ---------------------------------------------------------------------------
describe("hasEntrySource", () => {
  it("盤の中央なら全方向に進入元セルが存在する", () => {
    for (const dir of DIRECTIONS8) {
      expect(hasEntrySource(5, 5, dir, 10, 10)).toBe(true);
    }
  });

  it("盤の左上端(0,0)では、進入元セルが盤外を指す方向(南・東・南東)のみ不可", () => {
    // 進入方向dirへの移動は「dir逆向きにいる駒がdir方向に1マス進んで影響範囲に入る」ことなので、
    // 進入元セルはdirの「逆方向」寄りに位置する。南(1,0)・東(0,1)・南東(1,1)は、
    // 逆方向(北・西・北西)側の盤外を経由しないと影響範囲に入れないため進入元が存在しない
    expect(hasEntrySource(0, 0, [1, 0], 10, 10)).toBe(false); // 南
    expect(hasEntrySource(0, 0, [0, 1], 10, 10)).toBe(false); // 東
    expect(hasEntrySource(0, 0, [1, 1], 10, 10)).toBe(false); // 南東
    // 北・西・北西・北東・南西は、盤の内側(行1以上・列1以上の領域)に進入元セルが確保できる
    expect(hasEntrySource(0, 0, [-1, 0], 10, 10)).toBe(true); // 北
    expect(hasEntrySource(0, 0, [0, -1], 10, 10)).toBe(true); // 西
    expect(hasEntrySource(0, 0, [-1, -1], 10, 10)).toBe(true); // 北西
    expect(hasEntrySource(0, 0, [-1, 1], 10, 10)).toBe(true); // 北東
    expect(hasEntrySource(0, 0, [1, -1], 10, 10)).toBe(true); // 南西
  });

  it("盤の右下端(9,9、盤サイズ10x10)では、進入元セルが盤外を指す方向(北・西・北西)のみ不可", () => {
    // (0,0)の場合と点対称(方向を反転した関係)になる
    expect(hasEntrySource(9, 9, [-1, 0], 10, 10)).toBe(false); // 北
    expect(hasEntrySource(9, 9, [0, -1], 10, 10)).toBe(false); // 西
    expect(hasEntrySource(9, 9, [-1, -1], 10, 10)).toBe(false); // 北西
    expect(hasEntrySource(9, 9, [1, 0], 10, 10)).toBe(true); // 南
    expect(hasEntrySource(9, 9, [0, 1], 10, 10)).toBe(true); // 東
    expect(hasEntrySource(9, 9, [1, 1], 10, 10)).toBe(true); // 南東
    expect(hasEntrySource(9, 9, [1, -1], 10, 10)).toBe(true); // 南西
    expect(hasEntrySource(9, 9, [-1, 1], 10, 10)).toBe(true); // 北東
  });
});

// ---------------------------------------------------------------------------
// orbitsHaveRequiredGap
// ---------------------------------------------------------------------------
describe("orbitsHaveRequiredGap", () => {
  it("影響範囲が重複する場合は不可", () => {
    expect(orbitsHaveRequiredGap({ r: 5, c: 5 }, { r: 5, c: 6 })).toBe(false);
  });

  it("影響範囲が直交方向に隣接する場合は不可", () => {
    // 中心が3マス差(3x3が接する)は隣接扱い
    expect(orbitsHaveRequiredGap({ r: 1, c: 1 }, { r: 4, c: 1 })).toBe(false);
  });

  it("影響範囲が斜め方向にのみ接触する場合も不可(チェビシェフ距離での隣接判定)", () => {
    // 設計書の例: rows0-2/cols0-2 と rows3-5/cols3-5 (中心(1,1)と(4,4))は対角で接触
    expect(orbitsHaveRequiredGap({ r: 1, c: 1 }, { r: 4, c: 4 })).toBe(false);
  });

  it("行方向に最低1マスの間隔があれば可", () => {
    expect(orbitsHaveRequiredGap({ r: 1, c: 1 }, { r: 5, c: 1 })).toBe(true);
  });

  it("列方向に最低1マスの間隔があれば可", () => {
    expect(orbitsHaveRequiredGap({ r: 1, c: 1 }, { r: 1, c: 5 })).toBe(true);
  });

  it("斜め方向に十分離れていれば可", () => {
    expect(orbitsHaveRequiredGap({ r: 1, c: 1 }, { r: 5, c: 5 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// orbitDoorCells（描画用: 出入り可能な扉セルの列挙）
// ---------------------------------------------------------------------------
describe("orbitDoorCells", () => {
  it("直交方向(南)は、反対側の辺(北辺)3マスすべてが扉になる", () => {
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    const doors = orbitDoorCells(orbit, 10, 10);
    expect(doors).toEqual(
      expect.arrayContaining([{ r: 4, c: 4 }, { r: 4, c: 5 }, { r: 4, c: 6 }]),
    );
    expect(doors.length).toBe(3);
  });

  it("斜め方向(南東)は、隣接する2辺(北辺+西辺)計5マスが扉になる(角だけではない)", () => {
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 1] };
    const doors = orbitDoorCells(orbit, 10, 10);
    expect(doors).toEqual(
      expect.arrayContaining([
        { r: 4, c: 4 }, { r: 4, c: 5 }, { r: 4, c: 6 },
        { r: 5, c: 4 }, { r: 6, c: 4 },
      ]),
    );
    expect(doors.length).toBe(5); // 角(4,4)は北辺・西辺どちらからも1回しか列挙されない(重複なし)
  });

  it("8方向すべてで、扉として列挙された各セルはisSwapLegal()でも実際に合法と判定される(整合性)", () => {
    for (const dir of DIRECTIONS8) {
      const orbit: OrbitCell = { r: 5, c: 5, dir };
      const doors = orbitDoorCells(orbit, 10, 10);
      expect(doors.length).toBeGreaterThan(0);
      for (const door of doors) {
        const outsideR = door.r - dir[0], outsideC = door.c - dir[1];
        expect(isSwapLegal(outsideR, outsideC, door.r, door.c, [orbit])).toBe(true);
      }
    }
  });

  it("影響範囲境界のセルのうち、扉として列挙されなかったものはisSwapLegal()で不合法と判定される", () => {
    // 南向き(dir=[1,0])では北辺3マスのみが扉。東西南の各辺境界セルは扉ではないはず
    const orbit: OrbitCell = { r: 5, c: 5, dir: [1, 0] };
    const doors = orbitDoorCells(orbit, 10, 10);
    const doorKeys = new Set(doors.map((d) => `${d.r},${d.c}`));
    // 南辺(insideR=6)の外側(outsideR=7)への退出/侵入は不合法のはず
    expect(doorKeys.has("6,5")).toBe(false);
    expect(isSwapLegal(7, 5, 6, 5, [orbit])).toBe(false);
    // 東辺(insideC=6)も不合法のはず
    expect(doorKeys.has("5,6")).toBe(false);
    expect(isSwapLegal(5, 7, 5, 6, [orbit])).toBe(false);
  });

  it("盤端で進入元セルが盤外にはみ出す場合は扉として数えない(盤外アクセスもしない)", () => {
    // rows=3の盤で北向き(dir=[-1,0])のオービットを中心r=1に置くと、
    // 扉候補(南辺、insideR=2)の進入元はoutsideR=2-(-1)=3で盤外(rows=3は0-2)
    const orbit: OrbitCell = { r: 1, c: 2, dir: [-1, 0] };
    const doors = orbitDoorCells(orbit, 3, 5);
    expect(doors).toEqual([]);
  });

  it("盤端でオービット自身の影響範囲が欠ける場合も、範囲内に収まる候補だけを扉として数える", () => {
    // rows=5,cols=5の盤でr=0(盤端)に置いたオービット。影響範囲は2x3に欠けるが、
    // クラッシュせず盤内に収まる候補だけを正しく扉判定する
    const orbit: OrbitCell = { r: 0, c: 2, dir: [1, 0] };
    const doors = orbitDoorCells(orbit, 5, 5);
    // 南向きの扉は本来「北辺」だが、r=0では北辺自体が盤外(r=-1)のため扉は存在しない
    expect(doors).toEqual([]);
  });
});
