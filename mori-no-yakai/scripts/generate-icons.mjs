// 依存パッケージなしでPWAアイコン(icon-192.png / icon-512.png)を生成する。
// 夜空に浮かぶ三日月のシンプルな図形（暗い背景 + 明るいクレセント）。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildPng(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const idatData = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeIcon(size) {
  const bg = { r: 0x10, g: 0x13, b: 0x1a };
  const bgEdge = { r: 0x1b, g: 0x20, b: 0x30 };
  const moon = { r: 0xe8, g: 0xb0, b: 0x4b };
  const cx = size / 2;
  const cy = size / 2;
  const maxDist = size / 2;
  const moonCx = size * 0.58;
  const moonCy = size * 0.42;
  const moonR = size * 0.22;
  const biteCx = size * 0.68;
  const biteCy = size * 0.36;
  const biteR = size * 0.19;

  return buildPng(size, size, (x, y) => {
    const dist = Math.hypot(x - cx, y - cy) / maxDist;
    const t = Math.min(1, Math.max(0, dist));
    const r = Math.round(lerp(bg.r, bgEdge.r, t));
    const g = Math.round(lerp(bg.g, bgEdge.g, t));
    const b = Math.round(lerp(bg.b, bgEdge.b, t));

    const inMoon = Math.hypot(x - moonCx, y - moonCy) <= moonR;
    const inBite = Math.hypot(x - biteCx, y - biteCy) <= biteR;
    if (inMoon && !inBite) {
      return [moon.r, moon.g, moon.b, 255];
    }
    return [r, g, b, 255];
  });
}

writeFileSync("icon-192.png", makeIcon(192));
writeFileSync("icon-512.png", makeIcon(512));
console.log("Generated icon-192.png and icon-512.png");
