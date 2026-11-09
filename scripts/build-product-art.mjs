// Builds the product images for /products/* and Google Merchant Center:
// original vector art (no text, logos, characters, brands or people) printed
// on an A4 edible sheet, on a white background with a soft shadow.
//
//   node scripts/build-product-art.mjs
//
// Writes the SVG sources to scripts/product-art/ and 1200×1200 PNGs to
// public/products/. Cookie sheets use the site's own grid (lib/paper-config.js),
// so they show circles exactly where the editor and the printer put them;
// the full sheet uses the same printable area the print-ready PDF does.
import fs from 'node:fs';
import sharp from 'sharp';
import { computeMultiCircleLayout, designAreaInForShape, sheetSizeInForShape, BWSHEET_DESIGN_IN } from '../lib/paper-config.js';
import { findSize } from '../lib/catalog-sizes.js';

const SRC_DIR = 'scripts/product-art';
const OUT_DIR = 'public/products';
const SIZE = 1200;

// The A4 sheet, in px, centred on the canvas.
const A4 = sheetSizeInForShape('fullsheet');
const SHEET_H = 1040;
const PPI = SHEET_H / A4.h;
const SHEET_W = A4.w * PPI;
const SX = (SIZE - SHEET_W) / 2;
const SY = (SIZE - SHEET_H) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;

// Deterministic randomness, so re-running gives the same pictures.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Number(n.toFixed(1));

function page(id, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="shadow" x="-15%" y="-15%" width="130%" height="135%"><feGaussianBlur stdDeviation="16"/></filter>
    <linearGradient id="sheet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F6F6F3"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="#FFFFFF"/>
  <rect x="${f(SX + 8)}" y="${f(SY + 16)}" width="${f(SHEET_W)}" height="${SHEET_H}" rx="6" fill="#000" opacity="0.16" filter="url(#shadow)"/>
  <rect x="${f(SX)}" y="${SY}" width="${f(SHEET_W)}" height="${SHEET_H}" rx="6" fill="url(#sheet)"/>
  <g id="${id}">${art}</g>
</svg>
`;
}

// ── motifs ──────────────────────────────────────────────────────────────────

function flower(x, y, r, petal, center, petals = 6, rot = 0) {
  let s = '';
  for (let i = 0; i < petals; i++) {
    const a = rot + (360 / petals) * i;
    s += `<ellipse cx="${f(x)}" cy="${f(y - r * 0.55)}" rx="${f(r * 0.36)}" ry="${f(r * 0.55)}" fill="${petal}" transform="rotate(${f(a)} ${f(x)} ${f(y)})"/>`;
  }
  return s + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.3)}" fill="${center}"/>`;
}

function leaf(x, y, len, angle, color) {
  return `<path d="M0 0 Q ${f(len * 0.5)} ${f(-len * 0.32)} ${f(len)} 0 Q ${f(len * 0.5)} ${f(len * 0.32)} 0 0 Z" fill="${color}" transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})"/>`;
}

function balloon(x, y, r, color, stringTo) {
  const knot = y + r * 1.2;
  return `<path d="M ${f(x)} ${f(knot + 8)} C ${f(x - 22)} ${f(knot + 70)}, ${f(x + 26)} ${f(knot + 120)}, ${f(stringTo[0])} ${f(stringTo[1])}" stroke="#7A8794" stroke-width="2.4" fill="none"/>
    <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 1.2)}" fill="${color}"/>
    <path d="M ${f(x - 8)} ${f(knot + 10)} L ${f(x)} ${f(knot - 2)} L ${f(x + 8)} ${f(knot + 10)} Z" fill="${color}"/>
    <ellipse cx="${f(x - r * 0.38)}" cy="${f(y - r * 0.45)}" rx="${f(r * 0.18)}" ry="${f(r * 0.32)}" fill="#FFFFFF" opacity="0.45" transform="rotate(-25 ${f(x - r * 0.38)} ${f(y - r * 0.45)})"/>`;
}

function sparkle(x, y, r, color) {
  const k = r * 0.28;
  return `<path d="M ${f(x)} ${f(y - r)} Q ${f(x + k)} ${f(y - k)} ${f(x + r)} ${f(y)} Q ${f(x + k)} ${f(y + k)} ${f(x)} ${f(y + r)} Q ${f(x - k)} ${f(y + k)} ${f(x - r)} ${f(y)} Q ${f(x - k)} ${f(y - k)} ${f(x)} ${f(y - r)} Z" fill="${color}"/>`;
}

function confetti(rand, box, n, colors, scale = 1) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = box.x + rand() * box.w;
    const y = box.y + rand() * box.h;
    const c = colors[Math.floor(rand() * colors.length)];
    const rot = Math.floor(rand() * 180);
    if (rand() < 0.5) {
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(14 * scale)}" height="${f(6 * scale)}" rx="2" fill="${c}" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`;
    } else {
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f((3 + rand() * 4) * scale)}" fill="${c}"/>`;
    }
  }
  return s;
}

function heartPath(x, y, w, h) {
  // Unit heart drawn in a 92×82 box, scaled into (x, y, w, h).
  const P = (px, py) => `${f(x + ((px - 4) / 92) * w)} ${f(y + ((py - 10) / 82) * h)}`;
  return `M ${P(50, 30)} C ${P(50, 22)} ${P(44, 10)} ${P(30, 10)} C ${P(14, 10)} ${P(4, 22)} ${P(4, 36)} `
    + `C ${P(4, 58)} ${P(26, 74)} ${P(50, 92)} C ${P(74, 74)} ${P(96, 58)} ${P(96, 36)} `
    + `C ${P(96, 22)} ${P(86, 10)} ${P(70, 10)} C ${P(56, 10)} ${P(50, 22)} ${P(50, 30)} Z`;
}

function butterfly(x, y, r, wingA, wingB, dot, body) {
  return `<g transform="translate(${f(x)} ${f(y)})">
    <ellipse cx="${f(-r * 0.48)}" cy="${f(-r * 0.32)}" rx="${f(r * 0.5)}" ry="${f(r * 0.6)}" fill="${wingA}" transform="rotate(-28 ${f(-r * 0.48)} ${f(-r * 0.32)})"/>
    <ellipse cx="${f(r * 0.48)}" cy="${f(-r * 0.32)}" rx="${f(r * 0.5)}" ry="${f(r * 0.6)}" fill="${wingA}" transform="rotate(28 ${f(r * 0.48)} ${f(-r * 0.32)})"/>
    <ellipse cx="${f(-r * 0.36)}" cy="${f(r * 0.42)}" rx="${f(r * 0.34)}" ry="${f(r * 0.42)}" fill="${wingB}" transform="rotate(24 ${f(-r * 0.36)} ${f(r * 0.42)})"/>
    <ellipse cx="${f(r * 0.36)}" cy="${f(r * 0.42)}" rx="${f(r * 0.34)}" ry="${f(r * 0.42)}" fill="${wingB}" transform="rotate(-24 ${f(r * 0.36)} ${f(r * 0.42)})"/>
    <circle cx="${f(-r * 0.52)}" cy="${f(-r * 0.4)}" r="${f(r * 0.14)}" fill="${dot}"/>
    <circle cx="${f(r * 0.52)}" cy="${f(-r * 0.4)}" r="${f(r * 0.14)}" fill="${dot}"/>
    <rect x="${f(-r * 0.07)}" y="${f(-r * 0.62)}" width="${f(r * 0.14)}" height="${f(r * 1.3)}" rx="${f(r * 0.07)}" fill="${body}"/>
    <path d="M 0 ${f(-r * 0.6)} q ${f(-r * 0.12)} ${f(-r * 0.3)} ${f(-r * 0.3)} ${f(-r * 0.36)} M 0 ${f(-r * 0.6)} q ${f(r * 0.12)} ${f(-r * 0.3)} ${f(r * 0.3)} ${f(-r * 0.36)}" stroke="${body}" stroke-width="${f(r * 0.05)}" fill="none" stroke-linecap="round"/>
  </g>`;
}

// ── one picture per shape ───────────────────────────────────────────────────

// Round topper: blush floral wreath.
function round() {
  const r = 3.5 * PPI; // a 7" print
  let art = `<defs><clipPath id="c"><circle cx="${CX}" cy="${CY}" r="${f(r)}"/></clipPath>
    <radialGradient id="bg" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#FFF4EF"/><stop offset="1" stop-color="#F7D3CB"/></radialGradient></defs>
    <g clip-path="url(#c)"><rect x="${f(CX - r)}" y="${f(CY - r)}" width="${f(2 * r)}" height="${f(2 * r)}" fill="url(#bg)"/>`;
  const rand = rng(7);
  art += confetti(rand, { x: CX - r, y: CY - r, w: 2 * r, h: 2 * r }, 40, ['#F2B5A7', '#FFFFFF', '#E9C46A'], 0.8);
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14;
    const lx = CX + Math.cos(a) * r * 0.8;
    const ly = CY + Math.sin(a) * r * 0.8;
    art += leaf(lx, ly, 70, (a * 180) / Math.PI + 60, i % 2 ? '#8DB596' : '#6F9E7B');
  }
  const blooms = [['#F08A7E', '#E9B949'], ['#F6B48F', '#C8553D'], ['#FFF1E0', '#E9B949']];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 + 0.26;
    const [petal, center] = blooms[i % 3];
    art += flower(CX + Math.cos(a) * r * 0.8, CY + Math.sin(a) * r * 0.8, i % 2 ? 52 : 40, petal, center, 6, i * 17);
  }
  art += leaf(CX - 40, CY + 40, 110, 150, '#6F9E7B') + leaf(CX + 40, CY + 40, 110, 30, '#8DB596') + leaf(CX, CY + 30, 100, 95, '#6F9E7B');
  art += flower(CX, CY - 10, 92, '#F08A7E', '#E9B949', 6, 10)
    + flower(CX - 95, CY + 30, 64, '#F6B48F', '#C8553D', 6, 30)
    + flower(CX + 95, CY + 30, 64, '#FFF1E0', '#E9B949', 6, 0);
  return art + '</g>';
}

// Heart topper: coral heart with gold confetti and small hearts.
function heart() {
  const w = 7 * PPI, h = w * 0.9;
  const x = CX - w / 2, y = CY - h / 2;
  let art = `<defs><clipPath id="c"><path d="${heartPath(x, y, w, h)}"/></clipPath>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#FBB1A8"/><stop offset="1" stop-color="#E4505B"/></radialGradient></defs>
    <g clip-path="url(#c)"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#bg)"/>`;
  const rand = rng(11);
  art += confetti(rand, { x, y, w, h }, 120, ['#F7C948', '#FFF4E6', '#FFFFFF', '#B83242'], 1.1);
  for (let i = 0; i < 16; i++) {
    const s = 26 + rand() * 30;
    const hx = x + 40 + rand() * (w - 80), hy = y + 40 + rand() * (h - 120);
    art += `<path d="${heartPath(hx, hy, s, s * 0.9)}" fill="${i % 3 ? '#FFFFFF' : '#F7C948'}" opacity="${i % 3 ? 0.85 : 1}"/>`;
  }
  art += `<path d="${heartPath(CX - 110, CY - 120, 220, 198)}" fill="#FFF4E6"/>`
    + `<path d="${heartPath(CX - 80, CY - 92, 160, 144)}" fill="#E4505B"/>`;
  for (let i = 0; i < 6; i++) art += sparkle(CX - 150 + i * 60, CY + 140 + (i % 2) * 24, 14, '#F7C948');
  return art + '</g>';
}

// Square topper: balloons in a blue sky.
function square() {
  const s = 7 * PPI;
  const x = CX - s / 2, y = CY - s / 2;
  let art = `<defs><clipPath id="c"><rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE6F3"/><stop offset="1" stop-color="#F1FAFD"/></linearGradient></defs>
    <g clip-path="url(#c)"><rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}" fill="url(#bg)"/>`;
  const cloud = (cx, cy, k) => `<g fill="#FFFFFF" opacity="0.95"><ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(70 * k)}" ry="${f(26 * k)}"/><circle cx="${f(cx - 26 * k)}" cy="${f(cy - 14 * k)}" r="${f(28 * k)}"/><circle cx="${f(cx + 18 * k)}" cy="${f(cy - 22 * k)}" r="${f(36 * k)}"/></g>`;
  art += cloud(x + 120, y + 110, 1) + cloud(x + s - 110, y + 180, 0.8) + cloud(x + 150, y + s - 90, 0.9) + cloud(x + s - 150, y + s - 70, 1.1);
  const tie = [CX, y + s - 40];
  const balloons = [
    [CX - 150, CY - 90, 70, '#2EC4B6'], [CX + 150, CY - 70, 70, '#FFD166'], [CX, CY - 150, 78, '#3A86FF'],
    [CX - 70, CY + 20, 62, '#FFD166'], [CX + 80, CY + 40, 64, '#2EC4B6'], [CX - 210, CY + 70, 50, '#3A86FF'], [CX + 220, CY + 90, 50, '#3A86FF'],
  ];
  for (const [bx, by, br, c] of balloons) art += balloon(bx, by, br, c, tie);
  const rand = rng(5);
  art += confetti(rand, { x, y, w: s, h: s }, 30, ['#FFD166', '#2EC4B6', '#3A86FF', '#FFFFFF'], 0.9);
  return art + '</g>';
}

// Cookie sheets: the editor's own circle grid.
function cookieSheet(sizeId, motif) {
  const size = findSize('multicircle', sizeId);
  const L = computeMultiCircleLayout(SHEET_W, SHEET_H, true, size);
  const rr = L.circlePx / 2;
  let art = '';
  for (let row = 0; row < L.mcRows; row++) {
    for (let col = 0; col < L.mcCols; col++) {
      const cx = SX + L.mcOffsetX + col * L.mcStepPx + rr;
      const cy = SY + L.mcOffsetY + row * L.mcStepPx + rr;
      art += motif(cx, cy, rr, row * 10 + col);
    }
  }
  return art;
}

// 2" circles: white daisies on sunny yellow.
function cookie2() {
  return cookieSheet('mc2', (x, y, r, i) => {
    const rand = rng(100 + i);
    let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#FFD95A"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.9)}" fill="#FFE68A"/>`;
    for (let k = 0; k < 7; k++) {
      const a = rand() * Math.PI * 2, d = r * (0.55 + rand() * 0.3);
      s += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="${f(2.5 + rand() * 2)}" fill="#F79D3C"/>`;
    }
    return s + flower(x, y, r * 0.62, '#FFFFFF', '#F79D3C', 8, i * 9) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.1)}" fill="#E07A1F"/>`;
  });
}

// 3" circles: butterflies on lilac.
function cookie3() {
  return cookieSheet('mc3', (x, y, r, i) => {
    let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#E4D7F7"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.88)}" fill="#EFE6FB"/>`;
    s += sparkle(x - r * 0.55, y - r * 0.45, 12, '#9ED9C4') + sparkle(x + r * 0.58, y + r * 0.42, 10, '#9ED9C4') + sparkle(x + r * 0.5, y - r * 0.55, 8, '#B79CE8');
    s += leaf(x - r * 0.15, y + r * 0.62, r * 0.4, 200, '#9ED9C4') + leaf(x + r * 0.15, y + r * 0.62, r * 0.4, -20, '#7CC6AC');
    return s + butterfly(x, y - r * 0.04, r * 0.52, '#8E6CCF', '#B79CE8', '#9ED9C4', '#4B3A73');
  });
}

// Full sheet: mint and gold celebration, inside the printer's printable area.
function fullSheet() {
  const area = designAreaInForShape('fullsheet');
  const w = area.w * PPI, h = area.h * PPI;
  const x = SX + (SHEET_W - w) / 2;
  const y = SY + (15 / 25.4) * PPI; // top margin, as printed
  let art = `<defs><clipPath id="c"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D7F2E6"/><stop offset="1" stop-color="#A8DDC8"/></linearGradient></defs>
    <g clip-path="url(#c)"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#bg)"/>`;
  const streamer = (y0, amp, color, width) => {
    let d = `M ${f(x - 40)} ${f(y0)}`;
    for (let k = 0; k < 6; k++) d += ` q ${f(w / 12)} ${f(k % 2 ? amp : -amp)} ${f(w / 6)} 0`;
    return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
  };
  art += streamer(y + 110, 60, '#1F8A70', 14) + streamer(y + 150, 50, '#E8B949', 10)
    + streamer(y + h - 160, 55, '#E8B949', 12) + streamer(y + h - 115, 65, '#1F8A70', 14);
  const rand = rng(21);
  art += confetti(rand, { x, y, w, h }, 170, ['#1F8A70', '#E8B949', '#FFFFFF', '#F28C6B'], 1.15);
  art += `<circle cx="${CX}" cy="${CY}" r="200" fill="#FFFFFF" opacity="0.55"/>`;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    art += sparkle(CX + Math.cos(a) * 150, CY + Math.sin(a) * 150, i % 2 ? 18 : 28, i % 2 ? '#1F8A70' : '#E8B949');
  }
  art += sparkle(CX, CY, 70, '#E8B949') + sparkle(CX, CY, 34, '#FFF7DC');
  return art + '</g>';
}

// Black and white: botanical line art, 6.5" square centred on the sheet.
function bwSquare() {
  const s = BWSHEET_DESIGN_IN * PPI;
  const x = CX - s / 2, y = CY - s / 2;
  let art = `<defs><clipPath id="c"><rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}"/></clipPath></defs>
    <g clip-path="url(#c)"><rect x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}" fill="#E9E9E9"/>`;
  const stem = (x0, y0, x1, y1, bend) => `<path d="M ${f(x0)} ${f(y0)} Q ${f((x0 + x1) / 2 + bend)} ${f((y0 + y1) / 2)} ${f(x1)} ${f(y1)}" stroke="#3C3C3C" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  art += stem(CX, y + s - 30, CX - 150, y + 150, -60) + stem(CX, y + s - 30, CX + 160, y + 170, 60) + stem(CX, y + s - 30, CX, y + 110, 20);
  const leaves = [[CX - 60, CY + 120, 200], [CX - 110, CY, 215], [CX + 70, CY + 110, -20], [CX + 120, CY + 10, -35], [CX - 20, CY - 40, 240], [CX + 25, CY + 30, -60]];
  for (const [lx, ly, a] of leaves) art += leaf(lx, ly, 95, a, '#5A5A5A');
  art += flower(CX - 150, y + 150, 72, '#8C8C8C', '#2E2E2E', 6, 0)
    + flower(CX + 160, y + 170, 64, '#B4B4B4', '#2E2E2E', 6, 15)
    + flower(CX, y + 110, 80, '#6E6E6E', '#1F1F1F', 6, 30);
  const rand = rng(3);
  for (let i = 0; i < 26; i++) art += `<circle cx="${f(x + 30 + rand() * (s - 60))}" cy="${f(y + 30 + rand() * (s - 60))}" r="${f(3 + rand() * 4)}" fill="#9A9A9A"/>`;
  return art + '</g>';
}

const PICTURES = {
  round, heart, square,
  'cookie-2': cookie2, 'cookie-3': cookie3,
  'full-sheet': fullSheet, 'bw-square': bwSquare,
};

fs.mkdirSync(SRC_DIR, { recursive: true });
for (const [name, draw] of Object.entries(PICTURES)) {
  const svg = page(name, draw());
  fs.writeFileSync(`${SRC_DIR}/${name}.svg`, svg);
  let img = sharp(Buffer.from(svg)).resize(SIZE, SIZE).flatten({ background: '#FFFFFF' });
  if (name === 'bw-square') img = img.grayscale();
  await img.png({ compressionLevel: 9 }).toFile(`${OUT_DIR}/${name}.png`);
  console.log(`${OUT_DIR}/${name}.png`);
}
