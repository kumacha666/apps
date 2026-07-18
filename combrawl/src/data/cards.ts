import type { Card, GameState, Unit } from "../types";
import { avgAtk, avgDef, avgHp, makeUnit } from "../units";
import { aoePercentForLevel, dmgTakenMultForDef, retaliateMultFor } from "../combat";

function alivePlayers(state: GameState): Unit[] {
  return state.playerUnits.filter((u) => u.alive);
}

function pickTarget(state: GameState, chosenUnit?: Unit | null): Unit | null {
  const alive = alivePlayers(state);
  if (alive.length === 0) return null;
  if (chosenUnit && alive.includes(chosenUnit)) return chosenUnit;
  return alive[Math.floor(Math.random() * alive.length)];
}

export const CARD_POOL: Card[] = [
  {
    id: "reinforce",
    name: "増援",
    desc: "新しいユニットが1体、仲間に加わる",
    apply: (state) => {
      const h = avgHp(state.playerUnits);
      const a = avgAtk(state.playerUnits);
      const d = avgDef(state.playerUnits);
      state.playerUnits.push(makeUnit("player", h || 20, a || 4, d || 5));
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
    id: "fusion",
    name: "合体",
    desc: "全ユニットが1体に合体する。HP・攻撃力・DEFは合計の1.2倍。連撃・全体攻撃化・反撃・挑発などの特性も引き継ぐ",
    apply: (state) => {
      const units = state.playerUnits;
      const totalHp = units.reduce((s, u) => s + u.maxHp, 0);
      const totalAtk = units.reduce((s, u) => s + u.atk, 0);
      const totalDef = units.reduce((s, u) => s + u.def, 0);
      const newHp = Math.round(totalHp * 1.2);
      const newAtk = Math.round(totalAtk * 1.2);
      const newDef = Math.round(totalDef * 1.2);

      const extraHits = units.reduce((s, u) => s + (u.attackCount - 1), 0);
      const totalCrit = Math.min(0.95, units.reduce((s, u) => s + u.critChance, 0));
      const maxCritMult = units.reduce((m, u) => Math.max(m, u.critMult), 2);
      const avgDmgOut = units.reduce((s, u) => s + u.dmgOutMult, 0) / units.length;
      const sumAoeLevel = units.reduce((s, u) => s + u.aoeLevel, 0);
      const sumRetaliateLevel = units.reduce((s, u) => s + u.retaliateLevel, 0);
      const sumTauntLevel = units.reduce((s, u) => s + u.tauntLevel, 0);

      const fused = makeUnit("player", newHp, newAtk, newDef);
      fused.attackCount = 1 + extraHits;
      fused.critChance = totalCrit;
      fused.critMult = maxCritMult;
      fused.dmgOutMult = avgDmgOut;
      fused.aoeLevel = sumAoeLevel;
      fused.retaliateLevel = sumRetaliateLevel;
      fused.tauntLevel = sumTauntLevel;

      state.playerUnits = [fused];
      return { message: `1体の巨大ユニットに合体！ HP${newHp} / 攻撃${newAtk} / DEF${newDef}（特性も合算して引き継ぎ）` };
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
      const nd = Math.max(1, Math.round(u.def * 0.6));
      const child1 = makeUnit("player", nh, na, nd);
      const child2 = makeUnit("player", nh, na, nd);
      [child1, child2].forEach((c) => {
        c.attackCount = u.attackCount;
        c.critChance = u.critChance;
        c.critMult = u.critMult;
        c.dmgOutMult = u.dmgOutMult;
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
    desc: "選んだ（またはランダムな）1体が、敵全体に同時攻撃するように。重ねがけで威力上昇（Lv1:80%→Lv2:95%→Lv3:110%…上限なし）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.aoeLevel += 1;
      return { message: `1体が全体攻撃化した！（Lv${u.aoeLevel}・威力${Math.round(aoePercentForLevel(u.aoeLevel) * 100)}%）`, appliedUnit: u };
    },
  },
  {
    id: "retaliate",
    name: "反撃の型",
    desc: "選んだ（またはランダムな）1体が、敵ターン終了後、味方が受けた攻撃の回数ぶんまとめて反撃するように。重ねがけで反撃威力上昇（Lv1:100%→Lv2:135%→Lv3:170%…）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.retaliateLevel += 1;
      return { message: `1体が反撃の構えを取った！（Lv${u.retaliateLevel}・威力${Math.round(retaliateMultFor(u.retaliateLevel) * 100)}%）`, appliedUnit: u };
    },
  },
  {
    id: "taunt",
    name: "挑発",
    desc: "選んだ（またはランダムな）1体が、敵の攻撃を一身に受けるようになる。重ねがけでLvが上がり、1ラウンドにつきLv回ぶんダメージを完全無効化（毎ラウンドリフィル）",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.tauntLevel += 1;
      return { message: `1体が挑発した！（Lv${u.tauntLevel}・1ラウンドにつき${u.tauntLevel}回ダメージ無効）`, appliedUnit: u };
    },
  },
  {
    id: "titan_growth",
    name: "特大化",
    desc: "選んだ（またはランダムな）1体だけHPが3倍になり、その場で巨大化する",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      const nm = u.maxHp * 3;
      u.maxHp = nm;
      u.hp = nm;
      return { message: "1体が特大化した！", appliedUnit: u };
    },
  },
  {
    id: "sharpen",
    name: "先鋭化",
    desc: "選んだ（またはランダムな）1体だけ攻撃力が3倍になる",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.atk = u.atk * 3;
      return { message: "1体が先鋭化した！", appliedUnit: u };
    },
  },
  {
    id: "harden",
    name: "硬質化",
    desc: "選んだ（またはランダムな）1体だけDEFが3倍になり、被ダメージが大きく減る",
    singleTarget: true,
    apply: (state, chosenUnit) => {
      const u = pickTarget(state, chosenUnit);
      if (!u) return { message: "対象なし" };
      u.def = u.def * 3;
      u.dmgTakenMult = dmgTakenMultForDef(u.def);
      return { message: `1体が硬質化した！（被ダメージ${Math.round(u.dmgTakenMult * 100)}%）`, appliedUnit: u };
    },
  },
];
