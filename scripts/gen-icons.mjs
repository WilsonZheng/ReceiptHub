// 零依赖 PWA 图标 + iOS 启动画面生成器：深色底 + 收据图形（锯齿底边 + 文字行）
// 用法: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x05, 0x05, 0x05]; // tokens: --color-bg
const PAPER = [0xff, 0xff, 0xff]; // --color-ink
const ACCENT = [0x00, 0xff, 0x66]; // --color-accent

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

// pixelFn 收到的是像素坐标 (x, y)；正方形图标用 square() 包一层换成归一化坐标
function png(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const off = y * (width * 3 + 1) + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
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
  writeFileSync(
    `public/icons/${name}`,
    png(size, size, (x, y) => pixel(x / size, y / size)),
  );
  console.log(`wrote public/icons/${name}`);
}

// iOS 启动画面（apple-touch-startup-image）：不配的话 PWA 冷启动先白屏一下。
// 尺寸必须与设备物理像素完全一致，否则 iOS 忽略。深色 = 图形直接浮在底色上；
// 浅色 = 分组浅灰底 + 圆角深色 App 图标。index.html 里的 media 查询要同步。
const LIGHT_BG = [0xf2, 0xf2, 0xf7]; // tokens（light）: --color-bg
const SPLASHES = [
  [1320, 2868], // 6.9 英寸 Pro Max（16 / 17 / 18 Pro Max，440×956 pt @3x）
  [1206, 2622], // 6.3 英寸 Pro（16 / 17 Pro，402×874 pt @3x）
];
mkdirSync('public/splash', { recursive: true });
for (const [w, h] of SPLASHES) {
  const side = Math.round(w * 0.3);
  const x0 = Math.round((w - side) / 2);
  const y0 = Math.round((h - side) / 2);
  const radius = side * 0.225;
  const inIcon = (x, y) => {
    const dx = Math.max(x0 + radius - x, 0, x - (x0 + side - radius));
    const dy = Math.max(y0 + radius - y, 0, y - (y0 + side - radius));
    return x >= x0 && x < x0 + side && y >= y0 && y < y0 + side && dx * dx + dy * dy <= radius ** 2;
  };
  for (const mode of ['dark', 'light']) {
    const name = `splash-${w}x${h}-${mode}.png`;
    const bg = mode === 'dark' ? BG : LIGHT_BG;
    writeFileSync(
      `public/splash/${name}`,
      png(w, h, (x, y) => (inIcon(x, y) ? pixel((x - x0) / side, (y - y0) / side) : bg)),
    );
    console.log(`wrote public/splash/${name}`);
  }
}
