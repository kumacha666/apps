import { describe, expect, test } from "vitest";
import { EndOfStreamError } from "strtok3";
import { DriveRangeTokenizer, type FetchRangeFn } from "./rangeTokenizer";

// 実Driveを叩かずにDriveRangeTokenizerの読み出しロジックを検証するための、
// メモリ上のバッファをRangeリクエスト相当で切り出すフェイク。
function makeFakeSource(size: number) {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) data[i] = i % 256;

  let requestCount = 0;
  const fetchRange: FetchRangeFn = async (start, endInclusive) => {
    requestCount += 1;
    if (start > endInclusive) throw new Error("start must not exceed end");
    if (endInclusive >= size) throw new Error("range must stay within file size");
    return data.subarray(start, endInclusive + 1);
  };

  return { data, fetchRange, getRequestCount: () => requestCount };
}

describe("DriveRangeTokenizer", () => {
  test("readBufferは要求範囲を正しい内容で埋める", async () => {
    const { data, fetchRange } = makeFakeSource(200_000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const out = new Uint8Array(1000);
    const written = await tokenizer.readBuffer(out, { position: 150_000, length: 1000 });

    expect(written).toBe(1000);
    expect(out).toEqual(data.subarray(150_000, 151_000));
    expect(tokenizer.position).toBe(151_000);
  });

  test("チャンク境界をまたぐ読み出しでも欠落しない", async () => {
    const { data, fetchRange } = makeFakeSource(300_000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    // CHUNK_SIZE(64KB)境界(65536)をまたぐ範囲を読む
    const out = new Uint8Array(2000);
    await tokenizer.readBuffer(out, { position: 65_000, length: 2000 });

    expect(out).toEqual(data.subarray(65_000, 67_000));
  });

  test("同じ範囲の再読み出しは追加のRangeリクエストを発行しない（キャッシュされる）", async () => {
    const { data, fetchRange, getRequestCount } = makeFakeSource(200_000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const out1 = new Uint8Array(100);
    await tokenizer.readBuffer(out1, { position: 0, length: 100 });
    const afterFirst = getRequestCount();
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    const out2 = new Uint8Array(100);
    await tokenizer.readBuffer(out2, { position: 0, length: 100 });

    expect(getRequestCount()).toBe(afterFirst);
    expect(out2).toEqual(data.subarray(0, 100));
  });

  test("peekBufferはpositionを進めない", async () => {
    const { data, fetchRange } = makeFakeSource(10_000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const out = new Uint8Array(10);
    await tokenizer.peekBuffer(out, { position: 500, length: 10 });

    expect(tokenizer.position).toBe(0);
    expect(out).toEqual(data.subarray(500, 510));
  });

  test("mayBeLessなしでファイル末尾を超えて読むとEndOfStreamErrorになる", async () => {
    const { data, fetchRange } = makeFakeSource(1000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const out = new Uint8Array(50);
    await expect(tokenizer.readBuffer(out, { position: 980, length: 50 })).rejects.toThrow(EndOfStreamError);
  });

  test("mayBeLess付きならファイル末尾を超えても例外にならず、書けた分だけ返す", async () => {
    const { data, fetchRange } = makeFakeSource(1000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const out = new Uint8Array(50);
    const written = await tokenizer.readBuffer(out, { position: 980, length: 50, mayBeLess: true });

    expect(written).toBe(20);
    expect(out.subarray(0, 20)).toEqual(data.subarray(980, 1000));
  });

  test("末尾のmoovアトムを想定した先頭+末尾アクセスでも正しく読める", async () => {
    const { data, fetchRange } = makeFakeSource(500_000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const head = new Uint8Array(8);
    await tokenizer.readBuffer(head, { position: 0, length: 8 });
    expect(head).toEqual(data.subarray(0, 8));

    // MP4のmoovアトムが末尾にあるケースを模した、ファイル末尾付近への直接アクセス
    const tail = new Uint8Array(4000);
    await tokenizer.readBuffer(tail, { position: 496_000, length: 4000 });
    expect(tail).toEqual(data.subarray(496_000, 500_000));

    expect(tokenizer.accessedTail()).toBe(true);
  });

  test("accessedTail: 先頭付近しか読んでいなければfalseを返す", async () => {
    const { data, fetchRange } = makeFakeSource(500_000);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: data.length });

    const head = new Uint8Array(8);
    await tokenizer.readBuffer(head, { position: 0, length: 8 });

    expect(tokenizer.accessedTail()).toBe(false);
  });

  test("accessedTail: 何も読んでいなければfalseを返す（小さいファイルでも0リクエストでtrueにならない）", async () => {
    // ファイルサイズがmarginBytes（既定CHUNK_SIZE=64KB）以下だと、末尾窓の開始位置が0に
    // クランプされ、1回もfetchしていなくてもmaxByteOffsetFetched(0) >= 0でtrueを返して
    // しまう罠がある。requestCount===0のうちは必ずfalseを返す
    const { fetchRange } = makeFakeSource(100);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size: 100 });

    expect(tokenizer.accessedTail()).toBe(false);
  });

  test("accessedTail: ファイルサイズがCHUNK_SIZEの倍数のとき、末尾チャンクの手前までしか読んでいなければfalse", async () => {
    const CHUNK_SIZE = 64 * 1024;
    const size = CHUNK_SIZE * 3; // ちょうど3チャンク分
    const { fetchRange } = makeFakeSource(size);
    const tokenizer = new DriveRangeTokenizer(fetchRange, { size });

    // 先頭2チャンク分（末尾チャンクの直前まで）だけ読む。末尾チャンクは1バイトも読んでいない
    const out = new Uint8Array(CHUNK_SIZE * 2);
    await tokenizer.readBuffer(out, { position: 0, length: CHUNK_SIZE * 2 });

    expect(tokenizer.accessedTail()).toBe(false);

    // 末尾チャンクに1バイトでも踏み込めばtrueになる
    const tailByte = new Uint8Array(1);
    await tokenizer.readBuffer(tailByte, { position: CHUNK_SIZE * 2, length: 1 });
    expect(tokenizer.accessedTail()).toBe(true);
  });
});
