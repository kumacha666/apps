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
  assert.deepEqual(r, { ok: true, name: '黒Tシャツ', merged: 1, logsChanged: 3 });
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
  assert.equal(L.repairMeta({ cats: [null, { meta: 'x' }] }), 0);
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
