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

  // 名前・IDをキーにしてオブジェクトへ値を入れる。`__proto__` のような特殊な名前でも、
  // 継承元を書き換えず、必ず自分自身のプロパティとして保存する（通常の代入だと値が消える）。
  function setOwn(obj, key, value) {
    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  }

  // グループIDに対応する種類の一覧（自分自身のプロパティだけを見る。無ければ空）。
  function typesOf(cat, groupId) {
    const t = cat && cat.types;
    return t && Object.prototype.hasOwnProperty.call(t, groupId) && Array.isArray(t[groupId]) ? t[groupId] : [];
  }

  function ok(extra) { return Object.assign({ ok: true }, extra); }
  function fail(error, extra) { return Object.assign({ ok: false, error }, extra); }

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
    Object.keys(PRESET_TYPES).forEach(k => { setOwn(cat.types, k, PRESET_TYPES[k].slice()); });
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
    setOwn(cat.types, gid, []);
    return ok({ id: gid });
  }

  function addType(cat, groupId, name) {
    if (!cat || !Array.isArray(cat.groups)) return fail('not-started');
    if (!cat.groups.some(g => g.id === groupId)) return fail('no-group');
    const nm = typeof name === 'string' ? name.trim() : '';
    if (!nm) return fail('empty');
    cat.types = cat.types || {};
    const list = typesOf(cat, groupId);
    setOwn(cat.types, groupId, list);
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
      if (!('t' in p) && !(next.g && typesOf(cat, next.g).includes(next.t))) next.t = '';
    }
    if ('t' in p) {
      const t = p.t == null ? '' : p.t;
      if (t !== '' && !(next.g && typesOf(cat, next.g).includes(t))) return fail('no-type');
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
    if ('b' in p) {
      // ブランドはカテゴリごとの一覧（cat.brands）から選ぶ。null は「未設定」（属性ごと外す）
      if (p.b !== null && !findBrand(cat, p.b)) return fail('no-brand');
      if (p.b === null) delete next.b; else next.b = p.b;
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
      const moved = cat.meta[oldName];
      delete cat.meta[oldName];
      setOwn(cat.meta, nn, moved);
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
    // 着数は1項目あたり上限がある。合計が超えるなら、黙って切り捨てずに、何も変えずに断る。
    const totalQty = metas.reduce((sum, m) => sum + m.q, 0);
    if (totalQty > MAX_QTY) return fail('qty-overflow', { total: totalQty });
    const base = existing !== undefined ? getMeta(cat, existing) : metas[0];
    const merged = Object.assign({}, base, { q: totalQty, r: metas.every(m => m.r) });
    // ブランドは、変更先（または一番前の統合元）の設定を使う。未設定なら、統合する服のうち最初に設定のあるものを引き継ぐ
    if (merged.b == null) {
      const withBrand = metas.find(m => m.b != null);
      if (withBrand) merged.b = withBrand.b; else delete merged.b;
    }

    const before = cat.items.slice(0, first).filter(n => !fold.has(n));
    const after = cat.items.slice(first).filter(n => !fold.has(n));
    cat.items = before.concat([finalName], after);

    if (hasMetaStore(cat)) {
      cat.meta = cat.meta || {};
      fold.forEach(n => { delete cat.meta[n]; });
      setOwn(cat.meta, finalName, merged);
    }
    const logsChanged = rewriteLogNames(state.logs, catId, fold, finalName);
    return ok({ name: finalName, merged: fold.size - (fold.has(finalName) ? 1 : 0), logsChanged, qty: totalQty });
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

  // 服を追加する。分類を始めているカテゴリでは、名前から推定した グループ・種類・季節 を設定する。
  // 同じ名前（全角・半角などの違いを含む）がすでにあれば断る。
  function addItem(cat, name) {
    if (!cat || !Array.isArray(cat.items)) return fail('no-cat');
    const nm = typeof name === 'string' ? name.trim() : '';
    if (!nm) return fail('empty');
    const clash = cat.items.find(n => normalizeName(n) === normalizeName(nm));
    if (clash !== undefined) return fail('exists', { existing: clash });
    cat.items.push(nm);
    const grouped = Array.isArray(cat.groups) && cat.groups.length > 0;
    const brand = matchBrandForName(cat, nm); // 登録済みのブランドが、名前の先頭などに含まれていれば、自動で設定する
    if (grouped || brand) {
      cat.meta = cat.meta || {};
      const meta = Object.assign({}, DEFAULT_META);
      if (grouped) {
        const g = guessItem(nm);
        if (g && cat.groups.some(x => x.id === g.g)) {
          meta.g = g.g;
          meta.s = g.s;
          if (typesOf(cat, g.g).includes(g.t)) meta.t = g.t;
        }
      }
      if (brand) meta.b = brand.id;
      setOwn(cat.meta, nm, meta);
    }
    return ok({ name: nm });
  }

  // 服の管理の対象になるカテゴリ。
  //   ・分類を始めたカテゴリ（groups がある）。種類をあとから変えても、服が空になっても対象のまま。
  //     （カテゴリの編集画面は、分類を始めたカテゴリの服の編集を「服の管理」へ案内するため、届かなくならないようにする）
  //   ・種類が「ファッション」で、服が1つ以上あるカテゴリ（これから分類を始める候補）。
  // 食事・サプリなどは、分類を始めていなければ対象外（初期のグループ「トップス／ボトムス／アウター」は服用のため）。
  function wardrobeCategories(state) {
    const started = c => Array.isArray(c.groups) && c.groups.length > 0;
    return state && Array.isArray(state.cats)
      ? state.cats.filter(c => c && Array.isArray(c.items) && (started(c) || (c.type === 'fashion' && c.items.length > 0)))
      : [];
  }

  // 記録画面で選べる服。手放した服は隠す（ただし、その日にすでに選ばれている服は残す）。
  function visibleItems(cat, selectedNames) {
    const items = cat && Array.isArray(cat.items) ? cat.items : [];
    const selected = new Set(Array.isArray(selectedNames) ? selectedNames : []);
    return items.filter(n => !getMeta(cat, n).r || selected.has(n));
  }

  // 現役の服（手放していない服）。バリエーション率やおすすめの対象。
  function activeItems(cat) {
    const items = cat && Array.isArray(cat.items) ? cat.items : [];
    return items.filter(n => !getMeta(cat, n).r);
  }

  function ownGet(obj, key, fallback) {
    return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
  }

  // 服の管理画面の一覧。絞り込み・並べ替えをして返す。
  //   opts: { q: 検索語, group: 'all'|'none'|グループID, brand: 'all'|'none'|ブランドID, status: 'active'|'gone'|'all',
  //           sort: 'order'|'name'|'group'|'type'|'brand'|'season'|'qty'|'status'|'count'|'last', dir: 'asc'|'desc' }
  function wardrobeRows(cat, logs, opts) {
    const o = Object.assign({ q: '', group: 'all', brand: 'all', status: 'active', sort: 'order', dir: 'asc' }, opts);
    if (!cat || !Array.isArray(cat.items)) return [];
    const counts = countUsage(logs, cat.id, null);
    const last = lastUsed(logs, cat.id);
    const q = normalizeName(o.q);
    let rows = cat.items.map((name, order) => {
      const m = getMeta(cat, name);
      return { name, order, g: m.g, t: m.t, b: m.b == null ? null : m.b, s: m.s, q: m.q, r: m.r, count: ownGet(counts, name, 0), last: ownGet(last, name, '') };
    });
    rows = rows.filter(r => {
      if (q && !normalizeName(r.name).includes(q)) return false;
      if (o.status === 'active' && r.r) return false;
      if (o.status === 'gone' && !r.r) return false;
      if (o.brand === 'none' && r.b != null) return false;
      if (o.brand !== 'all' && o.brand !== 'none' && r.b !== o.brand) return false;
      if (o.group === 'none') return r.g == null;
      if (o.group !== 'all') return r.g === o.group;
      return true;
    });
    // ブランド順：表示名（略称があれば略称）の五十音順。未設定は最後
    const brandRank = new Map((Array.isArray(cat.brands) ? cat.brands : [])
      .slice().sort((a, b) => brandText(a).localeCompare(brandText(b), 'ja')).map((b, i) => [b.id, i]));
    const groupIndex = new Map((Array.isArray(cat.groups) ? cat.groups : []).map((g, i) => [g.id, i]));
    const keyOf = {
      order: r => r.order,
      name: r => r.name,
      group: r => (r.g != null && groupIndex.has(r.g) ? groupIndex.get(r.g) : Infinity),
      type: r => r.t,
      brand: r => (r.b != null && brandRank.has(r.b) ? brandRank.get(r.b) : Infinity),
      season: r => SEASONS.indexOf(r.s),
      qty: r => r.q,
      status: r => (r.r ? 1 : 0),
      count: r => r.count,
      last: r => r.last
    }[o.sort] || (r => r.order);
    const sign = o.dir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const x = keyOf(a), y = keyOf(b);
      let c;
      if (typeof x === 'string' || typeof y === 'string') c = String(x).localeCompare(String(y), 'ja');
      else c = x === y ? 0 : (x < y ? -1 : 1);
      return c * sign || a.order - b.order;
    });
    return rows;
  }

  // 統合した場合の結果を、実際には変更せずに確認する（確認画面用）。
  function previewMerge(state, catId, sourceNames, targetName) {
    return mergeItems(JSON.parse(JSON.stringify(state)), catId, sourceNames, targetName);
  }

  /* ---------- ブランド（カテゴリごとの一覧。服に1つ付ける） ----------
   *   cat.brands : [{ id, name(正式名称), short(略称。任意) }]
   *   meta.b     : ブランドID（未設定なら属性なし）
   * 表や選択欄など狭いところは略称（あれば）、設定や絞り込みの一覧では正式名称を出す。
   * ---------------------------------------------------------------- */

  // 名前からの推定に使う、よく知られたブランド（正式名称と、名前に含まれやすい表記）。
  const BRAND_DICTIONARY = [
    { name: 'Nike', keys: ['ナイキ', 'nike'] },
    { name: 'New Balance', keys: ['ニューバランス', 'new balance', 'newbalance'] },
    { name: 'Cole Haan', keys: ['コールハーン', 'cole haan', 'colehaan'] },
    { name: 'THE NORTH FACE', keys: ['ノースフェース', 'ノースフェイス', 'north face', 'northface'] },
    { name: 'adidas', keys: ['アディダス', 'adidas'] },
    { name: 'PUMA', keys: ['プーマ', 'puma'] },
    { name: 'Converse', keys: ['コンバース', 'converse'] },
    { name: 'VANS', keys: ['バンズ', 'vans'] },
    { name: 'Champion', keys: ['チャンピオン', 'champion'] },
    { name: 'LACOSTE', keys: ['ラコステ', 'lacoste'] },
    { name: "Levi's", keys: ['リーバイス', "levi's", 'levis'] },
    { name: 'Theory', keys: ['セオリー', 'theory'] },
    { name: 'UNIQLO', keys: ['ユニクロ', 'uniqlo'] },
    { name: 'Ralph Lauren', keys: ['ラルフローレン', 'ralph lauren'] },
    { name: 'BEAMS', keys: ['ビームス', 'beams'] },
    { name: 'UNITED ARROWS', keys: ['ユナイテッドアローズ', 'united arrows'] },
    { name: 'Paul Smith', keys: ['ポールスミス', 'paul smith'] },
    { name: 'Tom Wood', keys: ['トムウッド', 'tom wood'] },
    { name: 'CASIO', keys: ['カシオ', 'casio', 'オシアナス', 'oceanus', 'ocw-', 'mtg-'] }, // OCW-・MTG- はカシオの型番
    { name: 'Google', keys: ['pixel watch'] },
    { name: 'G-SHOCK', keys: ['g-shock', 'gshock', 'ジーショック'] },
    { name: 'SEIKO', keys: ['セイコー', 'seiko'] },
    { name: 'CITIZEN', keys: ['シチズン', 'citizen'] }
  ];

  const isAscii = k => /^[\x00-\x7f]+$/.test(k);
  const escapeRe = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 辞書のキーが名前に含まれるか。英字のキーは、前が英数字でない位置（先頭や日本語の直後）だけを見る。
  function hasDictKey(n, key) {
    const k = normalizeName(key);
    return isAscii(k) ? new RegExp('(^|[^a-z0-9])' + escapeRe(k)).test(n) : n.includes(k);
  }

  function dictionaryBrand(name) {
    const n = normalizeName(name);
    if (!n) return null;
    return BRAND_DICTIONARY.find(e => e.keys.some(k => hasDictKey(n, k))) || null;
  }

  // 一覧・選択欄に出す表示名（略称があれば略称）。
  function brandText(brand) { return brand ? (brand.short || brand.name) : ''; }
  function brandLabel(cat, id) { return brandText(findBrand(cat, id)); }

  function findBrand(cat, id) {
    return (cat && Array.isArray(cat.brands) ? cat.brands.find(b => b && b.id === id) : undefined) || null;
  }

  // 正式名称または略称が label と同じブランド（全角・半角などの違いは同じとみなす）。
  function findBrandByLabel(cat, label) {
    const n = normalizeName(label);
    if (!n || !cat || !Array.isArray(cat.brands)) return null;
    return cat.brands.find(b => b && (normalizeName(b.name) === n || (b.short && normalizeName(b.short) === n))) || null;
  }

  // 名前と略称が、ほかのブランドの名前・略称と重ならないか。
  function brandConflict(cat, name, short, exceptId) {
    const taken = new Set();
    (cat.brands || []).forEach(b => {
      if (b.id === exceptId) return;
      taken.add(normalizeName(b.name));
      if (b.short) taken.add(normalizeName(b.short));
    });
    return taken.has(normalizeName(name)) || (!!short && taken.has(normalizeName(short)));
  }

  function addBrand(cat, name, short, id) {
    if (!cat || typeof cat !== 'object') return fail('no-cat');
    const nm = typeof name === 'string' ? name.trim() : '';
    if (!nm) return fail('empty');
    let sh = typeof short === 'string' ? short.trim() : '';
    if (normalizeName(sh) === normalizeName(nm)) sh = '';
    if (!Array.isArray(cat.brands)) cat.brands = [];
    if (brandConflict(cat, nm, sh, null)) return fail('duplicate');
    let bid = id;
    if (!bid) {
      let i = cat.brands.length + 1;
      while (cat.brands.some(b => b.id === 'b' + i)) i++;
      bid = 'b' + i;
    }
    if (cat.brands.some(b => b.id === bid)) return fail('duplicate-id');
    cat.brands.push({ id: bid, name: nm, short: sh });
    return ok({ id: bid });
  }

  // ブランドの正式名称・略称を変える。付いている服は、IDで結び付いているので、そのまま付け替わる。
  function updateBrand(cat, id, patch) {
    const b = findBrand(cat, id);
    if (!b) return fail('no-brand');
    const p = patch || {};
    const nm = 'name' in p ? (typeof p.name === 'string' ? p.name.trim() : '') : b.name;
    if (!nm) return fail('empty');
    let sh = 'short' in p ? (typeof p.short === 'string' ? p.short.trim() : '') : (b.short || '');
    if (normalizeName(sh) === normalizeName(nm)) sh = '';
    if (brandConflict(cat, nm, sh, id)) return fail('duplicate');
    b.name = nm;
    b.short = sh;
    return ok();
  }

  // ブランドごとの服の数（手放した服を含む）。
  function brandCounts(cat) {
    const counts = new Map();
    if (!cat || !cat.meta) return {};
    Object.keys(cat.meta).forEach(name => {
      const m = cat.meta[name];
      if (m && typeof m === 'object' && m.b != null) counts.set(m.b, (counts.get(m.b) || 0) + 1);
    });
    return Object.fromEntries(counts);
  }

  // 使っていないブランドだけ削除できる。
  function deleteBrand(cat, id) {
    if (!findBrand(cat, id)) return fail('no-brand');
    const n = ownGet(brandCounts(cat), id, 0);
    if (n > 0) return fail('used', { count: n });
    cat.brands = cat.brands.filter(b => b.id !== id);
    return ok();
  }

  // 登録済みのブランドのうち、名前に含まれているもの。ユーザーが付けた名前・略称は、英字なら名前の先頭、
  // 日本語なら名前のどこかに含まれていれば当てはまる（「Levi's 502 US」が略称「US」に当たらないよう、英字は先頭だけを見る）。
  // 辞書にあるブランドは、辞書の表記（ナイキ・nike など）でも当てはまる。
  function matchBrandForName(cat, name) {
    if (!cat || !Array.isArray(cat.brands) || !cat.brands.length) return null;
    const n = normalizeName(name);
    if (!n) return null;
    for (const b of cat.brands) {
      const labels = [b.name, b.short].filter(Boolean).map(normalizeName);
      for (const k of labels) {
        if (k.length < 2) continue;
        if (isAscii(k) ? n.startsWith(k) : n.includes(k)) return b;
      }
      const entry = BRAND_DICTIONARY.find(e => labels.includes(normalizeName(e.name)));
      if (entry && entry.keys.some(k => hasDictKey(n, k))) return b;
    }
    return null;
  }

  // 名前の先頭の英字（2文字以上）。例：「Theory長黒」→ Theory、「PS緑長T」→ PS。
  // ハイフンや数字の手前までを見る（型番「AB-1」「AB-2」を、同じ「AB」として数えるため）。
  function leadingLatin(name) {
    const raw = String(name == null ? '' : name).normalize('NFKC').trim();
    const m = /^[A-Za-z][A-Za-z'.&]*/.exec(raw);
    const t = m ? m[0].replace(/[.&']+$/, '') : '';
    return t.length >= 2 ? t : '';
  }

  // ブランド未設定の服に、名前からブランドの案を作る（cat は書き換えない）。
  //   ①登録済みのブランドが名前に含まれていれば、そのブランド
  //   ②辞書にあるブランドがあれば、その正式名称
  //   ③名前の先頭の英字が、同じカテゴリで2つ以上の服に共通していれば、その英字（1つだけの服は推定しない）
  // 戻り値: [{ name: 服の名前, brand: ブランド名, id: 登録済みなら ID / 未登録なら null }]
  function suggestBrands(cat) {
    if (!cat || !Array.isArray(cat.items)) return [];
    const counts = new Map();
    cat.items.forEach(n => {
      if (dictionaryBrand(n)) return;
      const t = leadingLatin(n).toLowerCase();
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    });
    const out = [];
    cat.items.forEach(n => {
      if (getMeta(cat, n).b != null) return;
      let existing = matchBrandForName(cat, n);
      let brand = existing ? existing.name : null;
      if (!brand) {
        const d = dictionaryBrand(n);
        if (d) brand = d.name;
        else {
          const t = leadingLatin(n);
          if (t && counts.get(t.toLowerCase()) >= 2) brand = t;
        }
        existing = brand ? findBrandByLabel(cat, brand) : null;
      }
      if (brand) out.push({ name: n, brand: existing ? existing.name : brand, id: existing ? existing.id : null });
    });
    return out;
  }

  // 推定案を適用する。未登録のブランドは、正式名称として登録する（略称は、あとで付けられる）。
  function applyBrands(cat, proposals) {
    let applied = 0, created = 0, skipped = 0;
    (proposals || []).forEach(p => {
      if (!p || typeof p.brand !== 'string' || !cat || !cat.items.includes(p.name)) { skipped++; return; }
      let b = findBrandByLabel(cat, p.brand);
      if (!b) {
        const r = addBrand(cat, p.brand, '');
        if (!r.ok) { skipped++; return; }
        b = findBrand(cat, r.id);
        created++;
      }
      if (setMeta(cat, p.name, { b: b.id }).ok) applied++; else skipped++;
    });
    return { applied, created, skipped };
  }

  // cat.brands の不正な値を直す。直した件数を返す。
  function repairBrands(cat) {
    if (cat.brands === undefined) return 0;
    let fixed = 0;
    if (!Array.isArray(cat.brands)) { cat.brands = []; return 1; }
    const seen = new Set();
    const clean = [];
    cat.brands.forEach(b => {
      const valid = b && typeof b === 'object' && !Array.isArray(b) && typeof b.id === 'string' && b.id && typeof b.name === 'string' && b.name.trim() && !seen.has(b.id);
      if (!valid) { fixed++; return; }
      seen.add(b.id);
      const short = typeof b.short === 'string' ? b.short : '';
      if (short !== b.short) fixed++;
      clean.push({ id: b.id, name: b.name, short });
    });
    cat.brands = clean;
    return fixed;
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
      if (!cat || typeof cat !== 'object') return;
      fixed += repairBrands(cat);
      if (cat.meta == null) return;
      // meta そのものが配列・オブジェクト以外なら、保存できる空のオブジェクトに直す
      if (typeof cat.meta !== 'object' || Array.isArray(cat.meta)) { cat.meta = {}; fixed++; return; }
      const items = Array.isArray(cat.items) ? cat.items : [];
      const groupIds = new Set((Array.isArray(cat.groups) ? cat.groups : []).map(g => g.id));
      const brandIds = new Set((Array.isArray(cat.brands) ? cat.brands : []).map(b => b.id));
      Object.keys(cat.meta).forEach(name => {
        if (!items.includes(name)) { delete cat.meta[name]; fixed++; return; }
        const m = cat.meta[name];
        // 配列は typeof が 'object' だが、g/t/s/q/r を持たせても JSON に保存されない。通常のオブジェクトに置き換える
        if (!m || typeof m !== 'object' || Array.isArray(m)) { setOwn(cat.meta, name, Object.assign({}, DEFAULT_META)); fixed++; return; }
        let touched = false;
        if (m.g != null && !groupIds.has(m.g)) { m.g = null; touched = true; }
        if (m.g == null && m.g !== null) { m.g = null; touched = true; }
        const typeList = m.g != null ? typesOf(cat, m.g) : [];
        if (typeof m.t !== 'string' || (m.t !== '' && !typeList.includes(m.t))) { m.t = ''; touched = true; }
        if (!SEASONS.includes(m.s)) { m.s = '通年'; touched = true; }
        if (!Number.isInteger(m.q) || m.q < 1 || m.q > MAX_QTY) { m.q = 1; touched = true; }
        if (typeof m.r !== 'boolean') { m.r = false; touched = true; }
        if ('b' in m && (m.b == null || !brandIds.has(m.b))) { delete m.b; touched = true; } // 存在しないブランドは外す
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
    renameItem, mergeItems, previewMerge, addItem, deleteItem, isItemUsed,
    visibleItems, activeItems, wardrobeRows, wardrobeCategories,
    // ブランド
    BRAND_DICTIONARY, brandText, brandLabel, findBrand, addBrand, updateBrand, deleteBrand, brandCounts,
    matchBrandForName, suggestBrands, applyBrands,
    // 期間別の集計
    shiftDate, periodRange, countUsage, lastUsed,
    // 元に戻す・修復
    pushSnapshot, popSnapshot, repairMeta
  };
});
