// CONCEPT.md 5節「Phase 1」が前提とするHTTP Rangeリクエストによる部分取得を実装する
// ランダムアクセストークナイザー（catalog-script/src/rangeTokenizer.js からの移植）。
// music-metadataの内部I/O抽象（strtok3のITokenizer）を実装し、パーサーが要求するバイト範囲だけを
// 都度Rangeリクエストで取りに行く。MP4/M4Aのmoovアトムが末尾にある場合の末尾アクセスも
// 同じ仕組みで自然にカバーされる（先頭/末尾で処理を分けない）。
//
// Driveへの実際のHTTP呼び出しはコンストラクタに渡す`fetchRange`関数に閉じ込めてあり、
// このファイル自体はstrtok3のインターフェース実装のみを担当する（Drive呼び出し部分だけ
// 差し替えれば移植元のcatalog-scriptと同じ検証済みロジックをそのまま使える）。

import { AbstractTokenizer, EndOfStreamError, type IFileInfo, type IReadChunkOptions } from "strtok3";

// 一度のRangeリクエストで取得する最小単位。小さすぎるとリクエスト数が増え、
// 大きすぎるとタグが無い領域まで無駄に転送してしまうため検証で妥当な値を確認済み（CONCEPT.md 3.5節）。
const CHUNK_SIZE = 64 * 1024;

function chunkIndexRange(start: number, length: number): [number, number] {
  const end = start + length; // exclusive
  return [Math.floor(start / CHUNK_SIZE), Math.floor((end - 1) / CHUNK_SIZE)];
}

export type FetchRangeFn = (startByte: number, endByteInclusive: number) => Promise<Uint8Array>;

interface NormalizedReadOptions {
  position: number;
  length: number;
  offset: number;
  mayBeLess?: boolean;
}

export class DriveRangeTokenizer extends AbstractTokenizer {
  fileInfo: IFileInfo;
  private fetchRange: FetchRangeFn;
  private chunks: Map<number, Uint8Array>;
  private requestCount: number;
  private bytesFetched: number;
  private maxByteOffsetFetched: number;

  constructor(fetchRange: FetchRangeFn, fileInfo: IFileInfo) {
    super({ fileInfo });
    // AbstractTokenizerのコンストラクタはfileInfoを保持しないため、自前で保持する（FileTokenizer同様）
    this.fileInfo = fileInfo;
    this.fetchRange = fetchRange;
    this.chunks = new Map();
    this.requestCount = 0;
    this.bytesFetched = 0;
    this.maxByteOffsetFetched = 0;
  }

  // ファイル末尾付近（末尾marginBytes以内）まで実際にRangeリクエストで取得したかどうか。
  // 「M4A/MP4のmoovアトムが末尾にあるケースを実際に踏んで検証できたか」を後から確認するための指標。
  accessedTail(marginBytes = CHUNK_SIZE): boolean {
    const size = this.fileInfo.size;
    if (size === undefined || this.requestCount === 0) return false;
    // ファイルサイズがちょうどCHUNK_SIZEの倍数だと、末尾チャンクの「1つ手前」までしか
    // フェッチしていなくても厳密な境界一致で誤ってtrueになりうるため、`>`で厳密に超えた場合のみtrueとする
    const tailWindowStart = Math.max(0, size - marginBytes);
    return this.maxByteOffsetFetched > tailWindowStart;
  }

  supportsRandomAccess(): boolean {
    return true;
  }

  setPosition(position: number): void {
    this.position = position;
  }

  private async _fetchMissingChunks(startIdx: number, endIdx: number): Promise<void> {
    const missingRuns: [number, number][] = [];
    let runStart: number | null = null;
    for (let i = startIdx; i <= endIdx; i += 1) {
      if (this.chunks.has(i)) {
        if (runStart !== null) {
          missingRuns.push([runStart, i - 1]);
          runStart = null;
        }
      } else if (runStart === null) {
        runStart = i;
      }
    }
    if (runStart !== null) missingRuns.push([runStart, endIdx]);

    for (const [runStartIdx, runEndIdx] of missingRuns) {
      const byteStart = runStartIdx * CHUNK_SIZE;
      let byteEndExclusive = (runEndIdx + 1) * CHUNK_SIZE;
      if (this.fileInfo.size !== undefined) byteEndExclusive = Math.min(byteEndExclusive, this.fileInfo.size);
      if (byteEndExclusive <= byteStart) continue;

      const buf = await this.fetchRange(byteStart, byteEndExclusive - 1);
      this.requestCount += 1;
      this.bytesFetched += buf.length;
      this.maxByteOffsetFetched = Math.max(this.maxByteOffsetFetched, byteStart + buf.length);

      for (let idx = runStartIdx, offset = 0; idx <= runEndIdx && offset < buf.length; idx += 1, offset += CHUNK_SIZE) {
        this.chunks.set(idx, buf.subarray(offset, Math.min(offset + CHUNK_SIZE, buf.length)));
      }
    }
  }

  // uint8Arrayに書き込み、実際に埋められたバイト数を返す（ファイル末尾を超えて要求された分は書けない）
  private async _fill(uint8Array: Uint8Array, normOptions: NormalizedReadOptions): Promise<number> {
    const { position, length, offset } = normOptions;
    if (length === 0) return 0;

    const fileSize = this.fileInfo.size;
    const effectiveLength = fileSize !== undefined ? Math.max(0, Math.min(length, fileSize - position)) : length;
    if (effectiveLength === 0) return 0;

    const [startIdx, endIdx] = chunkIndexRange(position, effectiveLength);
    await this._fetchMissingChunks(startIdx, endIdx);

    let written = 0;
    for (let idx = startIdx; idx <= endIdx; idx += 1) {
      const chunk = this.chunks.get(idx);
      if (!chunk) continue; // ファイル末尾側でチャンクが存在しない場合
      const chunkByteStart = idx * CHUNK_SIZE;
      const sliceStart = Math.max(position, chunkByteStart);
      const sliceEnd = Math.min(position + effectiveLength, chunkByteStart + chunk.length);
      if (sliceEnd <= sliceStart) continue;
      const chunkOffset = sliceStart - chunkByteStart;
      const outOffset = offset + (sliceStart - position);
      uint8Array.set(chunk.subarray(chunkOffset, chunkOffset + (sliceEnd - sliceStart)), outOffset);
      written += sliceEnd - sliceStart;
    }
    return written;
  }

  async readBuffer(uint8Array: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    const normOptions = this.normalizeOptions(uint8Array, options) as NormalizedReadOptions;
    const written = await this._fill(uint8Array, normOptions);
    this.position = normOptions.position + written;
    if (written < normOptions.length && !normOptions.mayBeLess) throw new EndOfStreamError();
    return written;
  }

  async peekBuffer(uint8Array: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    const normOptions = this.normalizeOptions(uint8Array, options) as NormalizedReadOptions;
    const written = await this._fill(uint8Array, normOptions);
    if (written < normOptions.length && !normOptions.mayBeLess) throw new EndOfStreamError();
    return written;
  }
}
