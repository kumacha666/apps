import type { Card, GameState, Unit } from "../types";
import { avgAtk, avgHp, makeUnit } from "../units";

function alivePlayers(state: GameState): Unit[] {
  return state.playerUnits.filter((u) => u.alive);
}

function pickTarget(state: GameState, chosenUnit?: Unit | null): Unit | null {
  const alive = alivePlayers(state);
  if (alive.length === 0) return null;
  if (chosenUnit && alive.includes(chosenUnit)) return chosenUnit;
  return alive[Math.floor(Math.random() * alive.length)];
}

export function aoeMultForDisplay(level: number): number {
  if (!level || level <= 0) return 1;
  return Math.min(1.5, 0.65 + 0.15 * level);
}

export function retaliateMultForDisplay(level: number): number {
  if (!level || level <= 0) return 0;
  return Math.min(3, 1 + 0.35 * (level - 1));
}

/** 挑発Lvに対応する被ダメージ倍率（Lv1:70%→Lv2:49%→Lv3:34.3%…）。dmgTakenMultはtauntLevel専属の値なので、常にこの式で導出する */
export function tauntMultForDisplay(level: number): number {
  if (!level || level <= 0) return 1;
  return Math.pow(0.7, level);
}

export const CARD_POOL: Card[] = [
  {
    id: "reinforce",
    name: "増援",
    desc: "新しいユニットが1体、仲間に加わる",
    apply: (state) => {
      const h = avgHp(state.playerUnits);
      const a = avgAtk(state.playerUnits);
      state.playerUnits.push(makeUnit("player", h || 20, a || 4));
      return { message: `ユニットが${state.playerUnits.length}体に増えた！` };
    },
  },
  {
    id: "rapid_strike",
    name: "連撃の型",
    desc: "選んだ（またはランダムな）1体が、1ターンに5回攻撃するようになる",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.attackCount += 4;
      return { message: `1体が${u.attackCount}連撃になった！`, appliedUnit: u };
    },
  },
  {
    id: "giant_growth",
    name: "巨大化",
    desc: "全ユニットのHP・攻撃力が2倍になり、その場で巨大化する",
    apply: (state) => {
      state.playerUnits.forEach((u) => {
        const nm = u.maxHp * 2;
        u.hp = nm;
        u.maxHp = nm;
        u.atk = u.atk * 2;
      });
      return { message: "全ユニットが巨大化した！" };
    },
  },
  {
    id: "fusion",
    name: "合体",
    desc: "全ユニットが1体に合体する。HP・攻撃力は合計の1.2倍。連撃・全体攻撃化・反撃・挑発などの特性も引き継ぐ",
    apply: (state) => {
      const units = state.playerUnits;
      const totalHp = units.reduce((s, u) => s + u.maxHp, 0);
      const totalAtk = units.reduce((s, u) => s + u.atk, 0);
      const newHp = Math.round(totalHp * 1.2);
      const newAtk = Math.round(totalAtk * 1.2);

      const extraHits = units.reduce((s, u) => s + (u.attackCount - 1), 0);
      const totalCrit = Math.min(0.95, units.reduce((s, u) => s + u.critChance, 0));
      const maxCritMult = units.reduce((m, u) => Math.max(m, u.critMult), 2);
      const avgDmgOut = units.reduce((s, u) => s + u.dmgOutMult, 0) / units.length;
      const sumAoeLevel = units.reduce((s, u) => s + u.aoeLevel, 0);
      const sumRetaliateLevel = units.reduce((s, u) => s + u.retaliateLevel, 0);
      const sumTauntLevel = units.reduce((s, u) => s + u.tauntLevel, 0);

      const fused = makeUnit("player", newHp, newAtk);
      fused.attackCount = 1 + extraHits;
      fused.critChance = totalCrit;
      fused.critMult = maxCritMult;
      fused.dmgOutMult = avgDmgOut;
      // dmgTakenMultはtauntLevel専属の値なので、合算したtauntLevelから式で導出する
      // （単純平均だと「表示Lvは合算されているのに軽減率は伸びない」というズレが生じるため）
      fused.dmgTakenMult = tauntMultForDisplay(sumTauntLevel);
      fused.aoeLevel = sumAoeLevel;
      fused.retaliateLevel = sumRetaliateLevel;
      fused.tauntLevel = sumTauntLevel;

      state.playerUnits = [fused];
      return { message: `1体の巨大ユニットに合体！ HP${newHp} / 攻撃${newAtk}（特性も合算して引き継ぎ）` };
    },
  },
  {
    id: "split",
    name: "分裂",
    desc: "選んだ（またはランダムな）1体が2体に分裂する（それぞれ元の60%の力、特性は両方に引き継ぐ）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      const idx = state.playerUnits.indexOf(u);
      const nh = Math.max(6, Math.round(u.maxHp * 0.6));
      const na = Math.max(1, Math.round(u.atk * 0.6));
      const child1 = makeUnit("player", nh, na);
      const child2 = makeUnit("player", nh, na);
      [child1, child2].forEach((c) => {
        c.attackCount = u.attackCount;
        c.critChance = u.critChance;
        c.critMult = u.critMult;
        c.dmgOutMult = u.dmgOutMult;
        c.dmgTakenMult = u.dmgTakenMult;
        c.aoeLevel = u.aoeLevel;
        c.retaliateLevel = u.retaliateLevel;
        c.tauntLevel = u.tauntLevel;
      });
      state.playerUnits.splice(idx, 1, child1, child2);
      return { message: "1体が2体に分裂した！（特性も両方に引き継ぎ）", appliedUnit: child1 };
    },
  },
  {
    id: "aoe_convert",
    name: "全体攻撃化",
    desc: "選んだ（またはランダムな）1体が、敵全体に同時攻撃するように。重ねがけで威力上昇（Lv1:80%→Lv2:95%→Lv3:110%…上限150%）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.aoeLevel += 1;
      return { message: `1体が全体攻撃化した！（Lv${u.aoeLevel}・威力${Math.round(aoeMultForDisplay(u.aoeLevel) * 100)}%）`, appliedUnit: u };
    },
  },
  {
    id: "retaliate",
    name: "反撃の型",
    desc: "選んだ（またはランダムな）1体が、味方が攻撃を受けるたびに自動で反撃するように。重ねがけで反撃威力上昇（Lv1:100%→Lv2:135%→Lv3:170%…）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.retaliateLevel += 1;
      return { message: `1体が反撃の構えを取った！（Lv${u.retaliateLevel}・威力${Math.round(retaliateMultForDisplay(u.retaliateLevel) * 100)}%）`, appliedUnit: u };
    },
  },
  {
    id: "taunt",
    name: "挑発",
    desc: "選んだ（またはランダムな）1体が、敵の攻撃を一身に受けるようになる。ピックするたびに被ダメージがさらに0.7倍に（重ねがけ可）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.tauntLevel += 1;
      u.dmgTakenMult = tauntMultForDisplay(u.tauntLevel);
      return { message: `1体が挑発した！（Lv${u.tauntLevel}・被ダメージ${Math.round(u.dmgTakenMult * 100)}%）`, appliedUnit: u };
    },
  },
  {
    id: "titan_growth",
    name: "特大化",
    desc: "選んだ（またはランダムな）1体だけHP・攻撃力が3倍になり、その場で巨大化する",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      const nm = u.maxHp * 3;
      u.hp = nm;
      u.maxHp = nm;
      u.atk = u.atk * 3;
      return { message: "1体が特大化した！", appliedUnit: u };
    },
  },
];
