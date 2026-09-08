import { describe, expect, test, vi } from "vitest";
import { PlaybackQueue, queueRowViews, songDisplayLabel, nowPlayingLabel } from "./queue";
import { PlaybackAuthenticationRequiredError } from "./playback";
import { PlaybackAuthenticationGate } from "./playbackAuthGate";
import { PlaybackContinuationRegistry } from "./playbackContinuation";
import { parseIndexRows, type Song } from "./catalog";
import { INDEX_SHEET_HEADER } from "./sheets";
const song = (fileId: string): Song => ({ fileId, parentId: "p", title: fileId, artist: "", album: "", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", releaseType: "" });
const indexRow = (values: Record<string, string>): string[] => INDEX_SHEET_HEADER.map((header) => values[header] ?? "");
class Audio { listener: (() => void) | undefined; addEventListener(_: "ended", listener: () => void) { this.listener = listener; } }
describe("PlaybackQueue", () => {
  test("除外、新しいリストでのリセット、next/previous/ended、最後で停止を扱う", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]); queue.exclude("b", true); expect(queue.list().map((s) => s.fileId)).toEqual(["a", "c"]);
    await queue.playAt(0); await queue.next(); await queue.next(); await queue.previous(); audio.listener?.();
    await vi.waitFor(() => expect(played).toEqual(["a", "c", "a", "c"])); queue.setList([song("b")]); expect(queue.list().map((s) => s.fileId)).toEqual(["b"]);
  });
  test("現在曲より前を除外しても次曲を飛ばさない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]); await queue.playAt(1); queue.exclude("a", true); await queue.next();
    expect(played).toEqual(["b", "c"]);
  });
  test("未再生のリストでpreviousを押しても何も再生しない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b")]); await queue.previous();
    expect(played).toEqual([]);
  });
  test("shuffleは同じ曲集合を並べ替え、注入したrandomに従った決定的な順序になる（Fisher-Yates）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]);
    // 常に0を返すrandom＝各ステップでi=0側（先頭）の要素と交換し続けるため、結果は逆順になる。
    await queue.shuffle(() => 0);
    expect(queue.all().map((s) => s.fileId)).toEqual(["b", "c", "d", "a"]);
    expect(queue.all().map((s) => s.fileId).sort()).toEqual(["a", "b", "c", "d"]);
  });
  test("shuffleは再生中の曲・除外設定を変えない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]); queue.exclude("b", true); await queue.playAt(0);
    await queue.shuffle(() => 0.999);
    expect(queue.currentPlayingFileId()).toBe("a");
    expect(queue.isExcluded("b")).toBe(true);
  });
  test("再生中にshuffleしても現在曲の位置は変わらず、後ろの区間だけが並べ替わる（2026-09-06 レビュー指摘）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]); await queue.playAt(0); // aが再生中（index 0）
    await queue.shuffle(() => 0);
    // 現在曲aはindex0のまま。後ろのb/c/dだけがFisher-Yatesで並べ替わる。
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "d", "b"]);
  });
  test("再生中にshuffleしても、next()で残りの曲を1曲も失わずに全て辿れる（2026-09-06 レビュー指摘：現在曲を含めて全体をシャッフルすると、現在曲より前へ移動した曲がnext()から永久に到達不能になり、残り曲があっても再生が止まっていた）", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]); await queue.playAt(0);
    await queue.shuffle(() => 0);
    while (await queue.next()) { /* 到達可能な限り辿る */ }
    expect(played[0]).toBe("a");
    expect(played.slice(1).sort()).toEqual(["b", "c", "d"]);
    expect(played).toHaveLength(4);
  });
  test("進行中のnext()がcurrentFileIdを確定させる前にshuffleしても、確定後を基準に並べ替わり残り曲を全て辿れる（2026-09-06 レビュー再指摘：競合）", async () => {
    const played: string[] = []; let resolvePlayB: (() => void) | undefined;
    const audio = new Audio();
    const queue = new PlaybackQueue({
      play: async (id) => {
        played.push(id);
        if (id === "b") await new Promise<void>((resolve) => { resolvePlayB = resolve; });
      },
    }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]);
    await queue.playAt(0); // aが再生中
    const nextPromise = queue.next(); // bへの遷移を開始。player.play("b")がresolvePlayBで保留される
    await vi.waitFor(() => expect(played).toContain("b"));
    // この時点でcurrentFileIdはまだ"a"（bのplay()未解決）。shuffleはpendingMoveの
    // チェーンに参加するため、next()の完了（currentFileId="b"確定）を待ってから実行される。
    const shufflePromise = queue.shuffle(() => 0);
    resolvePlayB?.();
    await nextPromise; await shufflePromise;
    expect(queue.currentPlayingFileId()).toBe("b");
    while (await queue.next()) { /* 到達可能な限り辿る */ }
    expect(played.filter((id) => id !== "a" && id !== "b").sort()).toEqual(["c", "d"]);
  });
  test("canResumeCurrentは未再生でfalse、再生中/一時停止中はtrue、notifyExternalPlaybackStarted後はfalse（2026-09-06 PR #418 ChatGPTレビュー指摘）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    expect(queue.canResumeCurrent()).toBe(false);
    await queue.playAt(0);
    expect(queue.canResumeCurrent()).toBe(true);
    // キュー外の単曲試聴（main.tsのstartExternalPlayback()相当）に切り替わると、
    // currentPlayingFileId()自体は温存されるがcanResumeCurrent()はfalseになる
    // （試聴中の再生位置のままキューの古い曲を誤って再開してしまうことを防ぐ）。
    queue.notifyExternalPlaybackStarted();
    expect(queue.currentPlayingFileId()).toBe("a");
    expect(queue.canResumeCurrent()).toBe(false);
  });
  test("advanceOnEndedはキューを最後まで自然再生し終えるとcanResumeCurrentをfalseにする（2026-09-06 PR #418 ChatGPTレビュー再々指摘）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    await queue.playAt(0);
    // aからbへは進める（末尾に到達していないため、canResumeCurrentはtrueのまま）。
    expect(await queue.advanceOnEnded()).toBe(true);
    expect(queue.canResumeCurrent()).toBe(true);
    // bが最後の曲のため、advanceOnEndedはfalseを返し、以後は「再生」ボタンがplayAt(0)で
    // 先頭から再生し直せるようcanResumeCurrentをfalseへ遷移させる（currentPlayingFileId()
    // 自体は最後に再生した曲bのまま、UIの現在曲ハイライト表示は壊さない）。
    expect(await queue.advanceOnEnded()).toBe(false);
    expect(queue.currentPlayingFileId()).toBe("b");
    expect(queue.canResumeCurrent()).toBe(false);
  });
  test("次へボタンの末尾での空振りクリック（next()）はcanResumeCurrentを変えない（曲はまだ再生中のため一時停止して再開する既存動作を壊さない）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    await queue.playAt(1); // 最後の曲bが再生中
    expect(await queue.next()).toBe(false);
    expect(queue.canResumeCurrent()).toBe(true);
  });
  test("canResumeCurrentは現在曲が除外済みだとfalseになる（2026-09-06 PR #418 ChatGPTレビュー再々指摘：resume()自体は除外中のfileIdを拒否するため、除外済みの現在曲でtrueを返すと「再生」ボタンが何も再生できなくなる）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    await queue.playAt(0);
    expect(queue.canResumeCurrent()).toBe(true);
    queue.exclude("a", true);
    expect(queue.canResumeCurrent()).toBe(false);
  });
  test("hasShuffleHistoryはshuffle前false、shuffle後true、unshuffle後false", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    expect(queue.hasShuffleHistory()).toBe(false);
    await queue.shuffle(() => 0);
    expect(queue.hasShuffleHistory()).toBe(true);
    await queue.unshuffle();
    expect(queue.hasShuffleHistory()).toBe(false);
  });
  test("unshuffleはshuffle前の並び順に戻し、再生中の曲・除外設定は変えない", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]);
    queue.exclude("c", true);
    await queue.playAt(0);
    await queue.shuffle(() => 0);
    expect(queue.all().map((s) => s.fileId)).not.toEqual(["a", "b", "c", "d"]);
    const result = await queue.unshuffle();
    expect(result).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b", "c", "d"]);
    expect(queue.currentPlayingFileId()).toBe("a");
    expect(queue.isExcluded("c")).toBe(true);
  });
  test("シャッフル後にnext()で再生位置が進んでからunshuffleしても、未再生曲を飛ばさず・再生済み曲を再度辿らない（2026-09-06 PR #418 ChatGPTレビュー指摘）", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]);
    await queue.playAt(0); // aが再生中
    await queue.shuffle(() => 0); // b/c/dの区間をシャッフル → [a, c, d, b]
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "d", "b"]);
    await queue.next(); // cへ進む（シャッフル後の並びを辿った結果、bと再生順が入れ替わっている）
    expect(queue.currentPlayingFileId()).toBe("c");
    await queue.unshuffle();
    // 再生済み（a, c）はその通りの順で先頭に残り、未再生（b, d）は元の相対順（b→d）で後ろに続く。
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "b", "d"]);
    while (await queue.next()) { /* 到達可能な限り辿る */ }
    // 修正前は配列全体を元の並び[a,b,c,d]へ戻していたため、currentFileId="c"はindex2に位置し、
    // next()がindex1のb（本来まだ未再生）を永久にスキップしていた。
    expect(played).toEqual(["a", "c", "b", "d"]);
  });
  test("連続してshuffleしても、unshuffleは一度も並べ替えていない元の並びに戻す", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c"), song("d")]);
    await queue.shuffle(() => 0);
    await queue.shuffle(() => 0.5);
    await queue.unshuffle();
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b", "c", "d"]);
  });
  test("unshuffleはshuffle履歴が無い場合falseを返し何もしない", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    const result = await queue.unshuffle();
    expect(result).toBe(false);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b"]);
  });
  test("setListで新しいリストを作るとshuffle履歴はリセットされる", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    await queue.shuffle(() => 0);
    expect(queue.hasShuffleHistory()).toBe(true);
    queue.setList([song("x"), song("y")]);
    expect(queue.hasShuffleHistory()).toBe(false);
  });
  test("sortByは常にリスト全体（再生中の曲を含む）を対象に並べ替え、currentFileId自体・除外設定は変えない（開発体制#42、実機フィードバックによりプレフィックス固定を廃止）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("banana"), song("apple"), song("cherry")]);
    queue.exclude("cherry", true);
    await queue.playAt(0); // "banana"が再生中（現在位置=0）
    const result = await queue.sortBy("title", "asc");
    expect(result).toBe(true);
    // 旧仕様では現在曲"banana"はプレフィックスとして先頭に固定されていたが、新仕様では
    // 現在曲も含めて全曲がタイトル順に並べ替えられる。
    expect(queue.all().map((s) => s.fileId)).toEqual(["apple", "banana", "cherry"]);
    // currentFileId自体（並べ替えでどの曲が「現在曲」かという指し先）は不変。
    expect(queue.currentPlayingFileId()).toBe("banana");
    expect(queue.isExcluded("cherry")).toBe(true);
  });
  test("sortByで現在曲が新しい並びで後方へ移動すると、next()はそれより前に来た未再生曲へ到達できない（全体ソートを優先する以上のトレードオフとして許容、開発体制#42でユーザーと確認済み）", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("c"), song("a"), song("b")]);
    await queue.playAt(0); // "c"が再生中（現在位置=0）
    await queue.sortBy("title", "asc"); // 全体をタイトル昇順で並べ替え: [a, b, c]（cが末尾へ移動）
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b", "c"]);
    // cは末尾に移動したため、next()はそこから先を探索してももう曲が無く空振りする。
    expect(await queue.next()).toBe(false);
    expect(played).toEqual(["c"]);
  });
  test("sortByは再生中でない場合（isQueuePlayback=false、単曲試聴後や自然終了後を含む）も同様に全曲を並べ替える", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("c"), song("a"), song("b")]);
    await queue.playAt(0); // "c"が再生中（キュー再生）
    queue.notifyExternalPlaybackStarted(); // キュー外の単曲試聴へ切り替え（currentFileIdは温存）
    const result = await queue.sortBy("title", "asc");
    expect(result).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b", "c"]);
  });
  test("sortBy後、next()はfileIdで現在位置を探し直すため新しい並びをそのまま辿れる", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("c"), song("a"), song("b")]);
    await queue.playAt(0); // "c"が再生中
    await queue.sortBy("title", "desc"); // 新しい並び: c, b, a（降順のためcは先頭のまま）
    while (await queue.next()) { /* 到達可能な限り辿る */ }
    expect(played).toEqual(["c", "b", "a"]);
  });
  test("sortByはシャッフル履歴を無効化する（手動並び替え後は「シャッフルを元に戻す」は使えなくなる）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("banana"), song("apple")]);
    await queue.shuffle(() => 0);
    expect(queue.hasShuffleHistory()).toBe(true);
    await queue.sortBy("title", "asc");
    expect(queue.hasShuffleHistory()).toBe(false);
  });
  test("sortByはアーティストでソートする際、同じアーティスト内をアルバム→ディスク→トラック番号順に揃える", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    const songs: Song[] = [
      { ...song("1"), artist: "B", album: "Y", discNumber: "1", trackNumber: "2" },
      { ...song("2"), artist: "A", album: "X", discNumber: "1", trackNumber: "2" },
      { ...song("3"), artist: "A", album: "X", discNumber: "1", trackNumber: "1" },
    ];
    queue.setList(songs);
    await queue.sortBy("artist", "asc");
    expect(queue.all().map((s) => s.fileId)).toEqual(["3", "2", "1"]);
  });
  test("sortByはリリース年を数値として並べ替え、不明な年は末尾に置く", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    const songs: Song[] = [
      { ...song("1"), releaseYear: "2" },
      { ...song("2"), releaseYear: "10" },
      { ...song("3"), releaseYear: "" },
    ];
    queue.setList(songs);
    await queue.sortBy("releaseYear", "asc");
    expect(queue.all().map((s) => s.fileId)).toEqual(["1", "2", "3"]);
  });
  test("sortByは第二候補を指定すると、第一候補が同値の曲同士を第二候補で並べ替える（開発体制#42、例：アルバムを古い順に、その中はトラック順に）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    const songs: Song[] = [
      { ...song("1"), releaseYear: "2000", trackNumber: "2" },
      { ...song("2"), releaseYear: "2000", trackNumber: "1" },
      { ...song("3"), releaseYear: "1990", trackNumber: "5" },
    ];
    queue.setList(songs);
    await queue.sortBy("releaseYear", "asc", "track", "asc");
    expect(queue.all().map((s) => s.fileId)).toEqual(["3", "2", "1"]);
  });
  test("setListは呼び出し元の配列をコピーする。moveSong/shuffleのその場での入れ替えが呼び出し元の配列自体を破壊しない（2026-09-08、Codexレビュー指摘：P2。例えばアルバム再生ボタンがloadedAlbumGroups由来の配列をそのまま渡すと、以前は上下ボタン後に同じアルバムを再度読み込んでもdisc/track順に戻らなくなっていた）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    const original = [song("a"), song("b"), song("c")];
    const originalOrderSnapshot = original.map((s) => s.fileId);
    queue.setList(original);
    await queue.moveSong("c", "up");
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "b"]);
    // 呼び出し元が保持し続けている配列自体は変更されていない。
    expect(original.map((s) => s.fileId)).toEqual(originalOrderSnapshot);
  });
  test("whenIdleはそれまでにキューイングされた操作（moveSong等）が完了するまで待つ（2026-09-08、Codexレビュー指摘：P2。保存ボタン等がlist()を読む前にこれを待たないと、pendingMove待機中の並べ替え未反映のスナップショットを読んでしまう）", async () => {
    let releaseFirstPlay: (() => void) | null = null;
    const audio = new Audio();
    const queue = new PlaybackQueue({
      play: async () => { await new Promise<void>((resolve) => { releaseFirstPlay = resolve; }); },
    }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    const firstPlay = queue.playAt(0); // "a"の再生開始、まだ解決しない（保留中）
    await vi.waitFor(() => expect(releaseFirstPlay).not.toBeNull());
    const movePromise = queue.moveSong("c", "up"); // "a"の再生保留中にキューイングされる
    let idleResolved = false;
    const idlePromise = queue.whenIdle().then(() => { idleResolved = true; });
    // マイクロタスクを1回消化させても、まだ最初のplay()を解放していないため、
    // moveSongもwhenIdleもまだ完了していないはず。
    await Promise.resolve(); await Promise.resolve();
    expect(idleResolved).toBe(false);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b", "c"]); // moveSong未反映
    releaseFirstPlay!();
    await firstPlay; await movePromise; await idlePromise;
    expect(idleResolved).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "b"]); // whenIdle後は反映済み
  });
  test("generationIdはsetList()のたびに進み、moveSong等の並べ替えでは変わらない（2026-09-08、Codexレビュー指摘：P2続き。whenIdle()待機中に全く別のキューへ差し替えられていないかを呼び出し元が確認するために使う）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    const generation1 = queue.generationId();
    await queue.moveSong("a", "down");
    expect(queue.generationId()).toBe(generation1); // 並べ替えでは進まない
    queue.setList([song("c"), song("d")]);
    expect(queue.generationId()).not.toBe(generation1); // 差し替えでは進む
  });
  test("exclusionVersionはexclude()のたびに進む（2026-09-08、Codexレビュー指摘：P2続き。exclude()はsetList()を経由しないためgenerationIdでは検出できない「除外/除外解除だけの変更」を呼び出し元が検出するために使う）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    const version1 = queue.exclusionVersion();
    const generation1 = queue.generationId();
    queue.exclude("b", true);
    expect(queue.exclusionVersion()).not.toBe(version1);
    expect(queue.generationId()).toBe(generation1); // exclude()はgenerationIdを進めない
  });
  test("moveSongは指定した曲を1つ上/下へ入れ替える（開発体制#42②、上下ボタン）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    expect(await queue.moveSong("b", "up")).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["b", "a", "c"]);
    expect(await queue.moveSong("b", "down")).toBe(true);
    expect(await queue.moveSong("b", "down")).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "b"]);
  });
  test("moveSongは先頭を上へ・末尾を下へ動かそうとすると何もせずfalseを返す", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    expect(await queue.moveSong("a", "up")).toBe(false);
    expect(await queue.moveSong("b", "down")).toBe(false);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "b"]);
  });
  test("moveSongは除外中の曲も特別扱いせず、表示順そのままの隣接行と入れ替える", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    queue.exclude("b", true);
    // "c"を上へ動かすと、除外中の"b"を飛び越えず、隣接する"b"とだけ入れ替わる。
    expect(await queue.moveSong("c", "up")).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "b"]);
    expect(queue.isExcluded("b")).toBe(true);
  });
  test("moveSongは存在しないfileIdに対してfalseを返す", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    expect(await queue.moveSong("missing", "up")).toBe(false);
  });
  test("moveSongはcurrentFileId・除外設定を変えず、シャッフル履歴を無効化する", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    queue.exclude("c", true);
    await queue.playAt(0); // "a"が再生中
    await queue.shuffle(() => 0);
    expect(queue.hasShuffleHistory()).toBe(true);
    await queue.moveSong("b", "up");
    expect(queue.currentPlayingFileId()).toBe("a");
    expect(queue.isExcluded("c")).toBe(true);
    expect(queue.hasShuffleHistory()).toBe(false);
  });
  test("moveSongは再生中の曲自体も動かせる（常にリスト全体が対象、開発体制#42と同じ方針）", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    await queue.playAt(0); // "a"が再生中
    expect(await queue.moveSong("a", "down")).toBe(true);
    expect(queue.all().map((s) => s.fileId)).toEqual(["b", "a", "c"]);
    expect(queue.currentPlayingFileId()).toBe("a");
  });
  test("playFileIdは指定したfileIdの曲を再生する", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    expect(await queue.playFileId("b")).toBe(true);
    expect(played).toEqual(["b"]);
    expect(queue.currentPlayingFileId()).toBe("b");
  });
  test("playFileIdは除外中の曲・存在しないfileIdに対してfalseを返す", async () => {
    const audio = new Audio(); const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a"), song("b")]);
    queue.exclude("b", true);
    expect(await queue.playFileId("b")).toBe(false);
    expect(await queue.playFileId("missing")).toBe(false);
  });
  test("playFileIdはpendingMove待機中の並べ替えの後でもfileIdで解決するため、待機中にクリックしても意図した曲が再生される（2026-09-08、Codexレビュー指摘の回帰防止：main.tsの曲名クリックが描画時点のインデックスに依存していると、待機中の並べ替え完了後に別の曲が再生されうる）", async () => {
    const played: string[] = [];
    let releaseFirstPlay: (() => void) | null = null;
    const audio = new Audio();
    const queue = new PlaybackQueue({
      play: async (id) => {
        played.push(id);
        if (played.length === 1) await new Promise<void>((resolve) => { releaseFirstPlay = resolve; });
      },
    }, audio);
    queue.setList([song("a"), song("b"), song("c")]);
    const firstPlay = queue.playAt(0); // "a"の再生開始、まだ解決しない（保留中）
    await vi.waitFor(() => expect(releaseFirstPlay).not.toBeNull());
    // "a"の再生が保留中の間に、「cを上へ動かす」操作と「cをクリックする」操作を続けてキューイングする。
    const movePromise = queue.moveSong("c", "up"); // 完了すると[a, c, b]になる
    const clickPromise = queue.playFileId("c"); // クリック時点のインデックスに関わらず"c"を再生するべき
    releaseFirstPlay!();
    await firstPlay;
    await movePromise;
    expect(await clickPromise).toBe(true);
    expect(played[played.length - 1]).toBe("c");
    expect(queue.all().map((s) => s.fileId)).toEqual(["a", "c", "b"]);
  });
  test("キュー再生の終了時だけ次の曲へ進み、単曲試聴後の終了では進まない", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    queue.setList([song("a"), song("b")]); await queue.playAt(0); audio.listener?.();
    await vi.waitFor(() => expect(played).toEqual(["a", "b"]));
    queue.notifyExternalPlaybackStarted(); audio.listener?.();
    expect(played).toEqual(["a", "b"]);
  });
  test("失敗した再生を再試行し、endedの失敗を通知する", async () => {
    const audio = new Audio(); const error = new Error("temporary"); const onError = vi.fn();
    const play = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
    const queue = new PlaybackQueue({ play }, audio, onError);
    queue.setList([song("a"), song("b")]); await expect(queue.next()).rejects.toThrow("temporary"); await queue.next();
    audio.listener?.(); await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(play.mock.calls.map(([id]) => id)).toEqual(["a", "a", "b"]);
  });
  test("再生開始中に次へを連続で押すと、異なる曲へ順に進む", async () => {
    const audio = new Audio(); let resolveFirst: (() => void) | undefined;
    const firstPlayback = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const play = vi.fn().mockImplementationOnce(() => firstPlayback).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("a"), song("b"), song("c")]);

    const firstNext = queue.next();
    const secondNext = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("a"));
    expect(play).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await Promise.all([firstNext, secondNext]);

    expect(play.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  });
  test("リスト差し替え後は、待機中だった旧リストの移動を反映しない", async () => {
    const audio = new Audio(); let resolvePlayback: (() => void) | undefined;
    const playback = new Promise<void>((resolve) => { resolvePlayback = resolve; });
    const play = vi.fn().mockImplementationOnce(() => playback).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("old-a"), song("old-b")]);

    const oldMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("old-a"));
    queue.setList([song("new-a"), song("new-b")]);
    resolvePlayback?.();
    await oldMove;
    audio.listener?.();
    expect(play).toHaveBeenCalledTimes(1);

    await queue.next();
    expect(play.mock.calls.map(([id]) => id)).toEqual(["old-a", "new-a"]);
  });
  test("リスト差し替え後の移動は、旧リストの未解決の再生を待たない", async () => {
    const audio = new Audio(); let resolveOldPlayback: (() => void) | undefined;
    const oldPlayback = new Promise<void>((resolve) => { resolveOldPlayback = resolve; });
    const play = vi.fn().mockImplementationOnce(() => oldPlayback).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("old-a")]);

    const oldMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("old-a"));
    queue.setList([song("new-a")]);
    const newMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("new-a"));
    await newMove;

    resolveOldPlayback?.();
    await expect(oldMove).resolves.toBe(false);
  });

  test("重複を除いたカタログなら次曲へ進める", async () => {
    const played: string[] = []; const audio = new Audio(); const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    const songs = parseIndexRows([indexRow({ fileId: "a", title: "first" }), indexRow({ fileId: "a", title: "duplicate" }), indexRow({ fileId: "b" })]);
    queue.setList(songs);
    await queue.next(); await queue.next();
    expect(played).toEqual(["a", "b"]);
  });

  test("曲を開始しなかった移動はfalseを返し、UIが再生中と誤表示しないための情報を渡す", async () => {
    const audio = new Audio();
    const queue = new PlaybackQueue({ play: async () => {} }, audio);
    queue.setList([song("a")]);

    expect(await queue.previous()).toBe(false);
    expect(await queue.next()).toBe(true);
    expect(await queue.next()).toBe(false);
  });

  test("endedの自動送りを外側の認証ゲート経由ハンドラへ委譲できる", async () => {
    const audio = new Audio();
    const onEnded = vi.fn();
    const queue = new PlaybackQueue({ play: async () => {} }, audio, () => {}, onEnded);
    queue.setList([song("a"), song("b")]);
    await queue.next();

    audio.listener?.();

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test("現在のキュー曲を指定位置から再開できる", async () => {
    const audio = new Audio();
    const play = vi.fn(async () => {});
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("a")]);
    await queue.next();
    await queue.resumeCurrent(42.25);

    expect(play.mock.calls).toEqual([["a"], ["a", 42.25]]);
  });

  test("最初の曲のnative playが未解決でも、開始前フックが継続情報を登録できる", async () => {
    const audio = new Audio();
    let settlePlay!: () => void;
    const nativePlay = new Promise<void>((resolve) => { settlePlay = resolve; });
    const registry = new PlaybackContinuationRegistry();
    const beforePlay = vi.fn((fileId: string) => registry.register({ fileId, generation: 1, resume: async () => true }));
    const queue = new PlaybackQueue({ play: () => nativePlay }, audio, () => {}, null, beforePlay);
    queue.setList([song("a")]);

    const move = queue.next();
    await vi.waitFor(() => expect(beforePlay).toHaveBeenCalledWith("a"));
    expect(queue.currentPlayingFileId()).toBeNull();
    registry.recordTokenRequest("first-request", "a", 1, "rejected-token");
    expect(registry.acceptTokenRejection("first-request", "a", "rejected-token")).not.toBeNull();
    settlePlay();
    await expect(move).resolves.toBe(true);
  });

  test("認証継続は401後も未解決の元のキュー移動を待たずに再生する", async () => {
    const audio = new Audio();
    let settleOriginal!: () => void;
    const originalPlay = new Promise<void>((resolve) => { settleOriginal = resolve; });
    const play = vi.fn().mockImplementationOnce(() => originalPlay).mockResolvedValueOnce(undefined);
    const queue = new PlaybackQueue({ play }, audio);
    queue.setList([song("a")]);

    const originalMove = queue.next();
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("a"));
    const resumed = queue.resume("a", 12.5);
    await vi.waitFor(() => expect(play).toHaveBeenCalledWith("a", 12.5));
    await expect(resumed).resolves.toBe(true);

    settleOriginal();
    await expect(originalMove).resolves.toBe(true);
  });

  test("自動送り中の認証待ちは次曲を保留し、明示的な継続後に同じ次曲を再開する", async () => {
    const audio = new Audio();
    const played: string[] = [];
    const gate = new PlaybackAuthenticationGate(async () => {});
    const player = {
      play: vi.fn(async (fileId: string) => {
        played.push(fileId);
        if (fileId === "b" && played.filter((id) => id === "b").length === 1) {
          throw new PlaybackAuthenticationRequiredError();
        }
      }),
    };
    let queue!: PlaybackQueue;
    const advance = async () => {
      try {
        await queue.next();
      } catch (error) {
        if (error instanceof PlaybackAuthenticationRequiredError) gate.defer(advance);
        else throw error;
      }
    };
    queue = new PlaybackQueue(player, audio, () => {}, () => void advance());
    queue.setList([song("a"), song("b")]);
    await queue.next();

    audio.listener?.();
    await vi.waitFor(() => expect(gate.hasPendingOperation()).toBe(true));
    await gate.continueFromUserGesture();

    expect(played).toEqual(["a", "b", "b"]);
    expect(queue.currentPlayingFileId()).toBe("b");
  });
});

describe("queueRowViews", () => {
  test("除外されていない曲だけがlistIndexを持ち、list()と同じ順序で採番される", () => {
    const songs = [song("a"), song("b"), song("c")];
    const excluded = new Set(["b"]);
    const views = queueRowViews(songs, (fileId) => excluded.has(fileId), null);
    expect(views.map((v) => ({ fileId: v.song.fileId, excluded: v.excluded, listIndex: v.listIndex }))).toEqual([
      { fileId: "a", excluded: false, listIndex: 0 },
      { fileId: "b", excluded: true, listIndex: null },
      { fileId: "c", excluded: false, listIndex: 1 },
    ]);
  });

  test("listIndexは実際にPlaybackQueue.playAt()が受け付けるインデックスと一致する", async () => {
    const played: string[] = [];
    const audio = new Audio();
    const queue = new PlaybackQueue({ play: async (id) => { played.push(id); } }, audio);
    const songs = [song("a"), song("b"), song("c")];
    queue.setList(songs);
    queue.exclude("a", true);
    const views = queueRowViews(songs, (fileId) => queue.isExcluded(fileId), queue.currentPlayingFileId());
    const cView = views.find((v) => v.song.fileId === "c")!;
    await queue.playAt(cView.listIndex!);
    expect(played).toEqual(["c"]);
  });

  test("currentFileIdと一致する曲のisCurrentがtrueになる", () => {
    const songs = [song("a"), song("b")];
    const views = queueRowViews(songs, () => false, "b");
    expect(views.map((v) => v.isCurrent)).toEqual([false, true]);
  });
});

describe("songDisplayLabel / nowPlayingLabel", () => {
  test("タイトルのみの曲はタイトルだけを表示する", () => {
    const bare: Song = { fileId: "x", parentId: "p", title: "Title", artist: "", album: "", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", releaseType: "" };
    expect(songDisplayLabel(bare)).toBe("Title");
  });

  test("アーティスト・アルバム・フォルダパスがあれば連結する", () => {
    const full: Song = { fileId: "x", parentId: "p", title: "Title", artist: "Artist", album: "Album", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", releaseType: "", folderPath: "A / B" };
    expect(songDisplayLabel(full)).toBe("Title — Artist / Album [A / B]");
  });

  test("nowPlayingLabelは曲が無ければ空文字列、あれば「再生中: 」を前置する", () => {
    expect(nowPlayingLabel(undefined)).toBe("");
    expect(nowPlayingLabel(song("a"))).toBe("再生中: a");
  });
});
