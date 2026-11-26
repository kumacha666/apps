// LifeLog のロジック（DOMに触れない純粋関数）。
// ブラウザでは <script src="logic.js"> で読み込み、グローバル `LifeLogLogic` として使う。
// Node（npm test）では require() で読み込む。クラシックスクリプトのまま使うため UMD 形式にしている。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LifeLogLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 記録の重複排除
   * ---------------------------------------------------------------- */

  // 配列から重複を取り除く（最初に出た順序を保つ）。
  function dedupeValues(values) {
    return Array.from(new Set(values));
  }

  // 保存時の選択内容を作る。チップで選んだ項目に、自由記入の項目を加える。
  // 自由記入がすでにチップで選ばれている場合は、二重に入れない。
  function mergeSelection(chipValues, free) {
    const vals = Array.isArray(chipValues) ? chipValues.slice() : [];
    const f = typeof free === 'string' ? free.trim() : '';
    if (f) vals.push(f);
    return dedupeValues(vals);
  }

  // 記録を開き直したときに、自由記入欄へ入れる初期値。
  // 項目リストにある名前はチップで表現されるので、自由記入欄には入れない。
  // （入れると、チップの選択を外しても保存時に自由記入から復活してしまう）
  function freePrefill(entry, items) {
    const free = entry && typeof entry.free === 'string' ? entry.free : '';
    if (!free) return '';
    return Array.isArray(items) && items.includes(free) ? '' : free;
  }

  // 過去の記録に入っている重複を取り除く。logs を直接書き換え、直した件数を返す。
  // 対象は v が配列の記録のみ（食事などの文字列の v には触れない）。
  function repairLogs(logs) {
    let fixed = 0;
    if (!logs || typeof logs !== 'object') return fixed;
    Object.keys(logs).forEach(date => {
      const day = logs[date];
      if (!day || typeof day !== 'object') return;
      Object.keys(day).forEach(catId => {
        const entry = day[catId];
        if (!entry || !Array.isArray(entry.v)) return;
        const unique = dedupeValues(entry.v);
        if (unique.length !== entry.v.length) {
          entry.v = unique;
          fixed++;
        }
      });
    });
    return fixed;
  }

  /* ------------------------------------------------------------------
   * 服の管理（グループ・種類・季節・着数・手放した）
   *
   * データの持ち方は「今の形に足すだけ」：
   *   cat.items  : 名前の配列（従来どおり。logs もこの名前で保存される）
   *   cat.groups : [{ id, name }]            ← 「分類を始める」を押したカテゴリのみ
   *   cat.types  : { [groupId]: [string] }   ← グループ内の「種類」（任意の小見出し）
   *   cat.meta   : { [名前]: { g, t, s, q, r } }
   *                g=グループID/null, t=種類/'', s=季節, q=着数(1以上), r=手放した
   * 旧バージョンは追加フィールドを読み飛ばすので、書き出し・取り込みもそのまま動く。
   * ---------------------------------------------------------------- */

  const SEASONS = ['夏', '冬', '通年'];
  const DEFAULT_META = Object.freeze({ g: null, t: '', s: '通年', q: 1, r: false });
  const MAX_QTY = 99;

  // 「分類を始める」で入れる初期のグループと種類。
  const PRESET_GROUPS = [
    { id: 'tp', name: 'トップス' },
    { id: 'bt', name: 'ボトムス' },
    { id: 'ot', name: 'アウター' }
  ];
  const PRESET_TYPES = {
    tp: ['半袖T', '長袖T', 'シャツ', 'パーカー', 'ニット', 'スウェット・フリース'],
    bt: ['ジーンズ', 'パンツ'],
    ot: ['ジャケット', 'ブルゾン・ジャンパー', 'コート・ダウン']
  };

  function ok(extra) { return Object.assign({ ok: true }, extra); }
  function fail(error, extra) { return Object.assign({ ok: false, error }, extra); }

  // 利用者が付けた名前（`__proto__` などを含む）も通常のキーとして安全に保存する。
  function setOwn(obj, key, value) {
    Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
  }

  // 全角・半角、大文字・小文字、前後の空白の違いを同じ名前として扱うための正規化。
  function normalizeName(s) {
    return String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();
  }

  function findCat(state, catId) {
    return state && Array.isArray(state.cats) ? state.cats.find(c => c && c.id === catId) || null : null;
  }

  // 名前から グループ・種類・季節 を推定する。判定できなければ null。
  // 戻り値のグループ・種類は PRESET_GROUPS / PRESET_TYPES に必ず含まれる。
  function guessItem(name) {
    const n = normalizeName(name);
    if (!n) return null;
    if (/ダウン|コート/.test(n)) return { g: 'ot', t: 'コート・ダウン', s: '冬' };
    if (/ブルゾン|ジャンパー|マウンテン/.test(n)) return { g: 'ot', t: 'ブルゾン・ジャンパー', s: '冬' };
    if (/ジャケット/.test(n)) return { g: 'ot', t: 'ジャケット', s: '通年' };
    // リーバイスの3桁のモデル番号（501・502 など）はジーンズ
    if (/ジーンズ|デニム|リーバイス|levi'?s\s*\d{3}/.test(n)) return { g: 'bt', t: 'ジーンズ', s: '通年' };
    if (/パンツ|パン|スラックス|チノ|カーゴ|ズボン|ショーツ/.test(n)) return { g: 'bt', t: 'パンツ', s: '通年' };
    if (/パーカー/.test(n)) return { g: 'tp', t: 'パーカー', s: '冬' };
    if (/ニット|セーター/.test(n)) return { g: 'tp', t: 'ニット', s: '冬' };
    if (/スウェット|トレーナー|フリース/.test(n)) return { g: 'tp', t: 'スウェット・フリース', s: '冬' };
    if (/長|ロンt/.test(n)) return { g: 'tp', t: '長袖T', s: '冬' };
    if (/半袖|tシャツ|ポロ|タンク/.test(n)) return { g: 'tp', t: '半袖T', s: '夏' };
    if (/シャツ/.test(n)) return { g: 'tp', t: 'シャツ', s: '通年' };
    return null;
  }

  // 服の属性を、未設定の項目は既定値で補って返す（cat は書き換えない）。
  function getMeta(cat, name) {
    const m = cat && cat.meta && Object.prototype.hasOwnProperty.call(cat.meta, name) ? cat.meta[name] : null;
    return Object.assign({}, DEFAULT_META, m || {});
  }

  function hasMetaStore(cat) {
    return !!(cat && (cat.meta || (Array.isArray(cat.groups) && cat.groups.length)));
  }

  // 「分類を始める」：このカテゴリでグループ・種類・服ごとの属性を使えるようにする。
  // 既存の服は、グループ未設定（g=null）の状態で始まる。
  function startGrouping(cat) {
    if (!cat || !Array.isArray(cat.items)) return fail('no-cat');
    if (Array.isArray(cat.groups) && cat.groups.length) return fail('already');
    cat.groups = PRESET_GROUPS.map(g => Object.assign({}, g));
    cat.types = {};
    Object.keys(PRESET_TYPES).forEach(k => { cat.types[k] = PRESET_TYPES[k].slice(); });
    cat.meta = cat.meta || {};
    cat.items.forEach(name => {
      if (!Object.prototype.hasOwnProperty.call(cat.meta, name)) setOwn(cat.meta, name, Object.assign({}, DEFAULT_META));
    });
    return ok();
  }

  function addGroup(cat, name, id) {
    if (!cat || !Array.isArray(cat.groups)) return fail('not-started');
    const nm = typeof name === 'string' ? name.trim() : '';
    if (!nm) return fail('empty');
    if (cat.groups.some(g => normalizeName(g.name) === normalizeName(nm))) return fail('duplicate');
    let gid = id;
    if (!gid) {
      let i = cat.groups.length + 1;
      while (cat.groups.some(g => g.id === 'g' + i)) i++;
      gid = 'g' + i;
    }
    if (cat.groups.some(g => g.id === gid)) return fail('duplicate-id');
    cat.groups.push({ id: gid, name: nm });
    cat.types = cat.types || {};
    cat.types[gid] = [];
    return ok({ id: gid });
  }

  function addType(cat, groupId, name) {
    if (!cat || !Array.isArray(cat.groups)) return fail('not-started');
    if (!cat.groups.some(g => g.id === groupId)) return fail('no-group');
    const nm = typeof name === 'string' ? name.trim() : '';
    if (!nm) return fail('empty');
    cat.types = cat.types || {};
    const list = cat.types[groupId] = cat.types[groupId] || [];
    if (list.some(t => normalizeName(t) === normalizeName(nm))) return fail('duplicate');
    list.push(nm);
    return ok();
  }

  // patch を現在の属性に適用した結果を検証して返す（cat は書き換えない）。
  function resolvePatch(cat, name, patch) {
    const cur = getMeta(cat, name);
    const next = Object.assign({}, cur);
    const p = patch || {};
    if ('g' in p) {
      if (p.g !== null && !(Array.isArray(cat.groups) && cat.groups.some(g => g.id === p.g))) return fail('no-group');
      next.g = p.g;
      // グループが変わって、今の種類が新しいグループに無ければ種類を外す（種類を同時に指定した場合は下で検証）
      if (!('t' in p) && !(next.g && (cat.types && cat.types[next.g] || []).includes(next.t))) next.t = '';
    }
    if ('t' in p) {
      const t = p.t == null ? '' : p.t;
      if (t !== '' && !(next.g && (cat.types && cat.types[next.g] || []).includes(t))) return fail('no-type');
      next.t = t;
    }
    if ('s' in p) {
      if (!SEASONS.includes(p.s)) return fail('bad-season');
      next.s = p.s;
    }
    if ('q' in p) {
      if (!Number.isInteger(p.q) || p.q < 1 || p.q > MAX_QTY) return fail('bad-qty');
      next.q = p.q;
    }
    if ('r' in p) {
      if (typeof p.r !== 'boolean') return fail('bad-retired');
      next.r = p.r;
    }
    return ok({ meta: next });
  }

  // 服の属性を設定する。検証に失敗したら何も変更しない。
  function setMeta(cat, name, patch) {
    if (!cat || !Array.isArray(cat.items) || !cat.items.includes(name)) return fail('no-item');
    const res = resolvePatch(cat, name, patch);
    if (!res.ok) return res;
    cat.meta = cat.meta || {};
    setOwn(cat.meta, name, res.meta);
    return ok();
  }

  // 複数の服にまとめて同じ変更を適用する。1つでも検証に失敗したら、全体を適用しない。
  function bulkSetMeta(cat, names, patch) {
    if (!cat || !Array.isArray(cat.items)) return fail('no-cat');
    const list = dedupeValues(Array.isArray(names) ? names : []);
    const planned = [];
    for (const name of list) {
      if (!cat.items.includes(name)) return fail('no-item', { name });
      const res = resolvePatch(cat, name, patch);
      if (!res.ok) return Object.assign(res, { name });
      planned.push([name, res.meta]);
    }
    cat.meta = cat.meta || {};
    planned.forEach(([name, meta]) => { setOwn(cat.meta, name, meta); });
    return ok({ changed: planned.length });
  }

  // 名前からの推定案を作る（cat は書き換えない）。グループ未設定の服だけが対象。
  function suggestMeta(cat) {
    if (!cat || !Array.isArray(cat.items)) return [];
    return cat.items
      .filter(name => getMeta(cat, name).g == null)
      .map(name => {
        const g = guessItem(name);
        return g ? { name, g: g.g, t: g.t, s: g.s } : { name, unresolved: true };
      });
  }

  // 推定案を適用する。グループ・種類が今のカテゴリに無い案は飛ばす。
  function applyMeta(cat, proposals) {
    let applied = 0;
    let skipped = 0;
    (proposals || []).forEach(p => {
      if (!p || p.unresolved) { skipped++; return; }
      const res = setMeta(cat, p.name, { g: p.g, t: p.t, s: p.s });
      if (res.ok) applied++; else skipped++;
    });
    return { applied, skipped };
  }

  /* ---------- 名前変更・統合・削除（過去の記録も付け替える） ---------- */

  // 過去の記録の中の名前を、names のどれかなら target に付け替える。変えた記録の件数を返す。
  function rewriteLogNames(logs, catId, names, target) {
    let changed = 0;
    if (!logs || typeof logs !== 'object') return changed;
    Object.keys(logs).forEach(date => {
      const day = logs[date];
      const entry = day && typeof day === 'object' ? day[catId] : null;
      if (!entry || typeof entry !== 'object') return;
      let touched = false;
      if (Array.isArray(entry.v)) {
        if (entry.v.some(x => names.has(x))) {
          entry.v = dedupeValues(entry.v.map(x => (names.has(x) ? target : x)));
          touched = true;
        }
      } else if (typeof entry.v === 'string' && names.has(entry.v)) {
        entry.v = target;
        touched = true;
      }
      if (typeof entry.free === 'string' && names.has(entry.free)) {
        entry.free = target;
        touched = true;
      }
      if (touched) changed++;
    });
    return changed;
  }

  // 名前を変える。過去の記録の名前も一緒に書き換える。
  // 変更先が別の既存の服と同じ名前なら、何も変えず { error: 'exists' } を返す（統合は mergeItems で行う）。
  function renameItem(state, catId, oldName, newName) {
    const cat = findCat(state, catId);
    if (!cat || !Array.isArray(cat.items)) return fail('no-cat');
    const idx = cat.items.indexOf(oldName);
    if (idx < 0) return fail('no-item');
    const nn = typeof newName === 'string' ? newName.trim() : '';
    if (!nn) return fail('empty');
    if (nn === oldName) return ok({ logsChanged: 0 });
    const clash = cat.items.find(n => n !== oldName && normalizeName(n) === normalizeName(nn));
    if (clash !== undefined) return fail('exists', { existing: clash });

    cat.items[idx] = nn;
    if (cat.meta && Object.prototype.hasOwnProperty.call(cat.meta, oldName)) {
      setOwn(cat.meta, nn, cat.meta[oldName]);
      delete cat.meta[oldName];
    }
    const logsChanged = rewriteLogNames(state.logs, catId, new Set([oldName]), nn);
    return ok({ logsChanged });
  }

  // 複数の服を1つに統合する。targetName は、統合元のどれか・既存の別の服・新しい名前のいずれでもよい。
  // 属性は targetName が既存の服ならその属性、新しい名前なら一番前の統合元の属性を使う。
  // 着数は合算し、全部が手放した服のときだけ手放した扱いにする。過去の記録は付け替え、同じ日の重複は1回にする。
  function mergeItems(state, catId, sourceNames, targetName) {
    const cat = findCat(state, catId);
    if (!cat || !Array.isArray(cat.items)) return fail('no-cat');
    const target = typeof targetName === 'string' ? targetName.trim() : '';
    if (!target) return fail('empty');
    const sources = dedupeValues(Array.isArray(sourceNames) ? sourceNames : []);
    if (!sources.length) return fail('no-item');
    if (!sources.every(n => cat.items.includes(n))) return fail('no-item');

    // 入力と完全に同じ名前の服があればそれを、無ければ全角・半角などの違いだけの服を、変更先にする
    const existing = cat.items.includes(target) ? target : cat.items.find(n => normalizeName(n) === normalizeName(target));
    const finalName = existing !== undefined ? existing : target;
    const fold = new Set(sources);
    if (existing !== undefined) fold.add(existing);

    const ordered = cat.items.filter(n => fold.has(n));
    const first = cat.items.indexOf(ordered[0]);
    const metas = ordered.map(n => getMeta(cat, n));
    const base = existing !== undefined ? getMeta(cat, existing) : metas[0];
    const merged = Object.assign({}, base, {
      q: Math.min(MAX_QTY, metas.reduce((sum, m) => sum + m.q, 0)),
      r: metas.every(m => m.r)
    });

    const before = cat.items.slice(0, first).filter(n => !fold.has(n));
    const after = cat.items.slice(first).filter(n => !fold.has(n));
    cat.items = before.concat([finalName], after);

    if (hasMetaStore(cat)) {
      cat.meta = cat.meta || {};
      fold.forEach(n => { delete cat.meta[n]; });
      setOwn(cat.meta, finalName, merged);
    }
    const logsChanged = rewriteLogNames(state.logs, catId, fold, finalName);
    return ok({ name: finalName, merged: fold.size - (fold.has(finalName) ? 1 : 0), logsChanged });
  }

  // 記録に1度でも使われている名前か（v と自由記入の両方を見る）。
  function isItemUsed(logs, catId, name) {
    if (!logs || typeof logs !== 'object') return false;
    return Object.keys(logs).some(date => {
      const day = logs[date];
      const entry = day && typeof day === 'object' ? day[catId] : null;
      if (!entry || typeof entry !== 'object') return false;
      if (Array.isArray(entry.v) && entry.v.includes(name)) return true;
      if (typeof entry.v === 'string' && entry.v === name) return true;
      return entry.free === name;
    });
  }

  // 服を削除する。記録のある服は削除できない（統計を残すため。手放した扱いにする）。
  function deleteItem(state, catId, name) {
    const cat = findCat(state, catId);
    if (!cat || !Array.isArray(cat.items)) return fail('no-cat');
    if (!cat.items.includes(name)) return fail('no-item');
    if (isItemUsed(state.logs, catId, name)) return fail('used');
    cat.items = cat.items.filter(n => n !== name);
    if (cat.meta) delete cat.meta[name];
    return ok();
  }

  /* ---------- 期間別の集計 ---------- */

  const PERIOD_DAYS = { '30d': 30, '90d': 90, '6m': 180, '1y': 365 };

  function pad2(n) { return String(n).padStart(2, '0'); }

  // 'YYYY-MM-DD' を日数ぶんずらす（夏時間などの影響を受けない UTC 計算）。
  function shiftDate(dateStr, days) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
  }

  // 集計期間（今日を含む直近 N 日）。'all' は null（期間の制限なし）。
  function periodRange(period, todayStr) {
    if (period === 'all') return null;
    const n = PERIOD_DAYS[period];
    if (!n) throw new RangeError('unknown period: ' + period);
    return { from: shiftDate(todayStr, -(n - 1)), to: todayStr };
  }

  function inRange(date, range) {
    return !range || (date >= range.from && date <= range.to);
  }

  function entryValues(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray(entry.v)) return dedupeValues(entry.v);
    if (typeof entry.v === 'string' && entry.v) return [entry.v];
    return [];
  }

  // 服ごとの着用回数（同じ日の重複は1回）。range が null なら全期間。
  function countUsage(logs, catId, range) {
    const counts = new Map();
    if (!logs || typeof logs !== 'object') return {};
    Object.keys(logs).forEach(date => {
      if (!inRange(date, range)) return;
      const day = logs[date];
      const entry = day && typeof day === 'object' ? day[catId] : null;
      entryValues(entry).forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
    });
    return Object.fromEntries(counts);
  }

  // 服ごとの最終着用日（全期間）。
  function lastUsed(logs, catId) {
    const last = new Map();
    if (!logs || typeof logs !== 'object') return {};
    Object.keys(logs).forEach(date => {
      const day = logs[date];
      const entry = day && typeof day === 'object' ? day[catId] : null;
      entryValues(entry).forEach(name => {
        if (!last.has(name) || last.get(name) < date) last.set(name, date);
      });
    });
    return Object.fromEntries(last);
  }

  /* ---------- 元に戻す（操作前の状態を保存） ---------- */

  // 操作の直前の状態をスタックに積む。古いものから捨てて max 件まで保つ。新しい配列を返す。
  function pushSnapshot(stack, state, label, now, max) {
    const limit = max == null ? 5 : max;
    const next = (Array.isArray(stack) ? stack : []).concat([{ ts: now == null ? Date.now() : now, label: label || '', json: JSON.stringify(state) }]);
    return next.slice(-limit);
  }

  // 直前の状態を取り出す。無ければ null。
  function popSnapshot(stack) {
    if (!Array.isArray(stack) || !stack.length) return null;
    const last = stack[stack.length - 1];
    return { state: JSON.parse(last.json), label: last.label, ts: last.ts, stack: stack.slice(0, -1) };
  }

  /* ---------- 取り込み・起動時の修復 ---------- */

  // cat.meta の不正な値を直す（取り込んだファイルの破損への備え）。直した件数を返す。
  function repairMeta(state) {
    let fixed = 0;
    if (!state || !Array.isArray(state.cats)) return fixed;
    state.cats.forEach(cat => {
      if (!cat || !cat.meta || typeof cat.meta !== 'object') return;
      const items = Array.isArray(cat.items) ? cat.items : [];
      const groupIds = new Set((Array.isArray(cat.groups) ? cat.groups : []).map(g => g.id));
      Object.keys(cat.meta).forEach(name => {
        if (!items.includes(name)) { delete cat.meta[name]; fixed++; return; }
        const m = cat.meta[name];
        if (!m || typeof m !== 'object') { setOwn(cat.meta, name, Object.assign({}, DEFAULT_META)); fixed++; return; }
        let touched = false;
        if (m.g != null && !groupIds.has(m.g)) { m.g = null; touched = true; }
        if (m.g == null && m.g !== null) { m.g = null; touched = true; }
        const typeList = m.g != null && cat.types && Array.isArray(cat.types[m.g]) ? cat.types[m.g] : [];
        if (typeof m.t !== 'string' || (m.t !== '' && !typeList.includes(m.t))) { m.t = ''; touched = true; }
        if (!SEASONS.includes(m.s)) { m.s = '通年'; touched = true; }
        if (!Number.isInteger(m.q) || m.q < 1 || m.q > MAX_QTY) { m.q = 1; touched = true; }
        if (typeof m.r !== 'boolean') { m.r = false; touched = true; }
        if (touched) fixed++;
      });
    });
    return fixed;
  }

  return {
    // 記録の重複排除
    dedupeValues, mergeSelection, freePrefill, repairLogs,
    // 服の管理
    SEASONS, PRESET_GROUPS, PRESET_TYPES,
    normalizeName, guessItem, getMeta, startGrouping, addGroup, addType,
    setMeta, bulkSetMeta, suggestMeta, applyMeta,
    renameItem, mergeItems, deleteItem, isItemUsed,
    // 期間別の集計
    shiftDate, periodRange, countUsage, lastUsed,
    // 元に戻す・修復
    pushSnapshot, popSnapshot, repairMeta
  };
});
