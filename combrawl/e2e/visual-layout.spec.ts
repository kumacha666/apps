import { test, expect } from "@playwright/test";

// 過去に発生した「特性バッジがユニット本体や隣接ユニットに重なって表示が読めなくなる」
// 不具合の回帰テスト。通常プレイのランダムなカード進行だけでは体数・特性の組み合わせを
// 毎回同じ形で再現しづらいため、src/main.tsのE2E専用フック（__e2e）で境界ケース
// （体数が多く行が折り返す、全ユニットが4種の特性を同時に持つ）を直接構成し、
// 実際のDOM座標を実測して重なりが無いことを確認する。

declare global {
  interface Window {
    __e2e: {
      makeUnit: (side: "player" | "enemy", hp: number, atk: number, def?: number) => Record<string, unknown>;
      setPlayerUnits: (units: Record<string, unknown>[]) => void;
    };
  }
}

test("badged units in a wrapped multi-row layout do not overlap each other", async ({ page }) => {
  await page.goto("/");
  await page.click("#titleModeRow button >> nth=0");
  await expect(page.locator("#gameScreen")).toBeVisible();

  await page.evaluate(() => {
    const { makeUnit, setPlayerUnits } = window.__e2e;
    const units = [];
    for (let i = 0; i < 8; i++) {
      const u = makeUnit("player", 24 + i * 30, 4 + i, 5 + i) as Record<string, unknown>;
      u.attackCount = 2 + (i % 4);
      u.aoeLevel = 1 + (i % 3);
      u.retaliateLevel = 1 + (i % 2);
      u.tauntLevel = 1 + (i % 3);
      units.push(u);
    }
    setPlayerUnits(units);
  });

  const overlaps = await page.evaluate(() => {
    const slots = [...document.querySelectorAll("#playerSide .unit-slot")];
    const results: Array<{ badgeOwner: string; overlapsWith: string; area: number }> = [];

    function rectArea(a: DOMRect, b: DOMRect): number {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w > 0 && h > 0 ? w * h : 0;
    }

    slots.forEach((slot, i) => {
      const badge = slot.querySelector(".unit-badges");
      if (!badge) return;
      const badgeRect = badge.getBoundingClientRect();
      slots.forEach((otherSlot, j) => {
        if (i === j) return;
        const unitEl = otherSlot.querySelector(".unit");
        if (!unitEl) return;
        const area = rectArea(badgeRect, unitEl.getBoundingClientRect());
        if (area > 0) {
          results.push({
            badgeOwner: slot.getAttribute("data-testid") || `slot-${i}`,
            overlapsWith: `slot-${j}`,
            area: Math.round(area),
          });
        }
      });
    });
    return results;
  });

  expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
});
