/**
 * cpt-tracker 用 start.gg 中継（Google Apps Script ウェブアプリ）
 *
 * - start.gg APIのトークンは「スクリプト プロパティ」に保存する（このファイルにもリポジトリにも書かない）
 * - 公開GETエンドポイントで、イベントの順位・生存者を整形した軽量JSONを返す（60秒キャッシュ。更新中・start.gg障害時は前回の応答を即返す）
 * - 呼べるイベントは EVENT_ID プロパティで固定（トークンの悪用防止）。クライアントからのパラメータは受け付けない
 *
 * 手順は SETUP.md を参照。コードを変更したら「デプロイを管理」→ 既存デプロイを編集 → 新バージョンで更新する
 * （新規デプロイにするとURLが変わり data/config.json の apiUrl を直す必要がある）。
 */

var STARTGG_ENDPOINT = 'https://api.start.gg/gql/alpha';
var CACHE_SECONDS = 60;          // この間は新しい応答をそのまま返す
var STALE_SECONDS = 21600;       // 古い応答の保管期間（CacheServiceの上限6時間）。更新中・エラー時に即返す
var LOCK_TRY_MS = 500;           // 更新担当になれなかったら古い応答を即返すための待ち時間
var LOCK_WAIT_FIRST_MS = 20000;  // 古い応答がまだ無い最初の1回だけ待つ
var PER_PAGE = 100;
var MAX_STANDING_PAGES = 15;   // 1500人まで（EVO France SF6は約1,070人）
var MAX_SET_PAGES = 15;
// start.ggのSet状態: 1=未開始, 2=進行中, 3=終了, 6=呼出し済み, 7=キュー待ち
var INCOMPLETE_SET_STATES = [1, 2, 6, 7];

function doGet() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('STARTGG_TOKEN');
  var eventId = Number(props.getProperty('EVENT_ID') || 1602225);
  if (!token) return jsonOut_({ ok: false, error: 'STARTGG_TOKEN未設定（SETUP.md参照）' });

  var cache = CacheService.getScriptCache();
  var freshKey = 'live:' + eventId;
  var staleKey = 'stale:' + eventId;
  var hit = cache.get(freshKey);
  if (hit) return textOut_(hit);

  // キャッシュ切れの瞬間に全員がstart.ggの取得完了を待つと同時実行の上限(30)を超えて詰まるため、
  // 更新できるのは1人だけ。他の人は待たずに「前回の応答」を即座に返す。
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TRY_MS)) {
    var stale = cache.get(staleKey);
    if (stale) return textOut_(markStale_(stale, null));
    // 古い応答がまだ無い（起動直後の最初の1回）ときだけ、更新担当の完了を待つ
    if (!lock.tryLock(LOCK_WAIT_FIRST_MS)) {
      return jsonOut_({ ok: false, error: '混雑しています。しばらくして再試行してください' });
    }
  }
  try {
    hit = cache.get(freshKey);
    if (hit) return textOut_(hit);
    var payload = JSON.stringify(fetchLive_(token, eventId));
    // CacheServiceは1キー100KBまで。超える場合はキャッシュせず返す
    if (payload.length < 95000) {
      cache.put(freshKey, payload, CACHE_SECONDS);
      cache.put(staleKey, payload, STALE_SECONDS);
    }
    return textOut_(payload);
  } catch (err) {
    var reason = String(err && err.message ? err.message : err);
    var fallback = cache.get(staleKey);
    // start.ggが一時的に落ちていても、前回の応答があればそれを返す（画面側で「古い」と表示される）
    if (fallback) return textOut_(markStale_(fallback, reason));
    return jsonOut_({ ok: false, error: reason });
  } finally {
    lock.releaseLock();
  }
}

/** 前回の応答に stale:true を付けて返す。fetchedAt は取得時刻のまま残す（画面が経過時間を出せるように）。 */
function markStale_(json, reason) {
  try {
    var obj = JSON.parse(json);
    obj.stale = true;
    if (reason) obj.staleReason = reason;
    return JSON.stringify(obj);
  } catch (e) {
    return json;
  }
}

function fetchLive_(token, eventId) {
  var head = gql_(token, 'query($id:ID!){event(id:$id){id name state numEntrants phases{id name state}}}', { id: eventId });
  var ev = head.event;
  if (!ev) throw new Error('イベントが見つかりません: ' + eventId);

  // 順位（全員）。確定済みの早期敗退者の順位はクライアントが0ptとして扱うため、上位64位以内＋生存者だけ返す
  var standingsAll = [];
  var roster = [];
  var page = 1;
  var totalPages = 1;
  do {
    var d = gql_(token,
      'query($id:ID!,$p:Int!,$n:Int!){event(id:$id){standings(query:{page:$p,perPage:$n}){pageInfo{totalPages} nodes{placement entrant{id name participants{player{gamerTag}}}}}}}',
      { id: eventId, p: page, n: PER_PAGE });
    var st = d.event.standings;
    totalPages = st.pageInfo.totalPages || 1;
    (st.nodes || []).forEach(function (node) {
      if (!node.entrant) return;
      var tag = firstTag_(node.entrant);
      standingsAll.push({ id: String(node.entrant.id), tag: tag, name: node.entrant.name, placement: node.placement });
      roster.push(tag || node.entrant.name);
    });
    page++;
  } while (page <= totalPages && page <= MAX_STANDING_PAGES);

  // 生存者 = 未終了のSetのスロットに入っているentrant
  var alive = {};
  page = 1;
  totalPages = 1;
  do {
    var s = gql_(token,
      'query($id:ID!,$p:Int!,$n:Int!,$st:[Int]){event(id:$id){sets(page:$p,perPage:$n,sortType:NONE,filters:{state:$st}){pageInfo{totalPages} nodes{slots{entrant{id}}}}}}',
      { id: eventId, p: page, n: PER_PAGE, st: INCOMPLETE_SET_STATES });
    var sets = s.event.sets;
    totalPages = sets.pageInfo.totalPages || 1;
    (sets.nodes || []).forEach(function (node) {
      (node.slots || []).forEach(function (slot) {
        if (slot && slot.entrant && slot.entrant.id != null) alive[String(slot.entrant.id)] = true;
      });
    });
    page++;
  } while (page <= totalPages && page <= MAX_SET_PAGES);

  var aliveIds = Object.keys(alive);
  var completed = String(ev.state).toUpperCase() === 'COMPLETED';
  var keep = standingsAll.filter(function (x) {
    return alive[x.id] || (x.placement != null && x.placement <= 64);
  });

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    eventState: ev.state,
    eventName: ev.name,
    numEntrants: ev.numEntrants,
    phases: (ev.phases || []).map(function (p) { return { name: p.name, state: p.state }; }),
    aliveCount: completed ? 0 : aliveIds.length,
    aliveIds: completed ? [] : aliveIds,
    standings: keep,
    roster: roster
  };
}

function firstTag_(entrant) {
  var ps = entrant.participants || [];
  for (var i = 0; i < ps.length; i++) {
    if (ps[i] && ps[i].player && ps[i].player.gamerTag) return ps[i].player.gamerTag;
  }
  return null;
}

function gql_(token, query, variables) {
  var lastErr;
  for (var attempt = 0; attempt < 3; attempt++) {
    var res = UrlFetchApp.fetch(STARTGG_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ query: query, variables: variables }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 429 || code >= 500) { lastErr = 'start.gg HTTP ' + code; Utilities.sleep(1500 * (attempt + 1)); continue; }
    var body = JSON.parse(res.getContentText());
    if (code !== 200 || body.errors) throw new Error('start.gg: ' + JSON.stringify(body.errors || body.message || code).slice(0, 300));
    return body.data;
  }
  throw new Error(lastErr || 'start.gg 取得失敗');
}

function textOut_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function jsonOut_(obj) {
  return textOut_(JSON.stringify(obj));
}

/** エディタから手動実行して動作確認する用（ログに先頭だけ出す）。 */
function debugRun() {
  var out = doGet().getContent();
  Logger.log(out.slice(0, 1500));
}
