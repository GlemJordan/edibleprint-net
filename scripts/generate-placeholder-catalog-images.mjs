// One-time content utility: generates simple procedural PNG placeholders for
// the design catalog (content/design-catalog.json) so /designs has real
// thumbnails to render before real artwork exists. Uses only Node's built-in
// zlib (no image library dependency) — RGB truecolor PNG, filter type 0.
// Re-run any time to regenerate/add more placeholder swatches; the owner
// replaces these files with real art in public/designs/ later without
// touching any component.
import { writeFileSync } from 'fs';
import { deflateSync, crc32 } from 'zlib';

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      raw[offset++] = r; raw[offset++] = g; raw[offset++] = b;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB truecolor
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Deterministic pseudo-random in [0,1) from integer coords — same output
// every run, no external RNG dependency.
function hashNoise(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x9e3779b9;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000) / 1000;
}

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

const WHITE = [255, 255, 255];

// Circular ring design with scattered confetti dots in the outer band.
function confettiDesign({ bg, dotColors }) {
  return (x, y, w, h) => {
    const cx = w / 2, cy = h / 2;
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const outerR = w * 0.49, innerR = w * 0.34;
    if (d > outerR) return bg;
    if (d <= innerR) return WHITE; // clear center — text lands here
    // Ring band: scattered square confetti dots over bg
    const cell = 26;
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    const n = hashNoise(gx, gy);
    if (n < 0.35) {
      const color = dotColors[Math.floor(n * 971) % dotColors.length];
      const localX = x % cell, localY = y % cell;
      const dotR = 6 + hashNoise(gx + 99, gy + 7) * 5;
      const ldx = localX - cell / 2, ldy = localY - cell / 2;
      if (Math.sqrt(ldx * ldx + ldy * ldy) < dotR) return color;
    }
    return bg;
  };
}

// Wreath-style ring: a soft leafy band of green tones around a clear center.
function wreathDesign({ bg, leafColors }) {
  return (x, y, w, h) => {
    const cx = w / 2, cy = h / 2;
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const outerR = w * 0.47, innerR = w * 0.32;
    if (d > outerR) return bg;
    if (d <= innerR) return WHITE;
    const angle = Math.atan2(dy, dx);
    const leafCell = 0.28; // radians per leaf cluster
    const leafIdx = Math.floor(angle / leafCell);
    const n = hashNoise(leafIdx, Math.floor((d - innerR) / 8));
    const t = (d - innerR) / (outerR - innerR);
    const base = leafColors[((leafIdx % leafColors.length) + leafColors.length) % leafColors.length];
    return n < 0.75 ? mix(bg, base, 0.55 + t * 0.3) : bg;
  };
}

// Elegant thin double-line square frame around a clear center.
function elegantFrameDesign({ bg, lineColor }) {
  return (x, y, w, h) => {
    const marginOuter = w * 0.06;
    const marginInner = w * 0.1;
    const inOuter = x > marginOuter && x < w - marginOuter && y > marginOuter && y < h - marginOuter;
    const inInner = x > marginInner && x < w - marginInner && y > marginInner && y < h - marginInner;
    if (!inOuter) return bg;
    const onOuterLine = !inInner && (
      Math.min(x - marginOuter, w - marginOuter - x, y - marginOuter, h - marginOuter - y) < w * 0.006
    );
    const onInnerLine = inInner && (
      Math.min(x - marginInner, w - marginInner - x, y - marginInner, h - marginInner - y) < w * 0.006
    );
    if (onOuterLine || onInnerLine) return lineColor;
    if (!inInner) return bg; // between the two frame lines
    return WHITE; // clear center — text lands here
  };
}

const SIZE = 1000;
const DESIGNS = [
  {
    file: 'public/designs/birthday/birthday-confetti-01.png',
    fn: confettiDesign({
      bg: [255, 247, 225],
      dotColors: [[232, 112, 74], [27, 107, 74], [255, 205, 86], [86, 156, 214], [214, 86, 170]],
    }),
  },
  {
    file: 'public/designs/floral/floral-wreath-01.png',
    fn: wreathDesign({
      bg: [244, 248, 240],
      leafColors: [[74, 124, 89], [110, 156, 92], [58, 99, 71], [140, 176, 110]],
    }),
  },
  {
    file: 'public/designs/elegant/elegant-frame-01.png',
    fn: elegantFrameDesign({ bg: [253, 250, 242], lineColor: [176, 141, 87] }),
  },
];

for (const { file, fn } of DESIGNS) {
  const png = encodePNG(SIZE, SIZE, (x, y) => fn(x, y, SIZE, SIZE));
  writeFileSync(file, png);
  console.log('wrote', file, png.length, 'bytes');
}
