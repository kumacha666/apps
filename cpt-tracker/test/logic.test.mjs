import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pointsForPlacement, placementForPoints, tiedStart, normalizeTag, tagPart, nameKeys,
  compareTiebreak, rankRows, evaluateEntrants, aliveBounds, buildRows, judge, baselineRankMap,
  liveFreshness, nextRefreshDelayMs, aliveFloorPoints, isDebugMode, friendlyLiveError, phaseLabel,
  borderInfo, snapshotRows, changeEvents, createChangeTracker, recentResults,
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
test("evaluateEntrants: 大会終了なら全員確定、進行中は『生存者ではなく、生存者数の順位帯以下』の選手だけ確定", () => {
  const live = {
    eventState: "ACTIVE", aliveCount: 6, aliveIds: ["1", "2", "3", "4", "5", "6"],
    standings: [entrant(1, "A", 1), entrant(7, "B", 7), entrant(8, "C", 7), entrant(9, "D", 9), entrant(2, "E", 2)],
  };
  const m = evaluateEntrants(live);
  assert.equal(m.get("7").state, "final");
  assert.equal(m.get("9").state, "final");
  assert.equal(m.get("1").state, "alive");
  assert.equal(m.get("2").state, "alive");
  // 生存6人の順位帯は5位タイ(5-6位)。生存者ではなく5位ならこれから敗退した人として確定
  assert.equal(evaluateEntrants({ ...live, standings: [entrant(7, "B", 5)] }).get("7").state, "final");
  // 生存者ではないが、帯より良い暫定順位（3位）は、次の試合が未作成なだけの勝ち上がりかもしれないので未確定
  assert.equal(evaluateEntrants({ ...live, standings: [entrant(7, "B", 3)] }).get("7").state, "alive");
  const m3 = evaluateEntrants({ ...live, eventState: "COMPLETED", standings: [entrant(7, "B", 3)] });
  assert.equal(m3.get("7").state, "final");
  // 生存IDがstandingsに無くても生存として扱う
  assert.equal(evaluateEntrants({ ...live, standings: [] }).get("3").state, "alive");
  // 実データ: 生存22人のとき、17位で敗退した人は確定（帯17〜24の開始順位17以上）
  const live22 = { eventState: "ACTIVE", aliveCount: 22, aliveIds: ["1"], standings: [entrant(2, "X", 17), entrant(3, "Y", 13)] };
  const m22 = evaluateEntrants(live22);
  assert.equal(m22.get("2").state, "final");
  assert.equal(m22.get("3").state, "alive"); // 13位は帯17より良い→未確定
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
  // 生存者24人 → 順位帯は17位タイ(17-24)。Hinao(25位)もJr.(17位)も生存者ではないので確定（20pt）
  const { rows } = buildRows({ baseline, config, live });
  const hinao = rowOf(rows, "Hinao");
  const jr = rowOf(rows, "Jr.");
  assert.equal(hinao.evo.state, "final");
  assert.equal(hinao.evoPoints, 10);
  assert.equal(hinao.totals.confirmed, 310);
  assert.equal(jr.evo.state, "final");
  assert.equal(jr.evoPoints, 20);
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

test("別表記（aliases）: start.ggのタグ違いでも、名簿・生存者の両方でbaselineの選手に一致する", () => {
  const cfg = { ...config, aliases: { map: { "EVG Crossover": "CrossoverRD", Akutagawa: "あくたがわ" } } };
  const roster = ["RR | EVG Crossover", "Akutagawa", "Higuchi"];
  // CrossoverRDは名簿に別表記で居て生存者ではない → 0pt確定（欠場扱いにしない）
  // あくたがわは別表記で生存中 → baselineの行にマッチし、新規行を作らない
  const live = liveWith({
    alive: [7], roster,
    standings: [entrant(7, "Akutagawa", 17, "SCARZ | Akutagawa")],
  });
  const { rows } = buildRows({ baseline, config: cfg, live });
  const c = rowOf(rows, "CrossoverRD");
  assert.equal(c.evo.state, "final");
  assert.equal(c.evoPoints, 0);
  const a = rowOf(rows, "あくたがわ");
  assert.equal(a.evo.state, "alive");
  assert.equal(rows.filter((r) => r.isNew).length, 0);
  // aliasなしだと別人扱い（CrossoverRDは欠場、Akutagawaは新規行）になることも確認
  const { rows: rows2 } = buildRows({ baseline, config: { ...config, aliases: { map: {} } }, live });
  assert.equal(rowOf(rows2, "CrossoverRD").evo.state, "absent");
  assert.equal(rows2.filter((r) => r.isNew).length, 1);
});

test("生存中の選手はポイント枠が絶望でも圏外確定にしない（優勝のみ）、敗退確定者は圏外確定", () => {
  const roster = baseline.players.map((p) => tagPart(p.name));
  // 生存8人。上位8枠は敗退・確定済みの選手で埋まり、生存者のうち基準0の新規選手はポイントでは届かない
  const aliveTags = ["Higuchi", "Kilzyou", "Tantanmen", "CrossoverRD", "Blaz", "AngryBird", "Shuto", "NewKid"];
  const standings = aliveTags.map((t, i) => entrant(300 + i, t, 7));
  const live = liveWith({ alive: standings.map((s) => s.id), standings, roster: [...roster, "NewKid"] });
  const { rows, premierDecided } = buildRows({ baseline, config, live });
  judge(rows, config, "floor", { premierDecided });
  const kid = rows.find((r) => r.isNew);
  assert.equal(kid.evo.state, "alive");
  // NewKid(0pt)の最大は300。上に最低保証300超の選手が9人以上（Micky/Punk/Kobayan/cosa/Higuchi/Kilzyou/Tantanmen/CrossoverRD/Blaz…）→ポイントでは絶望
  assert.equal(kid.safety, "winonly");
  // 早期敗退が確定したJr.は本当の圏外確定
  assert.equal(rowOf(rows, "Jr.").evo.state, "final");
  assert.notEqual(rowOf(rows, "Jr.").safety, "winonly");
});

test("liveFreshness: 中継が前回応答を返した、または取得から3分超なら古い", () => {
  const now = Date.parse("2026-10-10T16:10:00Z");
  assert.deepEqual(liveFreshness(null, now), { ageSec: null, stale: false });
  assert.equal(liveFreshness({ fetchedAt: "2026-10-10T16:09:30Z" }, now).stale, false);
  assert.equal(liveFreshness({ fetchedAt: "2026-10-10T16:09:30Z" }, now).ageSec, 30);
  assert.equal(liveFreshness({ fetchedAt: "2026-10-10T16:06:00Z" }, now).stale, true);
  // staleフラグが立っていれば、取得時刻が新しくても古い扱い
  assert.equal(liveFreshness({ fetchedAt: "2026-10-10T16:09:50Z", stale: true }, now).stale, true);
  // 時刻が壊れていても落ちない
  assert.equal(liveFreshness({ fetchedAt: "x" }, now).ageSec, null);
});

test("nextRefreshDelayMs: 基準±最大10秒の範囲でばらつき、下限は20秒", () => {
  assert.equal(nextRefreshDelayMs(60, 0.5), 60000);
  assert.equal(nextRefreshDelayMs(60, 0), 50000);
  assert.equal(nextRefreshDelayMs(60, 1), 70000);
  assert.equal(nextRefreshDelayMs(5, 0.5), 20000); // 短すぎる設定は20秒に切り上げ
  assert.equal(nextRefreshDelayMs(600, 1), 610000); // 揺らぎは最大10秒
});

test("aliveFloorPoints: 暫定順位が生存者数からの下限より良ければそれを採る（ルーザーズ1回戦に勝つと17位→13位=30pt）", () => {
  // 生存22人 → 一律の下限は17位タイ=20pt
  assert.equal(aliveFloorPoints(17, 22, rules), 20);
  assert.equal(aliveFloorPoints(13, 22, rules), 30);
  assert.equal(aliveFloorPoints(9, 22, rules), 50);
  // 暫定順位が悪い（下限より下）場合は下限を下回らない
  assert.equal(aliveFloorPoints(25, 22, rules), 20);
  // 不正な暫定順位（欠損・1位・生存者数超え）は無視して一律の下限
  assert.equal(aliveFloorPoints(null, 22, rules), 20);
  assert.equal(aliveFloorPoints(1, 22, rules), 20);
  assert.equal(aliveFloorPoints(25, 8, rules), 100); // 生存8人: 暫定25位は不正（8人しか居ない）
  // 準決勝以降: 生存4人で暫定3位なら3位=250pt、決勝(2人)で暫定2位なら300pt
  assert.equal(aliveFloorPoints(3, 4, rules), 250);
  assert.equal(aliveFloorPoints(2, 2, rules), 300);
});

test("ルーザーズ勝者は個別に高い最低保証が反映され、負けた人は敗退確定する（実データの再現）", () => {
  const roster = baseline.players.map((p) => tagPart(p.name));
  // 生存22人。cosaとgachikunはルーザーズ1回戦に勝って暫定13位、他は暫定17位
  const aliveTags = ["cosa", "gachikun", "Punk", "kobayan", "Blaz", "Dogura"];
  const ids = Array.from({ length: 22 }, (_, i) => 500 + i);
  const standings = [
    entrant(500, "cosa", 13), entrant(501, "gachikun", 13),
    entrant(502, "Punk", 9), entrant(503, "kobayan", 9), entrant(504, "Blaz", 9), entrant(505, "Dogura", 17),
    entrant(900, "NuckleDu", 17), // 負けて敗退（生存者に含まれない）
  ];
  const live = liveWith({ alive: ids, standings, roster });
  live.aliveIds = ids.map(String); // 敗退者(900)は含めない
  const { rows } = buildRows({ baseline, config, live });
  assert.equal(rowOf(rows, "cosa").evoFloor, 30);
  assert.equal(rowOf(rows, "gachikun").evoFloor, 30);
  assert.equal(rowOf(rows, "Punk").evoFloor, 50);
  assert.equal(rowOf(rows, "Dogura").evoFloor, 20); // 暫定17位 → 一律の下限と同じ
  assert.equal(rowOf(rows, "cosa").evoCeil, 300);
  // 負けた人は17位で確定=20pt
  const nk = rowOf(rows, "NuckleDu");
  assert.equal(nk.evo.state, "final");
  assert.equal(nk.evoPoints, 20);
});

test("isDebugMode: debug=1 のときだけ有効", () => {
  assert.equal(isDebugMode("?debug=1"), true);
  assert.equal(isDebugMode("?utm_source=x&debug=1"), true);
  for (const s of ["", "?", "?debug=0", "?debug=true", "?debugx=1", null, undefined]) assert.equal(isDebugMode(s), false, String(s));
});

test("friendlyLiveError: 閲覧者向けの文言に技術的な原因を含めない", () => {
  for (const prev of [true, false]) {
    const m = friendlyLiveError(prev);
    assert.match(m, /自動で再試行/);
    assert.doesNotMatch(m, /Unexpected|token|HTTP|JSON|start\.gg|<|>/);
  }
  assert.match(friendlyLiveError(true), /前回のデータ/);
  assert.doesNotMatch(friendlyLiveError(false), /前回のデータ/);
});

test("phaseLabel: 進行中のフェーズ名／開始前の次フェーズ／大会終了を正しく出す（先頭のフェーズ名を誤って出さない）", () => {
  const ph = (...a) => a.map(([name, state]) => ({ name, state }));
  assert.equal(phaseLabel(null), "");
  // 進行中が複数なら最後（実データ: ROUND 3とTOP 24が同時にACTIVE）
  assert.equal(phaseLabel({ eventState: "ACTIVE", phases: ph(["ROUND 1", "COMPLETED"], ["ROUND 3", "ACTIVE"], ["TOP 24", "ACTIVE"], ["TOP 8", "CREATED"]) }), "TOP 24 進行中");
  // TOP 24が終わり、TOP 8がまだ始まっていない（夜間）→ 「ROUND 1 進行中」にしない
  assert.equal(phaseLabel({ eventState: "ACTIVE", phases: ph(["ROUND 1", "COMPLETED"], ["ROUND 3", "COMPLETED"], ["TOP 24", "COMPLETED"], ["TOP 8", "CREATED"]) }), "TOP 8 開始前");
  assert.equal(phaseLabel({ eventState: "ACTIVE", phases: ph(["TOP 8", "ACTIVE"]) }), "TOP 8 進行中");
  assert.equal(phaseLabel({ eventState: "COMPLETED", phases: ph(["TOP 8", "COMPLETED"]) }), "大会終了");
  assert.equal(phaseLabel({ eventState: "ACTIVE", phases: ph(["TOP 8", "COMPLETED"]) }), "全フェーズ終了");
  assert.equal(phaseLabel({ eventState: "ACTIVE", phases: [] }), "進行中");
});

test("evaluateEntrants: 決勝1試合目の後でリセット戦が未作成（生存者0人・フェーズ進行中）の間は1位・2位を確定扱いにしない", () => {
  const phases = [{ name: "TOP 24", state: "COMPLETED" }, { name: "TOP 8", state: "ACTIVE" }];
  const live = {
    eventState: "ACTIVE", aliveCount: 0, aliveIds: [], phases,
    standings: [entrant(1, "P", 1), entrant(2, "Q", 2), entrant(3, "R", 3), entrant(4, "S", 5)],
  };
  const m = evaluateEntrants(live);
  assert.equal(m.get("1").state, "alive");
  assert.equal(m.get("2").state, "alive");
  assert.equal(m.get("3").state, "final"); // 3位以下は決勝の結果で動かない
  assert.equal(m.get("4").state, "final");
  // 全フェーズ終了・大会終了なら従来どおり確定
  const done = evaluateEntrants({ ...live, phases: phases.map((p) => ({ ...p, state: "COMPLETED" })) });
  assert.equal(done.get("1").state, "final");
  assert.equal(evaluateEntrants({ ...live, eventState: "COMPLETED" }).get("2").state, "final");
  // 優勝が決まった扱いにならない（出場権の繰り下がりが動かない）
  const cfg = { ...config, qualified: { players: [] } };
  const base = { players: [{ name: "P", rank: 1, events: [0, 0, 0, 0, 0, 0, 0, null] }, { name: "Q", rank: 2, events: [0, 0, 0, 0, 0, 0, 0, null] }] };
  assert.equal(buildRows({ baseline: base, config: cfg, live }).premierDecided, false);
  assert.equal(buildRows({ baseline: base, config: cfg, live: { ...live, eventState: "COMPLETED" } }).premierDecided, true);
});

// ---- 枠のボーダー・速報フィード ----
const brow = (name, pts, o = {}) => ({ name, key: name, qualified: false, totals: { floor: pts, confirmed: pts, ceil: pts }, evo: { state: o.alive ? "alive" : "final" }, ...o });

test("borderInfo: 出場権保持者を除いた枠の最後と次点、差を返す", () => {
  const rows = [brow("T | A", 700), brow("Q", 650, { qualified: true }), brow("B", 600), brow("C", 360, { alive: true }), brow("D", 320), brow("E", 300)];
  const b = borderInfo(rows, 3, "floor");
  assert.deepEqual(b.last, { name: "C", pts: 360, alive: true }); // Qは枠に数えない → 枠3番目はC
  assert.deepEqual(b.next, { name: "D", pts: 320, alive: false });
  assert.equal(b.gap, 40);
  assert.equal(borderInfo(rows, 3, "confirmed").slots, 3);
  assert.equal(borderInfo(rows.slice(0, 3), 3, "floor"), null); // 枠より後ろに人がいない
});


test("changeEvents: 敗退・順位確定・確定圏内・圏外確定・出場権獲得を文言にし、手動上書きは出さない", () => {
  const p = { name: "X", evoState: "alive", placement: 7, points: 0, safety: "contested", qualifiedBy: null, manual: false };
  assert.deepEqual(changeEvents(p, { ...p, evoState: "final", points: 100, safety: "eliminated" }), ["X 敗退 → 7位 100pt確定", "X ポイント枠は圏外確定"]);
  assert.deepEqual(changeEvents(p, { ...p, safety: "locked" }), ["X ポイント枠が確定圏内に"]);
  assert.deepEqual(changeEvents(p, { ...p, safety: "winonly" }), ["X ポイント枠は絶望（優勝のみ）"]);
  assert.deepEqual(changeEvents(p, { ...p, evoState: "final", placement: 2, points: 300 }), ["X 準優勝 300pt確定"]);
  assert.deepEqual(changeEvents(p, { ...p, evoState: "final", placement: 1, points: 0, safety: "qualified", qualifiedBy: "premier" }), ["X 優勝", "X CAPCOM CUP 13の出場権を獲得（今大会）"]);
  assert.deepEqual(changeEvents(p, { ...p, safety: "contested" }), []);
  assert.deepEqual(changeEvents(p, { ...p, evoState: "final", manual: true }), []);
});

test("createChangeTracker: 初回は出さず、同じ変化が別々の2回の取得で続いたときだけ出す", () => {
  const snap = (state, pl, pts) => new Map([["x", { name: "X", evoState: state, placement: pl, points: pts, safety: "contested", qualifiedBy: null, manual: false }]]);
  const t = createChangeTracker();
  assert.deepEqual(t.update(snap("alive", 7, 0), "t1"), []); // 初回は基準にするだけ
  assert.deepEqual(t.update(snap("final", 7, 100), "t2"), []); // 1回目の変化は保留
  assert.deepEqual(t.update(snap("final", 7, 100), "t2"), []); // 同じ取得(stale等)の再処理は数えない
  const ev = t.update(snap("final", 7, 100), "t3");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].text, "X 敗退 → 7位 100pt確定");
  assert.equal(ev[0].at, "t2"); // 時刻は最初に見えた取得
  assert.deepEqual(t.update(snap("final", 7, 100), "t4"), []); // 二重に出さない
});

test("createChangeTracker: 一瞬だけの変化（すぐ元に戻る）は出さない", () => {
  const snap = (state) => new Map([["x", { name: "X", evoState: state, placement: 5, points: 150, safety: "contested", qualifiedBy: null, manual: false }]]);
  const t = createChangeTracker();
  t.update(snap("alive"), "t1");
  assert.deepEqual(t.update(snap("final"), "t2"), []);
  assert.deepEqual(t.update(snap("alive"), "t3"), []); // 元に戻った → 保留を捨てる
  assert.deepEqual(t.update(snap("alive"), "t4"), []);
  assert.deepEqual(t.update(snap("final"), "t5"), []); // 改めて1回目から数える
});

test("snapshotRows: 行から速報用の項目を取り出す", () => {
  const rows = [{ key: "k", name: "CR | Dogura", evo: { state: "final", placement: 7 }, evoPoints: 100, safety: "eliminated", qualifiedBy: undefined }];
  assert.deepEqual(snapshotRows(rows).get("k"), { name: "Dogura", evoState: "final", placement: 7, points: 100, safety: "eliminated", qualifiedBy: null, manual: false });
});

test("recentResults: 直近の試合結果を新しい順に出し、敗退確定した負け側には順位とポイントを添える", () => {
  const live = {
    eventState: "ACTIVE", aliveCount: 7, aliveIds: ["1", "2"],
    standings: [entrant(1, "A", 5), entrant(2, "B", 5), entrant(3, "C", 7)],
    recentSets: [
      { at: 100, round: "Losers Round 1", winnerId: "1", a: { id: "1", name: "T | A" }, b: { id: "3", name: "T | C" } },
      { at: 300, round: "Winners Semi-Final", winnerId: "2", a: { id: "1", name: "T | A" }, b: { id: "2", name: "T | B" } },
      { at: 200, round: "bad", winnerId: "9", a: { id: "1", name: "A" }, b: { id: "3", name: "C" } }, // 勝者がどちらでもない → 除く
    ],
  };
  const r = recentResults(live, rules);
  assert.equal(r.length, 2);
  assert.equal(r[0].text, "B が A に勝利"); // 新しい順（タグ部分だけ）
  assert.equal(r[0].note, null); // 勝ち側の敗者はまだ生存 → 添えない
  assert.equal(r[1].text, "A が C に勝利");
  assert.equal(r[1].note, "C 7位 100pt確定"); // 敗退確定
  assert.equal(r[1].round, "Losers Round 1");
  assert.equal(recentResults(live, rules, 1).length, 1);
  assert.equal(recentResults({ ...live, recentSets: undefined }, rules), null); // 中継が未対応 → null
  assert.deepEqual(recentResults({ ...live, recentSets: [] }, rules), []);
  assert.equal(recentResults(null, rules), null);
});
