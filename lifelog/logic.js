// LifeLog のロジック（DOMに触れない純粋関数）。
// ブラウザでは <script src="logic.js"> で読み込み、グローバル `LifeLogLogic` として使う。
// Node（npm test）では require() で読み込む。クラシックスクリプトのまま使うため UMD 形式にしている。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LifeLogLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  return { dedupeValues, mergeSelection, freePrefill, repairLogs };
});
