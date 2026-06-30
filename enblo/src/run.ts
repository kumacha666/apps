import type { CombatUnit, Relic, Stats, UpgradeOption } from "./types";
import { getClassById } from "./data/classes";
import { generateEnemyStats, enemyName, isBossStage } from "./data/enemies";
import { rollUpgradeChoices } from "./data/upgrades";
import { rollRelicChoices } from "./data/relics";
import { applyPermanentUpgrades } from "./data/permanentUpgrades";
import { simulateCombat } from "./combat";

export function goldForStage(stage: number): number {
  return 10 + stage * 3;
}

export interface RunConfig {
  classId: string;
  permanentUpgradeIds: string[];
  rng: () => number;
  pickUpgrade: (options: UpgradeOption[]) => UpgradeOption;
  pickRelic: (options: Relic[]) => Relic;
}

export interface RunSummary {
  stagesCleared: number;
  goldEarned: number;
}

export function playRun(config: RunConfig): RunSummary {
  const classDef = getClassById(config.classId);
  let stats: Stats = applyPermanentUpgrades(classDef.baseStats, config.permanentUpgradeIds);
  let stage = 1;
  let gold = 0;

  for (;;) {
    const enemyStats = generateEnemyStats(stage);
    const player: CombatUnit = { classId: config.classId, name: classDef.name, stats };
    const enemy: CombatUnit = { classId: "enemy", name: enemyName(stage), stats: enemyStats };
    const result = simulateCombat(player, enemy, config.rng);

    if (result.winner === "enemy") {
      break;
    }

    gold += goldForStage(stage);

    if (isBossStage(stage)) {
      const relicChoices = rollRelicChoices(3, config.rng);
      const chosen = config.pickRelic(relicChoices);
      stats = chosen.apply(stats);
    } else {
      const upgradeChoices = rollUpgradeChoices(3, config.classId, config.rng);
      const chosen = config.pickUpgrade(upgradeChoices);
      stats = chosen.apply(stats);
    }

    stage += 1;
  }

  return { stagesCleared: stage - 1, goldEarned: gold };
}

export function randomPick<T>(options: T[], rng: () => number): T {
  return options[Math.floor(rng() * options.length)];
}
