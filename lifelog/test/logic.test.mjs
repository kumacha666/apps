import { test } from 'node:test';
import assert from 'node:assert/strict';
import logic from '../logic.js';

const { dedupeValues, mergeSelection, freePrefill, repairLogs } = logic;

test('dedupeValues: 最初に出た順序を保って重複を除く', () => {
  assert.deepEqual(dedupeValues(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
  assert.deepEqual(dedupeValues([]), []);
});

test('mergeSelection: 自由記入がチップ選択と同じ名前でも二重に入らない', () => {
  // 実データで起きていた形：チップ選択＋自由記入に同じ名前
  assert.deepEqual(
    mergeSelection(['太ウォッシュドジーンズ', '白柄Tシャツ'], '白柄Tシャツ'),
    ['太ウォッシュドジーンズ', '白柄Tシャツ']
  );
});

test('mergeSelection: 自由記入が別の名前なら末尾に加わる', () => {
  assert.deepEqual(mergeSelection(['黒Tシャツ'], 'ダウンコート'), ['黒Tシャツ', 'ダウンコート']);
});

test('mergeSelection: 自由記入の前後の空白は除いて比較する', () => {
  assert.deepEqual(mergeSelection(['黒Tシャツ'], '  黒Tシャツ '), ['黒Tシャツ']);
});

test('mergeSelection: 自由記入が空・空白のみなら加えない', () => {
  assert.deepEqual(mergeSelection(['黒Tシャツ'], ''), ['黒Tシャツ']);
  assert.deepEqual(mergeSelection(['黒Tシャツ'], '   '), ['黒Tシャツ']);
  assert.deepEqual(mergeSelection([], ''), []);
});

test('mergeSelection: 入力配列を書き換えない', () => {
  const chips = ['黒Tシャツ'];
  mergeSelection(chips, 'ダウンコート');
  assert.deepEqual(chips, ['黒Tシャツ']);
});

test('freePrefill: 項目リストにある名前は自由記入欄に入れない（チップで表現されるため）', () => {
  assert.equal(freePrefill({ free: '白柄Tシャツ' }, ['黒Tシャツ', '白柄Tシャツ']), '');
});

test('freePrefill: 項目リストに無い名前は自由記入欄に残す', () => {
  assert.equal(freePrefill({ free: 'ダウンコート' }, ['黒Tシャツ']), 'ダウンコート');
});

test('freePrefill: 記録なし・free なし・items なしでも落ちない', () => {
  assert.equal(freePrefill(undefined, ['a']), '');
  assert.equal(freePrefill({}, ['a']), '');
  assert.equal(freePrefill({ free: 'x' }, undefined), 'x');
});

test('repairLogs: 重複を取り除き、直した件数を返す', () => {
  const logs = {
    '2026-06-28': {
      c1: { v: ['太ウォッシュドジーンズ', '白柄Tシャツ', '白柄Tシャツ'], free: '白柄Tシャツ' },
      c2: { v: ['黒ナイキ'], free: '' }
    },
    '2026-08-01': {
      c1: { v: ['太ジーンズ', 'クリームTシャツ', 'クリームTシャツ'], free: 'クリームTシャツ' }
    }
  };
  assert.equal(repairLogs(logs), 2);
  assert.deepEqual(logs['2026-06-28'].c1.v, ['太ウォッシュドジーンズ', '白柄Tシャツ']);
  assert.deepEqual(logs['2026-08-01'].c1.v, ['太ジーンズ', 'クリームTシャツ']);
  // 他の項目は変わらない
  assert.deepEqual(logs['2026-06-28'].c2.v, ['黒ナイキ']);
  assert.equal(logs['2026-06-28'].c1.free, '白柄Tシャツ');
});

test('repairLogs: 重複が無ければ何も変えず 0 を返す（再実行しても同じ）', () => {
  const logs = { '2026-06-16': { c1: { v: ['黒Tシャツ', '太ジーンズ'] } } };
  assert.equal(repairLogs(logs), 0);
  assert.deepEqual(logs['2026-06-16'].c1.v, ['黒Tシャツ', '太ジーンズ']);

  const dup = { d: { c: { v: ['a', 'a'] } } };
  assert.equal(repairLogs(dup), 1);
  assert.equal(repairLogs(dup), 0);
});

test('repairLogs: v が文字列・欠落・null の記録や不正な入力には触れず、落ちない', () => {
  const logs = {
    '2026-07-01': {
      food: { v: 'カレー', kcal: 500 },
      body: { wt: 65, v: undefined },
      nul: null
    },
    '2026-07-02': null
  };
  assert.equal(repairLogs(logs), 0);
  assert.equal(logs['2026-07-01'].food.v, 'カレー');
  assert.equal(repairLogs(null), 0);
  assert.equal(repairLogs(undefined), 0);
  assert.equal(repairLogs({}), 0);
});

/* ====================================================================
 * 服の管理（グループ・種類・季節・着数・手放した）
 * ================================================================== */

const L = logic;

// 合成データ。logs は { 日付: { catId: entry } }。
function makeState() {
  return {
    cats: [
      { id: 'c', name: 'コーデ', type: 'fashion', icon: '🧥', color: '#10b981',
        items: ['黒Tシャツ', 'ジーンズ', 'ダウンコート', '謎のアイテム', '白Tシャツ'], createdAt: 1 },
      { id: 'w', name: '腕時計', type: 'fashion', icon: '⌚', color: '#3b82f6', items: ['時計A'], createdAt: 2 }
    ],
    logs: {
      '2026-10-01': { c: { v: ['黒Tシャツ', 'ジーンズ'], free: '' }, w: { v: ['時計A'], free: '' } },
      '2026-10-05': { c: { v: ['白Tシャツ', 'ジーンズ'], free: '' } },
      '2026-11-20': { c: { v: ['ダウンコート', 'ジーンズ'], free: '' } },
      '2026-11-26': { c: { v: ['黒Tシャツ', '白Tシャツ'], free: '白Tシャツ' } }
    }
  };
}
const cat = (state, id = 'c') => state.cats.find(c => c.id === id);

test('normalizeName: 全角・半角・大文字小文字・前後の空白の違いを同じ名前とみなす', () => {
  assert.equal(L.normalizeName(' LACOSTE白長Ｔ '), L.normalizeName('lacoste白長t'));
  assert.notEqual(L.normalizeName('黒Tシャツ'), L.normalizeName('白Tシャツ'));
  assert.equal(L.normalizeName(null), '');
});

test('guessItem: 名前からグループ・種類・季節を推定する', () => {
  assert.deepEqual(L.guessItem('ダウンコート'), { g: 'ot', t: 'コート・ダウン', s: '冬' });
  assert.deepEqual(L.guessItem('ナイロンブルゾン'), { g: 'ot', t: 'ブルゾン・ジャンパー', s: '冬' });
  assert.deepEqual(L.guessItem('紺ジャケット'), { g: 'ot', t: 'ジャケット', s: '通年' });
  assert.deepEqual(L.guessItem('太ジーンズ'), { g: 'bt', t: 'ジーンズ', s: '通年' });
  assert.deepEqual(L.guessItem("Levi's 502 US"), { g: 'bt', t: 'ジーンズ', s: '通年' });
  assert.deepEqual(L.guessItem('Ｌｅｖｉ＇ｓ　５０１'), { g: 'bt', t: 'ジーンズ', s: '通年' });
  assert.equal(L.guessItem("Levi's ロゴ"), null); // モデル番号の無いリーバイスは判定しない
  assert.deepEqual(L.guessItem('グレースラックス'), { g: 'bt', t: 'パンツ', s: '通年' });
  assert.deepEqual(L.guessItem('カーゴパンツ'), { g: 'bt', t: 'パンツ', s: '通年' });
  // 「長」を含んでも、ボトムスは長袖Tにならない
  assert.deepEqual(L.guessItem('黒の長ズボン'), { g: 'bt', t: 'パンツ', s: '通年' });
  assert.deepEqual(L.guessItem('ロングパンツ'), { g: 'bt', t: 'パンツ', s: '通年' });
  assert.deepEqual(L.guessItem('白ショーツ'), { g: 'bt', t: 'パンツ', s: '通年' });
  assert.deepEqual(L.guessItem('黒パーカー'), { g: 'tp', t: 'パーカー', s: '冬' });
  assert.deepEqual(L.guessItem('ウールニット'), { g: 'tp', t: 'ニット', s: '冬' });
  assert.deepEqual(L.guessItem('長袖シャツ'), { g: 'tp', t: '長袖T', s: '冬' });
  assert.deepEqual(L.guessItem('黒Tシャツ'), { g: 'tp', t: '半袖T', s: '夏' });
  assert.deepEqual(L.guessItem('白ポロ'), { g: 'tp', t: '半袖T', s: '夏' });
  assert.deepEqual(L.guessItem('ネルシャツ'), { g: 'tp', t: 'シャツ', s: '通年' });
});

test('guessItem: 判定できない名前・空は null。全角の英字も推定できる', () => {
  assert.equal(L.guessItem('謎のアイテム'), null);
  assert.equal(L.guessItem(''), null);
  assert.equal(L.guessItem(undefined), null);
  assert.deepEqual(L.guessItem('ＬＡＣＯＳＴＥ白長Ｔ'), { g: 'tp', t: '長袖T', s: '冬' });
});

test('guessItem: 戻り値のグループ・種類は、必ず初期のグループ・種類に含まれる', () => {
  const names = ['ダウン', 'ブルゾン', 'ジャケット', 'ジーンズ', 'パンツ', 'パーカー', 'ニット', 'スウェット', '長袖', '半袖', 'シャツ'];
  names.forEach(n => {
    const g = L.guessItem(n);
    assert.ok(g, n);
    assert.ok(L.PRESET_GROUPS.some(x => x.id === g.g), n + ' group');
    assert.ok(L.PRESET_TYPES[g.g].includes(g.t), n + ' type');
    assert.ok(L.SEASONS.includes(g.s), n + ' season');
  });
});

test('getMeta: 未設定の服は既定値で返し、元のデータは書き換えない', () => {
  const c = cat(makeState());
  assert.deepEqual(L.getMeta(c, '黒Tシャツ'), { g: null, t: '', s: '通年', q: 1, r: false });
  assert.equal(c.meta, undefined);
  assert.deepEqual(L.getMeta(c, 'constructor'), { g: null, t: '', s: '通年', q: 1, r: false });
});

test('startGrouping: 初期のグループ・種類が入り、既存の服はグループ未設定で始まる', () => {
  const c = cat(makeState());
  assert.deepEqual(L.startGrouping(c), { ok: true });
  assert.deepEqual(c.groups.map(g => g.id), ['tp', 'bt', 'ot']);
  assert.ok(c.types.tp.includes('パーカー'));
  assert.equal(Object.keys(c.meta).length, c.items.length);
  assert.equal(c.meta['黒Tシャツ'].g, null);
  // 2回目は何もしない
  assert.deepEqual(L.startGrouping(c), { ok: false, error: 'already' });
  // 初期値はコピー（別のカテゴリに影響しない）
  c.types.tp.push('X');
  assert.ok(!L.PRESET_TYPES.tp.includes('X'));
});

test('addGroup / addType: 追加でき、同名（全角半角違い含む）は断る', () => {
  const c = cat(makeState());
  assert.equal(L.addGroup(c, '小物').error, 'not-started');
  L.startGrouping(c);
  const r = L.addGroup(c, '  小物 ');
  assert.equal(r.ok, true);
  assert.deepEqual(c.groups.at(-1), { id: r.id, name: '小物' });
  assert.deepEqual(c.types[r.id], []);
  assert.equal(L.addGroup(c, '小物').error, 'duplicate');
  assert.equal(L.addGroup(c, '').error, 'empty');
  assert.equal(L.addType(c, 'tp', 'タンクトップ').ok, true);
  assert.ok(c.types.tp.includes('タンクトップ'));
  assert.equal(L.addType(c, 'tp', 'ＴＥＥ').ok, true);
  assert.equal(L.addType(c, 'tp', 'tee').error, 'duplicate');
  assert.equal(L.addType(c, 'nope', 'x').error, 'no-group');
});

test('setMeta: 属性を設定できる。グループを変えると、合わない種類は外れる', () => {
  const c = cat(makeState());
  L.startGrouping(c);
  assert.equal(L.setMeta(c, '黒Tシャツ', { g: 'tp', t: '半袖T', s: '夏', q: 2 }).ok, true);
  assert.deepEqual(c.meta['黒Tシャツ'], { g: 'tp', t: '半袖T', s: '夏', q: 2, r: false });
  L.setMeta(c, '黒Tシャツ', { g: 'bt' });
  assert.equal(c.meta['黒Tシャツ'].g, 'bt');
  assert.equal(c.meta['黒Tシャツ'].t, '');
  // 同じ変更で種類も指定すれば検証したうえで保つ
  L.setMeta(c, '黒Tシャツ', { g: 'tp', t: 'シャツ' });
  assert.equal(c.meta['黒Tシャツ'].t, 'シャツ');
  L.setMeta(c, '黒Tシャツ', { r: true });
  assert.equal(c.meta['黒Tシャツ'].r, true);
});

test('setMeta: 不正な値は断り、何も変更しない', () => {
  const c = cat(makeState());
  L.startGrouping(c);
  L.setMeta(c, '黒Tシャツ', { g: 'tp', t: '半袖T', s: '夏' });
  const snap = JSON.stringify(c.meta);
  assert.equal(L.setMeta(c, '黒Tシャツ', { g: 'zzz' }).error, 'no-group');
  assert.equal(L.setMeta(c, '黒Tシャツ', { t: 'ブルゾン・ジャンパー' }).error, 'no-type');
  assert.equal(L.setMeta(c, '黒Tシャツ', { s: '春' }).error, 'bad-season');
  assert.equal(L.setMeta(c, '黒Tシャツ', { q: 0 }).error, 'bad-qty');
  assert.equal(L.setMeta(c, '黒Tシャツ', { q: 1.5 }).error, 'bad-qty');
  assert.equal(L.setMeta(c, '黒Tシャツ', { q: 100 }).error, 'bad-qty');
  assert.equal(L.setMeta(c, '黒Tシャツ', { r: 'yes' }).error, 'bad-retired');
  assert.equal(L.setMeta(c, 'ない服', { s: '夏' }).error, 'no-item');
  assert.equal(JSON.stringify(c.meta), snap);
});

test('setMeta: 分類を始めていないカテゴリにグループは設定できない（季節・着数・手放したは設定できる）', () => {
  const c = cat(makeState());
  assert.equal(L.setMeta(c, '黒Tシャツ', { g: 'tp' }).error, 'no-group');
  assert.equal(L.setMeta(c, '黒Tシャツ', { s: '夏', q: 2 }).ok, true);
});

test('bulkSetMeta: まとめて変更できる。1つでも失敗したら全体を適用しない', () => {
  const c = cat(makeState());
  L.startGrouping(c);
  assert.deepEqual(L.bulkSetMeta(c, ['黒Tシャツ', '白Tシャツ'], { g: 'tp', t: '半袖T', s: '夏' }), { ok: true, changed: 2 });
  assert.equal(c.meta['白Tシャツ'].t, '半袖T');
  const snap = JSON.stringify(c.meta);
  const bad = L.bulkSetMeta(c, ['黒Tシャツ', 'ない服'], { s: '冬' });
  assert.equal(bad.error, 'no-item');
  assert.equal(JSON.stringify(c.meta), snap);
  // 種類が、グループを変えない服にだけ合わない場合も全体を断る
  const bad2 = L.bulkSetMeta(c, ['黒Tシャツ', 'ジーンズ'], { t: '半袖T' });
  assert.equal(bad2.error, 'no-type');
  assert.equal(bad2.name, 'ジーンズ');
  assert.equal(JSON.stringify(c.meta), snap);
  // 同じ名前が重複して渡されても1回として数える
  assert.equal(L.bulkSetMeta(c, ['黒Tシャツ', '黒Tシャツ'], { q: 2 }).changed, 1);
});

test('suggestMeta / applyMeta: グループ未設定の服だけ推定し、判定できない服は飛ばす', () => {
  const c = cat(makeState());
  L.startGrouping(c);
  L.setMeta(c, '白Tシャツ', { g: 'tp', t: 'シャツ', s: '通年' }); // 設定済みの服は対象外
  const proposals = L.suggestMeta(c);
  assert.deepEqual(proposals.map(p => p.name), ['黒Tシャツ', 'ジーンズ', 'ダウンコート', '謎のアイテム']);
  assert.deepEqual(proposals.find(p => p.name === 'ダウンコート'), { name: 'ダウンコート', g: 'ot', t: 'コート・ダウン', s: '冬' });
  assert.deepEqual(proposals.find(p => p.name === '謎のアイテム'), { name: '謎のアイテム', unresolved: true });
  // 提案を作っただけでは変わらない
  assert.equal(c.meta['黒Tシャツ'].g, null);
  assert.deepEqual(L.applyMeta(c, proposals), { applied: 3, skipped: 1 });
  assert.equal(c.meta['ジーンズ'].g, 'bt');
  assert.equal(c.meta['謎のアイテム'].g, null);
  assert.equal(c.meta['白Tシャツ'].t, 'シャツ'); // 設定済みは変わらない
  // 適用後に再度作ると、残りは判定できなかった服だけ
  assert.deepEqual(L.suggestMeta(c).map(p => p.name), ['謎のアイテム']);
});

test('applyMeta: ユーザーが消した・無いグループの案は飛ばす', () => {
  const c = cat(makeState());
  L.startGrouping(c);
  c.groups = c.groups.filter(g => g.id !== 'ot');
  const r = L.applyMeta(c, [{ name: 'ダウンコート', g: 'ot', t: 'コート・ダウン', s: '冬' }]);
  assert.deepEqual(r, { applied: 0, skipped: 1 });
  assert.equal(c.meta['ダウンコート'].g, null);
});

test('renameItem: 項目・属性・過去の記録（v と自由記入）の名前を一緒に書き換える', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.setMeta(c, '白Tシャツ', { g: 'tp', t: '半袖T', s: '夏', q: 2 });
  const r = L.renameItem(st, 'c', '白Tシャツ', '白T');
  assert.deepEqual(r, { ok: true, logsChanged: 2 });
  assert.deepEqual(c.items, ['黒Tシャツ', 'ジーンズ', 'ダウンコート', '謎のアイテム', '白T']); // 位置は変わらない
  assert.equal(c.meta['白Tシャツ'], undefined);
  assert.deepEqual(c.meta['白T'], { g: 'tp', t: '半袖T', s: '夏', q: 2, r: false });
  assert.deepEqual(st.logs['2026-10-05'].c.v, ['白T', 'ジーンズ']);
  assert.deepEqual(st.logs['2026-11-26'].c.v, ['黒Tシャツ', '白T']);
  assert.equal(st.logs['2026-11-26'].c.free, '白T');
});

test('renameItem: 全角・半角だけの違いの名前変更はできる（自分自身とは衝突しない）', () => {
  const st = makeState();
  cat(st).items.push('LACOSTE白長Ｔ');
  st.logs['2026-11-01'] = { c: { v: ['LACOSTE白長Ｔ'], free: '' } };
  assert.equal(L.renameItem(st, 'c', 'LACOSTE白長Ｔ', 'LACOSTE白長T').ok, true);
  assert.ok(cat(st).items.includes('LACOSTE白長T'));
  assert.deepEqual(st.logs['2026-11-01'].c.v, ['LACOSTE白長T']);
});

test('renameItem: 変更先が別の既存の服と同じ名前なら、何も変えず exists を返す', () => {
  const st = makeState();
  const snap = JSON.stringify(st);
  const r = L.renameItem(st, 'c', '白Tシャツ', 'ジーンズ');
  assert.deepEqual(r, { ok: false, error: 'exists', existing: 'ジーンズ' });
  assert.equal(JSON.stringify(st), snap);
});

test('renameItem: 他のカテゴリの記録には触れない。不正な入力は断る', () => {
  const st = makeState();
  st.cats[1].items.push('黒Tシャツ'); // 別カテゴリに同名の服
  st.logs['2026-10-01'].w.v.push('黒Tシャツ');
  L.renameItem(st, 'c', '黒Tシャツ', '黒T');
  assert.deepEqual(st.logs['2026-10-01'].w.v, ['時計A', '黒Tシャツ']);
  assert.deepEqual(st.logs['2026-10-01'].c.v, ['黒T', 'ジーンズ']);
  assert.equal(L.renameItem(st, 'c', 'ない服', 'x').error, 'no-item');
  assert.equal(L.renameItem(st, 'c', '黒T', '  ').error, 'empty');
  assert.equal(L.renameItem(st, 'zzz', '黒T', 'x').error, 'no-cat');
  assert.deepEqual(L.renameItem(st, 'c', '黒T', ' 黒T '), { ok: true, logsChanged: 0 });
});

test('mergeItems: 2つを1つに統合し、記録を付け替え、同じ日の重複を1回にする', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.setMeta(c, '黒Tシャツ', { g: 'tp', t: '半袖T', s: '夏', q: 1 });
  L.setMeta(c, '白Tシャツ', { g: 'tp', t: '半袖T', s: '夏', q: 2 });
  // 同じ日に両方ある記録を作る
  st.logs['2026-11-26'].c.v = ['黒Tシャツ', '白Tシャツ'];
  const r = L.mergeItems(st, 'c', ['黒Tシャツ', '白Tシャツ'], '黒Tシャツ');
  assert.deepEqual(r, { ok: true, name: '黒Tシャツ', merged: 1, logsChanged: 3, qty: 3 });
  assert.deepEqual(c.items, ['黒Tシャツ', 'ジーンズ', 'ダウンコート', '謎のアイテム']);
  assert.deepEqual(c.meta['黒Tシャツ'], { g: 'tp', t: '半袖T', s: '夏', q: 3, r: false }); // 着数は合算
  assert.equal(c.meta['白Tシャツ'], undefined);
  assert.deepEqual(st.logs['2026-10-05'].c.v, ['黒Tシャツ', 'ジーンズ']);
  assert.deepEqual(st.logs['2026-11-26'].c.v, ['黒Tシャツ']); // 同じ日は1回
  assert.equal(st.logs['2026-11-26'].c.free, '黒Tシャツ');
});

test('mergeItems: 統合後の着用回数は、元の服の合計から同じ日の重複を除いたもの', () => {
  const st = makeState();
  st.logs['2026-11-26'].c.v = ['黒Tシャツ', '白Tシャツ'];
  const before = L.countUsage(st.logs, 'c', null);
  L.mergeItems(st, 'c', ['黒Tシャツ', '白Tシャツ'], '黒Tシャツ');
  const after = L.countUsage(st.logs, 'c', null);
  // 黒: 10/1, 11/26  白: 10/5, 11/26 → 日付は 10/1, 10/5, 11/26 の3日
  assert.equal(before['黒Tシャツ'] + before['白Tシャツ'], 4);
  assert.equal(after['黒Tシャツ'], 3);
  assert.equal(after['白Tシャツ'], undefined);
});

test('mergeItems: 変更先は新しい名前でもよい（属性は一番前の統合元から引き継ぐ）', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.setMeta(c, '黒Tシャツ', { g: 'tp', t: '半袖T', s: '夏' });
  const r = L.mergeItems(st, 'c', ['白Tシャツ', '黒Tシャツ'], '無地T');
  assert.equal(r.ok, true);
  assert.equal(r.name, '無地T');
  assert.equal(r.merged, 2);
  assert.deepEqual(c.items, ['無地T', 'ジーンズ', 'ダウンコート', '謎のアイテム']); // 位置は統合元の一番前
  assert.equal(c.meta['無地T'].t, '半袖T'); // 黒Tシャツは items の前にあるので、その属性
  assert.equal(c.meta['無地T'].q, 2);
  assert.deepEqual(st.logs['2026-10-01'].c.v, ['無地T', 'ジーンズ']);
});

test('mergeItems: 変更先が統合元に含まれない既存の服なら、その服の属性を使って取り込む', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.setMeta(c, 'ジーンズ', { g: 'bt', t: 'ジーンズ', s: '通年' });
  L.setMeta(c, '黒Tシャツ', { g: 'tp', t: '半袖T', s: '夏' });
  const r = L.mergeItems(st, 'c', ['黒Tシャツ'], 'ジーンズ');
  assert.equal(r.name, 'ジーンズ');
  assert.equal(c.meta['ジーンズ'].g, 'bt');
  assert.equal(c.meta['ジーンズ'].q, 2);
  assert.ok(!c.items.includes('黒Tシャツ'));
  assert.deepEqual(st.logs['2026-10-01'].c.v, ['ジーンズ']); // 黒Tシャツ+ジーンズ → 1回
});

test('mergeItems: 全部が手放した服のときだけ手放した扱いになる', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.setMeta(c, '黒Tシャツ', { r: true });
  L.setMeta(c, '白Tシャツ', { r: true });
  L.mergeItems(st, 'c', ['黒Tシャツ', '白Tシャツ'], '黒Tシャツ');
  assert.equal(c.meta['黒Tシャツ'].r, true);

  const st2 = makeState();
  const c2 = cat(st2);
  L.startGrouping(c2);
  L.setMeta(c2, '黒Tシャツ', { r: true });
  L.mergeItems(st2, 'c', ['黒Tシャツ', '白Tシャツ'], '黒Tシャツ');
  assert.equal(c2.meta['黒Tシャツ'].r, false);
});

test('mergeItems: 不正な入力は断り、何も変更しない', () => {
  const st = makeState();
  const snap = JSON.stringify(st);
  assert.equal(L.mergeItems(st, 'c', ['ない服'], 'x').error, 'no-item');
  assert.equal(L.mergeItems(st, 'c', [], 'x').error, 'no-item');
  assert.equal(L.mergeItems(st, 'c', ['黒Tシャツ'], ' ').error, 'empty');
  assert.equal(L.mergeItems(st, 'zzz', ['黒Tシャツ'], 'x').error, 'no-cat');
  assert.equal(JSON.stringify(st), snap);
});

test('mergeItems: 分類を始めていないカテゴリでも名前と記録を統合できる（属性は作らない）', () => {
  const st = makeState();
  const r = L.mergeItems(st, 'c', ['黒Tシャツ', '白Tシャツ'], '黒Tシャツ');
  assert.equal(r.ok, true);
  assert.equal(cat(st).meta, undefined);
});

test('deleteItem: 一度も使っていない服だけ削除できる', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  assert.equal(L.deleteItem(st, 'c', '謎のアイテム').ok, true);
  assert.ok(!c.items.includes('謎のアイテム'));
  assert.equal(c.meta['謎のアイテム'], undefined);
  // 記録のある服は断る（v に入っている）
  assert.equal(L.deleteItem(st, 'c', '黒Tシャツ').error, 'used');
  assert.ok(c.items.includes('黒Tシャツ'));
  // 自由記入にだけ入っている服も「使われている」
  st.logs['2026-12-01'] = { c: { v: [], free: '自由な服' } };
  c.items.push('自由な服');
  assert.equal(L.deleteItem(st, 'c', '自由な服').error, 'used');
  assert.equal(L.deleteItem(st, 'c', 'ない服').error, 'no-item');
});

test('shiftDate: 月・年をまたいでも正しく、夏時間などの影響を受けない', () => {
  assert.equal(L.shiftDate('2026-11-26', -29), '2026-10-28');
  assert.equal(L.shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(L.shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(L.shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(L.shiftDate('2026-12-31', 1), '2027-01-01');
});

test('periodRange: 今日を含む直近N日。all は制限なし。不明な期間は例外', () => {
  assert.deepEqual(L.periodRange('30d', '2026-11-26'), { from: '2026-10-28', to: '2026-11-26' });
  assert.deepEqual(L.periodRange('90d', '2026-11-26'), { from: '2026-08-29', to: '2026-11-26' }); // 既存のインサイトの90日と同じ窓
  assert.deepEqual(L.periodRange('6m', '2026-11-26'), { from: '2026-05-31', to: '2026-11-26' });
  assert.deepEqual(L.periodRange('1y', '2026-11-26'), { from: '2025-11-27', to: '2026-11-26' });
  assert.equal(L.periodRange('all', '2026-11-26'), null);
  assert.throws(() => L.periodRange('2w', '2026-11-26'), RangeError);
});

test('countUsage: 期間を絞って数える。範囲の端の日を含む。全期間は null', () => {
  const st = makeState();
  const all = L.countUsage(st.logs, 'c', null);
  assert.equal(all['ジーンズ'], 3);
  assert.equal(all['黒Tシャツ'], 2);
  const recent = L.countUsage(st.logs, 'c', { from: '2026-11-20', to: '2026-11-26' });
  assert.equal(recent['ジーンズ'], 1);
  assert.equal(recent['ダウンコート'], 1);
  assert.equal(recent['黒Tシャツ'], 1);
  assert.equal(recent['白Tシャツ'], 1);
  assert.equal(L.countUsage(st.logs, 'c', { from: '2026-11-27', to: '2026-12-31' })['ジーンズ'], undefined);
});

test('countUsage: 同じ日に同じ服が2回入っていても1回。他のカテゴリ・不正な記録は無視', () => {
  const logs = {
    '2026-11-01': { c: { v: ['A', 'A', 'B'] }, w: { v: ['A'] } },
    '2026-11-02': { c: { v: 'C' }, x: null },
    '2026-11-03': null,
    '2026-11-04': { c: { note: 'メモのみ' } }
  };
  assert.deepEqual(L.countUsage(logs, 'c', null), { A: 1, B: 1, C: 1 });
  assert.deepEqual(L.countUsage(undefined, 'c', null), {});
  // 名前が Object のプロパティ名と同じでも数えられる
  assert.equal(L.countUsage({ d: { c: { v: ['constructor', '__proto__'] } } }, 'c', null)['constructor'], 1);
});

test('lastUsed: 服ごとの最終着用日（全期間）', () => {
  const st = makeState();
  const last = L.lastUsed(st.logs, 'c');
  assert.equal(last['ジーンズ'], '2026-11-20');
  assert.equal(last['黒Tシャツ'], '2026-11-26');
  assert.equal(last['謎のアイテム'], undefined);
});

test('pushSnapshot / popSnapshot: 直前の状態に戻せる。件数の上限を超えたら古い方を捨てる', () => {
  const st = makeState();
  let stack = L.pushSnapshot([], st, '名前変更', 1000);
  L.renameItem(st, 'c', '白Tシャツ', '白T');
  assert.ok(cat(st).items.includes('白T'));
  const popped = L.popSnapshot(stack);
  assert.equal(popped.label, '名前変更');
  assert.equal(popped.ts, 1000);
  assert.deepEqual(popped.state, makeState()); // 操作前の状態
  assert.deepEqual(popped.stack, []);
  assert.equal(L.popSnapshot([]), null);
  assert.equal(L.popSnapshot(undefined), null);
  // 上限
  let s = [];
  for (let i = 0; i < 7; i++) s = L.pushSnapshot(s, { n: i }, 'op' + i, i, 5);
  assert.equal(s.length, 5);
  assert.deepEqual(s.map(x => x.label), ['op2', 'op3', 'op4', 'op5', 'op6']);
  // 入力のスタックは書き換えない
  const s0 = [];
  L.pushSnapshot(s0, st, 'x', 1);
  assert.equal(s0.length, 0);
});

test('repairMeta: 不正な属性を直し、items に無い属性を捨てる。正常なら 0', () => {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.setMeta(c, '黒Tシャツ', { g: 'tp', t: '半袖T', s: '夏', q: 2 });
  assert.equal(L.repairMeta(st), 0);

  c.meta['黒Tシャツ'].g = 'zzz';
  c.meta['白Tシャツ'] = { g: 'tp', t: 'ない種類', s: '春', q: 0, r: 'x' };
  c.meta['消えた服'] = { g: null, t: '', s: '夏', q: 1, r: false };
  c.meta['ジーンズ'] = null;
  const fixed = L.repairMeta(st);
  assert.equal(fixed, 4);
  assert.deepEqual(c.meta['黒Tシャツ'], { g: null, t: '', s: '夏', q: 2, r: false });
  assert.deepEqual(c.meta['白Tシャツ'], { g: 'tp', t: '', s: '通年', q: 1, r: false });
  assert.equal(c.meta['消えた服'], undefined);
  assert.deepEqual(c.meta['ジーンズ'], { g: null, t: '', s: '通年', q: 1, r: false });
  assert.equal(L.repairMeta(st), 0); // 冪等
});

test('repairMeta: meta の無いカテゴリ・不正な state でも落ちない', () => {
  assert.equal(L.repairMeta(makeState()), 0);
  assert.equal(L.repairMeta(null), 0);
  assert.equal(L.repairMeta({}), 0);
  // meta が無い・null のカテゴリは対象外（meta が配列・文字列などの不正な型の場合は、別のテストで空のオブジェクトに直す）
  assert.equal(L.repairMeta({ cats: [null, {}, { meta: null }, { meta: undefined }] }), 0);
});

test('mergeItems: 変更先と完全に同じ名前の服があれば、全角・半角違いの別の服ではなくそちらを使う', () => {
  const st = {
    cats: [{ id: 'c', name: 'コーデ', type: 'fashion', items: ['Ｔ白', 'T白', 'X'] }],
    logs: { '2026-11-01': { c: { v: ['X'] } }, '2026-11-02': { c: { v: ['Ｔ白'] } } }
  };
  const r = L.mergeItems(st, 'c', ['X'], 'T白');
  assert.equal(r.name, 'T白');
  assert.deepEqual(st.cats[0].items, ['Ｔ白', 'T白']); // 全角の別の服は巻き込まない
  assert.deepEqual(st.logs['2026-11-01'].c.v, ['T白']);
  assert.deepEqual(st.logs['2026-11-02'].c.v, ['Ｔ白']);
});

test('mergeItems: 全角・半角だけが違う名前を変更先にすると、その既存の服に統合する（似た名前の服を増やさない）', () => {
  const st = {
    cats: [{ id: 'c', name: 'コーデ', type: 'fashion', items: ['LACOSTE白長Ｔ', 'X'] }],
    logs: { '2026-11-01': { c: { v: ['X'] } } }
  };
  const r = L.mergeItems(st, 'c', ['X'], 'LACOSTE白長T');
  assert.equal(r.name, 'LACOSTE白長Ｔ');
  assert.deepEqual(st.cats[0].items, ['LACOSTE白長Ｔ']);
  assert.deepEqual(st.logs['2026-11-01'].c.v, ['LACOSTE白長Ｔ']);
});

/* ---- 特殊な名前（__proto__ など）でも属性が消えない ---- */

function protoState() {
  return {
    cats: [{ id: 'c', name: 'コーデ', type: 'fashion', items: ['__proto__', 'constructor', '黒T'] }],
    logs: { '2026-11-01': { c: { v: ['__proto__'], free: '' } } }
  };
}

test('特殊な名前: startGrouping / setMeta で、__proto__ の服の属性が保存され、継承元も汚染されない', () => {
  const st = protoState();
  const c = st.cats[0];
  L.startGrouping(c);
  assert.ok(Object.prototype.hasOwnProperty.call(c.meta, '__proto__'));
  assert.equal(L.setMeta(c, '__proto__', { g: 'tp', t: '半袖T', s: '夏', q: 2 }).ok, true);
  assert.deepEqual(L.getMeta(c, '__proto__'), { g: 'tp', t: '半袖T', s: '夏', q: 2, r: false });
  assert.equal(Object.getPrototypeOf(c.meta), Object.prototype);
  assert.deepEqual(L.getMeta(c, 'constructor'), { g: null, t: '', s: '通年', q: 1, r: false });
  // JSON の書き出し・読み込みを往復しても保持される
  const round = JSON.parse(JSON.stringify(st));
  assert.deepEqual(L.getMeta(round.cats[0], '__proto__'), { g: 'tp', t: '半袖T', s: '夏', q: 2, r: false });
});

test('特殊な名前: bulkSetMeta / renameItem / mergeItems / repairMeta でも属性が保存される', () => {
  const st = protoState();
  const c = st.cats[0];
  L.startGrouping(c);
  L.bulkSetMeta(c, ['__proto__', '黒T'], { g: 'tp', s: '冬' });
  assert.equal(L.getMeta(c, '__proto__').s, '冬');
  // 名前変更で __proto__ にする
  assert.equal(L.renameItem(st, 'c', '黒T', 'a').ok, true);
  assert.equal(L.setMeta(c, 'a', { q: 3 }).ok, true);
  c.items.push('b');
  L.setMeta(c, 'b', { q: 2 });
  // 統合先が __proto__ の服
  const r = L.mergeItems(st, 'c', ['a', 'b'], '__proto__');
  assert.equal(r.ok, true);
  assert.equal(r.name, '__proto__');
  assert.equal(L.getMeta(c, '__proto__').q, 1 + 3 + 2);
  assert.equal(Object.getPrototypeOf(c.meta), Object.prototype);
  // 名前変更の先が __proto__
  c.items.push('z');
  L.setMeta(c, 'z', { q: 4, s: '夏' });
  c.items = c.items.filter(n => n !== '__proto__');
  delete c.meta['__proto__'];
  assert.equal(L.renameItem(st, 'c', 'z', '__proto__').ok, true);
  assert.deepEqual(L.getMeta(c, '__proto__'), { g: null, t: '', s: '夏', q: 4, r: false });
  // repairMeta は __proto__ の属性を壊さず、不正な値だけを直す
  assert.equal(L.repairMeta(st), 0);
  c.meta['__proto__'].s = '春';
  assert.equal(L.repairMeta(st), 1);
  assert.equal(L.getMeta(c, '__proto__').s, '通年');
});

test('特殊な名前: __proto__ という名前のグループIDにも種類を保存できる', () => {
  const c = { id: 'c', name: 'コーデ', type: 'fashion', items: ['黒T'] };
  L.startGrouping(c);
  assert.equal(L.addGroup(c, '特殊', '__proto__').ok, true);
  assert.equal(L.addType(c, '__proto__', '種類A').ok, true);
  assert.deepEqual(L.addType(c, '__proto__', '種類A'), { ok: false, error: 'duplicate' });
  assert.ok(Object.prototype.hasOwnProperty.call(c.types, '__proto__'));
  assert.deepEqual(c.types['__proto__'], ['種類A']);
  assert.equal(L.setMeta(c, '黒T', { g: '__proto__', t: '種類A' }).ok, true);
  assert.equal(Object.getPrototypeOf(c.types), Object.prototype);
  // 種類の一覧を持たない（取り込んだデータなど）グループIDでも、例外にならず種類なしとして扱う
  const d = { id: 'd', name: 'x', type: 'fashion', items: ['a'], groups: [{ id: '__proto__', name: 'P' }], types: {} };
  assert.equal(L.setMeta(d, 'a', { g: '__proto__', t: 'T' }).error, 'no-type');
  assert.equal(L.setMeta(d, 'a', { g: '__proto__' }).ok, true);
});

/* ---- レビュー指摘への回帰テスト ---- */

test('mergeItems: 合計の着数が上限（99）を超える統合は、何も変えずに断る（黙って切り捨てない）', () => {
  const st = {
    cats: [{ id: 'c', name: 'コーデ', type: 'fashion', items: ['服A', '服B'], meta: {
      '服A': { g: null, t: '', s: '通年', q: 60, r: false },
      '服B': { g: null, t: '', s: '通年', q: 50, r: false } } }],
    logs: { '2026-11-01': { c: { v: ['服B'], free: '' } } }
  };
  const snap = JSON.stringify(st);
  const r = L.mergeItems(st, 'c', ['服A', '服B'], '服A');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'qty-overflow');
  assert.equal(JSON.stringify(st), snap); // items・meta・logs のどれも変わらない
});

test('mergeItems: 合計がちょうど上限（99）なら統合できる', () => {
  const st = {
    cats: [{ id: 'c', name: 'コーデ', type: 'fashion', items: ['服A', '服B'], meta: {
      '服A': { g: null, t: '', s: '通年', q: 40, r: false },
      '服B': { g: null, t: '', s: '通年', q: 59, r: false } } }],
    logs: {}
  };
  assert.equal(L.mergeItems(st, 'c', ['服A', '服B'], '服A').ok, true);
  assert.equal(L.getMeta(st.cats[0], '服A').q, 99);
});

test('repairMeta: 属性が配列になっているデータは、保存できるオブジェクトに置き換える（JSON往復後も直ったまま）', () => {
  const st = {
    cats: [{ id: 'c', name: 'コーデ', type: 'fashion', items: ['A', 'B'], groups: [{ id: 'tp', name: 'トップス' }], types: { tp: [] }, meta: { A: [], B: [1, 2] } }]
  };
  assert.equal(L.repairMeta(st), 2);
  assert.deepEqual(st.cats[0].meta.A, { g: null, t: '', s: '通年', q: 1, r: false });
  assert.equal(Array.isArray(st.cats[0].meta.B), false);
  const round = JSON.parse(JSON.stringify(st));
  assert.deepEqual(round.cats[0].meta.A, { g: null, t: '', s: '通年', q: 1, r: false });
  assert.equal(L.repairMeta(round), 0); // 再実行しても直す必要がない
});

test('repairMeta: cat.meta そのものが配列・不正な型でも、空のオブジェクトに直す', () => {
  const st = { cats: [{ id: 'c', items: ['A'], meta: ['x'] }, { id: 'd', items: ['A'], meta: 'x' }] };
  assert.equal(L.repairMeta(st), 2);
  assert.deepEqual(st.cats[0].meta, {});
  assert.deepEqual(st.cats[1].meta, {});
  assert.equal(L.repairMeta(st), 0);
});

/* ====================================================================
 * 服の管理画面の部品（追加・表示用の一覧・統合のプレビュー）
 * ================================================================== */

test('addItem: 服を追加できる。同じ名前（全角半角違いを含む）は断る', () => {
  const c = { id: 'c', name: 'コーデ', type: 'fashion', items: ['黒Tシャツ', 'LACOSTE白長Ｔ'] };
  assert.deepEqual(L.addItem(c, '  ダウンコート '), { ok: true, name: 'ダウンコート' });
  assert.deepEqual(c.items, ['黒Tシャツ', 'LACOSTE白長Ｔ', 'ダウンコート']);
  assert.equal(c.meta, undefined); // 分類を始めていなければ meta は作らない
  assert.deepEqual(L.addItem(c, 'LACOSTE白長T'), { ok: false, error: 'exists', existing: 'LACOSTE白長Ｔ' });
  assert.equal(L.addItem(c, '  ').error, 'empty');
  assert.equal(L.addItem(null, 'x').error, 'no-cat');
  assert.equal(c.items.length, 3);
});

test('addItem: 分類を始めたカテゴリでは、名前から グループ・種類・季節 を設定する', () => {
  const c = { id: 'c', name: 'コーデ', type: 'fashion', items: ['黒Tシャツ'] };
  L.startGrouping(c);
  L.addItem(c, 'ダウンコート');
  assert.deepEqual(L.getMeta(c, 'ダウンコート'), { g: 'ot', t: 'コート・ダウン', s: '冬', q: 1, r: false });
  L.addItem(c, '謎のアイテム');
  assert.deepEqual(L.getMeta(c, '謎のアイテム'), { g: null, t: '', s: '通年', q: 1, r: false });
  // 推定されたグループがこのカテゴリに無ければ、グループは未設定
  c.groups = c.groups.filter(g => g.id !== 'ot');
  L.addItem(c, 'ダウンベスト');
  assert.equal(L.getMeta(c, 'ダウンベスト').g, null);
  // 推定された種類がグループに無ければ、種類は空
  c.types.bt = c.types.bt.filter(t => t !== 'パンツ');
  L.addItem(c, 'チノパンツ');
  assert.equal(L.getMeta(c, 'チノパンツ').g, 'bt');
  assert.equal(L.getMeta(c, 'チノパンツ').t, '');
  // __proto__ という名前でも保存される
  L.addItem(c, '__proto__');
  assert.ok(Object.prototype.hasOwnProperty.call(c.meta, '__proto__'));
});

test('visibleItems: 手放した服は隠す。ただし、その日に選ばれている服は残す', () => {
  const c = { id: 'c', items: ['A', 'B', 'C'], meta: { B: { r: true }, C: { r: true } } };
  assert.deepEqual(L.visibleItems(c, []), ['A']);
  assert.deepEqual(L.visibleItems(c, ['C']), ['A', 'C']);
  assert.deepEqual(L.visibleItems(c, undefined), ['A']);
  // meta の無いカテゴリは全部表示
  assert.deepEqual(L.visibleItems({ id: 'd', items: ['X', 'Y'] }, []), ['X', 'Y']);
  assert.deepEqual(L.visibleItems(null, []), []);
});

test('activeItems: 手放していない服だけ（順序を保つ）', () => {
  const c = { id: 'c', items: ['A', 'B', 'C'], meta: { B: { r: true } } };
  assert.deepEqual(L.activeItems(c), ['A', 'C']);
  assert.deepEqual(L.activeItems({ items: ['X'] }), ['X']);
  assert.deepEqual(L.activeItems(undefined), []);
});

function wardrobeFixture() {
  const st = makeState();
  const c = cat(st);
  L.startGrouping(c);
  L.applyMeta(c, L.suggestMeta(c)); // 黒T/白T=tp, ジーンズ=bt, ダウンコート=ot, 謎のアイテム=未設定
  L.setMeta(c, '白Tシャツ', { r: true });
  L.setMeta(c, 'ジーンズ', { q: 2 });
  return st;
}

test('wardrobeRows: 既定は現役のみ。回数と最終着用日が付く', () => {
  const st = wardrobeFixture();
  const rows = L.wardrobeRows(cat(st), st.logs, {});
  assert.deepEqual(rows.map(r => r.name), ['黒Tシャツ', 'ジーンズ', 'ダウンコート', '謎のアイテム']);
  const jeans = rows.find(r => r.name === 'ジーンズ');
  assert.deepEqual(jeans, { name: 'ジーンズ', order: 1, g: 'bt', t: 'ジーンズ', b: null, s: '通年', q: 2, r: false, z: false, count: 3, last: '2026-11-20' });
  assert.equal(rows.find(r => r.name === '謎のアイテム').count, 0);
  assert.equal(rows.find(r => r.name === '謎のアイテム').last, '');
});

test('wardrobeRows: 状態・グループ・検索で絞り込む（全角半角・大文字小文字を区別しない）', () => {
  const st = wardrobeFixture();
  const c = cat(st);
  assert.deepEqual(L.wardrobeRows(c, st.logs, { status: 'gone' }).map(r => r.name), ['白Tシャツ']);
  assert.equal(L.wardrobeRows(c, st.logs, { status: 'all' }).length, 5);
  assert.deepEqual(L.wardrobeRows(c, st.logs, { status: 'all', group: 'tp' }).map(r => r.name), ['黒Tシャツ', '白Tシャツ']);
  assert.deepEqual(L.wardrobeRows(c, st.logs, { group: 'none' }).map(r => r.name), ['謎のアイテム']);
  assert.deepEqual(L.wardrobeRows(c, st.logs, { q: 'ＴＳＨＩＲＴ' }).map(r => r.name), []); // 「Tシャツ」は「tshirt」ではない
  assert.deepEqual(L.wardrobeRows(c, st.logs, { q: 'ｔシャツ' }).map(r => r.name), ['黒Tシャツ']); // 全角の t で、半角の T に当たる
  assert.deepEqual(L.wardrobeRows(c, st.logs, { q: '  ジーンズ ' }).map(r => r.name), ['ジーンズ']);
});

test('wardrobeRows: 並べ替え（名前・グループ・着数・回数・最終着用日）。同じ値は元の順序を保つ', () => {
  const st = wardrobeFixture();
  const c = cat(st);
  const names = o => L.wardrobeRows(c, st.logs, Object.assign({ status: 'all' }, o)).map(r => r.name);
  assert.deepEqual(names({ sort: 'group' }), ['黒Tシャツ', '白Tシャツ', 'ジーンズ', 'ダウンコート', '謎のアイテム']); // 未設定は最後
  assert.deepEqual(names({ sort: 'group', dir: 'desc' }), ['ダウンコート', 'ジーンズ', '黒Tシャツ', '白Tシャツ', '謎のアイテム']); // 降順でも、未設定は最後
  assert.deepEqual(names({ sort: 'qty', dir: 'desc' })[0], 'ジーンズ');
  assert.deepEqual(names({ sort: 'count', dir: 'desc' })[0], 'ジーンズ');
  assert.deepEqual(names({ sort: 'count' }).slice(-1), ['ジーンズ']);
  assert.deepEqual(names({ sort: 'last', dir: 'desc' })[0], '黒Tシャツ'); // 11/26
  assert.deepEqual(names({ sort: 'last' })[0], '謎のアイテム'); // 未着用は '' で最初
  assert.deepEqual(names({ sort: 'status' }).slice(-1), ['白Tシャツ']); // 手放した服は後ろ
  assert.deepEqual(names({ sort: 'season' })[0], '黒Tシャツ'); // 夏が先
  assert.deepEqual(names({ sort: 'name' }), [...names({ sort: 'name' })].sort((a, b) => a.localeCompare(b, 'ja')));
  assert.deepEqual(names({ sort: 'nope' }), names({ sort: 'order' })); // 不明なキーは元の順序
});

test('wardrobeRows: __proto__・constructor という名前の服でも回数が正しく出る', () => {
  const st = {
    cats: [{ id: 'c', name: 'x', type: 'fashion', items: ['__proto__', 'constructor', 'A'] }],
    logs: { d1: { c: { v: ['A'] } } }
  };
  const rows = L.wardrobeRows(st.cats[0], st.logs, {});
  assert.deepEqual(rows.map(r => [r.name, r.count, r.last]), [['__proto__', 0, ''], ['constructor', 0, ''], ['A', 1, 'd1']]);
});

test('previewMerge: 実際には変更せず、統合した場合の結果を返す', () => {
  const st = makeState();
  const snap = JSON.stringify(st);
  const r = L.previewMerge(st, 'c', ['黒Tシャツ', '白Tシャツ'], '黒Tシャツ');
  assert.equal(r.ok, true);
  assert.equal(r.qty, 2);
  assert.equal(r.logsChanged, 3);
  assert.equal(JSON.stringify(st), snap);
  assert.equal(L.previewMerge(st, 'c', ['黒Tシャツ'], ' ').error, 'empty');
});

test('wardrobeCategories: 分類を始めたカテゴリは、種類を変えても・服が空でも対象のまま（服の管理から届かなくならない）', () => {
  const groups = [{ id: 'tp', name: 'トップス' }];
  const st = {
    cats: [
      { id: 'a', type: 'food', items: ['x'], groups },     // 分類を始めたあとに、種類を「食事」に変えた
      { id: 'b', type: 'fashion', items: [], groups },      // 分類を始めたあとに、服をすべて削除した
      { id: 'c', type: 'food', items: ['カレー'] },          // 分類を始めていない食事は対象外
      { id: 'd', type: 'fashion', items: [] },              // 服が無く、分類も始めていない
      { id: 'e', type: 'fashion', items: ['y'], groups: [] } // groups が空の配列は「始めていない」扱い
    ]
  };
  assert.deepEqual(L.wardrobeCategories(st).map(c => c.id), ['a', 'b', 'e']);
});

test('wardrobeCategories: 服が1つ以上ある「ファッション」のカテゴリだけが対象（食事・サプリ・空は対象外）', () => {
  const st = {
    cats: [
      { id: 'a', type: 'fashion', items: ['x'] },
      { id: 'b', type: 'food', items: ['カレー'] },
      { id: 'c', type: 'supplement', items: ['ビタミン'] },
      { id: 'd', type: 'fashion', items: [] },
      { id: 'e', type: 'fashion' },
      { id: 'f', type: 'custom', items: ['y'] },
      null,
      { id: 'g', type: 'fashion', items: ['z'] }
    ]
  };
  assert.deepEqual(L.wardrobeCategories(st).map(c => c.id), ['a', 'g']);
  assert.deepEqual(L.wardrobeCategories({ cats: [] }), []);
  assert.deepEqual(L.wardrobeCategories(null), []);
  assert.deepEqual(L.wardrobeCategories({}), []);
});

/* ====================================================================
 * ブランド（カテゴリごとの一覧。正式名称＋任意の略称。服に1つ付ける）
 * ================================================================== */

const brandCat = () => ({ id: 'c', name: 'コーデ', type: 'fashion', items: ['Theory長黒', 'Theory長白', 'PS緑長T', 'UA灰パーカー', 'UA青パーカー', "Levi's 502 US", '黒ナイキ', '黒Tシャツ', 'Tシャツ'] });

test('addBrand: 正式名称と任意の略称で追加できる。前後の空白は除く', () => {
  const c = brandCat();
  assert.deepEqual(L.addBrand(c, '  Paul Smith ', ' PS '), { ok: true, id: 'b1' });
  assert.deepEqual(c.brands, [{ id: 'b1', name: 'Paul Smith', short: 'PS' }]);
  assert.deepEqual(L.addBrand(c, 'Theory'), { ok: true, id: 'b2' });
  assert.equal(c.brands[1].short, '');
  assert.equal(L.addBrand(c, 'x', '', 'b2').error, 'duplicate-id');
  assert.equal(L.addBrand(c, '  ').error, 'empty');
  assert.equal(L.addBrand(null, 'x').error, 'no-cat');
});

test('addBrand: 名前や略称が、ほかのブランドの名前・略称と重なるものは断る（全角半角・大文字小文字を含む）', () => {
  const c = brandCat();
  L.addBrand(c, 'Paul Smith', 'PS');
  assert.equal(L.addBrand(c, 'paul smith').error, 'duplicate');
  assert.equal(L.addBrand(c, 'ＰＡＵＬ　ＳＭＩＴＨ'.replace('　', ' ')).error, 'duplicate');
  assert.equal(L.addBrand(c, 'Pretty Style', 'ps').error, 'duplicate'); // 略称が他の略称と同じ
  assert.equal(L.addBrand(c, 'PS').error, 'duplicate'); // 名前が他の略称と同じ
  assert.equal(c.brands.length, 1);
});

test('addBrand: 略称が正式名称と同じなら、略称なしとして扱う', () => {
  const c = brandCat();
  L.addBrand(c, 'Theory', 'theory');
  assert.equal(c.brands[0].short, '');
});

test('updateBrand: 正式名称・略称を変えられる。重なる名前・空は断り、何も変えない', () => {
  const c = brandCat();
  L.addBrand(c, 'PS');
  L.addBrand(c, 'Theory');
  assert.equal(L.updateBrand(c, 'b1', { name: 'Paul Smith', short: 'PS' }).ok, true);
  assert.deepEqual(c.brands[0], { id: 'b1', name: 'Paul Smith', short: 'PS' });
  assert.equal(L.updateBrand(c, 'b1', { short: '' }).ok, true);
  assert.equal(c.brands[0].short, '');
  const snap = JSON.stringify(c.brands);
  assert.equal(L.updateBrand(c, 'b2', { name: 'paul smith' }).error, 'duplicate');
  assert.equal(L.updateBrand(c, 'b2', { name: ' ' }).error, 'empty');
  assert.equal(L.updateBrand(c, 'zzz', { name: 'x' }).error, 'no-brand');
  assert.equal(JSON.stringify(c.brands), snap);
  // 自分自身と同じ名前に変えるのは重複ではない
  assert.equal(L.updateBrand(c, 'b2', { name: 'THEORY' }).ok, true);
});

test('setMeta / bulkSetMeta: ブランドを設定できる。一覧に無いブランドは断り、null で外せる', () => {
  const c = brandCat();
  L.addBrand(c, 'Theory');
  assert.equal(L.setMeta(c, 'Theory長黒', { b: 'zzz' }).error, 'no-brand');
  assert.equal(L.setMeta(c, 'Theory長黒', { b: 'b1' }).ok, true);
  assert.equal(L.getMeta(c, 'Theory長黒').b, 'b1');
  assert.equal(L.setMeta(c, 'Theory長黒', { s: '冬' }).ok, true);
  assert.equal(L.getMeta(c, 'Theory長黒').b, 'b1'); // 他の属性を変えても保つ
  assert.deepEqual(L.bulkSetMeta(c, ['Theory長白', 'PS緑長T'], { b: 'b1' }), { ok: true, changed: 2 });
  assert.equal(L.getMeta(c, 'PS緑長T').b, 'b1');
  const snap = JSON.stringify(c.meta);
  assert.equal(L.bulkSetMeta(c, ['UA灰パーカー', 'ない服'], { b: 'b1' }).error, 'no-item'); // 全体を適用しない
  assert.equal(JSON.stringify(c.meta), snap);
  assert.equal(L.setMeta(c, 'Theory長黒', { b: null }).ok, true);
  assert.ok(!('b' in L.getMeta(c, 'Theory長黒'))); // 未設定は属性ごと無い
  assert.equal(L.getMeta(c, 'Theory長黒').b, undefined);
});

test('brandText / brandLabel: 略称があれば略称、無ければ正式名称', () => {
  const c = brandCat();
  L.addBrand(c, 'Paul Smith', 'PS');
  L.addBrand(c, 'Theory');
  assert.equal(L.brandLabel(c, 'b1'), 'PS');
  assert.equal(L.brandLabel(c, 'b2'), 'Theory');
  assert.equal(L.brandLabel(c, 'nope'), '');
  assert.equal(L.brandText(null), '');
});

test('deleteBrand: 使っていないブランドだけ削除できる（手放した服が使っていても断る）', () => {
  const c = brandCat();
  L.addBrand(c, 'Theory'); L.addBrand(c, 'PS');
  L.setMeta(c, 'Theory長黒', { b: 'b1' });
  L.setMeta(c, 'Theory長黒', { r: true });
  assert.deepEqual(L.deleteBrand(c, 'b1'), { ok: false, error: 'used', count: 1 });
  assert.equal(c.brands.length, 2);
  assert.equal(L.deleteBrand(c, 'b2').ok, true);
  assert.deepEqual(c.brands.map(b => b.id), ['b1']);
  assert.equal(L.deleteBrand(c, 'b2').error, 'no-brand');
  L.setMeta(c, 'Theory長黒', { b: null });
  assert.equal(L.deleteBrand(c, 'b1').ok, true);
});

test('deleteBrand: ID が __proto__ でも使用中を正しく判定できる', () => {
  const c = brandCat();
  L.addBrand(c, 'Weird', '', '__proto__');
  L.setMeta(c, 'Theory長黒', { b: '__proto__' });
  assert.equal(L.deleteBrand(c, '__proto__').error, 'used');
  assert.deepEqual(L.brandCounts(c), { ['__proto__']: 1 });
  L.setMeta(c, 'Theory長黒', { b: null });
  assert.equal(L.deleteBrand(c, '__proto__').ok, true);
});

test('mergeItems: ブランドは変更先の設定を使い、未設定なら統合する服のうち最初に設定のあるものを引き継ぐ', () => {
  const mk = () => {
    const st = { cats: [brandCat()], logs: {} };
    const c = st.cats[0];
    L.addBrand(c, 'Theory'); L.addBrand(c, 'PS');
    return { st, c };
  };
  let { st, c } = mk();
  L.setMeta(c, 'Theory長黒', { b: 'b1' }); L.setMeta(c, 'Theory長白', { b: 'b2' });
  L.mergeItems(st, 'c', ['Theory長黒', 'Theory長白'], 'Theory長黒');
  assert.equal(L.getMeta(c, 'Theory長黒').b, 'b1'); // 変更先の設定
  ({ st, c } = mk());
  L.setMeta(c, 'Theory長白', { b: 'b2' });
  L.mergeItems(st, 'c', ['Theory長黒', 'Theory長白'], 'Theory長黒');
  assert.equal(L.getMeta(c, 'Theory長黒').b, 'b2'); // 変更先が未設定なので、設定のある服から
  ({ st, c } = mk());
  L.mergeItems(st, 'c', ['Theory長黒', 'Theory長白'], 'Theory長黒');
  assert.ok(!('b' in L.getMeta(c, 'Theory長黒'))); // どちらも未設定なら、未設定のまま
});

test('addItem: 登録済みのブランドが名前に含まれていれば、ブランドを自動で設定する', () => {
  const c = brandCat();
  L.addBrand(c, 'Theory'); L.addBrand(c, 'Paul Smith', 'PS'); L.addBrand(c, 'Nike'); L.addBrand(c, 'US');
  L.addItem(c, 'Theory長グレー');
  assert.equal(L.getMeta(c, 'Theory長グレー').b, 'b1');
  L.addItem(c, 'PS紺ニット');
  assert.equal(L.getMeta(c, 'PS紺ニット').b, 'b2'); // 略称
  L.addItem(c, '白ナイキ');
  assert.equal(L.getMeta(c, '白ナイキ').b, 'b3'); // 辞書の表記（ナイキ）が、登録済みのNikeに当たる
  L.addItem(c, "Levi's 505 US");
  assert.equal(L.getMeta(c, "Levi's 505 US").b, undefined); // 英字は名前の先頭だけを見る（末尾の「US」に当たらない）
  L.addItem(c, 'ブランド無しの服');
  assert.equal(L.getMeta(c, 'ブランド無しの服').b, undefined);
  assert.ok(c.meta && !('ブランド無しの服' in c.meta)); // 分類を始めておらず、ブランドも無ければ meta は作らない
});

test('suggestBrands: 辞書・名前の先頭の英字（2つ以上の服に共通）・登録済みのブランドから案を作る', () => {
  const c = brandCat();
  const props = L.suggestBrands(c);
  const by = Object.fromEntries(props.map(p => [p.name, p.brand]));
  assert.equal(by['Theory長黒'], 'Theory');
  assert.equal(by['Theory長白'], 'Theory');
  assert.equal(by['UA灰パーカー'], 'UA');
  assert.equal(by['UA青パーカー'], 'UA');
  assert.equal(by["Levi's 502 US"], "Levi's"); // 辞書
  assert.equal(by['黒ナイキ'], 'Nike'); // 辞書（カタカナ）
  assert.equal(by['PS緑長T'], undefined); // 1つだけの英字は推定しない
  assert.equal(by['黒Tシャツ'], undefined);
  assert.equal(by['Tシャツ'], undefined); // 1文字の英字は対象外
  assert.ok(props.every(p => p.id === null)); // まだ登録されていない
  assert.equal(c.brands, undefined); // 案を作っただけでは変わらない
});

test('suggestBrands: 登録済みのブランドは1つだけの服にも当てはまり、既存のID・名前を使う。設定済みの服は対象外', () => {
  const c = brandCat();
  L.addBrand(c, 'Paul Smith', 'PS');
  L.setMeta(c, 'Theory長黒', { b: L.addBrand(c, 'Theory').id });
  const props = L.suggestBrands(c);
  const ps = props.find(p => p.name === 'PS緑長T');
  assert.deepEqual(ps, { name: 'PS緑長T', brand: 'Paul Smith', id: 'b1' });
  assert.ok(!props.some(p => p.name === 'Theory長黒')); // 設定済み
  const white = props.find(p => p.name === 'Theory長白');
  assert.deepEqual(white, { name: 'Theory長白', brand: 'Theory', id: 'b2' });
});

test('applyBrands: 未登録のブランドは正式名称として登録し、服に設定する。登録済みは再利用する', () => {
  const c = brandCat();
  const props = L.suggestBrands(c);
  const r = L.applyBrands(c, props);
  assert.equal(r.skipped, 0);
  assert.equal(r.applied, props.length);
  assert.deepEqual(c.brands.map(b => b.name).sort(), ["Levi's", 'Nike', 'Theory', 'UA']);
  assert.equal(L.brandLabel(c, L.getMeta(c, 'Theory長黒').b), 'Theory');
  assert.equal(L.getMeta(c, 'Theory長黒').b, L.getMeta(c, 'Theory長白').b); // 同じブランドは同じID
  assert.equal(r.created, 4);
  // もう一度適用しても、ブランドは増えない
  const again = L.applyBrands(c, [{ name: 'PS緑長T', brand: 'theory' }]);
  assert.equal(again.created, 0);
  assert.equal(c.brands.length, 4);
  assert.deepEqual(L.applyBrands(c, [{ name: 'ない服', brand: 'X' }, null, { name: '黒Tシャツ' }]), { applied: 0, created: 0, skipped: 3 });
});

test('wardrobeRows: ブランドで絞り込み・並べ替え（略称があれば略称の順。未設定は最後）', () => {
  const c = brandCat();
  L.addBrand(c, 'Theory'); L.addBrand(c, 'Paul Smith', 'PS'); L.addBrand(c, 'Adidas');
  L.setMeta(c, 'Theory長黒', { b: 'b1' }); L.setMeta(c, 'PS緑長T', { b: 'b2' }); L.setMeta(c, '黒ナイキ', { b: 'b3' });
  const names = o => L.wardrobeRows(c, {}, Object.assign({ status: 'all' }, o)).map(r => r.name);
  assert.deepEqual(names({ brand: 'b2' }), ['PS緑長T']);
  assert.deepEqual(names({ brand: 'none' }).includes('Theory長黒'), false);
  assert.equal(names({ brand: 'none' }).length, 6);
  assert.deepEqual(names({ sort: 'brand' }).slice(0, 3), ['黒ナイキ', 'PS緑長T', 'Theory長黒']); // Adidas, PS(略称), Theory
  assert.deepEqual(names({ sort: 'brand', dir: 'desc' }).slice(0, 3), ['Theory長黒', 'PS緑長T', '黒ナイキ']); // 降順でも、未設定は最後
  assert.ok(L.wardrobeRows(c, {}, { status: 'all', sort: 'brand', dir: 'desc' }).slice(3).every(r => r.b === null));
  assert.equal(L.wardrobeRows(c, {}, { status: 'all' }).find(r => r.name === 'PS緑長T').b, 'b2');
});

test('repairMeta: 不正なブランドの一覧・属性を直す', () => {
  const st = { cats: [{
    id: 'c', items: ['A', 'B', 'C'],
    brands: [{ id: 'b1', name: 'Theory', short: 5 }, { id: 'b1', name: 'Dup' }, { id: 'b3', name: ' ' }, 'x', null, { name: 'noid' }, { id: 'b4', name: 'OK' }],
    meta: { A: { g: null, t: '', s: '夏', q: 1, r: false, b: 'b1' }, B: { g: null, t: '', s: '夏', q: 1, r: false, b: 'gone' }, C: { g: null, t: '', s: '夏', q: 1, r: false, b: null } }
  }] };
  const fixed = L.repairMeta(st);
  assert.ok(fixed >= 6);
  assert.deepEqual(st.cats[0].brands, [{ id: 'b1', name: 'Theory', short: '' }, { id: 'b4', name: 'OK', short: '' }]);
  assert.equal(st.cats[0].meta.A.b, 'b1');
  assert.ok(!('b' in st.cats[0].meta.B)); // 存在しないブランドは外す
  assert.ok(!('b' in st.cats[0].meta.C)); // null も外す
  assert.equal(L.repairMeta(st), 0);
  const bad = { cats: [{ id: 'd', items: [], brands: 'oops' }, { id: 'e', items: [] }] };
  assert.equal(L.repairMeta(bad), 1);
  assert.deepEqual(bad.cats[0].brands, []);
  assert.equal(bad.cats[1].brands, undefined);
});

test('suggestBrands: 型番の先頭（ハイフンより前）を同じブランドとして数える。カシオの型番は辞書で CASIO', () => {
  const c = { id: 'w', items: ['AB-100 赤', 'AB-200 青', 'OCW-7000B 青紫', 'OCW-S4000E 銀', 'MTG-B1000RB 虹', 'Pixel Watch 4', 'ZZ-1'] };
  const by = Object.fromEntries(L.suggestBrands(c).map(p => [p.name, p.brand]));
  assert.equal(by['AB-100 赤'], 'AB');
  assert.equal(by['AB-200 青'], 'AB');
  assert.equal(by['OCW-7000B 青紫'], 'CASIO');
  assert.equal(by['OCW-S4000E 銀'], 'CASIO');
  assert.equal(by['MTG-B1000RB 虹'], 'CASIO');
  assert.equal(by['Pixel Watch 4'], 'Google');
  assert.equal(by['ZZ-1'], undefined); // 1つだけの型番は推定しない
});

test('wardrobeRows: グループ・ブランドの並べ替えは、昇順でも降順でも、未設定の服が最後', () => {
  const c = { id: 'c', items: ['未設定服', 'Z服', 'A服'], groups: [{ id: 'g1', name: 'A群' }, { id: 'g2', name: 'Z群' }], types: { g1: [], g2: [] },
    brands: [{ id: 'bA', name: 'Alpha', short: '' }, { id: 'bZ', name: 'Zed', short: '' }],
    meta: { 'Z服': { g: 'g2', t: '', s: '通年', q: 1, r: false, b: 'bZ' }, 'A服': { g: 'g1', t: '', s: '通年', q: 1, r: false, b: 'bA' } } };
  const names = o => L.wardrobeRows(c, {}, Object.assign({ status: 'all' }, o)).map(r => r.name);
  assert.deepEqual(names({ sort: 'brand' }), ['A服', 'Z服', '未設定服']);
  assert.deepEqual(names({ sort: 'brand', dir: 'desc' }), ['Z服', 'A服', '未設定服']);
  assert.deepEqual(names({ sort: 'group' }), ['A服', 'Z服', '未設定服']);
  assert.deepEqual(names({ sort: 'group', dir: 'desc' }), ['Z服', 'A服', '未設定服']);
  // 未設定どうしは、元の順序を保つ
  c.items.push('未設定服2');
  assert.deepEqual(names({ sort: 'brand', dir: 'desc' }).slice(-2), ['未設定服', '未設定服2']);
});

/* ---------- 記録画面（pickerSections / defaultSeasonView） ---------- */

test('defaultSeasonView: 6〜9月は夏、11〜3月は冬、4・5・10月はすべて', () => {
  const v = d => L.defaultSeasonView(d);
  ['2026-06-01', '2026-07-15', '2026-09-30'].forEach(d => assert.equal(v(d), '夏', d));
  ['2026-11-01', '2026-12-31', '2027-01-10', '2027-02-28', '2027-03-31'].forEach(d => assert.equal(v(d), '冬', d));
  ['2026-04-01', '2026-05-31', '2026-10-01', '2026-10-31'].forEach(d => assert.equal(v(d), 'all', d));
  // 読めない日付は「すべて」
  assert.equal(v(''), 'all');
  assert.equal(v(undefined), 'all');
  assert.equal(v('abc'), 'all');
});

function pickerCat() {
  const c = {
    id: 'f', type: 'fashion', items: [], groups: [], types: {}, brands: [], meta: {}
  };
  L.startGrouping(c);
  const gt = c.groups.find(g => g.name === 'トップス').id;
  const gb = c.groups.find(g => g.name === 'ボトムス').id;
  c.brands = [{ id: 'bx', name: 'Alpha Wear', short: 'AW' }];
  const add = (name, g, t, s, extra = {}) => {
    c.items.push(name);
    c.meta[name] = Object.assign({ g, t, s, q: 1, r: false }, extra);
  };
  add('夏半袖', gt, '半袖T', '夏');
  add('冬ニット', gt, 'ニット', '冬');
  add('通年シャツ', gt, 'シャツ', '通年', { b: 'bx' });
  add('夏パンツ', gb, 'パンツ', '夏');
  add('冬ジーンズ', gb, 'ジーンズ', '冬');
  add('手放し半袖', gt, '半袖T', '夏', { r: true });
  add('未分類服', null, '', '通年');
  return { c, gt, gb };
}
const flat = (secs) => secs.groups.flatMap(g => g.types.flatMap(t => t.items));

test('pickerSections: 夏の表示は、夏と通年の服だけ。手放した服・冬の服は出ない', () => {
  const { c } = pickerCat();
  const s = L.pickerSections(c, {}, { season: '夏' });
  assert.deepEqual(flat(s).sort(), ['夏パンツ', '夏半袖', '未分類服', '通年シャツ'].sort());
  assert.equal(s.hiddenBySeason, 2); // 冬ニット・冬ジーンズ（手放した服は数えない）
});

test('pickerSections: すべての表示は、季節で絞らない（手放した服は出ない）', () => {
  const { c } = pickerCat();
  const s = L.pickerSections(c, {}, { season: 'all' });
  assert.equal(flat(s).length, 6);
  assert.ok(!flat(s).includes('手放し半袖'));
  assert.equal(s.hiddenBySeason, 0);
});

test('pickerSections: 選択中の服は、季節が違っても手放した服でも残る', () => {
  const { c } = pickerCat();
  const s = L.pickerSections(c, {}, { season: '夏', selected: ['冬ニット', '手放し半袖'] });
  assert.ok(flat(s).includes('冬ニット'));
  assert.ok(flat(s).includes('手放し半袖'));
  assert.equal(s.hiddenBySeason, 1); // 冬ジーンズのみ
});

test('pickerSections: グループ→種類の順で並ぶ。グループ未設定は最後の「未分類」', () => {
  const { c } = pickerCat();
  const s = L.pickerSections(c, {}, { season: 'all' });
  assert.deepEqual(s.groups.map(g => g.name), ['トップス', 'ボトムス', '未分類']);
  const tops = s.groups[0];
  assert.equal(tops.count, 3);
  // 種類は、グループに登録された種類の順
  const order = c.types[tops.id];
  const idx = t => order.indexOf(t.type);
  assert.deepEqual(tops.types.map(t => t.type), tops.types.map(t => t.type).sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  assert.ok(tops.types.every(t => idx(t) >= 0));
});

test('pickerSections: 検索は服の名前・ブランドの正式名称・略称に当たり、季節に関係なく探せる', () => {
  const { c } = pickerCat();
  const names = q => flat(L.pickerSections(c, {}, { season: '夏', q })).sort();
  assert.deepEqual(names('ニット'), ['冬ニット']); // 冬でも夏の表示で見つかる
  assert.deepEqual(names('alpha'), ['通年シャツ']); // 正式名称（大文字小文字を問わない）
  assert.deepEqual(names('ＡＷ'), ['通年シャツ']); // 略称（全角でも）
  assert.deepEqual(names('そんな服はない'), []);
  assert.equal(L.pickerSections(c, {}, { season: '夏', q: 'ニット' }).searching, true);
  // 検索中でも手放した服は出ない
  assert.deepEqual(names('手放し'), []);
});

test('pickerSections: 最近着た服は、季節に関係なく直近30日、新しい順、最大8件。記録中の日は除く', () => {
  const { c } = pickerCat();
  const logs = {
    '2026-11-20': { f: { v: ['夏半袖'] } },
    '2026-11-25': { f: { v: ['冬ニット', '通年シャツ'] } },
    '2026-11-26': { f: { v: ['夏パンツ'] } }, // 記録中の日：除く
    '2026-10-01': { f: { v: ['冬ジーンズ'] } }, // 30日より前
    '2026-11-24': { g: { v: ['未分類服'] } } // 別カテゴリ
  };
  const s = L.pickerSections(c, logs, { season: '冬', today: '2026-11-26', excludeDate: '2026-11-26' });
  // 同じ日に着た服は、リストの並び順
  assert.deepEqual(s.recent, ['冬ニット', '通年シャツ', '夏半袖']);
});

test('pickerSections: 最近着た服は最大8件で、手放した服は含まない。検索中は出さない', () => {
  const { c, gt } = pickerCat();
  const logs = {};
  for (let i = 0; i < 12; i++) {
    const n = '服' + i;
    c.items.push(n); c.meta[n] = { g: gt, t: '', s: '通年', q: 1, r: false };
    logs['2026-11-' + String(11 + i).padStart(2, '0')] = { f: { v: [n] } };
  }
  logs['2026-11-22'].f.v.push('手放し半袖');
  const s = L.pickerSections(c, logs, { season: 'all', today: '2026-11-26', excludeDate: '2026-11-26' });
  assert.equal(s.recent.length, 8);
  assert.ok(!s.recent.includes('手放し半袖'));
  assert.equal(s.recent[0], '服11');
  const q = L.pickerSections(c, logs, { season: 'all', q: '服1', today: '2026-11-26', excludeDate: '2026-11-26' });
  assert.deepEqual(q.recent, []);
});

test('pickerSections: 元のカテゴリを書き換えない／壊れたデータでも落ちない', () => {
  const { c } = pickerCat();
  const before = JSON.stringify(c);
  L.pickerSections(c, { '2026-11-01': null, '2026-11-02': { f: 5 } }, { season: 'all', today: '2026-11-26' });
  assert.equal(JSON.stringify(c), before);
  assert.doesNotThrow(() => L.pickerSections({ id: 'x' }, null, {}));
  assert.deepEqual(L.pickerSections({ id: 'x' }, null, {}).groups, []);
});

test('pickerSections: 最近着た服は、記録日の30日前から前日まで（30日前の日を含み、31日前は含まない）', () => {
  const { c } = pickerCat();
  const logs = {
    '2026-10-27': { f: { v: ['夏半袖'] } }, // 31日前：含まない
    '2026-10-28': { f: { v: ['冬ニット'] } }, // 30日前：含む
    '2026-11-26': { f: { v: ['通年シャツ'] } }, // 前日：含む
    '2026-11-27': { f: { v: ['夏パンツ'] } } // 記録日：含まない
  };
  const s = L.pickerSections(c, logs, { season: 'all', today: '2026-11-27', excludeDate: '2026-11-27' });
  assert.deepEqual(s.recent.slice().sort(), ['冬ニット', '通年シャツ'].sort());
});

/* ---------- ファッションの統計（fashionStats / periodLabel） ---------- */

function statsCat() {
  const c = { id: 'f', type: 'fashion', items: [], groups: [], types: {}, brands: [], meta: {} };
  L.startGrouping(c);
  const add = (name, g, s, extra = {}) => { c.items.push(name); c.meta[name] = Object.assign({ g, t: '', s, q: 1, r: false }, extra); };
  add('夏T', 'tp', '夏');
  add('冬ニット', 'tp', '冬');
  add('通年シャツ', 'tp', '通年', { q: 2 });
  add('手放しT', 'tp', '夏', { r: true });
  add('夏パンツ', 'bt', '夏');
  add('冬ジーンズ', 'bt', '冬');
  add('未分類服', null, '通年');
  return c;
}
const day = (n, ...v) => ({ ['2026-11-' + String(n).padStart(2, '0')]: { f: { v } } });
const statsLogs = () => Object.assign({},
  day(1, '夏T', '手放しT'), day(2, '冬ニット', '通年シャツ'), day(3, '冬ニット'), day(20, '通年シャツ', '冬ジーンズ'),
  { '2026-06-10': { f: { v: ['夏T', '冬ニット', '消えた服'] } } });

test('periodLabel: 期間の表示（全期間は最初の記録日から）', () => {
  assert.equal(L.periodLabel('30d', '2026-11-27', ''), '直近30日（10/29〜11/27）');
  assert.equal(L.periodLabel('90d', '2026-11-27', ''), '直近90日（8/30〜11/27）');
  assert.equal(L.periodLabel('6m', '2026-11-27', ''), '直近半年（6/1〜11/27）');
  assert.equal(L.periodLabel('1y', '2026-11-27', ''), '直近1年（2025/11/28〜2026/11/27）');
  assert.equal(L.periodLabel('all', '2026-11-27', '2026-06-10'), '全期間（2026/6/10〜）');
  assert.equal(L.periodLabel('all', '2026-11-27', ''), '全期間');
});

test('fashionStats: グループ別に集計し、同じグループの服は着用回数の多い順', () => {
  const c = statsCat();
  const s = L.fashionStats(c, statsLogs(), { period: 'all', today: '2026-11-27', season: 'all' });
  assert.deepEqual(s.groups.map(g => g.name), ['トップス', 'ボトムス', '未分類']); // 服が無いグループ（アウター）は出さない
  const tops = s.groups[0];
  assert.deepEqual(tops.items.map(i => [i.name, i.count]), [['冬ニット', 3], ['夏T', 2], ['通年シャツ', 2], ['手放しT', 1]]);
  // 同じ回数は元の並び順
  assert.deepEqual(tops.items.map(i => i.name).slice(1, 3), ['夏T', '通年シャツ']);
});

test('fashionStats: 手放した服は統計に残り（印つき）、着数は1着あたりの回数に使う', () => {
  const c = statsCat();
  const tops = L.fashionStats(c, statsLogs(), { period: 'all', today: '2026-11-27', season: 'all' }).groups[0];
  const by = n => tops.items.find(i => i.name === n);
  assert.equal(by('手放しT').retired, true);
  assert.equal(by('通年シャツ').q, 2);
  assert.equal(by('通年シャツ').perPiece, 1); // 2回 ÷ 2着
  assert.equal(by('夏T').perPiece, 2);
  assert.equal(tops.activeCount, 3);
  assert.equal(tops.pieces, 4); // 夏T1 + 冬ニット1 + 通年シャツ2（手放した服は着数に数えない）
  assert.equal(tops.wears, 8); // 手放した服の1回も延べ回数に含める
});

test('fashionStats: 期間で絞る。期間外の手放した服は一覧から外れ、現役の服は0回で残る', () => {
  const c = statsCat();
  // 12/15の直近30日は11/16〜12/15。11/20の記録だけが入る（11/1〜11/3と6月の記録は期間外）
  const s = L.fashionStats(c, statsLogs(), { period: '30d', today: '2026-12-15', season: 'all' });
  const tops = s.groups[0];
  assert.deepEqual(tops.items.map(i => [i.name, i.count]), [['通年シャツ', 1], ['夏T', 0], ['冬ニット', 0]]);
  assert.equal(tops.wears, 1);
  assert.ok(s.range && s.range.from === '2026-11-16');
  // 期間外の記録は、全期間にだけ入る
  assert.equal(L.fashionStats(c, statsLogs(), { period: 'all', today: '2026-12-15', season: 'all' }).groups[0].wears, 8);
});

test('fashionStats: バリエーションと提案は、今の季節（と通年）の現役の服が対象', () => {
  const c = statsCat();
  const winter = L.fashionStats(c, statsLogs(), { period: 'all', today: '2026-11-27', season: '冬' });
  const tops = winter.groups[0];
  // 冬ニット・通年シャツが対象（夏T・手放しTは対象外）。どちらも着用あり
  assert.deepEqual(tops.variety, { used: 2, total: 2, pct: 100 });
  assert.deepEqual(tops.tips.map(t => t.name), ['冬ニット']); // 冬ニットは11/3が最後（24日前）。通年シャツは7日前なので対象外
  const bottoms = winter.groups[1];
  assert.deepEqual(bottoms.variety, { used: 1, total: 1, pct: 100 }); // 冬ジーンズのみ対象（夏パンツは対象外）
  assert.ok(!bottoms.tips.some(t => t.name === '夏パンツ')); // 夏の服は、冬の間「着ていない」と提案しない
  const all = L.fashionStats(c, statsLogs(), { period: 'all', today: '2026-11-27', season: 'all' });
  assert.equal(all.groups[1].variety.total, 2);
});

test('fashionStats: 提案は、一度も着ていない服と、14日以上着ていない服（期間に関係なく全記録で判定）', () => {
  const c = statsCat();
  const logs = Object.assign({}, day(1, '冬ニット'), day(20, '通年シャツ'), day(26, '冬ジーンズ'));
  const s = L.fashionStats(c, logs, { period: '30d', today: '2026-11-27', season: '冬' });
  const tips = Object.fromEntries(s.groups.flatMap(g => g.tips).map(t => [t.name, t]));
  assert.equal(tips['冬ニット'].kind, 'idle');
  assert.equal(tips['冬ニット'].days, 26);
  assert.equal(tips['通年シャツ'], undefined); // 7日前なので提案しない
  assert.equal(tips['冬ジーンズ'], undefined);
  assert.equal(tips['未分類服'].kind, 'unused');
  // 期間を「全期間」にしても、提案の判定は同じ
  const s2 = L.fashionStats(c, logs, { period: 'all', today: '2026-11-27', season: '冬' });
  assert.equal(s2.groups.flatMap(g => g.tips).find(t => t.name === '冬ニット').days, 26);
  // 最後に着た日が期間の外でも、「記録なし」ではなく「N日前」になる（12/15の直近30日は11/16〜。冬ニットの最後は11/1）
  const s3 = L.fashionStats(c, logs, { period: '30d', today: '2026-12-15', season: '冬' });
  const t3 = s3.groups.flatMap(g => g.tips).find(t => t.name === '冬ニット');
  assert.deepEqual([t3.kind, t3.days], ['idle', 44]);
});

test('fashionStats: グループ未設定の服と、一覧に無い名前（記録だけに残る）は「未分類」に入る', () => {
  const c = statsCat();
  const s = L.fashionStats(c, statsLogs(), { period: 'all', today: '2026-11-27', season: 'all' });
  const un = s.groups.find(g => g.id === null);
  assert.equal(un.name, '未分類');
  assert.ok(un.items.some(i => i.name === '未分類服'));
  const orphan = un.items.find(i => i.name === '消えた服');
  assert.ok(orphan && orphan.orphan === true && orphan.count === 1);
  assert.equal(un.activeCount, 1); // 記録だけに残る名前は現役に数えない
});

test('fashionStats: 分類を使わないカテゴリは、1つのまとまり（名前なし）として集計する', () => {
  const c = { id: 'w', type: 'fashion', items: ['時計A', '時計B'] };
  const logs = { '2026-11-20': { w: { v: ['時計A'] } }, '2026-11-21': { w: { v: ['時計A'] } } };
  const s = L.fashionStats(c, logs, { period: 'all', today: '2026-11-27', season: '冬' });
  assert.equal(s.groups.length, 1);
  assert.equal(s.groups[0].name, '');
  assert.deepEqual(s.groups[0].items.map(i => [i.name, i.count]), [['時計A', 2], ['時計B', 0]]);
  assert.deepEqual(s.groups[0].variety, { used: 1, total: 2, pct: 50 }); // 季節の設定が無い服は、どの季節でも対象
});

test('fashionStats: __proto__ という名前の服や壊れたデータでも落ちない／元のデータを書き換えない', () => {
  const c = statsCat();
  c.items.push('__proto__'); Object.defineProperty(c.meta, '__proto__', { value: { g: 'tp', t: '', s: '通年', q: 1, r: false }, enumerable: true, configurable: true, writable: true });
  const logs = { '2026-11-20': { f: { v: ['__proto__'] } }, '2026-11-21': null, '2026-11-22': { f: 5 } };
  const before = JSON.stringify([c, logs]);
  const s = L.fashionStats(c, logs, { period: 'all', today: '2026-11-27', season: 'all' });
  assert.equal(s.groups[0].items.find(i => i.name === '__proto__').count, 1);
  assert.equal(JSON.stringify([c, logs]), before);
  assert.doesNotThrow(() => L.fashionStats({ id: 'x' }, null, { period: 'all', today: '2026-11-27', season: 'all' }));
});

test('hasLogs: そのカテゴリの記録が（いつでも）1件でもあるか。空の記録・別カテゴリ・壊れたデータは数えない', () => {
  assert.equal(L.hasLogs({ '2026-06-01': { f: { v: ['A'] } } }, 'f'), true);
  assert.equal(L.hasLogs({ '2026-06-01': { g: { v: ['A'] } } }, 'f'), false);
  assert.equal(L.hasLogs({ '2026-06-01': null, '2026-06-02': { f: null } }, 'f'), false);
  assert.equal(L.hasLogs({}, 'f'), false);
  assert.equal(L.hasLogs(null, 'f'), false);
});

/* ---------- 「提案に出さない」（meta.z）と、着ていない服の列 ---------- */

function restCat() {
  const c = { id: 'f', type: 'fashion', items: [], groups: [], types: {}, brands: [], meta: {} };
  L.startGrouping(c);
  const add = (name, s = '通年', extra = {}) => { c.items.push(name); c.meta[name] = Object.assign({ g: 'tp', t: '', s, q: 1, r: false }, extra); };
  return { c, add };
}

test('setMeta: z（提案に出さない）を付け外しできる。falseにすると属性ごと外れる。真偽値以外は断る', () => {
  const { c, add } = restCat(); add('A');
  assert.equal(L.setMeta(c, 'A', { z: true }).ok, true);
  assert.equal(c.meta.A.z, true);
  assert.equal(L.setMeta(c, 'A', { z: false }).ok, true);
  assert.equal('z' in c.meta.A, false);
  assert.equal(L.setMeta(c, 'A', { z: 'yes' }).error, 'bad-flag');
  assert.equal('z' in c.meta.A, false);
  // まとめて変更：1つでも失敗したら全体を適用しない
  add('B');
  assert.equal(L.bulkSetMeta(c, ['A', 'B'], { z: true }).changed, 2);
  assert.equal(L.bulkSetMeta(c, ['A', 'B'], { z: 1 }).ok, false);
  assert.equal(c.meta.A.z, true);
});

test('z: 名前変更で引き継ぐ。統合は、全部がzのときだけz', () => {
  const { c, add } = restCat(); add('A', '通年', { z: true }); add('B'); add('C', '通年', { z: true });
  const st = { cats: [c], logs: {} };
  assert.equal(L.renameItem(st, 'f', 'A', 'A2').ok, true);
  assert.equal(c.meta.A2.z, true);
  assert.equal(L.mergeItems(st, 'f', ['A2', 'B'], 'A2').ok, true);
  assert.equal('z' in c.meta.A2, false); // Bは出す対象なので、統合後も出す
  add('D', '通年', { z: true });
  assert.equal(L.mergeItems(st, 'f', ['C', 'D'], 'C').ok, true);
  assert.equal(c.meta.C.z, true);
});

test('repairMeta: 真偽値でないzや、falseのzを取り除く', () => {
  const { c, add } = restCat(); add('A', '通年', { z: 'x' }); add('B', '通年', { z: false }); add('C', '通年', { z: true });
  const st = { cats: [c], logs: {} };
  assert.ok(L.repairMeta(st) >= 2);
  assert.equal('z' in c.meta.A, false);
  assert.equal('z' in c.meta.B, false);
  assert.equal(c.meta.C.z, true);
});

test('wardrobeRows: z の行と「出さない」だけの絞り込み。状態の並べ替えは 現役→出さない→手放した', () => {
  // 元の並びを「出さない→手放した→現役」にして、並べ替えの結果と区別できるようにする
  const { c, add } = restCat(); add('出さない', '通年', { z: true }); add('手放した', '通年', { r: true }); add('現役');
  const names = o => L.wardrobeRows(c, {}, o).map(r => r.name);
  assert.deepEqual(names({ status: 'kept' }), ['出さない']);
  assert.deepEqual(names({ status: 'active' }), ['出さない', '現役']); // 「現役」の絞り込みは、出さない服も含む（持っている服）
  assert.deepEqual(names({ status: 'all', sort: 'status' }), ['現役', '出さない', '手放した']);
  assert.equal(L.wardrobeRows(c, {}, { status: 'all' }).find(r => r.name === '出さない').z, true);
});

const rareLogs = () => Object.assign({},
  { '2026-11-20': { f: { v: ['新しい'] } }, '2026-10-01': { f: { v: ['古い'] } }, '2026-09-01': { f: { v: ['もっと古い', '少ない'] } } },
  { '2026-11-25': { f: { v: ['よく着る'] } }, '2026-11-24': { f: { v: ['よく着る'] } }, '2026-11-23': { f: { v: ['よく着る', '少ない'] } } });
function rareCat() {
  const { c, add } = restCat();
  add('新しい'); add('古い'); add('もっと古い'); add('よく着る'); add('少ない'); add('未着用');
  add('夏服', '夏'); add('出さない服', '通年', { z: true }); add('手放した服', '通年', { r: true });
  return c;
}

test('pickerSections: しばらく着ていない順。一度も着ていない服が先頭、次に最後に着た日が古い順', () => {
  const s = L.pickerSections(rareCat(), rareLogs(), { season: '冬', today: '2026-11-27', excludeDate: '2026-11-27', rareMode: 'idle' });
  assert.equal(s.rare[0].name, '未着用');
  assert.equal(s.rare[0].days, null);
  const rest = s.rare.slice(1).map(r => [r.name, r.days]);
  // 少ない(11/23=4日前)・もっと古い(9/1=87日前)・古い(10/1=57日前)・新しい(11/20=7日前)・よく着る(11/25=2日前)
  assert.deepEqual(rest, [['もっと古い', 87], ['古い', 57], ['新しい', 7], ['少ない', 4], ['よく着る', 2]]);
});

test('pickerSections: 着ていない服の列から、手放した服・出さない服・季節外の服は外れる（選択中でも出さない服は外れる）', () => {
  const c = rareCat();
  const s = L.pickerSections(c, rareLogs(), { season: '冬', today: '2026-11-27', excludeDate: '2026-11-27', rareMode: 'idle', selected: ['出さない服', '手放した服', '夏服'] });
  const names = s.rare.map(r => r.name);
  assert.ok(!names.includes('出さない服'));
  assert.ok(!names.includes('手放した服'));
  assert.ok(!names.includes('夏服')); // 冬の表示では夏の服は対象外
  const summer = L.pickerSections(c, rareLogs(), { season: '夏', today: '2026-11-27', excludeDate: '2026-11-27', rareMode: 'idle' });
  assert.ok(summer.rare.some(r => r.name === '夏服'));
  // 出さない服も、普通の一覧には残る（選べる）
  assert.ok(s.groups.flatMap(g => g.types.flatMap(t => t.items)).includes('出さない服'));
});

test('pickerSections: 回数が少ない順（着数は1着あたり）。同じなら最後に着た日が古い順、一度も着ていない服が先頭', () => {
  const c = rareCat(); c.meta['よく着る'].q = 3;
  const s = L.pickerSections(c, rareLogs(), { season: '冬', today: '2026-11-27', excludeDate: '2026-11-27', rareMode: 'few' });
  const by = Object.fromEntries(s.rare.map(r => [r.name, r]));
  assert.equal(s.rare[0].name, '未着用');
  assert.equal(by['よく着る'].count, 3);
  assert.equal(by['よく着る'].perPiece, 1); // 3回 ÷ 3着
  assert.equal(by['少ない'].count, 2);
  // 着数で割る：よく着る（3回÷3着=1）は、少ない（2回÷1着=2）より先に出る。回数だけで比べると逆になる
  assert.ok(s.rare.findIndex(r => r.name === 'よく着る') < s.rare.findIndex(r => r.name === '少ない'));
  // 1着あたり1回のもの同士は、最後に着た日が古い順
  const ones = s.rare.filter(r => r.perPiece === 1).map(r => r.name);
  assert.deepEqual(ones, ['もっと古い', '古い', '新しい', 'よく着る'].filter(n => ones.includes(n)));
});

test('pickerSections: 着ていない服の列は、記録している日より前の記録だけで数える（その日と、それより後は使わない）。検索中は出さない', () => {
  const c = rareCat();
  const logs = Object.assign({}, rareLogs(), { '2026-11-27': { f: { v: ['未着用'] } }, '2026-12-05': { f: { v: ['古い'] } } });
  const s = L.pickerSections(c, logs, { season: '冬', today: '2026-11-27', excludeDate: '2026-11-27', rareMode: 'idle' });
  assert.equal(s.rare[0].name, '未着用'); // 記録中の日の分は数えない
  assert.equal(s.rare.find(r => r.name === '古い').days, 57); // 未来の記録（12/5）は使わない
  assert.deepEqual(L.pickerSections(c, logs, { season: '冬', today: '2026-11-27', q: '古い', rareMode: 'idle' }).rare, []);
  assert.equal(L.pickerSections(c, logs, { season: '冬', today: '2026-11-27', rareMode: 'idle', recentMax: 3 }).rare.length, 3);
});

test('fashionStats: 「出さない」服は、バリエーションの母数と提案から外れる（統計の一覧と現役の点数には残る）', () => {
  const c = rareCat();
  const s = L.fashionStats(c, rareLogs(), { period: 'all', today: '2026-11-27', season: '冬' });
  const g = s.groups.find(x => x.id === 'tp');
  assert.ok(!g.tips.some(t => t.name === '出さない服'));
  assert.ok(g.items.some(i => i.name === '出さない服'));
  const base = L.fashionStats(Object.assign({}, c, { meta: Object.assign({}, c.meta, { '出さない服': { g: 'tp', t: '', s: '通年', q: 1, r: false } }) }), rareLogs(), { period: 'all', today: '2026-11-27', season: '冬' }).groups.find(x => x.id === 'tp');
  assert.equal(base.variety.total, g.variety.total + 1);
  assert.equal(base.activeCount, g.activeCount);
});

test('pickerSections: 「最近着た順」の列からも、「出さない」服は外す（8件に絞る前に外すので、件数は減らない）。普通の一覧には残る', () => {
  const { c, add } = restCat();
  for (let i = 0; i < 10; i++) add('服' + i);
  c.meta['服9'].z = true; // いちばん新しく着た服を「出さない」にする
  const logs = {};
  for (let i = 0; i < 10; i++) logs['2026-11-' + String(10 + i).padStart(2, '0')] = { f: { v: ['服' + i] } };
  const s = L.pickerSections(c, logs, { season: 'all', today: '2026-11-27', excludeDate: '2026-11-27' });
  assert.ok(!s.recent.includes('服9'));
  assert.equal(s.recent.length, 8); // 除外した分だけ減らず、次の服が繰り上がる
  assert.equal(s.recent[0], '服8');
  assert.ok(s.groups.flatMap(g => g.types.flatMap(t => t.items)).includes('服9')); // 普通の一覧では選べる
  // 選択中でも、上の列には出さない
  const sel = L.pickerSections(c, logs, { season: 'all', today: '2026-11-27', excludeDate: '2026-11-27', selected: ['服9'] });
  assert.ok(!sel.recent.includes('服9'));
});
