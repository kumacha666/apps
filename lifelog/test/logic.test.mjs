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
