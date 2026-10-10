// CPT Premier ポイントトラッカーの純ロジック（DOM非依存・ユニットテスト対象）。
// 仕様の根拠は CPT 2026 公式規定 2.3 / 5.1 / 5.2（apps/cpt-tracker/CLAUDE.md参照）。

export const VIEWS = ["confirmed", "floor", "ceil"];

// ---- ポイント表 -------------------------------------------------------

/** 順位→Premierポイント。1位・lastPlace超・不正値は0（1位は出場権のみでポイント無し）。 */
export function pointsForPlacement(placement, rules) {
  if (!Number.isFinite(placement) || placement < 2 || placement > rules.lastPlace) return 0;
  let pts = 0;
  for (const row of rules.table) if (placement >= row.place) pts = row.points;
  return pts;
}

/** ポイント→順位（double eliminationのタイ開始順位）。ポイントが表に無ければnull。 */
export function placementForPoints(points, rules) {
  const row = rules.table.find((r) => r.points === points);
  return row ? row.place : null;
}

/** r位が属するタイ順位の開始順位（5,6→5 / 7,8→7 / 9-12→9 / 13-16→13 / 17-24→17 / 25-32→25 …）。 */
export function tiedStart(r) {
  if (!Number.isFinite(r) || r < 1) return null;
  if (r <= 4) return r;
  const p = 2 ** Math.floor(Math.log2(r - 1));
  const half = p / 2;
  return r <= p + half ? p + 1 : p + half + 1;
}

// ---- 名前の正規化・マッチング ----------------------------------------

export function normalizeTag(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s._\-'’"`・]/g, "");
}

/** "チーム | タグ" → タグ部分。区切りが無ければそのまま。 */
export function tagPart(displayName) {
  const s = String(displayName ?? "");
  const i = s.lastIndexOf("|");
  return (i >= 0 ? s.slice(i + 1) : s).trim();
}

/** 名前から照合キー集合を作る（"ひなお/Hinao" のような併記は各片を別キーにする）。 */
export function nameKeys(...names) {
  const keys = new Set();
  for (const n of names) {
    const tag = tagPart(n);
    if (!tag) continue;
    const k = normalizeTag(tag);
    if (k) keys.add(k);
    if (tag.includes("/")) {
      for (const part of tag.split("/")) {
        const kk = normalizeTag(part);
        if (kk) keys.add(kk);
      }
    }
  }
  return keys;
}

// ---- 順位決定（公式規定 2.3.1）--------------------------------------

/** 昇順の順位配列を辞書式比較（先頭が小さい＝上位。規定①最高順位→②入賞回数→③次点…と等価）。 */
export function compareTiebreak(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? Infinity;
    const y = b[i] ?? Infinity;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** total降順→タイブレーク。同じ並びなら同順位（実際はCAPCOM抽選）として扱う。 */
export function rankRows(rows, totalOf) {
  const sorted = [...rows].sort((a, b) => {
    const d = totalOf(b) - totalOf(a);
    if (d !== 0) return d;
    return compareTiebreak(a.placements, b.placements);
  });
  let prev = null;
  let prevRank = 0;
  sorted.forEach((row, i) => {
    const t = totalOf(row);
    const same = prev && totalOf(prev) === t && compareTiebreak(prev.placements, row.placements) === 0;
    row.rank = same ? prevRank : i + 1;
    row.rankTied = false;
    prev = row;
    prevRank = row.rank;
  });
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if ((sorted[i + 1] && sorted[i + 1].rank === r.rank) || (sorted[i - 1] && sorted[i - 1].rank === r.rank)) {
      r.rankTied = true;
    }
  }
  return sorted;
}

// ---- ライブデータの評価 ----------------------------------------------

/**
 * ライブデータ(GAS応答)→ entrant単位の状態。
 * live = { eventState, aliveCount, aliveIds:[], standings:[{id,tag,name,placement}] }
 * 返り値: Map<id, { state:'final'|'alive', placement, tag, name }>
 */
export function evaluateEntrants(live) {
  const out = new Map();
  if (!live) return out;
  const completed = String(live.eventState || "").toUpperCase() === "COMPLETED";
  const alive = new Set((live.aliveIds || []).map(String));
  const aliveCount = completed ? 0 : (live.aliveCount ?? alive.size);
  for (const s of live.standings || []) {
    const id = String(s.id);
    const placement = Number.isFinite(s.placement) ? s.placement : null;
    // 確定条件: 大会終了、または「生存者ではない」かつ、順位が生存者数の属するタイ順位帯の開始順位以上。
    // 順位は「17位タイ=17〜24位」のような帯なので、生存22人でも17位で敗退した人は確定でよい（22位より下とは限らない）。
    // 生存者でないのに帯より良い順位（例: 生存22人で暫定13位）の人は、次の試合が未作成なだけの勝ち上がりかもしれないので未確定にする。
    const final =
      placement != null && (completed || (!alive.has(id) && placement >= tiedStart(Math.max(aliveCount, 1))));
    out.set(id, { state: final ? "final" : "alive", placement, tag: s.tag, name: s.name });
  }
  for (const id of alive) {
    if (!out.has(id)) out.set(id, { state: "alive", placement: null, tag: null, name: null });
  }
  return out;
}

/**
 * 生存中の選手個別の最低保証ポイント。start.ggが出す暫定順位は「その選手が次に負けた場合の順位」
 * （例: TOP 24のルーザーズ1回戦に勝つと17位→13位に上がる）なので、生存者数からの一律の下限より
 * 良ければそちらを採る。暫定順位が不正（欠損・1位・生存者数を超える）なら一律の下限だけを使う。
 */
export function aliveFloorPoints(placement, aliveCount, rules) {
  const byCount = pointsForPlacement(tiedStart(Math.max(aliveCount, 2)), rules);
  if (!Number.isFinite(placement) || placement < 2 || placement > aliveCount) return byCount;
  return Math.max(byCount, pointsForPlacement(placement, rules));
}

/** 生存者の最低保証（今負けたら）と最大（準優勝=2位）のポイント。 */
export function aliveBounds(aliveCount, rules) {
  const worst = tiedStart(Math.max(aliveCount, 2));
  return { floor: pointsForPlacement(worst, rules), ceil: pointsForPlacement(2, rules) };
}

// ---- 行の構築 ---------------------------------------------------------

function makePlayerKey(name) {
  return normalizeTag(tagPart(name)) || normalizeTag(name);
}

/**
 * baseline + live + 手動上書き → 表示用の行。
 * opts: { baseline, config, live, overrides:{key:placement|null}, qualifiedExtra:{key:true|false} }
 */
export function buildRows({ baseline, config, live, overrides = {}, qualifiedExtra = {} }) {
  const rules = config.rules;
  const liveIdx = config.liveEvent.premierIndex;
  const entrants = evaluateEntrants(live);
  const completed = String(live?.eventState || "").toUpperCase() === "COMPLETED";
  const aliveCount = completed ? 0 : (live?.aliveCount ?? 0);
  const bounds = aliveBounds(aliveCount, rules);

  const qualKeys = new Set();
  for (const q of config.qualified.players) for (const k of nameKeys(q.tag)) qualKeys.add(k);

  const aliasMap = new Map();
  for (const [from, to] of Object.entries(config.aliases?.map || {})) {
    aliasMap.set(normalizeTag(from), normalizeTag(to));
  }

  // baseline行
  const rows = baseline.players.map((p) => {
    const keys = nameKeys(p.name);
    return {
      key: makePlayerKey(p.name),
      name: p.name,
      keys,
      isNew: false,
      baseRank: p.rank,
      events: [...p.events],
      baseTotal: p.events.reduce((s, v) => s + (v || 0), 0),
      evo: { state: "none", placement: null },
    };
  });

  // entrantとのマッチング（一意に決まる場合のみ）
  const byKey = new Map();
  for (const r of rows) for (const k of r.keys) byKey.set(k, [...(byKey.get(k) || []), r]);
  const unmatched = [];
  for (const [id, e] of entrants) {
    const ekeys = nameKeys(e.tag, e.name);
    for (const k of [...ekeys]) if (aliasMap.has(k)) ekeys.add(aliasMap.get(k));
    const cands = new Set();
    for (const k of ekeys) for (const r of byKey.get(k) || []) cands.add(r);
    if (cands.size === 1) {
      const r = [...cands][0];
      // 同一選手に複数entrantが当たった場合は良い順位を採用
      const cur = r.evo;
      const better = cur.state === "none" || (e.placement != null && (cur.placement == null || e.placement < cur.placement));
      if (better) r.evo = { state: e.state, placement: e.placement };
      r.entrantId = id;
    } else if (cands.size === 0) {
      unmatched.push({ id, e, ekeys });
    }
  }

  // ライブ取得済みなら、standingsに出ない選手は名簿で「参加したが早期敗退(0pt)」か「名簿に居ない」かを区別する。
  // 名簿に居ない選手は欠場の可能性が高いが名前の照合ミスの可能性もあるため、確定判定には使わず警告対象にする。
  if (live) {
    const roster = new Set();
    for (const t of live.roster || []) {
      for (const k of nameKeys(t)) {
        roster.add(k);
        if (aliasMap.has(k)) roster.add(aliasMap.get(k)); // start.ggの別表記 → baselineのタグ
      }
    }
    for (const r of rows) {
      if (r.evo.state !== "none") continue;
      const inRoster = [...r.keys].some((k) => roster.has(k));
      r.evo = inRoster ? { state: "final", placement: null, implied: true } : { state: "absent", placement: null };
    }
  }

  // baselineに居ない選手（ポイント無しからの新規）
  for (const { id, e, ekeys } of unmatched) {
    const interesting =
      (e.state === "final" && pointsForPlacement(e.placement, rules) > 0) ||
      (e.state === "final" && e.placement === 1) ||
      (e.state === "alive" && aliveCount > 0 && aliveCount <= rules.lastPlace);
    if (!interesting) continue;
    rows.push({
      key: "new:" + (makePlayerKey(e.tag || e.name) || id),
      name: e.name || e.tag || `entrant ${id}`,
      keys: ekeys,
      isNew: true,
      baseRank: null,
      events: [null, null, null, null, null, null, null, null],
      baseTotal: 0,
      evo: { state: e.state, placement: e.placement },
      entrantId: id,
    });
  }

  // 手動上書き（順位を直接指定→確定扱い）
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(overrides, r.key)) {
      const v = overrides[r.key];
      if (Number.isFinite(v)) r.evo = { state: "final", placement: v, manual: true };
    }
  }

  // 出場権保持（設定＋手動トグル）
  for (const r of rows) {
    let q = [...r.keys].some((k) => qualKeys.has(k));
    if (Object.prototype.hasOwnProperty.call(qualifiedExtra, r.key)) q = !!qualifiedExtra[r.key];
    r.qualified = q;
    r.qualifiedBy = q ? "prior" : null;
  }

  // 大会終了/順位確定後のPremier出場権（規定5.2: 既に出場権保持なら次順位へ繰り下げ）
  const finals = rows.filter((r) => r.evo.state === "final" && r.evo.placement != null);
  const premierDecided = finals.some((r) => r.evo.placement === 1);
  if (premierDecided) {
    const single = finals.filter((r) => r.evo.placement <= 4).sort((a, b) => a.evo.placement - b.evo.placement);
    const recipient = single.find((r) => !r.qualified);
    if (recipient) {
      recipient.qualified = true;
      recipient.qualifiedBy = "premier";
    }
  }

  // 各行のEVO France値・合計・順位配列
  for (const r of rows) {
    const evo = r.evo;
    let pts = 0;
    let floor = 0;
    let ceil = 0;
    if (evo.state === "final") {
      pts = pointsForPlacement(evo.placement, rules);
      floor = ceil = pts;
    } else if (evo.state === "alive") {
      floor = aliveFloorPoints(evo.placement, aliveCount, rules);
      ceil = bounds.ceil;
    } else if (evo.state === "none") {
      // ライブ未取得: 結果が全く分からないので上振れ余地は最大とみなす（確定判定を誤って出さない）
      ceil = bounds.ceil;
    }
    // "absent"（名簿に居ない）は0pt扱いだが、画面で警告表示する
    r.evoPoints = pts;
    r.evoFloor = floor;
    r.evoCeil = ceil;
    r.totals = {
      confirmed: r.baseTotal + (evo.state === "final" ? pts : 0),
      floor: r.baseTotal + floor,
      ceil: r.baseTotal + ceil,
    };
    const placements = r.events
      .map((p) => (p ? placementForPoints(p, rules) : null))
      .filter((x) => x != null);
    if (evo.state === "final" && evo.placement != null && (pts > 0 || evo.placement === 1)) placements.push(evo.placement);
    placements.sort((a, b) => a - b);
    r.placements = placements;
  }
  return { rows, aliveCount, bounds, premierDecided };
}

// ---- 出場権の判定 ----------------------------------------------------

/**
 * view別に順位付けし、Premierポイント枠(上位cupSlots名・出場権保持者除く)を判定する。
 * 各行に cup: 'in'|'out'、safety: 'locked'|'eliminated'|'contested'|'qualified' を付ける。
 */
export function judge(rows, config, view, { premierDecided = false } = {}) {
  const slots = config.cupSlots;
  // Premier出場権を得る人（優勝者、既に保持なら繰り下がり先）はポイント枠から1名抜ける。
  // 決定前は「上位の誰か1人が抜ける」可能性を見込んで圏外確定を判定する（決定後は既にqualifiedとして除外済み）。
  const leaveAllowance = premierDecided ? 0 : 1;
  const ranked = rankRows(rows, (r) => r.totals[view]);

  let n = 0;
  for (const r of ranked) {
    if (r.qualified) {
      r.cup = null;
    } else {
      n += 1;
      r.cup = n <= slots ? "in" : "out";
    }
  }

  const pool = rows.filter((r) => !r.qualified);
  for (const r of rows) {
    if (r.qualified) {
      r.safety = "qualified";
      continue;
    }
    // 確定圏内: 自分の最低合計以上の最大合計を持つ他者が slots-1 人以下
    // （同点は不利側に数える。他者が優勝して枠を空ける方向は自分に有利なので無視してよい）
    // 同点は、相手が生存中（順位が増えうる）か、タイブレークで相手が同等以上のときだけ脅威に数える
    const threats = pool.filter((o) => {
      if (o === r) return false;
      if (o.totals.ceil !== r.totals.floor) return o.totals.ceil > r.totals.floor;
      return o.evo.state === "alive" || compareTiebreak(o.placements, r.placements) <= 0;
    }).length;
    if (threats <= slots - 1) {
      r.safety = "locked";
      continue;
    }
    // 圏外確定: 自分の最大合計より真に上の他者（最低保証ベース）が、枠を空け得る1名を差し引いても slots 人以上
    // 同点は、双方の結果が確定済みでタイブレークで相手が明確に上のときだけ「上」に数える
    const above = pool.filter((o) => {
      if (o === r) return false;
      if (o.totals.floor !== r.totals.ceil) return o.totals.floor > r.totals.ceil;
      return o.evo.state !== "alive" && r.evo.state !== "alive" && compareTiebreak(o.placements, r.placements) < 0;
    }).length;
    const outOfPoints = above - leaveAllowance >= slots;
    // 生存中なら優勝（既に出場権を持つ選手が優勝した場合は準優勝以下への繰り下がり）でPremier出場権を得られるため、
    // ポイント枠が絶望でも「圏外確定」にはしない（winonly）。確定済みの敗退者だけが本当の圏外確定。
    r.safety = outOfPoints ? (r.evo.state === "alive" ? "winonly" : "eliminated") : "contested";
  }
  return ranked;
}

/** baseline単体の順位（順位変動表示用）。baselineRankMap: key→rank */
export function baselineRankMap(rows, rules) {
  const tmp = rows
    .filter((r) => !r.isNew)
    .map((r) => ({
      key: r.key,
      baseTotal: r.baseTotal,
      placements: r.events.map((p) => (p ? placementForPoints(p, rules) : null)).filter((x) => x != null).sort((a, b) => a - b),
    }));
  const ranked = rankRows(tmp, (r) => r.baseTotal);
  return new Map(ranked.map((r) => [r.key, r.rank]));
}

// ---- ライブデータの鮮度 ------------------------------------------------

/** GAS応答の経過時間と「古い」判定。中継が前回の応答を返した(stale)か、取得から一定時間たっていれば古い。 */
export function liveFreshness(live, nowMs, staleAfterSec = 180) {
  if (!live) return { ageSec: null, stale: false };
  const t = Date.parse(live.fetchedAt);
  const ageSec = Number.isFinite(t) ? Math.max(0, Math.round((nowMs - t) / 1000)) : null;
  return { ageSec, stale: !!live.stale || (ageSec != null && ageSec > staleAfterSec) };
}

/** 次の取得までの待ち時間(ms)。全員が同じ秒に取りに行かないよう±jitterRatioだけばらす。rand は 0〜1。 */
export function nextRefreshDelayMs(baseSec, rand = Math.random(), jitterRatio = 0.2, maxJitterSec = 10) {
  const base = Math.max(baseSec, 20) * 1000;
  const jitter = Math.min(base * jitterRatio, maxJitterSec * 1000);
  return Math.round(base + (rand * 2 - 1) * jitter);
}

/** URLに debug=1 が付いているときだけ、開発者向けの表示（名簿に見つからない選手の警告など）を出す。 */
export function isDebugMode(search) {
  try {
    return new URLSearchParams(search || "").get("debug") === "1";
  } catch {
    return false;
  }
}

/** 閲覧者向けの取得エラー文。技術的な原因（HTMLが返った、HTTPエラー等）は出さない（開発者は ?debug=1 で生の文言を見る）。 */
export function friendlyLiveError(hasPreviousData) {
  return hasPreviousData
    ? "データを一時的に取得できませんでした。自動で再試行します（前回のデータを表示しています）。"
    : "データを一時的に取得できませんでした。自動で再試行します。";
}
