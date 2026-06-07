// 零依赖 PWA 图标生成器：深色底 + 收据图形（锯齿底边 + 文字行）
// 用法: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0e, 0x11, 0x16]; // tokens: --color-bg
const PAPER = [0xe8, 0xec, 0xf1]; // --color-ink
const ACCENT = [0x3d, 0xdc, 0x97]; // --color-accent

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x / size, y / size);
      const off = y * (size * 3 + 1) + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 归一化坐标里的收据图形
function pixel(u, v) {
  // 收据纸：x ∈ [0.30, 0.70]，y 从 0.18 到锯齿底边（0.74~0.78 三角波）
  const inX = u >= 0.3 && u <= 0.7;
  const t = ((u - 0.3) / 0.4) * 8; // 8 个锯齿
  const tri = Math.abs((t % 2) - 1); // 三角波 0..1
  const bottom = 0.74 + 0.04 * tri;
  const inY = v >= 0.18 && v <= bottom;
  if (inX && inY) {
    // 文字行（accent 色）
    const lines = [0.3, 0.4, 0.5];
    for (const ly of lines) {
      if (v >= ly && v <= ly + 0.035 && u >= 0.36 && u <= 0.64) return ACCENT;
    }
    // 总额行：加粗
    if (v >= 0.63 && v <= 0.685 && u >= 0.36 && u <= 0.64) return ACCENT;
    return PAPER;
  }
  return BG;
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(`public/icons/${name}`, png(size, pixel));
  console.log(`wrote public/icons/${name}`);
}
