/**
 * ワンショットのアイコン生成スクリプト（依存ライブラリなしで単色+ロゴ文字のPNGを作る）。
 * ビルドの一部ではなく、public/icon-*.pngを作る際に手動実行する。
 */
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makeIcon(size, bg, fg) {
  const width = size;
  const height = size;
  const raw = Buffer.alloc((width * 3 + 1) * height);

  // 中央にシンプルな「C」型の塗り(円+切り欠き)を描く。凝ったロゴではなく仮アイコン。
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = width * 0.36;
  const rInner = width * 0.18;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // フィルタタイプ: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const isRing = dist <= rOuter && dist >= rInner;
      const isGap = angle > -0.6 && angle < 0.6 && dx > 0; // 右側に切り欠き(combrawlのCモチーフ)
      const paint = isRing && !isGap;
      const [r, g, b] = paint ? fg : bg;
      const off = rowStart + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const bg = [16, 18, 26]; // --bg
const fg = [244, 185, 66]; // --gold

writeFileSync(new URL("../public/icon-192.png", import.meta.url), makeIcon(192, bg, fg));
writeFileSync(new URL("../public/icon-512.png", import.meta.url), makeIcon(512, bg, fg));
console.log("icon-192.png / icon-512.png generated in public/");
