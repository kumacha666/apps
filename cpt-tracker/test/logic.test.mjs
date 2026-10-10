import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pointsForPlacement, placementForPoints, tiedStart, normalizeTag, tagPart, nameKeys,
  compareTiebreak, rankRows, evaluateEntrants, aliveBounds, buildRows, judge, baselineRankMap,
} from "../logic.js";

const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL("../data/baseline.json", import.meta.url)));
const rules = config.rules;

const rowOf = (rows, tag) => rows.find((r) => r.keys.has(normalizeTag(tag)));
const entrant = (id, tag, placement, name) => ({ id, tag, name: name ?? tag, placement });

// ---- ポイント表 ----
test("順位別ポイント表（公式2026）", () => {
  const exp = { 1: 0, 2: 300, 3: 250, 4: 200, 5: 150, 6: 150, 7: 100, 8: 100, 9: 50, 12: 50, 13: 30, 16: 30, 17: 20, 24: 20, 25: 10, 32: 10, 33: 0, 65: 0 };
  for (const [p, pts] of Object.entries(exp)) assert.equal(pointsForPlacement(Number(p), rules), pts, `placement ${p}`);
  assert.equal(pointsForPlacement(null, rules), 0);
  assert.equal(pointsForPlacement(NaN, rules), 0);
});

test("ポイント→順位は表の開始順位", () => {
  assert.equal(placementForPoints(300, rules), 2);
  assert.equal(placementForPoints(150, rules), 5);
  assert.equal(placementForPoints(10, rules), 25);
  assert.equal(placementForPoints(40, rules), null);
});

test("tiedStartはdouble eliminationのタイ開始順位", () => {
  const exp = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5, 7: 7, 8: 7, 9: 9, 12: 9, 13: 13, 16: 13, 17: 17, 24: 17, 25: 25, 32: 25, 33: 33, 48: 33, 49: 49 };
  for (const [r, s] of Object.entries(exp)) assert.equal(tiedStart(Number(r)), s, `r=${r}`);
});

// ---- 名前 ----
test("名前の正規化と併記タグ", () => {
  assert.equal(tagPart("ZETA | Higuchi"), "Higuchi");
  assert.equal(tagPart("Falcons/Qanba | Micky"), "Micky");
  assert.equal(tagPart("Naooonn"), "Naooonn");
  assert.equal(normalizeTag("Ｇ８Ｓ Sahara."), "g8ssahara");
  const k = nameKeys("REJECT | ひなお/Hinao");
  assert.ok(k.has("hinao") && k.has("ひなお") && k.has("ひなお/hinao"));
  assert.ok(nameKeys("Sahara.").has("sahara"));
});

// ---- タイブレーク（公式規定 2.3.2 の例）----
test("タイブレーク: 最高順位 → 入賞回数 → 次点", () => {
  // A: 2位あり / B: 3位が最高 → Aが上
  assert.equal(compareTiebreak([2, 9], [3, 5]), -1);
  // 最高順位同じ4位、回数 D=2回 / E=1回 → Dが上
  assert.equal(compareTiebreak([4, 4, 9], [4, 7, 7]), -1);
  // G/H 7位×2、次点9位の回数でG
  assert.equal(compareTiebreak([7, 7, 9, 9], [7, 7, 9, 13]), -1);
  // 完全一致は抽選（0）
  assert.equal(compareTiebreak([5, 9], [5, 9]), 0);
  assert.equal(compareTiebreak([2], [2]), 0);
});

// ---- baseline検証 ----
test("baselineの順位が公式ページと一致（全117人）", () => {
  const { rows } = buildRows({ baseline, config, live: null });
  const ranks = baselineRankMap(rows, rules);
  baseline.players.forEach((p, i) => {
    const key = rows[i].key;
    const sameTotal = baseline.players.filter((o) => o.total === p.total).length;
    // 公式は同点タイブレーク未解消のときのみ同順位 → 公式順位は「上位に居る人数+1」
    const expected = 1 + baseline.players.filter((o) => o.total > p.total).length;
    // 同点でも公式がタイブレークで順位を割っていればranks <= 公式の最悪順位
    assert.ok(ranks.get(key) >= expected && ranks.get(key) <= expected + sameTotal - 1, `${p.name}: ${ranks.get(key)} vs ${expected}`);
  });
  assert.equal(baseline.players.length, 117);
  for (const p of baseline.players) {
    assert.equal(p.events.reduce((s, v) => s + (v || 0), 0), p.total, p.name);
    assert.equal(p.events.length, 8);
    assert.equal(p.events[7], null);
  }
});

test("同点9位3人のうち出場権保持者を除いた8枠: 公式の同順位並びをタイブレークで解く", () => {
  const { rows } = buildRows({ baseline, config, live: null });
  // 360pt: Shigematsu=[4,... 2位(300)+...], Craime, Tantanmen
  const ranked = judge(rows, config, "confirmed");
  const r = (t) => ranked.findIndex((x) => x.keys.has(normalizeTag(t)));
  // Shigematsu: 10(25位),50(9位),300(2位) / Craime: 10,200(4位),150(5位) / Tantanmen: 150,10,200
  assert.ok(r("Shigematsu") < r("Craime"), "最高順位2位のShigematsuが上");
  assert.ok(r("Craime") < r("Tantanmen"), "4位のCraime > 4位1回のTantanmen? 次点で判定");
});

// ---- ライブ評価 ----
test("evaluateEntrants: 大会終了なら全員確定、進行中は生存者より下位の非生存者のみ確定", () => {
  const live = {
    eventState: "ACTIVE", aliveCount: 6, aliveIds: ["1", "2", "3", "4", "5", "6"],
    standings: [entrant(1, "A", 1), entrant(7, "B", 7), entrant(8, "C", 7), entrant(9, "D", 9), entrant(2, "E", 2)],
  };
  const m = evaluateEntrants(live);
  assert.equal(m.get("7").state, "final");
  assert.equal(m.get("9").state, "final");
  assert.equal(m.get("1").state, "alive");
  assert.equal(m.get("2").state, "alive");
  // 生存者ではないが順位が生存者数以下 → 誤判定防止で未確定扱い
  const m2 = evaluateEntrants({ ...live, standings: [entrant(7, "B", 5)] });
  assert.equal(m2.get("7").state, "alive");
  const m3 = evaluateEntrants({ ...live, eventState: "COMPLETED", standings: [entrant(7, "B", 5)] });
  assert.equal(m3.get("7").state, "final");
  // 生存IDがstandingsに無くても生存として扱う
  assert.equal(evaluateEntrants({ ...live, standings: [] }).get("3").state, "alive");
});

test("aliveBounds: 生存者数に応じた最低保証と最大", () => {
  assert.deepEqual(aliveBounds(6, rules), { floor: 150, ceil: 300 });
  assert.deepEqual(aliveBounds(8, rules), { floor: 100, ceil: 300 });
  assert.deepEqual(aliveBounds(24, rules), { floor: 20, ceil: 300 });
  assert.deepEqual(aliveBounds(32, rules), { floor: 10, ceil: 300 });
  assert.deepEqual(aliveBounds(200, rules), { floor: 0, ceil: 300 });
  assert.deepEqual(aliveBounds(2, rules), { floor: 300, ceil: 300 });
});

// ---- シナリオ ----
function liveWith({ state = "ACTIVE", alive = [], standings = [], roster = [] }) {
  return { eventState: state, aliveCount: alive.length, aliveIds: alive.map(String), standings, roster };
}

test("TOP 24でのポイント確定が表に反映される（Hinao 300 + 25位 10pt など）", () => {
  const rosterTags = baseline.players.map((p) => tagPart(p.name));
  const live = liveWith({
    alive: Array.from({ length: 24 }, (_, i) => 1000 + i),
    standings: [entrant(1, "Hinao", 25, "REJECT | Hinao"), entrant(2, "Jr.", 17, "RIDDLE ORDER | Jr.")],
    roster: rosterTags,
  });
  // 生存者24人 → placement>24 のみ確定。Hinao(25位)は確定、Jr.(17位)は未確定扱い
  const { rows } = buildRows({ baseline, config, live });
  const hinao = rowOf(rows, "Hinao");
  const jr = rowOf(rows, "Jr.");
  assert.equal(hinao.evo.state, "final");
  assert.equal(hinao.evoPoints, 10);
  assert.equal(hinao.totals.confirmed, 310);
  assert.equal(jr.evo.state, "alive");
});

test("名簿に居ない選手は欠場扱い、名簿にいるのにstandingsに居ない選手は0pt確定", () => {
  const live = liveWith({ alive: [1, 2, 3, 4, 5, 6, 7, 8], roster: ["Higuchi", "Micky"], standings: [entrant(1, "Higuchi", 7)] });
  const { rows } = buildRows({ baseline, config, live });
  assert.equal(rowOf(rows, "Higuchi").evo.state, "alive");
  assert.equal(rowOf(rows, "Micky").evo.state, "final");
  assert.equal(rowOf(rows, "Micky").evoPoints, 0);
  assert.equal(rowOf(rows, "Punk").evo.state, "absent");
});

test("ライブ未取得のときは上振れ余地を最大とみなし、確定判定を出し過ぎない", () => {
  const { rows } = buildRows({ baseline, config, live: null });
  judge(rows, config, "floor");
  // 出場権保持者を除いたポイント首位のHiguchiは、他に730以上になり得る選手が5人しか居ないので確定圏内
  assert.equal(rowOf(rows, "Higuchi").safety, "locked");
  // 8位付近のCrossoverRD(310)はまだ決まらない
  assert.equal(rowOf(rows, "CrossoverRD").safety, "contested");
  // 出場権保持者
  assert.equal(rowOf(rows, "Booce_Lee").safety, "qualified");
});

test("出場権保持者はPremierポイント枠(8名)に数えない", () => {
  const { rows } = buildRows({ baseline, config, live: null });
  const ranked = judge(rows, config, "confirmed");
  const inCup = ranked.filter((r) => r.cup === "in").map((r) => r.name);
  assert.equal(inCup.length, 8);
  assert.ok(!inCup.some((n) => /Booce_Lee|NoahTheProdigy|Shigematsu|Tokido/.test(n)));
  assert.ok(inCup.some((n) => /Higuchi/.test(n)));
});

test("圏外確定: 順位確定済みの上位が枠数以上いて最大合計でも届かない", () => {
  // 全員を早期敗退(0pt)確定、上位8人のみ確定済みにして、下位の最大合計を見る
  const standings = [entrant(1, "Higuchi", 1)]; // 優勝者が出場権を得てポイント枠から外れる
  const roster = baseline.players.map((p) => tagPart(p.name));
  const live = liveWith({ state: "COMPLETED", standings, roster });
  const { rows, premierDecided } = buildRows({ baseline, config, live });
  judge(rows, config, "confirmed", { premierDecided });
  // 全員確定済み(0pt)なので、9位以下は圏外確定、1〜8位は確定圏内
  const inRows = rows.filter((r) => r.cup === "in");
  assert.equal(inRows.length, 8);
  for (const r of inRows) assert.equal(r.safety, "locked", r.name);
  const outRow = rows.find((r) => r.cup === "out");
  assert.equal(outRow.safety, "eliminated");
});

test("優勝者が既に出場権保持なら、Premier出場権は準優勝者へ繰り下がる（規定5.2）", () => {
  const roster = baseline.players.map((p) => tagPart(p.name));
  // Noah(UFA優勝済み)が優勝 → 準優勝のMickyがPremier出場権 → ポイント枠から外れる
  const live = liveWith({
    state: "COMPLETED", roster,
    standings: [entrant(1, "NoahTheProdigy", 1), entrant(2, "Micky", 2), entrant(3, "Punk", 3)],
  });
  const { rows } = buildRows({ baseline, config, live });
  const micky = rowOf(rows, "Micky");
  assert.equal(micky.qualified, true);
  assert.equal(micky.qualifiedBy, "premier");
  assert.equal(rowOf(rows, "Punk").qualified, false);
  assert.equal(micky.evoPoints, 300);
});

test("優勝者が未出場権なら優勝者が出場権（ポイント無し）、準優勝は枠に残る", () => {
  const roster = baseline.players.map((p) => tagPart(p.name));
  const live = liveWith({
    state: "COMPLETED", roster,
    standings: [entrant(1, "Higuchi", 1), entrant(2, "Kilzyou", 2)],
  });
  const { rows } = buildRows({ baseline, config, live });
  const h = rowOf(rows, "Higuchi");
  assert.equal(h.qualified, true);
  assert.equal(h.evoPoints, 0);
  assert.equal(rowOf(rows, "Kilzyou").qualified, false);
  assert.equal(rowOf(rows, "Kilzyou").totals.confirmed, 850);
});

test("start.ggにしか居ない新規選手がポイントを得たら行が追加される", () => {
  const roster = baseline.players.map((p) => tagPart(p.name)).concat(["NewKid"]);
  const live = liveWith({
    state: "COMPLETED", roster,
    standings: [entrant(1, "Higuchi", 1), entrant(2, "NewKid", 2, "FOO | NewKid")],
  });
  const { rows } = buildRows({ baseline, config, live });
  const nk = rows.find((r) => r.isNew);
  assert.ok(nk);
  assert.equal(nk.totals.confirmed, 300);
});

test("手動上書き（順位指定）は確定扱いでライブより優先", () => {
  const live = liveWith({ alive: [1, 2, 3, 4, 5, 6, 7, 8], roster: [], standings: [] });
  const base = buildRows({ baseline, config, live }).rows;
  const key = rowOf(base, "Hinao").key;
  const { rows } = buildRows({ baseline, config, live, overrides: { [key]: 5 } });
  const h = rowOf(rows, "Hinao");
  assert.equal(h.evo.state, "final");
  assert.equal(h.evoPoints, 150);
});

test("手動の出場権トグルで枠から外せる", () => {
  const base = buildRows({ baseline, config, live: null }).rows;
  const key = rowOf(base, "Higuchi").key;
  const { rows } = buildRows({ baseline, config, live: null, qualifiedExtra: { [key]: true } });
  assert.equal(rowOf(rows, "Higuchi").qualified, true);
  const { rows: rows2 } = buildRows({ baseline, config, live: null, qualifiedExtra: { [normalizeTag("Craime")]: false } });
  assert.equal(rowOf(rows2, "Craime").qualified, false);
});

test("rankRows: 同点・同タイブレークは同順位、タイ印が付く", () => {
  const rows = [
    { id: "a", t: 100, placements: [2] },
    { id: "b", t: 100, placements: [2] },
    { id: "c", t: 50, placements: [9] },
  ];
  const out = rankRows(rows, (r) => r.t);
  assert.deepEqual(out.map((r) => r.rank), [1, 1, 3]);
  assert.equal(out[0].rankTied, true);
  assert.equal(out[2].rankTied, false);
});

test("圏外確定: 枠を空け得る1名分を差し引いて判定する（9人上に居ても優勝者が抜ければ8位に入り得る）", () => {
  const roster = baseline.players.map((p) => tagPart(p.name));
  // 生存者8人（床100pt）。出場権保持者を除く上位8人が生存、CrossoverRD(310)・Hinao・Jr.は0pt確定
  const aliveTags = ["Higuchi", "Micky", "Punk", "Kilzyou", "Kobayan", "cosa", "Tantanmen", "Craime"];
  const cfg = { ...config, qualified: { players: config.qualified.players.filter((q) => q.tag !== "Craime") } };
  const standings = aliveTags.map((t, i) => entrant(100 + i, t, 7));
  const live = liveWith({ alive: standings.map((s) => s.id), standings, roster });
  const { rows, premierDecided } = buildRows({ baseline, config: cfg, live });
  judge(rows, cfg, "floor", { premierDecided });
  // 上に8人（床込みで310超）→ 8 - 1(優勝者が抜ける) = 7 < 8 なのでまだ圏外確定ではない
  assert.equal(rowOf(rows, "CrossoverRD").evo.state, "final");
  assert.equal(rowOf(rows, "CrossoverRD").evoPoints, 0);
  assert.equal(rowOf(rows, "CrossoverRD").safety, "contested");
  // 9人目も床込みで310超になれば（優勝者1名が抜けても8人残る）圏外確定
  const live2 = liveWith({ alive: [...standings.map((s) => s.id), 200], standings: [...standings, entrant(200, "Blaz", 7)], roster });
  const r2 = buildRows({ baseline, config: cfg, live: live2 });
  // Blaz 270 + 床(9人生存→tiedStart(9)=9→50)=320 > 310
  judge(r2.rows, cfg, "floor", { premierDecided: r2.premierDecided });
  assert.equal(rowOf(r2.rows, "CrossoverRD").safety, "eliminated");
});

test("早期敗退者は8列目に0ptが確定し、欠場者は0pt(absent)として区別される", () => {
  const live = liveWith({ alive: [1, 2, 3, 4], roster: ["Higuchi", "CrossoverRD", "Jr."], standings: [entrant(1, "Higuchi", 3)] });
  const { rows } = buildRows({ baseline, config, live });
  for (const t of ["CrossoverRD", "Jr."]) {
    const r = rowOf(rows, t);
    assert.equal(r.evo.state, "final");
    assert.equal(r.evoPoints, 0);
    assert.equal(r.totals.ceil, r.totals.confirmed);
  }
  assert.equal(rowOf(rows, "Punk").evo.state, "absent");
  assert.equal(rowOf(rows, "Punk").totals.ceil, rowOf(rows, "Punk").baseTotal);
});
