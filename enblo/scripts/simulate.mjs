/**
 * Endless Bloodline シミュレーションテスト
 *
 * 自動戦闘ローグライクのバランスを、ヘッドレスで大量試行して検証する。
 * 使い方:
 *   npm run sim                     # warriorで baseline / フル永続強化 をそれぞれ300回
 *   npm run sim -- --class mage     # クラス指定
 *   npm run sim -- --runs 1000      # 試行回数指定
 */

import { playRun, randomPick } from "../src/run.ts";
import { PERMANENT_UPGRADE_POOL } from "../src/data/permanentUpgrades.ts";
import { CLASSES } from "../src/data/classes.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { class: "warrior", runs: 300 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--class") opts.class = args[++i];
    if (args[i] === "--runs") opts.runs = Number(args[++i]);
  }
  return opts;
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function runBatch(classId, permanentUpgradeIds, runs) {
  const stagesClearedList = [];
  const goldList = [];
  for (let i = 0; i < runs; i++) {
    const rng = seededRng(i * 7919 + 13);
    const summary = playRun({
      classId,
      permanentUpgradeIds,
      rng,
      pickUpgrade: (opts) => randomPick(opts, rng),
      pickRelic: (opts) => randomPick(opts, rng),
    });
    stagesClearedList.push(summary.stagesCleared);
    goldList.push(summary.goldEarned);
  }
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const survivalRate = (minStages) =>
    (stagesClearedList.filter((s) => s >= minStages).length / runs) * 100;
  return {
    avgStagesCleared: avg(stagesClearedList).toFixed(2),
    avgGold: avg(goldList).toFixed(1),
    survivalRate1: survivalRate(1).toFixed(1),
    survivalRate3: survivalRate(3).toFixed(1),
    survivalRate5: survivalRate(5).toFixed(1),
    maxStages: Math.max(...stagesClearedList),
  };
}

function main() {
  const opts = parseArgs();
  if (!CLASSES.some((c) => c.id === opts.class)) {
    console.error(`Unknown class: ${opts.class}`);
    process.exit(1);
  }

  console.log(`=== Endless Bloodline シミュレーション (class=${opts.class}, runs=${opts.runs}) ===\n`);

  const baseline = runBatch(opts.class, [], opts.runs);
  console.log("[永続強化なし]");
  console.log(`  平均クリア面数: ${baseline.avgStagesCleared}`);
  console.log(`  平均獲得ゴールド: ${baseline.avgGold}`);
  console.log(`  1面以上突破率: ${baseline.survivalRate1}%`);
  console.log(`  3面以上突破率: ${baseline.survivalRate3}%`);
  console.log(`  5面以上突破率: ${baseline.survivalRate5}%`);
  console.log(`  最高到達面: ${baseline.maxStages}\n`);

  const fullUpgradeIds = PERMANENT_UPGRADE_POOL.map((u) => u.id);
  const boosted = runBatch(opts.class, fullUpgradeIds, opts.runs);
  console.log("[永続強化フル取得]");
  console.log(`  平均クリア面数: ${boosted.avgStagesCleared}`);
  console.log(`  平均獲得ゴールド: ${boosted.avgGold}`);
  console.log(`  1面以上突破率: ${boosted.survivalRate1}%`);
  console.log(`  3面以上突破率: ${boosted.survivalRate3}%`);
  console.log(`  5面以上突破率: ${boosted.survivalRate5}%`);
  console.log(`  最高到達面: ${boosted.maxStages}\n`);

  console.log(
    Number(boosted.avgStagesCleared) > Number(baseline.avgStagesCleared)
      ? "✓ 永続強化により平均到達面数が向上している"
      : "✗ 永続強化の効果が見えていない（要調整）"
  );
}

main();
