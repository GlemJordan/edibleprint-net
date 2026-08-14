'use client';

import { useState, useRef, useEffect } from 'react';
import NextImage from 'next/image';
import './globals.css';
import HeroSection from './_components/HeroSection';
import { getShippingCost } from '../lib/shipping-config.js';
import { WAFER_PAPER_PRICE } from '../lib/wafer-paper-config.js';
import {
  sheetSizeInForShape, computeSheetPlacement, isWholeSheetShape, hasSheetMargin, BWSHEET_DESIGN_IN,
  customShapeLabel,
} from '../lib/paper-config.js';

/* ═══ PRICING CONFIG ═══
   Sheet w/h below come from lib/paper-config.js (true A4 for icing sheet,
   true Letter for wafer paper) — not hand-typed per format, so the catalog
   can't drift from what the PDF pipeline and print-preview modal use. */
const ICING_SHEET_IN = sheetSizeInForShape('fullsheet');
const WAFER_SHEET_IN = sheetSizeInForShape('waferletter');
const SIZES = {
  circular: [
    { id: 'c5', label: '5" Round (13cm)', w: 5, h: 5, price: 14.99 },
    { id: 'c6', label: '6" Round (15cm)', w: 6, h: 6, price: 14.99 },
    { id: 'c7', label: '7" Round (18cm)', w: 7, h: 7, price: 19.99 },
    { id: 'c8', label: '8" Round (20cm)', w: 8, h: 8, price: 19.99 },
  ],
  heart: [
    { id: 'h6', label: '6" Heart (15cm)', w: 6, h: 6, price: 14.99 },
    { id: 'h7', label: '7" Heart (18cm)', w: 7, h: 7, price: 19.99 },
    { id: 'h8', label: '8" Heart (20cm)', w: 8, h: 8, price: 19.99 },
  ],
  multicircle: [
    { id: 'mc125', label: '1.25” Circles on A4 Sheet', sublabel: '40 mini cookies/sheet', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, price: 19.99, circleSize: 1.25, cols: 5, rows: 8,  gap: 0.10 },
    { id: 'mc2',   label: '2” Circles on A4 Sheet',   sublabel: '15 cookies/sheet',      w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, price: 19.99, circleSize: 2,    cols: 3, rows: 5,  gap: 0.15 },
    { id: 'mc3',   label: '3” Circles on A4 Sheet',   sublabel: '6 cookies/sheet',       w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, price: 19.99, circleSize: 3,    cols: 2, rows: 3,  gap: 0.20 },
  ],
  square: [
    { id: 's5', label: '5"×5" (13cm)', w: 5, h: 5, price: 14.99 },
    { id: 's6', label: '6"×6" (15cm)', w: 6, h: 6, price: 14.99 },
    { id: 's7', label: '7"×7" (18cm)', w: 7, h: 7, price: 19.99 },
    { id: 's8', label: '8"×8" (20cm)', w: 8, h: 8, price: 19.99 },
  ],
  fullsheet: [
    { id: 'a4', label: 'A4 Full Sheet (210×297mm / 8.27"×11.69")', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, price: 19.99 },
  ],
  bwsheet: [
    { id: 'bw1', label: '6.5"×6.5" B&W Square', sublabel: 'Centered on A4 sheet', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, printW: BWSHEET_DESIGN_IN, printH: BWSHEET_DESIGN_IN, price: 9.99, grayscale: true },
  ],
  waferletter: [
    { id: 'wl1', label: 'Wafer Paper — Letter Sheet (8.5"×11")', w: WAFER_SHEET_IN.w, h: WAFER_SHEET_IN.h, price: WAFER_PAPER_PRICE },
  ],
  custom: [{ id: 'custom', label: 'Custom Size', w: 0, h: 0, price: 0 }],
};

const SHAPE_LABEL = {
  circular: 'Round', heart: 'Heart', square: 'Square', multicircle: 'Cookie Sheet',
  fullsheet: 'Full Sheet', bwsheet: 'B&W Sheet', waferletter: 'Wafer Paper', custom: 'Custom',
};

// Figures selectable within shape === 'custom'. 'rectangle' is the default
// (matches every Custom design created before this picker existed — see
// the customShapeKind accessor below, which leaves the field undefined
// rather than defaulting it, so old designs keep rendering exactly as
// before). Labels come from paper-config.js's customShapeLabel() — the
// same map the server-side PDF footer/email and Stripe line item read —
// so a figure can't be called something different there than it's called
// here.
const CUSTOM_SHAPES = [
  { key: 'rectangle', icon: '▭' },
  { key: 'circle',    icon: '⭕' },
  { key: 'oval',      icon: '⬭' },
  { key: 'triangle',  icon: '🔺' },
  { key: 'hexagon',   icon: '⬡' },
].map((s) => ({ ...s, label: customShapeLabel(s.key) }));

/* ═══ "I ALREADY HAVE MY DESIGN" — customer-supplied print-ready file ═══
   No price of its own: an alternate entry point into the same three flat
   formats above, at the price each already has. */
const UPLOAD_FLOW_SHAPES = ['fullsheet', 'bwsheet', 'waferletter'];
const UPLOAD_MAX_FILE_MB = 25;
const UPLOAD_MARGIN_MM = 3;
const UPLOAD_MIN_DPI = 300;
/* Sizing policy for a customer-supplied file that doesn't exactly match its
   sheet's dimensions: always scale to fit within the sheet (never crop —
   cropping customer content they haven't explicitly seen cropped is the
   riskier failure mode of the two). A mismatch shows as an even margin on
   whichever axis isn't the constraining one, never as lost content. */
function getUploadTargetSizeIn(shape) {
  const sz = (SIZES[shape] || [])[0];
  if (!sz) return { w: 8.5, h: 11 };
  if (shape === 'bwsheet') return { w: sz.printW || 6.5, h: sz.printH || 6.5 };
  return { w: sz.w, h: sz.h };
}
function computeContainFit(sourceW, sourceH, targetW, targetH) {
  const sourceRatio = sourceW / sourceH;
  const targetRatio = targetW / targetH;
  let printedW, printedH;
  if (sourceRatio > targetRatio) {
    printedW = targetW;
    printedH = targetW / sourceRatio;
  } else {
    printedH = targetH;
    printedW = targetH * sourceRatio;
  }
  return { printedW, printedH, exact: Math.abs(sourceRatio - targetRatio) < 0.01 };
}

/* ═══ SHIPPING ═══ */
function getDeliveryEstimate() {
  return 'Canada Post shipping — flat rate $9.99, approx. 3–5 business days anywhere in Canada.';
}

function trackGA(event, params) {
  if (typeof window !== 'undefined' && window.gtag) window.gtag('event', event, params || {});
}
function trackMeta(event, params) {
  if (typeof window !== 'undefined' && window.fbq) window.fbq('track', event, params || {});
}

const PROVINCES = [
  'Alberta','British Columbia','Manitoba','New Brunswick',
  'Newfoundland and Labrador','Northwest Territories','Nova Scotia',
  'Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon'
];

/* ═══ BRAND COLORS ═══ */
const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', brandDark: '#14503A',
  accent: '#E8873C', accentLight: '#FFF4EB',
  bg: '#FAFBF9', text: '#1a1a1a', muted: '#6B7280',
  border: '#E5E7EB', white: '#FFFFFF',
};

/* ═══ STYLES ═══ */
const inputStyle = {
  width: '100%', padding: '12px 14px', border: '1.5px solid ' + C.border, borderRadius: 10,
  fontSize: 15, fontFamily: "'Outfit', sans-serif", outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s', background: C.white,
};
const btnPrimary = {
  background: C.brand, color: '#fff', border: 'none', borderRadius: 12,
  padding: '14px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s',
  boxShadow: '0 4px 16px rgba(27,107,74,0.25)',
};
const btnSecondary = { ...btnPrimary, background: '#F3F4F6', color: '#555', boxShadow: 'none' };
// padding/fontSize/borderRadius stripped so the .ep-header-cta-btn CSS class
// (which differs mobile vs desktop) isn't fought by higher-precedence inline styles.
const { padding: _hp, fontSize: _hf, borderRadius: _hr, ...btnPrimaryHeader } = btnPrimary;
const stepBadge = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, borderRadius: '50%', background: C.brand,
  color: '#fff', fontWeight: 700, fontSize: 15,
};
const card = {
  background: C.white, borderRadius: 14, padding: 20,
  boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid ' + C.border,
};
const zoomBtnStyle = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid ' + C.border,
  background: C.white, cursor: 'pointer', fontSize: 17, fontWeight: 700,
  color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'Outfit', sans-serif",
};

/* ═══ LOGO ═══
   Footer uses the circular badge mark (logo-full.png — white/light
   background, reads fine on the dark footer). Header uses the horizontal
   wordmark, swapped at 768px via CSS classes below (not JS isMobile state)
   so there's no SSR/hydration flash of the wrong logo on first paint. */
function Logo({ footer = false }) {
  if (footer) {
    return (
      <div style={{ textAlign: 'center' }}>
        <NextImage
          src="/logo-assets/logo-full.png"
          alt="EdiblePrint.net"
          width={800}
          height={800}
          style={{ height: 80, width: 'auto', display: 'inline-block' }}
        />
      </div>
    );
  }
  return (
    <>
      <span className="ep-logo-desktop">
        <NextImage
          src="/logo-assets/logo-header.png"
          alt="EdiblePrint.net"
          width={879}
          height={200}
          priority
          style={{ height: 64, width: 'auto', display: 'block' }}
        />
      </span>
      <span className="ep-logo-mobile">
        <NextImage
          src="/logo-assets/logo-compact.png"
          alt="EdiblePrint.net"
          width={657}
          height={116}
          priority
          style={{ height: 44, width: 'auto', display: 'block' }}
        />
      </span>
    </>
  );
}

/* ═══ IMAGE EDITOR (with hi-res export) ═══ */
const FONT_STYLE_MAP = {
  normal:       { style: 'normal',  weight: 'normal' },
  bold:         { style: 'normal',  weight: 'bold'   },
  italic:       { style: 'italic',  weight: 'normal' },
  'bold italic':{ style: 'italic',  weight: 'bold'   },
};
/* Calculate circle grid layout for multi-circle sheet (0.25" margin, 0.15" gap) */
const MC_MARGIN = 0.25; // inches on each side
const MC_GAP    = 0.15; // inches between circles
function getCircleGrid(sheetW, sheetH, circleSize) {
  const usableW = sheetW - 2 * MC_MARGIN;
  const usableH = sheetH - 2 * MC_MARGIN;
  const step = circleSize + MC_GAP;
  const cols = Math.floor((usableW + MC_GAP) / step);
  const rows = Math.floor((usableH + MC_GAP) / step);
  return { cols, rows, count: cols * rows };
}

/* Heart clip path: x,y = top-left of bounding box, width & height */
function drawHeartPath(ctx, x, y, width, height, asSubpath = false) {
  if (!asSubpath) ctx.beginPath();
  const w = width;
  const h = height;
  const centerX = x + w / 2;
  const notchY  = y + h * 0.28;
  ctx.moveTo(centerX, notchY);
  // Left bump — wide and rounded
  ctx.bezierCurveTo(
    centerX - w * 0.1,  y,              // ctrl 1: rises to top
    x,                  y + h * 0.1,    // ctrl 2: extends to left edge
    x + w * 0.02,       y + h * 0.38   // end: top of left side
  );
  // Left side down to tip
  ctx.bezierCurveTo(
    x + w * 0.02,  y + h * 0.58,
    x + w * 0.3,   y + h * 0.78,
    centerX,       y + h * 0.99
  );
  // Right side up from tip
  ctx.bezierCurveTo(
    x + w * 0.7,   y + h * 0.78,
    x + w * 0.98,  y + h * 0.58,
    x + w * 0.98,  y + h * 0.38
  );
  // Right bump — wide and rounded
  ctx.bezierCurveTo(
    x + w,              y + h * 0.1,    // ctrl 1: extends to right edge
    centerX + w * 0.1,  y,              // ctrl 2: rises to top
    centerX,            notchY          // close at notch
  );
  ctx.closePath();
}

/* Clip/cut-line path for a Custom design's chosen sub-shape (circle/oval/
   triangle/hexagon/rectangle), sized to the x,y,w,h box. Only called for
   shape === 'custom' — circular/heart/square keep their own existing
   inline arc/drawHeartPath/rect code untouched at every call site below,
   so this addition can't change how any pre-existing format renders.
   'rectangle' (and any unrecognized/undefined kind) falls through to a
   plain rect — the same shape a Custom design without this field already
   rendered before this picker existed, so legacy designs and an explicit
   "Rectangle" choice draw identically. asSubpath mirrors drawHeartPath's
   own flag: true appends to an already-open path, false starts a fresh
   beginPath() first. */
function appendCustomShapeClipPath(ctx, customShapeKind, x, y, w, h, asSubpath = false) {
  const cx = x + w / 2, cy = y + h / 2;
  if (!asSubpath) ctx.beginPath();
  if (customShapeKind === 'circle' || customShapeKind === 'oval') {
    ctx.moveTo(cx + w / 2, cy);
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (customShapeKind === 'triangle') {
    ctx.moveTo(cx, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else if (customShapeKind === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 3);
      const px = cx + (w / 2) * Math.cos(angle);
      const py = cy + (h / 2) * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
}

/* Custom designs with a real "outside the shape but inside its bounding
   box" region (everything except 'rectangle', which fills the whole box)
   — used to decide whether the crop-interaction mask/overlay and cut-line
   stroke apply, matching how circular/heart are already treated below. */
function isCustomShapeClipped(customShapeKind) {
  return customShapeKind === 'circle' || customShapeKind === 'oval'
    || customShapeKind === 'triangle' || customShapeKind === 'hexagon';
}

function drawText(ctx, textOverlay, w, h, sf = 1) {
  if (!textOverlay?.text) return;
  const px   = (Number(textOverlay.fontSize) || 24) * sf;
  const { style, weight } = FONT_STYLE_MAP[textOverlay.fontStyle] || FONT_STYLE_MAP.normal;
  ctx.font        = `${style} ${weight} ${px}px ${textOverlay.fontFamily || 'Arial'}, sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline= 'middle';
  const tx = (textOverlay.position?.x ?? 50) / 100 * w;
  const ty = (textOverlay.position?.y ?? 85) / 100 * h;
  ctx.lineWidth   = Math.max(2, px / 9);
  ctx.strokeStyle = 'rgba(0,0,0,0.70)';
  ctx.strokeText(textOverlay.text, tx, ty);
  ctx.fillStyle   = textOverlay.color || '#FFFFFF';
  ctx.fillText(textOverlay.text, tx, ty);
}

function drawImageInCircle(ctx, img, originX, originY, diameter, layer) {
  if (!img) return;
  const radius = diameter / 2;
  const cx = originX + radius;
  const cy = originY + radius;
  const baseSc = Math.max(diameter / img.width, diameter / img.height);
  const relZoom = baseSc > 0 ? Math.max(0.1, layer.scale / baseSc) : 1;
  const baseW = img.width * baseSc;
  const baseH = img.height * baseSc;
  const drawW = baseW * relZoom;
  const drawH = baseH * relZoom;
  const autoFitX = (diameter - baseW) / 2;
  const autoFitY = (diameter - baseH) / 2;
  const panX = layer.x - autoFitX;
  const panY = layer.y - autoFitY;
  const drawX = cx - radius + autoFitX + panX * relZoom - (drawW - baseW) / 2;
  const drawY = cy - radius + autoFitY + panY * relZoom - (drawH - baseH) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (layer.rotation !== 0) {
    ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);
    ctx.translate(-(drawX + drawW / 2), -(drawY + drawH / 2));
  }
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function hexToGrayscale(hex) {
  if (!hex || hex === 'transparent') return hex;
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const gh = gray.toString(16).padStart(2, '0');
  return `#${gh}${gh}${gh}`;
}

function computeCanvasSize(containerWidth, shape, sizeObj, viewportH = 800) {
  let aspectRatio;
  if (shape === 'circular' || shape === 'heart' || shape === 'square') {
    aspectRatio = 1;
  } else if (shape === 'multicircle' || shape === 'fullsheet' || shape === 'bwsheet' || shape === 'waferletter') {
    const w = (sizeObj && sizeObj.w) || 8;
    const h = (sizeObj && sizeObj.h) || 11;
    aspectRatio = w / h;
  } else if (shape === 'custom') {
    const cw = (sizeObj && sizeObj.w) || 8;
    const ch = (sizeObj && sizeObj.h) || 11;
    aspectRatio = cw > 0 && ch > 0 ? cw / ch : 1;
  } else {
    aspectRatio = 1;
  }
  /* Reserve space for header (~50) + add-image btn (~50) + zoom/rotation panel (~80) + help text (~24) + padding (~40) */
  const RESERVED = 244;
  const dynamicMaxH = Math.max(320, viewportH - RESERVED);
  const maxW = Math.min(containerWidth - 24, 480);
  let w = Math.max(280, maxW);
  let h = w / aspectRatio;
  if (h > dynamicMaxH) {
    h = dynamicMaxH;
    w = Math.floor(h * aspectRatio);
  }
  return { canvasW: Math.floor(w), canvasH: Math.floor(h) };
}

function drawWatermark(ctx, canvasW, canvasH) {
  ctx.save();
  ctx.fillStyle = 'rgba(120, 120, 120, 0.13)';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.rotate(-Math.PI / 6);
  const text = 'EDIBLEPRINT.NET';
  const spacing = 100;
  const reps = Math.ceil(Math.max(canvasW, canvasH) / spacing) + 2;
  for (let i = -reps; i <= reps; i++) {
    ctx.fillText(text, 0, i * spacing);
  }
  ctx.restore();
}

function drawShapeShadow(ctx, shape, canvasW, canvasH, isMobile, customShapeKind) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = isMobile ? 10 : 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = isMobile ? 4 : 6;
  ctx.fillStyle = '#FFFFFF';
  if (shape === 'circular') {
    ctx.beginPath();
    ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'heart') {
    drawHeartPath(ctx, 0, 0, canvasW, canvasH);
    ctx.fill();
  } else if (shape === 'bwsheet') {
    const sq = canvasW * (BWSHEET_DESIGN_IN / ICING_SHEET_IN.w);
    ctx.fillRect((canvasW - sq) / 2, (canvasH - sq) / 2, sq, sq);
  } else if (shape === 'custom' && isCustomShapeClipped(customShapeKind)) {
    appendCustomShapeClipPath(ctx, customShapeKind, 0, 0, canvasW, canvasH);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
  ctx.restore();
}

/* PREVIEW-ONLY quality helpers. Never used by the hi-res (300 DPI) print
   pipeline — that pipeline always draws straight from the original
   full-resolution <img>, untouched by anything below. */

/* devicePixelRatio*2, capped at 3, used to size preview canvas backing
   stores so they aren't blurry on HiDPI screens. */
function getPreviewRenderScale() {
  if (typeof window === 'undefined') return 1;
  return Math.min((window.devicePixelRatio || 1) * 2, 3);
}

/* Shrinks `img` down to ~targetW×targetH by repeatedly halving instead of
   one steep single-step canvas resize, which avoids the aliasing/blur a
   single big-ratio drawImage() produces (e.g. a 3000px source collapsed
   straight into a 75px circle). Only used to build PREVIEW pixels. */
function steppedDownscale(img, targetW, targetH) {
  const tw = Math.max(1, Math.round(targetW));
  const th = Math.max(1, Math.round(targetH));
  let source = img;
  let srcW = img.width, srcH = img.height;
  if (!srcW || !srcH) return img;
  while (srcW > tw * 2 && srcH > th * 2) {
    const nextW = Math.max(tw, Math.round(srcW / 2));
    const nextH = Math.max(th, Math.round(srcH / 2));
    const step = document.createElement('canvas');
    step.width = nextW;
    step.height = nextH;
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, nextW, nextH);
    source = step;
    srcW = nextW;
    srcH = nextH;
  }
  return source;
}

/* Cheap heuristic powering the "remove background?" suggestion — never
   scans full-resolution pixels. Downscales the image to a small fixed grid
   (one drawImage call, browser-accelerated) and runs the same border
   flood-fill the real removal uses, but only over that tiny grid, then
   reports what fraction of it is a white/near-white region connected to
   the edge. The actual removal (if the user opts in) still samples at
   preview/full resolution separately — this is purely a fast estimate. */
const WHITE_DETECT_GRID = 48;
const WHITE_DETECT_TOLERANCE = 15; // matches the default flood-fill tolerance
function detectBorderWhiteRatio(img) {
  const size = WHITE_DETECT_GRID;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const isWhiteish = (idx) => Math.min(data[idx], data[idx + 1], data[idx + 2]) >= 255 - WHITE_DETECT_TOLERANCE;
  const visited = new Uint8Array(size * size);
  const queue = [];
  for (let x = 0; x < size; x++) { queue.push(x, 0); queue.push(x, size - 1); }
  for (let y = 0; y < size; y++) { queue.push(0, y); queue.push(size - 1, y); }
  let count = 0;
  while (queue.length > 0) {
    const y = queue.pop();
    const x = queue.pop();
    if (x < 0 || x >= size || y < 0 || y >= size) continue;
    const pixelIdx = y * size + x;
    if (visited[pixelIdx]) continue;
    const dataIdx = pixelIdx * 4;
    if (!isWhiteish(dataIdx)) continue;
    visited[pixelIdx] = 1;
    count++;
    queue.push(x + 1, y); queue.push(x - 1, y);
    queue.push(x, y + 1); queue.push(x, y - 1);
  }
  return count / (size * size);
}
const WHITE_DETECT_SUGGEST_RATIO = 0.15;

/* ═══ "I already have my design" — print-ready file validation ═══
   pdf.js is only needed for PDF uploads in this flow, so it's dynamically
   imported on first use rather than bundled into the main app chunk. The
   worker script is vendored into /public (same pattern as
   bg-remove-worker.js) so it works with Turbopack with zero bundler config. */
let pdfjsLibPromise = null;
function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsLibPromise;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function getPdfPageCount(file) {
  const pdfjsLib = await getPdfjsLib();
  const buf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  return pdfDoc.numPages;
}

async function renderPdfPageToCanvas(file, pageNumber, targetWidthPx) {
  const pdfjsLib = await getPdfjsLib();
  const buf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport1 = page.getViewport({ scale: 1 });
  const scale = targetWidthPx / viewport1.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, pageWidthIn: viewport1.width / 72, pageHeightIn: viewport1.height / 72, numPages: pdfDoc.numPages };
}

/* Thin-band edge scan for the "content too close to the trim edge" warning.
   Deliberately NOT the flood-fill from detectBorderWhiteRatio above — that
   answers "how much of the background is white", this answers "is there any
   non-background content within N px of each edge", a different question
   that doesn't care about connectivity. */
function hasContentNearEdge(canvas, bandPx) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const band = Math.max(1, Math.round(bandPx));
  const tolerance = 12;
  const isContent = (data, idx) => {
    if (data[idx + 3] < 40) return false; // effectively transparent
    return Math.min(data[idx], data[idx + 1], data[idx + 2]) < 255 - tolerance;
  };
  const regions = [
    { x: 0, y: 0, w, h: Math.min(band, h) },
    { x: 0, y: Math.max(0, h - band), w, h: Math.min(band, h) },
    { x: 0, y: 0, w: Math.min(band, w), h },
    { x: Math.max(0, w - band), y: 0, w: Math.min(band, w), h },
  ];
  for (const r of regions) {
    if (r.w <= 0 || r.h <= 0) continue;
    const data = ctx.getImageData(r.x, r.y, r.w, r.h).data;
    for (let i = 0; i < data.length; i += 4) {
      if (isContent(data, i)) return true;
    }
  }
  return false;
}

/* Runs the full Change-2 validation suite for one customer-supplied design
   against its currently selected sheet type + (for PDFs) selected page.
   Never mutates or re-encodes the file — only reads it to measure. */
async function validateUploadDesignFile(design) {
  const target = getUploadTargetSizeIn(design.shape);
  const isPdf = design.fileMimeType === 'application/pdf';

  if (isPdf) {
    const pageNumber = Math.max(1, design.selectedPage || 1);
    const RENDER_DPI = 150;
    const pdfjsLib = await getPdfjsLib();
    const buf = await design.file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    const numPagesReal = pdfDoc.numPages;
    const clampedPage = Math.min(pageNumber, numPagesReal);
    const page = await pdfDoc.getPage(clampedPage);
    const viewport1 = page.getViewport({ scale: 1 });
    const fileWidthIn = viewport1.width / 72;
    const fileHeightIn = viewport1.height / 72;
    const renderScale = RENDER_DPI / 72;
    const viewport = page.getViewport({ scale: renderScale });
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = Math.max(1, Math.ceil(viewport.width));
    renderCanvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = renderCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const fit = computeContainFit(fileWidthIn, fileHeightIn, target.w, target.h);
    const bandPx = (UPLOAD_MARGIN_MM / 25.4) * RENDER_DPI;
    const marginWarning = hasContentNearEdge(renderCanvas, bandPx);

    return {
      computedAt: new Date().toISOString(),
      numPages: numPagesReal,
      selectedPage: clampedPage,
      fileWidthIn, fileHeightIn,
      targetWidthIn: target.w, targetHeightIn: target.h,
      sizeExact: fit.exact,
      printedWidthIn: fit.printedW, printedHeightIn: fit.printedH,
      dpiKnown: false, dpi: null, dpiOk: null,
      marginWarning,
    };
  }

  const img = await loadImageFromFile(design.file);
  const fit = computeContainFit(img.naturalWidth, img.naturalHeight, target.w, target.h);
  const effectiveDpi = img.naturalWidth / fit.printedW;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const bandPx = (UPLOAD_MARGIN_MM / 25.4) * effectiveDpi;
  const marginWarning = hasContentNearEdge(canvas, bandPx);

  return {
    computedAt: new Date().toISOString(),
    numPages: 1,
    selectedPage: 1,
    pixelWidth: img.naturalWidth, pixelHeight: img.naturalHeight,
    targetWidthIn: target.w, targetHeightIn: target.h,
    sizeExact: fit.exact,
    printedWidthIn: fit.printedW, printedHeightIn: fit.printedH,
    dpiKnown: true, dpi: effectiveDpi, dpiOk: effectiveDpi >= UPLOAD_MIN_DPI,
    marginWarning,
  };
}

/* Renders a customer-supplied file exactly as it will print: the file
   composited (contain-fit, same policy as validation) onto a white canvas
   sized to the target sheet's physical dimensions. This is preview-only —
   the bitmap it produces is never uploaded or stored; production always
   reads the original file (or, for a multi-page PDF, a page extracted from
   it — see Stage 4), never this rendering. */
async function renderUploadPreviewCanvas(design, previewDpi = 150) {
  const target = getUploadTargetSizeIn(design.shape);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(target.w * previewDpi);
  canvas.height = Math.round(target.h * previewDpi);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (design.fileMimeType === 'application/pdf') {
    const pdfjsLib = await getPdfjsLib();
    const buf = await design.file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    const pageNumber = Math.min(Math.max(1, design.selectedPage || 1), pdfDoc.numPages);
    const page = await pdfDoc.getPage(pageNumber);
    const viewport1 = page.getViewport({ scale: 1 });
    const fileWidthIn = viewport1.width / 72;
    const fileHeightIn = viewport1.height / 72;
    const fit = computeContainFit(fileWidthIn, fileHeightIn, target.w, target.h);
    const renderScale = (fit.printedW * previewDpi) / viewport1.width;
    const viewport = page.getViewport({ scale: renderScale });
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = Math.max(1, Math.ceil(viewport.width));
    pageCanvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: pageCanvas.getContext('2d'), viewport }).promise;
    const offX = Math.round(((target.w - fit.printedW) / 2) * previewDpi);
    const offY = Math.round(((target.h - fit.printedH) / 2) * previewDpi);
    ctx.drawImage(pageCanvas, offX, offY);
  } else {
    const img = await loadImageFromFile(design.file);
    const fit = computeContainFit(img.naturalWidth, img.naturalHeight, target.w, target.h);
    const drawW = fit.printedW * previewDpi;
    const drawH = fit.printedH * previewDpi;
    const offX = Math.round((canvas.width - drawW) / 2);
    const offY = Math.round((canvas.height - drawH) / 2);
    ctx.drawImage(img, offX, offY, drawW, drawH);
  }
  return canvas.toDataURL('image/png');
}

/* Layout math for the multi-circle "cookie sheet" grid, factored out so
   both the inline preview canvas and the print-preview modal (which render
   at different pixel sizes) can compute circle size/positions consistently. */
function computeMultiCircleLayout(cw, ch, isMultiCircle, sizeObj) {
  if (!isMultiCircle) return { circlePx: cw, mcCols: 1, mcRows: 1, mcGapPx: 0, mcStepPx: cw, mcOffsetX: 0, mcOffsetY: 0 };
  const circleSize = sizeObj.circleSize || 2;
  const mcGapInches = sizeObj.gap ?? MC_GAP;
  const previewPPI = cw / (sizeObj.w || ICING_SHEET_IN.w);
  const circlePx = Math.round(circleSize * previewPPI);
  const { cols: mcCols, rows: mcRows } = (sizeObj.cols && sizeObj.rows)
    ? { cols: sizeObj.cols, rows: sizeObj.rows }
    : getCircleGrid(sizeObj.w || ICING_SHEET_IN.w, sizeObj.h || ICING_SHEET_IN.h, circleSize);
  const mcGapPx = mcGapInches * previewPPI;
  const mcStepPx = circlePx + mcGapPx;
  const mcTotalW = mcCols * circlePx + Math.max(0, mcCols - 1) * mcGapPx;
  const mcTotalH = mcRows * circlePx + Math.max(0, mcRows - 1) * mcGapPx;
  const mcOffsetX = (cw - mcTotalW) / 2;
  const mcOffsetY = (ch - mcTotalH) / 2;
  return { circlePx, mcCols, mcRows, mcGapPx, mcStepPx, mcOffsetX, mcOffsetY };
}

/*
 * Layer positions/scales (layer.x, layer.y, layer.scale) are stored relative
 * to the inline editor's own layout — canvasW×canvasH for regular shapes, or
 * circlePx×circlePx for multi-circle sheets (see the auto-fit logic in
 * ImageEditor). Any renderer drawing those same layers into a differently
 * sized destination (e.g. the print-preview modal, fit to the viewport
 * instead of the inline container) must scale them by the ratio between the
 * destination size and that reference size, or the layers land offset from
 * where they appear inline. Both renderPreviewCore call sites must derive
 * their layerScale through this one function so they can't diverge again.
 */
function computeLayerScale(isMultiCircle, destW, destCirclePx, refW, refCirclePx) {
  return isMultiCircle ? destCirclePx / refCirclePx : destW / refW;
}

/*
 * Draws the PREVIEW ONLY — never called for hi-res/print output.
 * Pure function of its arguments so it can be reused both by the small
 * inline editor canvas and the fullscreen print-preview modal, which
 * render the same composition at different pixel sizes.
 *   ctx              — 2D context of the destination canvas, already sized
 *                       and (if HiDPI) ctx.scale()'d by the caller; this
 *                       function draws entirely in cw×ch logical units.
 *   layerScale       — ratio between this destination's size and the inline
 *                       editor's own layout size, from computeLayerScale();
 *                       applied to every layer.x/y/scale and to text size so
 *                       the composition lands identically regardless of the
 *                       destination canvas's pixel dimensions.
 *   downscale(key,img,w,h) — returns a pre-shrunk drawImage-able source,
 *                       memoized by the caller across renders.
 *   renderScale      — the same DPR-derived scale the caller applied to
 *                       `ctx`, used to size the offscreen multi-circle
 *                       "source crop" canvas at matching physical density.
 */
/* Appends a circle as its own closed subpath (via an explicit moveTo to the
   arc's start point) so it can be combined with a preceding rect() subpath
   and filled with the 'evenodd' rule — see drawCropInteractionOverlay. */
function appendCirclePath(ctx, cx, cy, r) {
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

/* Shared per-layer paint loop, used both for the crisp clipped render and
   (while the user is actively dragging/scaling) an unclipped full-bleed
   pass so the crop-interaction overlay below has real pixels to darken. */
function drawLayers(ctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, cacheSuffix, grayscale) {
  layers.forEach(layer => {
    const img = getImg(layer.id);
    /* layer.x/y/scale are always anchored to the ORIGINAL loaded image's
       dimensions (see the auto-fit calc in the layer-load effect below) —
       getImg() can return a smaller preview bitmap (BG_REMOVE_PREVIEW_MAX_WIDTH)
       when background removal is on, so the destination box must be sized
       off the native dimensions, never off whatever bitmap is being sampled. */
    const native = getNativeSize(layer.id);
    if (!img || !native) return;
    ctx.save();
    if (grayscale) ctx.filter = 'grayscale(100%)';
    const imgW = native.width * layer.scale * layerScale;
    const imgH = native.height * layer.scale * layerScale;
    const lx = layer.x * layerScale, ly = layer.y * layerScale;
    const src = downscale(`${layer.id}:${cacheSuffix}`, img, imgW * renderScale, imgH * renderScale);
    if (layer.rotation !== 0) {
      ctx.translate(lx + imgW / 2, ly + imgH / 2);
      ctx.rotate(layer.rotation * Math.PI / 180);
      ctx.translate(-(lx + imgW / 2), -(ly + imgH / 2));
    }
    ctx.drawImage(src, lx, ly, imgW, imgH);
    if (grayscale) ctx.filter = 'none';
    ctx.restore();
  });
}

/* Interaction-only crop indicator: a semi-transparent dark mask over
   everything outside the crop shape (so the overflow painted by the
   unclipped drawLayers() pass above is visible as "what gets lost"), plus
   a soft 1px white line tracing the crop boundary. `boundsFn` appends the
   crop-shape subpath (no leading beginPath/rect) to whatever path is
   already open on `ctx`. Both elements are opacity-driven by the caller so
   they can fade in/out around a drag or scale gesture. */
function drawCropInteractionOverlay(ctx, cw, ch, boundsFn, overlayOpacity) {
  if (overlayOpacity <= 0.002) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  boundsFn(ctx);
  ctx.fillStyle = `rgba(0,0,0,${(0.4 * overlayOpacity).toFixed(3)})`;
  ctx.fill('evenodd');
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  boundsFn(ctx);
  ctx.strokeStyle = `rgba(255,255,255,${overlayOpacity.toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.shadowColor = `rgba(0,0,0,${(0.35 * overlayOpacity).toFixed(3)})`;
  ctx.shadowBlur = 3;
  ctx.stroke();
  ctx.restore();
}

function renderPreviewCore(ctx, cw, ch, {
  shape, isBWSheet, isMultiCircle, layers, getImg, getNativeSize, bgColor, textOverlay,
  circlePx, mcCols, mcRows, mcOffsetX, mcOffsetY, mcStepPx, layerScale = 1,
  downscale, renderScale, isMobile, showSelection, selectedLayer, selectedLayerImg,
  showWatermark, overlayOpacity = 0, customShapeKind,
}) {
  ctx.clearRect(0, 0, cw, ch);
  drawShapeShadow(ctx, shape, cw, ch, isMobile, customShapeKind);

  if (isBWSheet) {
    const squareSize = cw * (BWSHEET_DESIGN_IN / ICING_SHEET_IN.w);
    const sqX = (cw - squareSize) / 2;
    const sqY = (ch - squareSize) / 2;
    const bwInteracting = showSelection && overlayOpacity > 0.002;

    /* Unclipped full-bleed pass — only while actively dragging/scaling, so
       the mask below has real (dimmed) pixels to show as "what gets lost"
       instead of empty canvas. */
    if (bwInteracting) {
      ctx.save();
      ctx.filter = 'grayscale(100%)';
      drawLayers(ctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, 'bw', false);
      ctx.filter = 'none';
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(sqX, sqY, squareSize, squareSize);
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);
    if (bgColor && bgColor !== 'transparent') {
      ctx.filter = 'grayscale(100%)';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cw, ch);
      ctx.filter = 'none';
    }
    ctx.filter = 'grayscale(100%)';
    drawLayers(ctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, 'bw', false);
    ctx.filter = 'none';
    if (textOverlay?.text) {
      ctx.filter = 'grayscale(100%)';
      drawText(ctx, textOverlay, cw, ch, layerScale);
      ctx.filter = 'none';
    }
    ctx.restore();

    if (showSelection) {
      if (bwInteracting) {
        drawCropInteractionOverlay(ctx, cw, ch, (c) => c.rect(sqX, sqY, squareSize, squareSize), overlayOpacity);
      }
    } else {
      ctx.beginPath();
      ctx.rect(sqX, sqY, squareSize, squareSize);
      ctx.strokeStyle = '#C8C8C8';
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (isMultiCircle) {
    /* Fill the WHOLE sheet with bgColor first — not just inside each tiled
       circle — so the gaps/margins between circles are colored too, not
       left as the plain white shadow-shape fill from drawShapeShadow above.
       (Bug: background fill used to only reach the inside of each circle.) */
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cw, ch);
    }
    /* Build a single source-crop canvas (what the user sees) then tile it.
       Rendered at renderScale physical density so tiling it 40× onto the
       already-scaled main canvas is a crisp ~1:1 blit, not an upscale. */
    const mcInteracting = showSelection && overlayOpacity > 0.002;
    const sc = document.createElement('canvas');
    const scPx = Math.max(1, Math.round(circlePx * renderScale));
    sc.width = scPx; sc.height = scPx;
    const sctx = sc.getContext('2d');
    sctx.scale(renderScale, renderScale);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';

    /* Unclipped full-bleed pass onto the source-crop canvas — only while
       interacting — so the mask below has the real overflow to darken. */
    if (mcInteracting) {
      sctx.save();
      drawLayers(sctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, 'mc', false);
      sctx.restore();
    }

    sctx.beginPath();
    sctx.arc(circlePx / 2, circlePx / 2, circlePx / 2, 0, Math.PI * 2);
    sctx.fillStyle = '#FFFFFF';
    sctx.fill();
    if (bgColor && bgColor !== 'transparent') {
      sctx.beginPath();
      sctx.arc(circlePx / 2, circlePx / 2, circlePx / 2, 0, Math.PI * 2);
      sctx.fillStyle = bgColor;
      sctx.fill();
    }
    sctx.save();
    sctx.beginPath();
    sctx.arc(circlePx / 2, circlePx / 2, circlePx / 2, 0, Math.PI * 2);
    sctx.clip();
    drawLayers(sctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, 'mc', false);
    sctx.restore();
    drawText(sctx, textOverlay, circlePx, circlePx, layerScale);

    if (mcInteracting) {
      drawCropInteractionOverlay(sctx, circlePx, circlePx,
        (c) => appendCirclePath(c, circlePx / 2, circlePx / 2, circlePx / 2), overlayOpacity);
    }

    /* Tile source crop into the grid — processed once above, reused for
       every circle below (no per-circle reprocessing). */
    for (let row = 0; row < mcRows; row++) {
      for (let col = 0; col < mcCols; col++) {
        const ox = mcOffsetX + col * mcStepPx;
        const oy = mcOffsetY + row * mcStepPx;
        ctx.drawImage(sc, ox, oy, circlePx, circlePx);
      }
    }
    if (!showSelection) {
      ctx.strokeStyle = '#C8C8C8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      for (let row = 0; row < mcRows; row++) {
        for (let col = 0; col < mcCols; col++) {
          ctx.beginPath();
          ctx.arc(mcOffsetX + col * mcStepPx + circlePx / 2, mcOffsetY + row * mcStepPx + circlePx / 2, circlePx / 2 - 1, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
  } else {
    /* Circle/heart (and a clipped Custom sub-shape) have a real "outside
       the shape but inside the canvas" region to mask; a full-bleed rect
       crop doesn't (the shape already covers the whole canvas), so it
       gets a boundary line only. */
    const customClipped = shape === 'custom' && isCustomShapeClipped(customShapeKind);
    const boundsFn = shape === 'circular'
      ? (c) => appendCirclePath(c, cw / 2, ch / 2, cw / 2)
      : shape === 'heart'
        ? (c) => drawHeartPath(c, 0, 0, cw, ch, true)
        : customClipped
          ? (c) => appendCustomShapeClipPath(c, customShapeKind, 0, 0, cw, ch, true)
          : null;
    const interacting = showSelection && overlayOpacity > 0.002;

    if (interacting && boundsFn) {
      ctx.save();
      drawLayers(ctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, 'main', false);
      ctx.restore();
    }

    ctx.save();
    if (shape === 'circular') {
      ctx.beginPath();
      ctx.arc(cw / 2, ch / 2, cw / 2, 0, Math.PI * 2);
      ctx.clip();
    } else if (shape === 'heart') {
      drawHeartPath(ctx, 0, 0, cw, ch);
      ctx.clip();
    } else if (customClipped) {
      appendCustomShapeClipPath(ctx, customShapeKind, 0, 0, cw, ch);
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.clip();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cw, ch);
    }
    drawLayers(ctx, layers, getImg, getNativeSize, layerScale, downscale, renderScale, 'main', false);
    drawText(ctx, textOverlay, cw, ch, layerScale);
    ctx.restore();

    /* Crop-interaction mask + boundary line — inline editor only, and only
       while the user is actively dragging/scaling (see overlayOpacity). */
    if (showSelection) {
      if (interacting && boundsFn) {
        drawCropInteractionOverlay(ctx, cw, ch, boundsFn, overlayOpacity);
      } else if (interacting) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${overlayOpacity.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.shadowColor = `rgba(0,0,0,${(0.35 * overlayOpacity).toFixed(3)})`;
        ctx.shadowBlur = 3;
        ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);
        ctx.restore();
      }
    } else {
      ctx.strokeStyle = '#C8C8C8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      if (shape === 'circular') {
        ctx.beginPath();
        ctx.arc(cw / 2, ch / 2, cw / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape === 'heart') {
        drawHeartPath(ctx, 1, 1, cw - 2, ch - 2);
        ctx.stroke();
      } else if (customClipped) {
        appendCustomShapeClipPath(ctx, customShapeKind, 1, 1, cw - 2, ch - 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);
      }
      ctx.setLineDash([]);
    }
  }

  if (showWatermark) drawWatermark(ctx, cw, ch);
}

/* White-background removal now runs off the main thread — see
   public/bg-remove-worker.js (same flood-fill + feather algorithm, moved
   verbatim) and removeWhiteBackgroundViaWorker() inside ImageEditor below. */

function ImageEditor({ layers, onLayersChange, shape, sizeObj, onCrop, onHiResCrop, bgColor = '#FFFFFF', textOverlay = null, onTextPositionChange, removeWhiteBg = false, bgRemoveTolerance = 30, onBgProcessingChange, onWhiteBgSuggestion, sizeLabel = '', isMobile = false, designs = [], activeDesignId = null, customShapeKind = undefined }) {
  /* Declared early: several hooks below depend on these */
  const isMultiCircle = shape === 'multicircle';
  const isBWSheet = shape === 'bwsheet';

  const canvasRef = useRef(null);
  const hiResCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const imgRefs = useRef({});
  /* Background-removed bitmaps, kept in TWO separate caches so the hi-res
     print pipeline never touches the downscaled preview version:
     - processedImgRefs: preview only, capped to BG_REMOVE_PREVIEW_MAX_WIDTH.
     - processedHiResImgRefs: full original resolution, used only by the
       hi-res canvas draw code (getHiResImg) that feeds the print output. */
  const processedImgRefs = useRef({});
  const processedHiResImgRefs = useRef({});
  const addLayerFileRef = useRef(null);

  /* Persistent Web Worker running the white-background removal algorithm
     (public/bg-remove-worker.js) off the main thread. One worker per
     ImageEditor instance, created lazily, terminated on unmount. */
  const bgWorkerRef = useRef(null);
  const bgWorkerCallbacksRef = useRef(new Map());
  const bgRequestIdRef = useRef(0);
  const getBgWorker = () => {
    if (!bgWorkerRef.current) {
      const worker = new Worker('/bg-remove-worker.js');
      worker.onmessage = (e) => {
        const { requestId, ok, bitmap, error } = e.data;
        const cb = bgWorkerCallbacksRef.current.get(requestId);
        bgWorkerCallbacksRef.current.delete(requestId);
        if (!cb) { bitmap?.close?.(); return; }
        if (ok) cb.resolve(bitmap); else cb.reject(new Error(error));
      };
      bgWorkerRef.current = worker;
    }
    return bgWorkerRef.current;
  };
  useEffect(() => () => {
    bgWorkerRef.current?.terminate();
    bgWorkerRef.current = null;
  }, []);
  /* Preview quality only — capped so a single slider tick's flood fill runs
     in single-digit/low-double-digit ms even on a large source photo. The
     hi-res pass (no maxWidth) always runs at the original resolution. */
  const BG_REMOVE_PREVIEW_MAX_WIDTH = 600;
  const removeWhiteBackgroundViaWorker = async (img, tolerance, maxWidth) => {
    const opts = {};
    if (maxWidth && img.width > maxWidth) {
      opts.resizeWidth = maxWidth;
      opts.resizeHeight = Math.max(1, Math.round(img.height * (maxWidth / img.width)));
      opts.resizeQuality = 'high';
    }
    const bitmap = await createImageBitmap(img, opts);
    const worker = getBgWorker();
    const requestId = ++bgRequestIdRef.current;
    return new Promise((resolve, reject) => {
      bgWorkerCallbacksRef.current.set(requestId, { resolve, reject });
      worker.postMessage({ requestId, bitmap, tolerance }, [bitmap]);
    });
  };
  /* Runs both passes (preview-capped + full-res) for one loaded image in
     parallel, as two independent worker round-trips. Returns the bitmaps
     without storing them — callers decide whether to keep or discard+close
     based on whether a newer request has since superseded this one. */
  const computeBgRemovalForId = async (id, tolerance) => {
    const img = imgRefs.current[id];
    if (!img) return null;
    const [previewBmp, hiResBmp] = await Promise.all([
      removeWhiteBackgroundViaWorker(img, tolerance, BG_REMOVE_PREVIEW_MAX_WIDTH),
      removeWhiteBackgroundViaWorker(img, tolerance, null),
    ]);
    return { previewBmp, hiResBmp };
  };
  /* Cache of preview-only stepped-downscale results, keyed by cache key
     (layer id + which render pass). Invalidated automatically whenever the
     source image or requested target size changes, so the expensive
     downscale only re-runs when someone actually zooms/switches images —
     not on every drag frame, and never on the hi-res print pipeline. */
  const downscaleCacheRef = useRef(new Map());
  const getDownscaledSource = (cacheKey, img, targetW, targetH) => {
    const tw = Math.max(1, Math.round(targetW));
    const th = Math.max(1, Math.round(targetH));
    const cached = downscaleCacheRef.current.get(cacheKey);
    if (cached && cached.img === img && cached.w === tw && cached.h === th) return cached.source;
    const source = steppedDownscale(img, tw, th);
    downscaleCacheRef.current.set(cacheKey, { img, w: tw, h: th, source });
    return source;
  };
  const onLayersChangeRef = useRef(onLayersChange);
  onLayersChangeRef.current = onLayersChange;

  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  useEffect(() => { onBgProcessingChange?.(bgProcessing); }, [bgProcessing]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Counter rather than a plain boolean: multiple layers can be reprocessing
     concurrently, and the indicator should stay on until all of them finish. */
  const bgProcessingCountRef = useRef(0);
  const beginBgProcessing = () => { bgProcessingCountRef.current++; setBgProcessing(true); };
  const endBgProcessing = () => {
    bgProcessingCountRef.current = Math.max(0, bgProcessingCountRef.current - 1);
    if (bgProcessingCountRef.current === 0) setBgProcessing(false);
  };
  const [dragging, setDragging] = useState(false);
  const [dragLayerId, setDragLayerId] = useState(null);
  const [dragStart, setDragStart] = useState({ clientX: 0, clientY: 0, layerX: 0, layerY: 0 });
  const [textDragging, setTextDragging] = useState(false);
  const textDragOffset = useRef({ dx: 0, dy: 0 });
  const activePointers = useRef(new Map());
  const pinchStateRef = useRef(null);

  /* Crop-interaction overlay (mask + boundary line, see renderPreviewCore):
     shown at full opacity while actively dragging/scaling, then faded out
     over ~400ms after release. Driven by a raw rAF loop rather than React
     state so the fade doesn't re-trigger the (expensive) hi-res print pass
     on every animation frame — it only repaints the visible low-res canvas,
     reusing the last args the main draw effect computed. */
  const overlayOpacityRef = useRef(0);
  const overlayFadeRafRef = useRef(null);
  const lastPreviewDrawRef = useRef(null);
  const setCropInteracting = (active) => {
    if (active) {
      if (overlayFadeRafRef.current) {
        cancelAnimationFrame(overlayFadeRafRef.current);
        overlayFadeRafRef.current = null;
      }
      overlayOpacityRef.current = 1;
      const last = lastPreviewDrawRef.current;
      if (last) renderPreviewCore(last.ctx, last.cw, last.ch, { ...last.args, overlayOpacity: 1 });
      return;
    }
    if (overlayOpacityRef.current <= 0 || overlayFadeRafRef.current) return;
    const FADE_MS = 400;
    const fadeFrom = overlayOpacityRef.current;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      overlayOpacityRef.current = fadeFrom * (1 - t);
      const last = lastPreviewDrawRef.current;
      if (last) renderPreviewCore(last.ctx, last.cw, last.ch, { ...last.args, overlayOpacity: overlayOpacityRef.current });
      if (t < 1) {
        overlayFadeRafRef.current = requestAnimationFrame(step);
      } else {
        overlayFadeRafRef.current = null;
      }
    };
    overlayFadeRafRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => {
    if (overlayFadeRafRef.current) cancelAnimationFrame(overlayFadeRafRef.current);
  }, []);

  const [redrawTick, setRedrawTick] = useState(0);
  const [canvasW, setCanvasW] = useState(360);
  const [canvasH, setCanvasH] = useState(360);

  /* Multi-circle layout — computed early (needs only canvasW/canvasH/sizeObj)
     because the modal print-preview effect below needs it to derive its own
     scale factor relative to the inline editor's layout. Delegates to
     computeMultiCircleLayout() — the same function the hi-res export and the
     print-preview modal use — instead of re-deriving the grid math here. */
  const circleSize = sizeObj.circleSize || 2;
  const mcGapInches = isMultiCircle ? (sizeObj.gap ?? MC_GAP) : 0;
  const { circlePx, mcCols, mcRows, mcGapPx, mcStepPx, mcOffsetX, mcOffsetY } =
    computeMultiCircleLayout(canvasW, canvasH, isMultiCircle, sizeObj);

  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  );

  /* ── Fullscreen print-preview modal (Problem 2) ── */
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [modalBaseSize, setModalBaseSize] = useState({ w: 360, h: 360 });
  const [modalZoom, setModalZoom] = useState(1);
  const [modalPan, setModalPan] = useState({ x: 0, y: 0 });
  const modalCanvasRef = useRef(null);
  const modalViewportRef = useRef(null);
  const modalPointers = useRef(new Map());
  const modalPinchRef = useRef(null);
  const modalDragRef = useRef(null);

  /* Which design's SHEET the modal is showing — defaults to the one being
     edited when opened, but the customer can page through every design in
     the order without leaving the modal (each design gets its own sheet). */
  const [previewDesignId, setPreviewDesignId] = useState(null);
  useEffect(() => {
    if (showPrintPreview) setPreviewDesignId(activeDesignId);
  }, [showPrintPreview, activeDesignId]);
  const previewIndex = Math.max(0, designs.findIndex(d => d.id === previewDesignId));
  const previewDesign = designs[previewIndex] || designs.find(d => d.id === activeDesignId) || null;

  /* Preview-only image cache, independent of imgRefs (which only ever holds
     the ACTIVE design's images — see the layer-load effect above). Paging
     to a different design in the modal loads straight from layer.src into
     here, never touching the live editor's own image/auto-fit state. */
  const previewImgCacheRef = useRef({});
  const [previewImagesTick, setPreviewImagesTick] = useState(0);
  useEffect(() => {
    if (!showPrintPreview || !previewDesign) return;
    const toLoad = (previewDesign.layers || []).filter(l => !previewImgCacheRef.current[l.id]);
    if (toLoad.length === 0) return;
    let cancelled = false;
    Promise.all(toLoad.map(l => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { previewImgCacheRef.current[l.id] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = l.src;
    }))).then(() => { if (!cancelled) setPreviewImagesTick(t => t + 1); });
    return () => { cancelled = true; };
  }, [showPrintPreview, previewDesign]);
  const getPreviewImg = (id) => previewImgCacheRef.current[id];
  const getPreviewNativeSize = (id) => {
    const img = previewImgCacheRef.current[id];
    return img ? { width: img.width, height: img.height } : null;
  };

  /* The reference canvas size a design's layer.x/y/scale values are stored
     relative to. For the active design that's the live canvasW/circlePx;
     for any other design it's recomputed from its own shape/size against
     the current container — accurate as long as the container hasn't
     resized since that design was last edited (the common case). */
  const referenceSizeFor = (design) => {
    if (!design || design.id === activeDesignId) return { refW: canvasW, refCirclePx: circlePx };
    const dShape = design.shape;
    const dSizes = SIZES[dShape] || [];
    const dSizeObj = dShape === 'custom'
      ? { w: parseFloat(design.customW) || 2, h: parseFloat(design.customH) || 2 }
      : (dSizes.find(s => s.id === design.sizeId) || dSizes[0] || {});
    const { canvasW: refW, canvasH: refH } = computeCanvasSize(containerRef.current?.offsetWidth || 480, dShape, dSizeObj, viewportHeight);
    const dIsMultiCircle = dShape === 'multicircle';
    const refCirclePx = dIsMultiCircle
      ? computeMultiCircleLayout(refW, refH, true, dSizeObj).circlePx
      : refW;
    return { refW, refCirclePx };
  };

  /* Reset zoom/pan each time the modal opens. zoom=1 IS "fit to screen" —
     modalBaseSize (below) is computed to exactly fill the safe visible
     area, so there's no separate "100% native" mode to guard against on
     mobile; this always opens fit, on every screen size. */
  useEffect(() => {
    if (showPrintPreview) { setModalZoom(1); setModalPan({ x: 0, y: 0 }); }
  }, [showPrintPreview]);

  /* Snap pan back to center once zoomed back out to fit */
  useEffect(() => {
    if (modalZoom <= 1 && (modalPan.x !== 0 || modalPan.y !== 0)) setModalPan({ x: 0, y: 0 });
  }, [modalZoom]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Lock background scroll + close on Esc while modal is open */
  useEffect(() => {
    if (!showPrintPreview) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setShowPrintPreview(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [showPrintPreview]);

  /* Size the modal canvas to fit the *actual visible* area — never
     window.innerWidth/innerHeight directly. Those don't reflect mobile
     browser chrome (address bar) or safe-area insets during the first
     frames after the modal mounts, which let the sheet compute wider than
     the real safe width and get clipped by the viewport's overflow:hidden
     (reported bug: sheet cut off on the right on Android, 8" ROUND).
     Fix: measure modalViewportRef's own rendered box (already net of the
     header/toolbar siblings via flex:1 — no more hardcoded "chrome" guess),
     subtract its CSS padding (which encodes env(safe-area-inset-*) — see
     the div's style below) via getComputedStyle, and clamp against
     window.visualViewport when available, since that's what's actually
     visible on mobile independent of the layout viewport. Rechecked via
     rAF right after mount (layout may still be settling) plus a
     ResizeObserver + visualViewport listeners for anything later
     (address-bar collapse, orientation change, on-screen keyboard).
     Aspect ratio is the PRINTED SHEET's (A4 or Letter, by material — see
     lib/paper-config.js), not the design's own shape, so the modal shows
     the whole sheet the customer receives, not just the isolated design. */
  useEffect(() => {
    if (!showPrintPreview) return;
    const el = modalViewportRef.current;
    if (!el) return;

    const update = () => {
      const node = modalViewportRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      const vv = window.visualViewport;
      const boxW = vv ? Math.min(rect.width, vv.width) : rect.width;
      const boxH = vv ? Math.min(rect.height, vv.height) : rect.height;

      const sheet = sheetSizeInForShape(previewDesign?.shape || shape);
      const aspect = sheet.w / sheet.h;
      const availW = Math.max(120, boxW - padL - padR);
      const availH = Math.max(120, boxH - padT - padB);
      let w = availW;
      let h = w / aspect;
      if (h > availH) { h = availH; w = h * aspect; }
      setModalBaseSize({ w: Math.floor(w), h: Math.floor(h) });
    };

    update();
    let raf2 = null;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(update); });

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [showPrintPreview, previewDesign?.shape, shape, isMobile]);

  /* Draw the modal canvas: the WHOLE printed sheet (paper background, design
     placed at its real position/size/margins, cut line, grid for cookie
     sheet) — not just the isolated design. Full-bleed whole-sheet shapes
     with no print margin (bwsheet/multicircle/waferletter) draw straight
     onto the full sheet via renderPreviewCore, exactly like the hi-res
     export does (both call computeMultiCircleLayout fed the destination's
     own pixel size). Every other shape — individual-item ones
     (circular/heart/square/custom) AND whole-sheet shapes that DO have a
     margin (fullsheet, see hasSheetMargin()/paper-config.js) — render into
     a sub-canvas at their placed size, then get positioned on the sheet via
     computeSheetPlacement() — the SAME function lib/generate-pdf.js calls
     server-side, so this can't show a position/margin that doesn't match
     the PDF. */
  useEffect(() => {
    if (!showPrintPreview || !previewDesign) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const cw = modalBaseSize.w, ch = modalBaseSize.h;
    const renderScale = getPreviewRenderScale();
    canvas.width = Math.max(1, Math.round(cw * renderScale));
    canvas.height = Math.max(1, Math.round(ch * renderScale));
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    /* Paper background — reads as a physical sheet, not app chrome. */
    ctx.fillStyle = '#FBFAF7';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#E2E0D9';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    const isActive = previewDesign.id === activeDesignId;
    const pShape = previewDesign.shape;
    const pIsMultiCircle = pShape === 'multicircle';
    const pIsBWSheet = pShape === 'bwsheet';
    const pLayers = previewDesign.layers || [];
    const pBgColor = previewDesign.bgColor || '#FFFFFF';
    const pTextOverlay = previewDesign.textOverlay || null;
    const pSizes = SIZES[pShape] || [];
    const pSizeObj = pShape === 'custom'
      ? { w: parseFloat(previewDesign.customW) || 2, h: parseFloat(previewDesign.customH) || 2 }
      : (pSizes.find(s => s.id === previewDesign.sizeId) || pSizes[0] || {});
    /* The active design's images/removeWhiteBg live in the editor's own
       refs; every other design draws from the modal-only preview cache
       (see previewImgCacheRef above) — never the other way around. */
    const pGetImg = isActive ? getImg : getPreviewImg;
    const pGetNativeSize = isActive ? getNativeSize : getPreviewNativeSize;
    const downscale = (key, img, w, h) => getDownscaledSource('modalPreview:' + key, img, w, h);
    const { refW, refCirclePx } = referenceSizeFor(previewDesign);

    if (isWholeSheetShape(pShape) && !hasSheetMargin(pShape)) {
      const layout = computeMultiCircleLayout(cw, ch, pIsMultiCircle, pSizeObj);
      const layerScale = computeLayerScale(pIsMultiCircle, cw, layout.circlePx, refW, refCirclePx);
      renderPreviewCore(ctx, cw, ch, {
        shape: pShape, isBWSheet: pIsBWSheet, isMultiCircle: pIsMultiCircle,
        layers: pLayers, getImg: pGetImg, getNativeSize: pGetNativeSize,
        bgColor: pBgColor, textOverlay: pTextOverlay,
        circlePx: layout.circlePx, mcCols: layout.mcCols, mcRows: layout.mcRows,
        mcOffsetX: layout.mcOffsetX, mcOffsetY: layout.mcOffsetY, mcStepPx: layout.mcStepPx,
        layerScale, downscale, renderScale, isMobile: false,
        showSelection: false, selectedLayer: null, selectedLayerImg: null,
        showWatermark: true,
      });
    } else {
      const placement = computeSheetPlacement(pShape, pSizeObj, previewDesign.customW, previewDesign.customH);
      const pxPerInX = cw / placement.sheetW, pxPerInY = ch / placement.sheetH;
      const designPxW = Math.max(1, Math.round(placement.designW * pxPerInX));
      const designPxH = Math.max(1, Math.round(placement.designH * pxPerInY));
      const offPxX = placement.offsetX * pxPerInX, offPxY = placement.offsetY * pxPerInY;

      const sub = document.createElement('canvas');
      sub.width = Math.max(1, Math.round(designPxW * renderScale));
      sub.height = Math.max(1, Math.round(designPxH * renderScale));
      const sctx = sub.getContext('2d');
      sctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      const layerScale = computeLayerScale(false, designPxW, designPxW, refW, refCirclePx);
      renderPreviewCore(sctx, designPxW, designPxH, {
        shape: pShape, isBWSheet: false, isMultiCircle: false,
        layers: pLayers, getImg: pGetImg, getNativeSize: pGetNativeSize,
        bgColor: pBgColor, textOverlay: pTextOverlay,
        circlePx: designPxW, mcCols: 1, mcRows: 1, mcOffsetX: 0, mcOffsetY: 0, mcStepPx: designPxW,
        layerScale, downscale, renderScale, isMobile: false,
        showSelection: false, selectedLayer: null, selectedLayerImg: null,
        showWatermark: true, customShapeKind: previewDesign.customShapeKind,
      });
      ctx.drawImage(sub, offPxX, offPxY, designPxW, designPxH);

      /* Cut line around the design's actual contour. */
      ctx.save();
      ctx.strokeStyle = '#BFBFBF';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      if (pShape === 'circular') {
        ctx.arc(offPxX + designPxW / 2, offPxY + designPxH / 2, designPxW / 2, 0, Math.PI * 2);
      } else if (pShape === 'heart') {
        drawHeartPath(ctx, offPxX, offPxY, designPxW, designPxH);
      } else if (pShape === 'custom' && isCustomShapeClipped(previewDesign.customShapeKind)) {
        appendCustomShapeClipPath(ctx, previewDesign.customShapeKind, offPxX, offPxY, designPxW, designPxH, true);
      } else {
        ctx.rect(offPxX, offPxY, designPxW, designPxH);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [showPrintPreview, modalBaseSize, previewDesign, previewImagesTick, redrawTick, layers, canvasW, circlePx, removeWhiteBg]);

  /* "8" Round · A4" — the design's own dimensions plus the sheet material,
     so it reads as a physical spec, not just a shape name. */
  const previewSheetLabel = (() => {
    if (!previewDesign) return '';
    const pShape = previewDesign.shape;
    const material = pShape === 'waferletter' ? 'Letter' : 'A4';
    const pSizes = SIZES[pShape] || [];
    const pSizeObj = pShape === 'custom'
      ? { w: parseFloat(previewDesign.customW) || 2, h: parseFloat(previewDesign.customH) || 2 }
      : (pSizes.find(s => s.id === previewDesign.sizeId) || pSizes[0] || {});
    let designLabel;
    if (pShape === 'circular' || pShape === 'heart' || pShape === 'square') {
      designLabel = `${pSizeObj.w}" ${SHAPE_LABEL[pShape]}`;
    } else if (pShape === 'custom') {
      designLabel = `${pSizeObj.w}"×${pSizeObj.h}"`;
    } else if (pShape === 'bwsheet') {
      designLabel = `${BWSHEET_DESIGN_IN}" B&W Square`;
    } else if (pShape === 'multicircle') {
      designLabel = `${pSizeObj.circleSize}" Circles (${(pSizeObj.cols || 0) * (pSizeObj.rows || 0)})`;
    } else {
      designLabel = SHAPE_LABEL[pShape] || pShape;
    }
    return `${designLabel} · ${material}`;
  })();

  const goToPreviewDesign = (delta) => {
    if (designs.length < 2) return;
    const next = (previewIndex + delta + designs.length) % designs.length;
    setPreviewDesignId(designs[next].id);
    setModalZoom(1);
    setModalPan({ x: 0, y: 0 });
  };

  const onModalPointerDown = (e) => {
    modalPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (modalPointers.current.size === 2) {
      const pts = Array.from(modalPointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      modalPinchRef.current = { initialDist: dist, initialZoom: modalZoom };
      modalDragRef.current = null;
    } else if (modalPointers.current.size === 1 && modalZoom > 1) {
      modalDragRef.current = { startX: e.clientX, startY: e.clientY, startPan: modalPan };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  };
  const onModalPointerMove = (e) => {
    if (!modalPointers.current.has(e.pointerId)) return;
    modalPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (modalPointers.current.size === 2 && modalPinchRef.current) {
      const pts = Array.from(modalPointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const { initialDist, initialZoom } = modalPinchRef.current;
      setModalZoom(Math.min(4, Math.max(0.5, initialZoom * (dist / initialDist))));
      return;
    }
    if (modalDragRef.current) {
      const { startX, startY, startPan } = modalDragRef.current;
      setModalPan({ x: startPan.x + (e.clientX - startX), y: startPan.y + (e.clientY - startY) });
    }
  };
  const onModalPointerUp = (e) => {
    modalPointers.current.delete(e.pointerId);
    if (modalPointers.current.size < 2) modalPinchRef.current = null;
    if (modalPointers.current.size === 0) modalDragRef.current = null;
  };

  /* Wheel-to-zoom on desktop (native listener so preventDefault actually stops page scroll) */
  useEffect(() => {
    if (!showPrintPreview) return;
    const el = modalViewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setModalZoom(z => Math.min(4, Math.max(0.5, +(z - e.deltaY * 0.0015).toFixed(3))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [showPrintPreview]);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Keep shape/sizeObj/viewportHeight accessible inside ResizeObserver without re-creating it */
  const shapeRef = useRef(shape);
  const sizeObjRef = useRef(sizeObj);
  const viewportHRef = useRef(viewportHeight);
  shapeRef.current = shape;
  sizeObjRef.current = sizeObj;
  viewportHRef.current = viewportHeight;

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      const containerW = containerRef.current.offsetWidth;
      const { canvasW: w, canvasH: h } = computeCanvasSize(
        containerW, shapeRef.current, sizeObjRef.current, viewportHRef.current
      );
      setCanvasW(w);
      setCanvasH(h);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* Recalculate canvas size when shape, size, or viewport changes */
  useEffect(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const { canvasW: w, canvasH: h } = computeCanvasSize(containerW, shape, sizeObj, viewportHeight);
    setCanvasW(w);
    setCanvasH(h);
  }, [shape, sizeObj.id, sizeObj.w, sizeObj.h, viewportHeight]);

  /* Hi-res output: 300 DPI */
  const DPI = 300;
  const printW = sizeObj.w || 6;
  const printH = sizeObj.h || 6;
  const hiResW = printW * DPI;
  const hiResH = printH * DPI;
  const scaleFactor = hiResW / canvasW;

  /* Effective selected layer (handles stale selectedLayerId on design switch) */
  const effectiveSelectedId = layers.find(l => l.id === selectedLayerId)?.id
    ?? layers[layers.length - 1]?.id ?? null;
  const selectedLayer = layers.find(l => l.id === effectiveSelectedId) ?? null;

  /* Refs to detect shape/size changes for re-auto-fit */
  const autoFitShapeRef = useRef(shape);
  const autoFitSizeRef  = useRef('');
  const layoutRef = useRef({ isMultiCircle, circlePx, canvasW, canvasH });
  layoutRef.current = { isMultiCircle, circlePx, canvasW, canvasH };

  /* Re-auto-fit all layers when shape or size changes */
  useEffect(() => {
    const sizeKey = (sizeObj.id || '') + '|' + sizeObj.w + '|' + sizeObj.h + '|' + (sizeObj.circleSize || '');
    if (autoFitShapeRef.current === shape && autoFitSizeRef.current === sizeKey) return;
    autoFitShapeRef.current = shape;
    autoFitSizeRef.current  = sizeKey;
    const { isMultiCircle: mc, circlePx: cp, canvasW: cw, canvasH: ch } = layoutRef.current;
    const effW = mc ? cp : cw;
    const effH = mc ? cp : ch;
    onLayersChangeRef.current(prev => prev.map(l => {
      const img = imgRefs.current[l.id];
      if (!img) return l;
      const sc = fitMode(effW / img.width, effH / img.height);
      return { ...l, x: (effW - img.width * sc) / 2, y: (effH - img.height * sc) / 2, scale: sc };
    }));
  }, [shape, sizeObj.id, sizeObj.w, sizeObj.h, sizeObj.circleSize]);

  /* Re-auto-fit when canvas container resizes */
  useEffect(() => {
    const { isMultiCircle: mc, circlePx: cp, canvasW: cw, canvasH: ch } = layoutRef.current;
    const effW = mc ? cp : cw;
    const effH = mc ? cp : ch;
    onLayersChangeRef.current(prev => prev.map(l => {
      const img = imgRefs.current[l.id];
      if (!img) return l;
      const sc = fitMode(effW / img.width, effH / img.height);
      return { ...l, x: (effW - img.width * sc) / 2, y: (effH - img.height * sc) / 2, scale: sc };
    }));
  }, [canvasW, canvasH]);

  /* Load images for layers; auto-fit new ones */
  useEffect(() => {
    layers.forEach(layer => {
      if (imgRefs.current[layer.id]) {
        if (layer._autoFit) {
          const img = imgRefs.current[layer.id];
          const effW = isMultiCircle ? circlePx : canvasW;
          const effH = isMultiCircle ? circlePx : canvasH;
          const coverSc = fitMode(effW / img.width, effH / img.height);
          onLayersChangeRef.current(prev => prev.map(l =>
            l.id === layer.id ? { ...l, x: (effW - img.width * coverSc) / 2, y: (effH - img.height * coverSc) / 2, scale: coverSc, _autoFit: false } : l
          ));
        }
        return;
      }
      const img = new Image();
      img.onload = async () => {
        imgRefs.current[layer.id] = img;
        try {
          const ratio = detectBorderWhiteRatio(img);
          onWhiteBgSuggestion?.(layer.id, ratio >= WHITE_DETECT_SUGGEST_RATIO);
        } catch (e) {
          /* Detection is a soft suggestion — never block the upload over it. */
        }
        if (removeWhiteBg) {
          beginBgProcessing();
          try {
            const result = await computeBgRemovalForId(layer.id, bgRemoveTolerance);
            if (result) {
              processedImgRefs.current[layer.id] = result.previewBmp;
              processedHiResImgRefs.current[layer.id] = result.hiResBmp;
            }
          } catch (e) {
            delete processedImgRefs.current[layer.id];
            delete processedHiResImgRefs.current[layer.id];
          } finally {
            endBgProcessing();
          }
        }
        const effW = isMultiCircle ? circlePx : canvasW;
        const effH = isMultiCircle ? circlePx : canvasH;
        const coverSc = fitMode(effW / img.width, effH / img.height);
        onLayersChangeRef.current(prev => prev.map(l =>
          l.id === layer.id && l._autoFit
            ? { ...l, x: (effW - img.width * coverSc) / 2, y: (effH - img.height * coverSc) / 2, scale: coverSc, _autoFit: false }
            : l
        ));
        setRedrawTick(t => t + 1);
      };
      img.src = layer.src;
    });
    /* Clean up refs for removed layers */
    const ids = new Set(layers.map(l => l.id));
    Object.keys(imgRefs.current).forEach(id => { if (!ids.has(id)) delete imgRefs.current[id]; });
    Object.keys(processedImgRefs.current).forEach(id => {
      if (!ids.has(id)) { processedImgRefs.current[id]?.close?.(); delete processedImgRefs.current[id]; }
    });
    Object.keys(processedHiResImgRefs.current).forEach(id => {
      if (!ids.has(id)) { processedHiResImgRefs.current[id]?.close?.(); delete processedHiResImgRefs.current[id]; }
    });
    Array.from(downscaleCacheRef.current.keys()).forEach(key => {
      if (!ids.has(key.split(':')[0])) downscaleCacheRef.current.delete(key);
    });
  }, [layers]);

  /* Raw tolerance drives the slider UI instantly; reprocessing only fires
     ~200ms after the user stops moving it (debounced "confirm" point) —
     not on every drag tick, which is what used to freeze the main thread. */
  const [debouncedTolerance, setDebouncedTolerance] = useState(bgRemoveTolerance);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTolerance(bgRemoveTolerance), 200);
    return () => clearTimeout(t);
  }, [bgRemoveTolerance]);

  /* Re-process all loaded images when the toggle flips, or (debounced) when
     tolerance settles. Computes BOTH a capped-width preview bitmap and a
     full-resolution hi-res bitmap per image, each a separate Web Worker
     round-trip, so neither one blocks the main thread. */
  useEffect(() => {
    let cancelled = false;
    const process = async () => {
      if (!removeWhiteBg) {
        Object.values(processedImgRefs.current).forEach(b => b?.close?.());
        Object.values(processedHiResImgRefs.current).forEach(b => b?.close?.());
        processedImgRefs.current = {};
        processedHiResImgRefs.current = {};
        setRedrawTick(t => t + 1);
        return;
      }
      const ids = Object.keys(imgRefs.current);
      if (ids.length === 0) return;
      beginBgProcessing();
      try {
        await Promise.all(ids.map(async (id) => {
          try {
            const result = await computeBgRemovalForId(id, debouncedTolerance);
            if (!result) return;
            if (cancelled) { result.previewBmp.close?.(); result.hiResBmp.close?.(); return; }
            processedImgRefs.current[id]?.close?.();
            processedImgRefs.current[id] = result.previewBmp;
            processedHiResImgRefs.current[id]?.close?.();
            processedHiResImgRefs.current[id] = result.hiResBmp;
          } catch (e) {
            if (!cancelled) { delete processedImgRefs.current[id]; delete processedHiResImgRefs.current[id]; }
          }
        }));
      } finally {
        if (!cancelled) endBgProcessing();
      }
      if (!cancelled) setRedrawTick(t => t + 1);
    };
    process();
    return () => { cancelled = true; };
  }, [removeWhiteBg, debouncedTolerance]);

  const getImg = (id) => (removeWhiteBg && processedImgRefs.current[id]) ? processedImgRefs.current[id] : imgRefs.current[id];
  /* Hi-res print pipeline only — always the full-resolution processed
     bitmap (or the untouched original), never the capped preview one. */
  const getHiResImg = (id) => (removeWhiteBg && processedHiResImgRefs.current[id]) ? processedHiResImgRefs.current[id] : imgRefs.current[id];
  /* layer.x/y/scale are computed at load/auto-fit time from the raw loaded
     <img> (see the layer-load effect below), never from a processed/resized
     bitmap — so drawLayers must size against these same original dimensions
     regardless of which bitmap getImg()/getHiResImg() end up sampling from. */
  const getNativeSize = (id) => {
    const img = imgRefs.current[id];
    return img ? { width: img.width, height: img.height } : null;
  };
  const fitMode = shape === 'custom' ? Math.min : Math.max;

  /* Draw canvases */
  useEffect(() => {
    const canvas = canvasRef.current;
    const hiResCanvas = hiResCanvasRef.current;
    if (!canvas || !hiResCanvas) return;

    /* ── Preview canvas ── (never the source of print output, see hi-res
       section below, which draws from the original imgRefs independently) */
    const previewRenderStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const renderScale = getPreviewRenderScale();
    canvas.width = Math.max(1, Math.round(canvasW * renderScale));
    canvas.height = Math.max(1, Math.round(canvasH * renderScale));
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const sel = effectiveSelectedId ? layers.find(l => l.id === effectiveSelectedId) : null;
    const selImg = sel ? imgRefs.current[sel.id] : null;

    const previewArgs = {
      shape, isBWSheet, isMultiCircle, layers, getImg, getNativeSize, bgColor, textOverlay,
      circlePx, mcCols, mcRows, mcOffsetX, mcOffsetY, mcStepPx,
      /* This *is* the layout layers are fit to, so the ratio is always 1 —
         computed the same way the modal computes its own, non-1 ratio. */
      layerScale: computeLayerScale(isMultiCircle, canvasW, circlePx, canvasW, circlePx),
      downscale: getDownscaledSource, renderScale, isMobile,
      showSelection: true, selectedLayer: sel, selectedLayerImg: selImg,
      showWatermark: true, customShapeKind,
    };
    /* Snapshot for the crop-interaction fade loop, which redraws the
       low-res canvas directly (bypassing this effect and the hi-res pass
       below) on every animation frame — see setCropInteracting. */
    lastPreviewDrawRef.current = { ctx, cw: canvasW, ch: canvasH, args: previewArgs };
    renderPreviewCore(ctx, canvasW, canvasH, { ...previewArgs, overlayOpacity: overlayOpacityRef.current });

    if (onCrop) onCrop(canvas.toDataURL());
    if (typeof performance !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.debug(`[preview] render ${(performance.now() - previewRenderStart).toFixed(1)}ms @ ${canvas.width}x${canvas.height}`);
    }

    /* ── Hi-res canvas ── */
    hiResCanvas.width = hiResW;
    hiResCanvas.height = hiResH;
    const hctx = hiResCanvas.getContext('2d');
    hctx.clearRect(0, 0, hiResW, hiResH);
    hctx.fillStyle = '#FFFFFF';
    hctx.fillRect(0, 0, hiResW, hiResH);

    if (isBWSheet) {
      const hrSquarePx = Math.round(BWSHEET_DESIGN_IN * DPI);
      const hrSqX = (hiResW - hrSquarePx) / 2;
      const hrSqY = (hiResH - hrSquarePx) / 2;
      hctx.save();
      hctx.beginPath();
      hctx.rect(hrSqX, hrSqY, hrSquarePx, hrSquarePx);
      hctx.clip();
      if (bgColor && bgColor !== 'transparent') {
        hctx.filter = 'grayscale(100%)';
        hctx.fillStyle = bgColor;
        hctx.fillRect(0, 0, hiResW, hiResH);
        hctx.filter = 'none';
      }
      layers.forEach(layer => {
        const img = getHiResImg(layer.id);
        if (!img) return;
        hctx.save();
        hctx.filter = 'grayscale(100%)';
        const hrX = layer.x * scaleFactor;
        const hrY = layer.y * scaleFactor;
        const hrW = img.width * layer.scale * scaleFactor;
        const hrH = img.height * layer.scale * scaleFactor;
        if (layer.rotation !== 0) {
          hctx.translate(hrX + hrW / 2, hrY + hrH / 2);
          hctx.rotate(layer.rotation * Math.PI / 180);
          hctx.translate(-(hrX + hrW / 2), -(hrY + hrH / 2));
        }
        hctx.drawImage(img, hrX, hrY, hrW, hrH);
        hctx.filter = 'none';
        hctx.restore();
      });
      if (textOverlay?.text) {
        hctx.filter = 'grayscale(100%)';
        drawText(hctx, textOverlay, hiResW, hiResH, scaleFactor);
        hctx.filter = 'none';
      }
      hctx.restore();
      hctx.beginPath();
      hctx.rect(hrSqX, hrSqY, hrSquarePx, hrSquarePx);
      hctx.strokeStyle = '#CCCCCC';
      hctx.setLineDash([20, 10]);
      hctx.lineWidth = 3;
      hctx.stroke();
      hctx.setLineDash([]);
    } else if (isMultiCircle) {
      /* Fill the WHOLE sheet with bgColor first — not just inside each tiled
         circle — so the gaps/margins between circles are colored too, not
         left as the base white fill above. (Bug: background fill used to
         only reach the inside of each circle.) */
      if (bgColor && bgColor !== 'transparent') {
        hctx.fillStyle = bgColor;
        hctx.fillRect(0, 0, hiResW, hiResH);
      }
      /* Same shared function as the inline preview and the print-preview
         modal, just fed the hi-res pixel dimensions — see the "Multi-circle
         layout" block above for why this can't be recomputed separately. */
      const {
        circlePx: hrCirclePx, mcGapPx: hrGapPx, mcStepPx: hrStepPx,
        mcOffsetX: hrOffsetX, mcOffsetY: hrOffsetY,
      } = computeMultiCircleLayout(hiResW, hiResH, isMultiCircle, sizeObj);
      const hrSf = hrCirclePx / circlePx; /* preview→hi-res scale for this circle */
      /* Build hi-res source crop canvas then tile it */
      const hsc = document.createElement('canvas');
      hsc.width = hrCirclePx; hsc.height = hrCirclePx;
      const hsctx = hsc.getContext('2d');
      hsctx.beginPath();
      hsctx.arc(hrCirclePx / 2, hrCirclePx / 2, hrCirclePx / 2, 0, Math.PI * 2);
      hsctx.fillStyle = bgColor;
      hsctx.fill();
      hsctx.save();
      hsctx.beginPath();
      hsctx.arc(hrCirclePx / 2, hrCirclePx / 2, hrCirclePx / 2, 0, Math.PI * 2);
      hsctx.clip();
      layers.forEach(layer => {
        const img = getHiResImg(layer.id);
        if (!img) return;
        hsctx.save();
        const hrX = layer.x * hrSf;
        const hrY = layer.y * hrSf;
        const hrW = img.width  * layer.scale * hrSf;
        const hrH = img.height * layer.scale * hrSf;
        if (layer.rotation !== 0) {
          hsctx.translate(hrX + hrW / 2, hrY + hrH / 2);
          hsctx.rotate(layer.rotation * Math.PI / 180);
          hsctx.translate(-(hrX + hrW / 2), -(hrY + hrH / 2));
        }
        hsctx.drawImage(img, hrX, hrY, hrW, hrH);
        hsctx.restore();
      });
      hsctx.restore();
      drawText(hsctx, textOverlay, hrCirclePx, hrCirclePx, hrSf);
      for (let row = 0; row < mcRows; row++) {
        for (let col = 0; col < mcCols; col++) {
          hctx.drawImage(hsc, hrOffsetX + col * hrStepPx, hrOffsetY + row * hrStepPx, hrCirclePx, hrCirclePx);
        }
      }
      hctx.strokeStyle = '#CCCCCC';
      hctx.lineWidth = 3;
      hctx.setLineDash([20, 10]);
      for (let row = 0; row < mcRows; row++) {
        for (let col = 0; col < mcCols; col++) {
          hctx.beginPath();
          hctx.arc(hrOffsetX + col * hrStepPx + hrCirclePx / 2, hrOffsetY + row * hrStepPx + hrCirclePx / 2, hrCirclePx / 2 - 2, 0, Math.PI * 2);
          hctx.stroke();
        }
      }
      hctx.setLineDash([]);
    } else {
      hctx.save();
      if (shape === 'circular') {
        hctx.beginPath();
        hctx.arc(hiResW / 2, hiResH / 2, hiResW / 2, 0, Math.PI * 2);
        hctx.clip();
      } else if (shape === 'heart') {
        drawHeartPath(hctx, 0, 0, hiResW, hiResH);
        hctx.clip();
      } else if (shape === 'custom' && isCustomShapeClipped(customShapeKind)) {
        appendCustomShapeClipPath(hctx, customShapeKind, 0, 0, hiResW, hiResH);
        hctx.clip();
      } else {
        hctx.beginPath();
        hctx.rect(0, 0, hiResW, hiResH);
        hctx.clip();
      }
      if (bgColor && bgColor !== 'transparent') {
        hctx.fillStyle = bgColor;
        hctx.fillRect(0, 0, hiResW, hiResH);
      }
      layers.forEach(layer => {
        const img = getHiResImg(layer.id);
        if (!img) return;
        hctx.save();
        const hrX = layer.x * scaleFactor;
        const hrY = layer.y * scaleFactor;
        const hrW = img.width * layer.scale * scaleFactor;
        const hrH = img.height * layer.scale * scaleFactor;
        if (layer.rotation !== 0) {
          hctx.translate(hrX + hrW / 2, hrY + hrH / 2);
          hctx.rotate(layer.rotation * Math.PI / 180);
          hctx.translate(-(hrX + hrW / 2), -(hrY + hrH / 2));
        }
        hctx.drawImage(img, hrX, hrY, hrW, hrH);
        hctx.restore();
      });
      drawText(hctx, textOverlay, hiResW, hiResH, scaleFactor);
      hctx.restore();
      hctx.strokeStyle = '#CCCCCC';
      hctx.lineWidth = 3;
      hctx.setLineDash([20, 10]);
      if (shape === 'circular') {
        hctx.beginPath();
        hctx.arc(hiResW / 2, hiResH / 2, hiResW / 2 - 2, 0, Math.PI * 2);
        hctx.stroke();
      } else if (shape === 'heart') {
        drawHeartPath(hctx, 2, 2, hiResW - 4, hiResH - 4);
        hctx.stroke();
      } else if (shape === 'custom' && customShapeKind) {
        /* Any explicitly-chosen Custom figure gets a printed cut-line
           guide, including 'rectangle' — a Custom design predating this
           picker (customShapeKind left undefined, see the accessor in the
           parent component) falls through here and keeps its old
           no-cut-line output untouched. */
        appendCustomShapeClipPath(hctx, customShapeKind, 2, 2, hiResW - 4, hiResH - 4);
        hctx.stroke();
      }
      hctx.setLineDash([]);
    }

    if (onHiResCrop) onHiResCrop(hiResCanvas.toDataURL('image/jpeg', 0.92));
  }, [layers, redrawTick, effectiveSelectedId, shape, hiResW, hiResH, scaleFactor, bgColor, textOverlay, isMultiCircle, isBWSheet, circlePx, mcCols, mcRows, mcOffsetX, mcOffsetY, mcStepPx, circleSize, canvasW, canvasH, customShapeKind]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* Pinch-to-zoom: 2 simultaneous pointers */
    if (activePointers.current.size >= 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180 / Math.PI;
      const selLayer = layers.find(l => l.id === effectiveSelectedId);
      pinchStateRef.current = {
        initialDist: dist,
        initialAngle: angle,
        initialScale: selLayer?.scale ?? 1,
        initialRotation: selLayer?.rotation ?? 0,
        layerId: effectiveSelectedId,
      };
      setDragging(false);
      setDragLayerId(null);
      setTextDragging(false);
      setCropInteracting(true);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    /* Text drag check */
    if (textOverlay?.text && onTextPositionChange) {
      const tx = (textOverlay.position?.x ?? 50) / 100 * canvasW;
      const ty = (textOverlay.position?.y ?? 85) / 100 * canvasH;
      const hitR = (Number(textOverlay.fontSize) || 24) * 1.5;
      if (Math.hypot(cx - tx, cy - ty) < hitR) {
        setTextDragging(true);
        textDragOffset.current = { dx: cx - tx, dy: cy - ty };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    /* Find topmost layer at click point */
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const img = imgRefs.current[layer.id];
      if (!img) continue;
      const imgW = img.width * layer.scale;
      const imgH = img.height * layer.scale;
      if (cx >= layer.x && cx <= layer.x + imgW && cy >= layer.y && cy <= layer.y + imgH) {
        setSelectedLayerId(layer.id);
        setDragging(true);
        setDragLayerId(layer.id);
        setDragStart({ clientX: e.clientX, clientY: e.clientY, layerX: layer.x, layerY: layer.y });
        e.currentTarget.setPointerCapture(e.pointerId);
        setCropInteracting(true);
        return;
      }
    }
    /* Fall back: drag the selected layer */
    if (effectiveSelectedId) {
      const layer = layers.find(l => l.id === effectiveSelectedId);
      if (layer) {
        setDragging(true);
        setDragLayerId(effectiveSelectedId);
        setDragStart({ clientX: e.clientX, clientY: e.clientY, layerX: layer.x, layerY: layer.y });
        e.currentTarget.setPointerCapture(e.pointerId);
        setCropInteracting(true);
      }
    }
  };

  const handlePointerMove = (e) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    /* Pinch-to-zoom */
    if (activePointers.current.size >= 2 && pinchStateRef.current) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180 / Math.PI;
      const { initialDist, initialAngle, initialScale, initialRotation, layerId } = pinchStateRef.current;
      const selImg = layerId ? imgRefs.current[layerId] : null;
      const mn = selImg ? Math.max(20 / selImg.width, 20 / selImg.height) : 0.05;
      const mx = selImg ? Math.max(canvasW * 4 / selImg.width, canvasH * 4 / selImg.height) : 8;
      const newScale = Math.min(mx, Math.max(mn, initialScale * (dist / initialDist)));
      const newRotation = applyRotationSnap(normalizeRotation(initialRotation + (angle - initialAngle)));
      if (layerId) {
        onLayersChangeRef.current(prev => prev.map(l =>
          l.id === layerId ? { ...l, ...scaleLayerAround(l, newScale), rotation: newRotation } : l
        ));
      }
      return;
    }

    if (textDragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvasW / rect.width;
      const scaleY = canvasH / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top)  * scaleY;
      const nx = Math.min(100, Math.max(0, ((cx - textDragOffset.current.dx) / canvasW) * 100));
      const ny = Math.min(100, Math.max(0, ((cy - textDragOffset.current.dy) / canvasH) * 100));
      onTextPositionChange({ x: nx, y: ny });
      return;
    }
    if (!dragging || !dragLayerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - dragStart.clientX) * (canvasW / rect.width);
    const dy = (e.clientY - dragStart.clientY) * (canvasH / rect.height);
    onLayersChangeRef.current(prev => prev.map(l =>
      l.id === dragLayerId ? { ...l, x: dragStart.layerX + dx, y: dragStart.layerY + dy } : l
    ));
  };

  const handlePointerUp = (e) => {
    if (e?.pointerId !== undefined) {
      activePointers.current.delete(e.pointerId);
    } else {
      activePointers.current.clear();
    }
    if (activePointers.current.size < 2) {
      pinchStateRef.current = null;
    }
    setDragging(false);
    setDragLayerId(null);
    setTextDragging(false);
    setCropInteracting(false);
  };

  const moveLayerUp = (id) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx >= layers.length - 1) return;
    const next = [...layers];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onLayersChange(next);
  };

  const moveLayerDown = (id) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx <= 0) return;
    const next = [...layers];
    [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
    onLayersChange(next);
  };

  const deleteLayer = (id) => {
    const remaining = layers.filter(l => l.id !== id);
    onLayersChange(remaining);
    if (selectedLayerId === id) setSelectedLayerId(remaining[remaining.length - 1]?.id ?? null);
  };

  const handleAddLayerFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (addLayerFileRef.current) addLayerFileRef.current.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newLayer = { id: String(Date.now()), src: ev.target.result, name: file.name, x: 0, y: 0, scale: 1, rotation: 0, _autoFit: true };
      onLayersChange([...layers, newLayer]);
      setSelectedLayerId(newLayer.id);
    };
    reader.readAsDataURL(file);
  };

  /* Per-layer slider range */
  const selImg = effectiveSelectedId ? imgRefs.current[effectiveSelectedId] : null;
  const minScale = selImg ? Math.max(20 / selImg.width, 20 / selImg.height) : 0.05;
  const maxScale = selImg ? Math.max(canvasW * 4 / selImg.width, canvasH * 4 / selImg.height) : 8;
  const currentScale = selectedLayer?.scale ?? 1;
  const currentRotation = selectedLayer?.rotation ?? 0;

  const updateSelectedLayer = (patch) => {
    if (!effectiveSelectedId) return;
    onLayersChange(layers.map(l => l.id === effectiveSelectedId ? { ...l, ...patch } : l));
  };

  /* Rotation handle (drag-to-rotate on the crop boundary) + magnetic snap.
     Rotation is stored in degrees exactly as before (-180..180) — only the
     input method changes, not the value or how it's applied downstream. */
  const [rotationDragging, setRotationDragging] = useState(false);
  const rotationDragRef = useRef(null);
  const normalizeRotation = (deg) => {
    let d = ((deg + 180) % 360 + 360) % 360 - 180;
    if (d === -180) d = 180;
    return d;
  };
  const angleDiff = (a, b) => {
    let d = (a - b) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };
  const applyRotationSnap = (deg) => {
    const norm = normalizeRotation(deg);
    for (const c of [-180, -90, 0, 90, 180]) {
      if (Math.abs(angleDiff(norm, c)) <= 6) return normalizeRotation(c);
    }
    const nearest15 = Math.round(norm / 15) * 15;
    if (Math.abs(angleDiff(norm, nearest15)) <= 4) return normalizeRotation(nearest15);
    return Math.round(norm);
  };
  const handleRotationPointerDown = (e) => {
    if (!effectiveSelectedId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    rotationDragRef.current = { rectLeft: rect.left, rectTop: rect.top, rectW: rect.width, rectH: rect.height };
    setRotationDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const handleRotationPointerMove = (e) => {
    const drag = rotationDragRef.current;
    if (!drag || !effectiveSelectedId) return;
    const scaleX = canvasW / drag.rectW, scaleY = canvasH / drag.rectH;
    const cx = (e.clientX - drag.rectLeft) * scaleX;
    const cy = (e.clientY - drag.rectTop) * scaleY;
    const dx = cx - canvasW / 2, dy = cy - canvasH / 2;
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    updateSelectedLayer({ rotation: applyRotationSnap(angleDeg + 90) });
  };
  const handleRotationPointerUp = () => {
    rotationDragRef.current = null;
    setRotationDragging(false);
  };
  const handleRotationKeyDown = (e) => {
    if (!effectiveSelectedId) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      updateSelectedLayer({ rotation: normalizeRotation(currentRotation - (e.shiftKey ? 15 : 1)) });
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      updateSelectedLayer({ rotation: normalizeRotation(currentRotation + (e.shiftKey ? 15 : 1)) });
    } else if (e.key === 'Home') {
      e.preventDefault();
      updateSelectedLayer({ rotation: 0 });
    }
  };
  /* Handle position on the crop boundary, in percentage offsets from the
     canvas center so it tracks correctly at any rendered (CSS-scaled) size. */
  const rotationHandleRadius = Math.min(canvasW, canvasH) / 2;
  const rotationHandleAngleRad = (currentRotation - 90) * Math.PI / 180;
  const rotationHandleLeftPct = 50 + (Math.cos(rotationHandleAngleRad) * rotationHandleRadius / canvasW) * 100;
  const rotationHandleTopPct = 50 + (Math.sin(rotationHandleAngleRad) * rotationHandleRadius / canvasH) * 100;

  /* Layers scale around the center of their own crop area: the circle for
     multi-circle sheets (layers are positioned within a single circlePx×
     circlePx crop that then gets tiled — see renderPreviewCore), the full
     canvas for every other shape. Using canvasW/canvasH here unconditionally
     was the bug: it scaled multi-circle layers around the sheet's center
     instead of their circle's center, so the image drifted off-center. */
  const scaleCx = isMultiCircle ? circlePx / 2 : canvasW / 2;
  const scaleCy = isMultiCircle ? circlePx / 2 : canvasH / 2;
  const scaleLayerAround = (layer, newScale) => {
    const ratio = newScale / (layer.scale || newScale);
    return { scale: newScale, x: scaleCx - ratio * (scaleCx - layer.x), y: scaleCy - ratio * (scaleCy - layer.y) };
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>

      {/* Compact header: label + add/delete buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "'Outfit', sans-serif" }}>Adjust Your Image</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => addLayerFileRef.current?.click()}
            style={{ fontSize: 11, padding: '5px 10px', background: C.brandLight, color: C.brand,
              border: '1px solid ' + C.brand, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
              fontFamily: "'Outfit', sans-serif" }}>
            + Add Image
          </button>
          {layers.length > 1 && effectiveSelectedId && (
            <button onClick={() => deleteLayer(effectiveSelectedId)} title="Delete selected layer"
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #EF4444',
                background: '#FEF2F2', color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>
              🗑
            </button>
          )}
          <input ref={addLayerFileRef} type="file" accept="image/*" onChange={handleAddLayerFile} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', background: '#F5F5F5', borderRadius: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
        <canvas ref={canvasRef}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
          style={{ cursor: textDragging ? 'move' : dragging ? 'grabbing' : 'grab', touchAction: 'none',
            width: canvasW, height: canvasH, maxWidth: '100%', display: 'block',
            filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.12))' }}
        />
        {sizeLabel && (
          <div style={{
            position: 'absolute', bottom: 10, right: 10,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)',
            padding: '4px 10px', borderRadius: 6, fontSize: 10.5,
            fontWeight: 600, color: '#6B7280', letterSpacing: 0.3,
            pointerEvents: 'none', fontFamily: "'Outfit', sans-serif",
          }}>
            {sizeLabel}
          </div>
        )}
        {/* Rotation handle — drag directly on the crop boundary to rotate */}
        <div
          role="slider"
          aria-label="Rotate image"
          aria-valuemin={-180}
          aria-valuemax={180}
          aria-valuenow={currentRotation}
          tabIndex={effectiveSelectedId ? 0 : -1}
          onPointerDown={handleRotationPointerDown}
          onPointerMove={handleRotationPointerMove}
          onPointerUp={handleRotationPointerUp}
          onKeyDown={handleRotationKeyDown}
          title="Drag to rotate"
          style={{
            position: 'absolute',
            left: `${rotationHandleLeftPct}%`,
            top: `${rotationHandleTopPct}%`,
            transform: 'translate(-50%, -50%)',
            width: 24, height: 24, borderRadius: '50%',
            background: C.white, border: '2px solid ' + C.brand,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            display: effectiveSelectedId ? 'flex' : 'none',
            alignItems: 'center', justifyContent: 'center',
            cursor: rotationDragging ? 'grabbing' : 'grab',
            touchAction: 'none', userSelect: 'none',
            fontSize: 11, color: C.brand, outline: 'none',
          }}>
          ⟳
        </div>
      </div>
      <canvas ref={hiResCanvasRef} style={{ display: 'none' }} />
      <div style={{
        fontSize: 10.5,
        color: C.muted,
        textAlign: 'center',
        marginTop: 8,
        fontStyle: 'italic',
        letterSpacing: 0.2,
      }}>
        Watermark shown only in preview — removed from final product
      </div>

      {/* Compact zoom + rotation panel */}
      <div style={{ padding: '10px 12px', background: C.white, borderRadius: 8, border: '1px solid ' + C.border }}>
        {/* Zoom row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <button
            onClick={() => {
              if (!effectiveSelectedId || !selectedLayer) return;
              const newScale = Math.max(minScale, currentScale - (maxScale - minScale) / 10);
              updateSelectedLayer(scaleLayerAround(selectedLayer, newScale));
            }}
            onPointerDown={() => setCropInteracting(true)}
            onPointerUp={() => setCropInteracting(false)}
            onPointerLeave={() => setCropInteracting(false)}
            disabled={!effectiveSelectedId}
            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.border, background: C.white,
              cursor: effectiveSelectedId ? 'pointer' : 'default', fontSize: 15, fontWeight: 700,
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: effectiveSelectedId ? 1 : 0.4, fontFamily: "'Outfit', sans-serif" }}>−</button>
          <input type="range" min={minScale} max={maxScale} step={0.001} value={currentScale}
            onChange={(e) => {
              const newScale = parseFloat(e.target.value);
              if (!effectiveSelectedId || !selectedLayer) return;
              updateSelectedLayer(scaleLayerAround(selectedLayer, newScale));
            }}
            onPointerDown={() => setCropInteracting(true)}
            onPointerUp={() => setCropInteracting(false)}
            disabled={!effectiveSelectedId}
            style={{ flex: 1, accentColor: C.brand, cursor: effectiveSelectedId ? 'pointer' : 'default' }} />
          <button
            onClick={() => {
              if (!effectiveSelectedId || !selectedLayer) return;
              const newScale = Math.min(maxScale, currentScale + (maxScale - minScale) / 10);
              updateSelectedLayer(scaleLayerAround(selectedLayer, newScale));
            }}
            onPointerDown={() => setCropInteracting(true)}
            onPointerUp={() => setCropInteracting(false)}
            onPointerLeave={() => setCropInteracting(false)}
            disabled={!effectiveSelectedId}
            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.border, background: C.white,
              cursor: effectiveSelectedId ? 'pointer' : 'default', fontSize: 15, fontWeight: 700,
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: effectiveSelectedId ? 1 : 0.4, fontFamily: "'Outfit', sans-serif" }}>+</button>
          <span style={{ fontSize: 10.5, color: C.muted, minWidth: 36, textAlign: 'right', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
            {Math.round(currentScale * 100)}%
          </span>
        </div>
        {/* Rotation row — drag the ⟳ handle on the crop edge, or use these */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => updateSelectedLayer({ rotation: normalizeRotation(currentRotation - 90) })}
            disabled={!effectiveSelectedId}
            title="Rotate -90°"
            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.border, background: C.white,
              cursor: effectiveSelectedId ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: effectiveSelectedId ? 1 : 0.4, fontFamily: "'Outfit', sans-serif" }}>−90°</button>
          <button
            onClick={() => updateSelectedLayer({ rotation: normalizeRotation(currentRotation + 90) })}
            disabled={!effectiveSelectedId}
            title="Rotate +90°"
            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.border, background: C.white,
              cursor: effectiveSelectedId ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: effectiveSelectedId ? 1 : 0.4, fontFamily: "'Outfit', sans-serif" }}>+90°</button>
          <input type="number" min={-180} max={180} step={1} value={currentRotation}
            onChange={(e) => {
              if (e.target.value === '') return;
              const v = Math.min(180, Math.max(-180, Math.round(Number(e.target.value))));
              if (!Number.isNaN(v)) updateSelectedLayer({ rotation: v });
            }}
            disabled={!effectiveSelectedId}
            aria-label="Rotation in degrees"
            style={{ width: 52, fontSize: 12, padding: '4px 6px', borderRadius: 6,
              border: '1px solid ' + C.border, color: C.text, textAlign: 'center',
              fontFamily: "'Outfit', sans-serif" }} />
          <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Outfit', sans-serif" }}>degrees</span>
          <div style={{ flex: 1 }} />
          {currentRotation !== 0 && (
            <button onClick={() => updateSelectedLayer({ rotation: 0 })}
              style={{ fontSize: 10, color: C.brand, background: 'none', border: '1px solid ' + C.brand,
                borderRadius: 5, padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: "'Outfit', sans-serif" }}>↺ Reset</button>
          )}
        </div>
      </div>

      {/* Help text */}
      <p style={{ fontSize: 10.5, color: C.muted, textAlign: 'center', margin: 0, fontStyle: 'italic' }}>
        {layers.length > 1 ? 'Click layer to select · Drag to reposition' : 'Drag to reposition'}
      </p>

      {/* Layers — collapsible */}
      {layers.length > 0 && (
        <details style={{ width: '100%' }}>
          <summary style={{ fontSize: 11, fontWeight: 600, color: C.muted, cursor: 'pointer',
            padding: '4px 0', fontFamily: "'Outfit', sans-serif", listStyle: 'none',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>▸</span> Layers ({layers.length})
          </summary>
          <div style={{ marginTop: 6 }}>
            {[...layers].reverse().map((layer, revIdx) => {
              const realIdx = layers.length - 1 - revIdx;
              const isSelected = layer.id === effectiveSelectedId;
              return (
                <div key={layer.id} onClick={() => setSelectedLayerId(layer.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer',
                    background: isSelected ? C.brandLight : C.white,
                    border: '1px solid ' + (isSelected ? C.brand : C.border),
                    borderRadius: 8, marginBottom: 4 }}>
                  <img src={layer.src} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isSelected ? C.brand : C.text, fontWeight: isSelected ? 600 : 400 }}>{layer.name}</span>
                  <button onClick={(ev) => { ev.stopPropagation(); moveLayerUp(layer.id); }} title="Move up"
                    disabled={realIdx >= layers.length - 1}
                    style={{ fontSize: 11, padding: '2px 5px', borderRadius: 5, border: '1px solid ' + C.border,
                      background: C.white, cursor: realIdx >= layers.length - 1 ? 'default' : 'pointer',
                      opacity: realIdx >= layers.length - 1 ? 0.3 : 1, fontFamily: "'Outfit', sans-serif" }}>↑</button>
                  <button onClick={(ev) => { ev.stopPropagation(); moveLayerDown(layer.id); }} title="Move down"
                    disabled={realIdx <= 0}
                    style={{ fontSize: 11, padding: '2px 5px', borderRadius: 5, border: '1px solid ' + C.border,
                      background: C.white, cursor: realIdx <= 0 ? 'default' : 'pointer',
                      opacity: realIdx <= 0 ? 0.3 : 1, fontFamily: "'Outfit', sans-serif" }}>↓</button>
                  <button onClick={(ev) => { ev.stopPropagation(); deleteLayer(layer.id); }} title="Delete layer"
                    style={{ fontSize: 11, padding: '2px 5px', borderRadius: 5, border: '1px solid #EF4444',
                      background: '#FEF2F2', color: '#EF4444', cursor: 'pointer' }}>🗑</button>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>Print output: {hiResW}×{hiResH}px ({DPI} DPI)</p>

      <button onClick={() => setShowPrintPreview(true)}
        style={{ width: '100%', padding: '11px 14px', background: C.white, color: C.brand,
          border: '1.5px solid ' + C.brand, borderRadius: 8, cursor: 'pointer', fontWeight: 600,
          fontSize: 13, fontFamily: "'Outfit', sans-serif" }}>
        🔍 See print preview
      </button>

      {/* ── Fullscreen print-preview modal ── */}
      {showPrintPreview && (
        <div role="dialog" aria-modal="true" aria-label="Print preview"
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#F4F5F2',
            display: 'flex', flexDirection: 'column' }}
          onClick={() => setShowPrintPreview(false)}>
          {/* Header */}
          <div onClick={e => e.stopPropagation()} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: isMobile ? '10px 14px' : '14px 24px', flexShrink: 0,
          }}>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14, color: C.text }}>
              Print Preview
              {designs.length > 1 && (
                <span style={{ fontWeight: 400, color: C.muted, marginLeft: 8 }}>
                  — Design {previewIndex + 1} of {designs.length}
                </span>
              )}
            </span>
            <button onClick={() => setShowPrintPreview(false)} aria-label="Close preview" style={{
              width: 34, height: 34, borderRadius: '50%', border: '1px solid ' + C.border,
              background: C.white, fontSize: 18, lineHeight: 1, cursor: 'pointer', color: C.text,
            }}>×</button>
          </div>

          {/* Sheet viewport — zoom/pan lives here */}
          <div ref={modalViewportRef} onClick={e => e.stopPropagation()}
            onPointerDown={onModalPointerDown} onPointerMove={onModalPointerMove}
            onPointerUp={onModalPointerUp} onPointerLeave={onModalPointerUp}
            style={{
              position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', touchAction: 'none', cursor: modalZoom > 1 ? 'grab' : 'default',
              boxSizing: 'border-box',
              padding: isMobile
                ? 'calc(8px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))'
                : 'calc(24px + env(safe-area-inset-top)) calc(64px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(64px + env(safe-area-inset-left))',
            }}>
            <canvas ref={modalCanvasRef} style={{
              transform: `translate(${modalPan.x}px, ${modalPan.y}px) scale(${modalZoom})`,
              transformOrigin: 'center center',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)', borderRadius: 4,
              maxWidth: '100%', maxHeight: '100%',
            }} />
            {previewSheetLabel && (
              <div style={{
                position: 'absolute', top: 14, left: 14,
                background: 'rgba(255,255,255,0.92)', padding: '6px 12px', borderRadius: 6,
                fontSize: 11.5, fontWeight: 700, color: C.text, letterSpacing: 0.4,
                pointerEvents: 'none', fontFamily: "'Outfit', sans-serif",
              }}>
                {previewSheetLabel}
              </div>
            )}
            {designs.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); goToPreviewDesign(-1); }}
                  aria-label="Previous design" style={{
                    position: 'absolute', left: isMobile ? 6 : 18, top: '50%', transform: 'translateY(-50%)',
                    width: 38, height: 38, borderRadius: '50%', border: '1px solid ' + C.border,
                    background: 'rgba(255,255,255,0.92)', fontSize: 16, cursor: 'pointer', color: C.text,
                  }}>‹</button>
                <button onClick={(e) => { e.stopPropagation(); goToPreviewDesign(1); }}
                  aria-label="Next design" style={{
                    position: 'absolute', right: isMobile ? 6 : 18, top: '50%', transform: 'translateY(-50%)',
                    width: 38, height: 38, borderRadius: '50%', border: '1px solid ' + C.border,
                    background: 'rgba(255,255,255,0.92)', fontSize: 16, cursor: 'pointer', color: C.text,
                  }}>›</button>
              </>
            )}
          </div>

          {/* Zoom toolbar */}
          <div onClick={e => e.stopPropagation()} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: isMobile ? '10px 14px 18px' : '14px 24px', flexShrink: 0,
          }}>
            <button onClick={() => setModalZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              aria-label="Zoom out" style={zoomBtnStyle}>−</button>
            <span style={{ fontSize: 12.5, color: C.muted, minWidth: 46, textAlign: 'center',
              fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>
              {Math.round(modalZoom * 100)}%
            </span>
            <button onClick={() => setModalZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
              aria-label="Zoom in" style={zoomBtnStyle}>+</button>
            <button onClick={() => { setModalZoom(1); setModalPan({ x: 0, y: 0 }); }}
              style={{ ...zoomBtnStyle, width: 'auto', padding: '0 16px' }}>Fit to screen</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ COLOR PICKER DROPDOWN ═══ */
const PALETTE = [
  { color: '#FFFFFF', label: 'White' },       { color: '#F5F5F5', label: 'Light Grey' },
  { color: '#9E9E9E', label: 'Grey' },         { color: '#222222', label: 'Black' },
  { color: '#FF4444', label: 'Red' },          { color: '#8B0000', label: 'Dark Red' },
  { color: '#FF8C00', label: 'Orange' },       { color: '#CC5500', label: 'Dark Orange' },
  { color: '#FFD700', label: 'Yellow' },       { color: '#FFC200', label: 'Gold' },
  { color: '#66CC44', label: 'Light Green' },  { color: '#1B6B4A', label: 'Dark Green' },
  { color: '#66AAFF', label: 'Light Blue' },   { color: '#0033AA', label: 'Dark Blue' },
  { color: '#00BFFF', label: 'Sky Blue' },     { color: '#008080', label: 'Teal' },
  { color: '#FF88CC', label: 'Pink' },         { color: '#FF1493', label: 'Hot Pink' },
  { color: '#8844CC', label: 'Purple' },       { color: '#C8A0E8', label: 'Lavender' },
  { color: '#F5DEB3', label: 'Beige' },        { color: '#8B4513', label: 'Brown' },
  { color: '#D2691E', label: 'Light Brown' },  { color: '#FFFDD0', label: 'Cream' },
  { color: '#FF6B6B', label: 'Coral' },        { color: '#FA8072', label: 'Salmon' },
  { color: '#001F3F', label: 'Navy' },         { color: '#808000', label: 'Olive' },
  { color: '#800020', label: 'Burgundy' },     { color: '#40E0D0', label: 'Turquoise' },
];
const BW_PALETTE = [
  { color: '#FFFFFF', label: 'White' },
  { color: '#D9D9D9', label: 'Light Gray' },
  { color: '#888888', label: 'Gray' },
  { color: '#000000', label: 'Black' },
];

function ColorPickerDropdown({ value, onChange, colors, label, allowCustom }) {
  const [isOpen, setIsOpen] = useState(false);
  const customInputRef = useRef(null);
  const lightColors = new Set(['#FFFFFF', '#F5F5F5', '#FFFDD0', '#FFC200', '#FFD700']);
  const current = colors.find(c => c.color.toLowerCase() === (value || '').toLowerCase());
  const displayName = current?.label || value;

  return (
    <div>
      <button
        onClick={() => setIsOpen(v => !v)}
        style={{ height: 36, padding: '6px 10px', border: '1px solid ' + C.border,
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', cursor: 'pointer', background: C.white,
          fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box' }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, background: value, flexShrink: 0,
          border: '1px solid #ddd',
          boxShadow: lightColors.has(value) ? 'inset 0 0 0 1px #ccc' : 'none',
          display: 'inline-block' }} />
        <span style={{ fontSize: 13, color: C.text, textAlign: 'left' }}>{label}: <strong>{displayName}</strong></span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ marginTop: 6, padding: 10, background: C.white,
          borderRadius: 8, border: '1px solid ' + C.border }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {colors.map(({ color, label: lbl }) => (
              <button key={color} title={lbl} onClick={() => onChange(color)}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                style={{
                  width: 22, height: 22, borderRadius: 4, background: color, cursor: 'pointer',
                  border: value === color ? '2px solid ' + C.brand : '1px solid rgba(0,0,0,0.08)',
                  boxShadow: value === color
                    ? 'inset 0 0 0 2px white'
                    : (lightColors.has(color) ? 'inset 0 0 0 1px #ccc' : 'none'),
                  boxSizing: 'border-box', padding: 0,
                  transition: 'transform 0.15s ease',
                }} />
            ))}
            {allowCustom && (
              <button title="Custom color" onClick={() => customInputRef.current?.click()}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                style={{
                  width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
                  border: '1px dashed ' + C.border, background: C.white,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, color: C.muted, fontWeight: 700, padding: 0,
                  transition: 'transform 0.15s ease',
                }}>+</button>
            )}
          </div>
          {allowCustom && (
            <input ref={customInputRef} type="color" value={value} onChange={(e) => onChange(e.target.value)}
              style={{ display: 'none' }} />
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════ */
/* ═══ MAIN APP ═══ */
/* ═══════════════════════════════════ */
export default function EdiblePrintApp() {
  const [step, setStep] = useState(0);
  /* 'editor' = the existing upload-and-customize flow (default, most visible).
     'upload' = "I already have my design" — customer supplies a print-ready
     file for one of the flat-sheet formats and we print it as-is. Drives
     which UI renders at steps 1-2; step 0 (home) and step 3 (Details/
     checkout) are shared and shape-agnostic already. */
  const [orderMode, setOrderMode] = useState('editor');
  const [designs, setDesigns] = useState([]);
  const [activeDesignId, setActiveDesignId] = useState(null);
  const [shipping, setShipping] = useState('shipping');
  const [pricingTab, setPricingTab] = useState('circular');
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [pendingShape, setPendingShape] = useState(null);
  const [pendingSizeId, setPendingSizeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acceptedDesign, setAcceptedDesign] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', unit: '', city: '', province: 'Ontario', postal: ''
  });
  const fileRef = useRef(null);

  /* Active design aliases */
  const activeDesign = designs.find(d => d.id === activeDesignId) ?? designs[0] ?? null;
  const layers      = activeDesign?.layers      ?? [];
  const shape       = activeDesign?.shape       ?? 'circular';
  const sizeId      = activeDesign?.sizeId      ?? 'c8';
  const customW     = activeDesign?.customW     ?? '';
  const customH     = activeDesign?.customH     ?? '';
  /* No fallback default — stays undefined for any Custom design created
     before this field existed, so appendCustomShapeClipPath's callers can
     tell "legacy, render as plain rectangle with no cut-line" apart from
     "explicitly chose rectangle" (which does get a cut-line). New designs
     get 'rectangle' explicitly at creation time instead (see
     handleAddDesign/handlePricingCardClick below). */
  const customShapeKind = activeDesign?.customShapeKind;
  const qty         = activeDesign?.qty         ?? 1;
  const notes       = activeDesign?.notes       ?? '';
  const bgColor     = activeDesign?.bgColor     ?? '#FFFFFF';
  const textOverlay = activeDesign?.textOverlay ?? { text: '', fontSize: 24, color: '#FFFFFF', position: { x: 50, y: 85 }, fontFamily: 'Arial', fontStyle: 'normal' };
  const cropPreview = activeDesign?.cropPreview ?? null;
  const hiResCrop   = activeDesign?.hiResCrop   ?? null;

  const updateActive = (patch) => {
    if (!activeDesignId) return;
    setDesigns(ds => ds.map(d => d.id === activeDesignId ? { ...d, ...patch } : d));
  };
  /* Explicit-id variant used by the upload-flow's async validation effect
     below, so a slow validation run can never accidentally patch whichever
     design happens to be active by the time it resolves. */
  const patchDesign = (id, patch) => setDesigns(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d));
  /* Shared by the design tabs (Change 1) and the Order Summary (Change 2).
     Tabs never expose this when it's the last design (control hidden, not
     disabled — enforced at the call site); the Order Summary intentionally
     allows removing the last one, landing on the empty-cart state.
     TODO: window.confirm() shows the site's raw domain in its dialog on
     iOS Safari, which reads unprofessional for a storefront — swap for a
     lightweight custom confirm dialog later. Left as native for now since
     it's an unspoofable browser-level prompt, which matters more for a
     destructive action than how it looks. */
  const handleDeleteDesign = (id) => {
    const idx = designs.findIndex(d => d.id === id);
    if (idx === -1) return;
    if (!window.confirm(`Remove Design ${idx + 1}? This can't be undone.`)) return;
    const remaining = designs.filter(d => d.id !== id);
    setDesigns(remaining);
    if (activeDesignId === id) {
      const next = remaining[idx] || remaining[remaining.length - 1] || null;
      setActiveDesignId(next?.id ?? null);
    }
    // The design-confirmation checkbox on step 3 attests to whatever set of
    // designs was reviewed — removing one changes that set, so it must be
    // re-confirmed before the order can be placed again.
    setAcceptedDesign(false);
  };
  const setLayers      = (v) => updateActive({ layers: typeof v === 'function' ? v(layers) : v });
  const setShape       = (v) => updateActive({ shape: v });
  const setSizeId      = (v) => updateActive({ sizeId: v });
  const setCustomW     = (v) => updateActive({ customW: v });
  const setCustomH     = (v) => updateActive({ customH: v });
  const setCustomShapeKind = (v) => updateActive({ customShapeKind: v });
  const setQty         = (v) => updateActive({ qty: v });
  const setNotes       = (v) => updateActive({ notes: v });
  const setBgColor     = (v) => updateActive({ bgColor: v });
  const setTextOverlay = (v) => updateActive({ textOverlay: typeof v === 'function' ? v(textOverlay) : v });
  const setCropPreview = (v) => updateActive({ cropPreview: v });
  const setHiResCrop   = (v) => updateActive({ hiResCrop: v });

  const sizes = SIZES[shape] || [];
  const selectedSize = sizes.find((sz) => sz.id === sizeId) || sizes[0];
  const effectiveSize = shape === 'custom'
    ? { id: 'custom', label: 'Custom Size', w: parseFloat(customW) || 2, h: parseFloat(customH) || 2, price: selectedSize?.price || 0 }
    : selectedSize;
  const unitPrice = shape === 'custom'
    ? (parseFloat(customW || 0) * parseFloat(customH || 0) <= 36 ? 14.99 : 19.99)
    : selectedSize?.price || 0;
  const subtotal = unitPrice * qty;

  const sizeLabel = shape === 'fullsheet' ? 'FULL SHEET · A4'
    : shape === 'bwsheet' ? `B&W ${BWSHEET_DESIGN_IN}" × ${BWSHEET_DESIGN_IN}"`
    : shape === 'waferletter' ? 'WAFER PAPER · LETTER'
    : shape === 'custom' ? `${customShapeKind && customShapeKind !== 'rectangle' ? customShapeLabel(customShapeKind).toUpperCase() + ' ' : ''}${customW || '?'}" × ${customH || '?'}"`
    : shape === 'multicircle' ? (selectedSize?.sublabel || '').toUpperCase()
    : shape === 'circular' ? `${(selectedSize?.label || '').split(' ')[0]} ROUND`
    : shape === 'heart' ? `${(selectedSize?.label || '').split(' ')[0]} HEART`
    : selectedSize?.label || '';

  const designsSubtotal = designs.reduce((sum, d) => {
    const dSizes = SIZES[d.shape] || [];
    const dSel = dSizes.find(sz => sz.id === d.sizeId) || dSizes[0];
    const dPrice = d.shape === 'custom'
      ? (parseFloat(d.customW || 0) * parseFloat(d.customH || 0) <= 36 ? 14.99 : 19.99)
      : dSel?.price || 0;
    return sum + dPrice * d.qty;
  }, 0);

  const shippingCost = getShippingCost(shipping);
  const total = designsSubtotal + shippingCost;

  useEffect(() => {
    if (!activeDesignId) return;
    if (shape === 'custom') { setSizeId('custom'); }
    else if (!SIZES[shape]?.find((sz) => sz.id === sizeId)) { setSizeId(SIZES[shape]?.[0]?.id || ''); }
  }, [shape, activeDesignId]);

  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', prevent);
    return () => {
      document.removeEventListener('dragover', prevent);
      document.removeEventListener('drop', prevent);
    };
  }, []);

  const addDesignFromFile = (file) => {
    if (!file) return;
    if (designs.length >= 5) { alert('Maximum 5 designs per order.'); return; }
    trackGA('add_to_design', { method: 'file_upload', design_count: designs.length + 1 });
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newId = String(Date.now());
      const initialLayer = { id: String(Date.now() + 1), src: ev.target.result, name: file.name, x: 0, y: 0, scale: 1, rotation: 0, _autoFit: true };
      const newShape = pendingShape || 'circular';
      const newSizeId = pendingSizeId || (SIZES[newShape]?.[SIZES[newShape].length - 1]?.id || 'c8');
      const newSizeObj = (SIZES[newShape] || []).find(sz => sz.id === newSizeId) || (SIZES[newShape] || [])[0];
      const newPrice = newSizeObj?.price || 0;
      trackGA('add_to_cart', {
        currency: 'CAD',
        value: newPrice,
        items: [{ item_id: `${newShape}-${newSizeId}`, item_name: `EdiblePrint ${newShape}`, price: newPrice, quantity: 1 }],
      });
      setDesigns(ds => [...ds, {
        id: newId,
        layers: [initialLayer],
        shape: newShape,
        sizeId: newSizeId,
        customW: '',
        customH: '',
        customShapeKind: 'rectangle',
        qty: 1,
        notes: '',
        bgColor: '#FFFFFF',
        textOverlay: { text: '', fontSize: 24, color: '#FFFFFF', position: { x: 50, y: 85 }, fontFamily: 'Arial', fontStyle: 'normal' },
        cropPreview: null,
        hiResCrop: null,
      }]);
      setPendingShape(null);
      setPendingSizeId(null);
      setActiveDesignId(newId);
      setStep(2);
    };
    reader.readAsDataURL(file);
  };

  const addTextOnlyDesign = () => {
    if (designs.length >= 5) { alert('Maximum 5 designs per order.'); return; }
    const newId = String(Date.now());
    const newShape = pendingShape || 'circular';
    const newSizeId = pendingSizeId || (SIZES[newShape]?.[SIZES[newShape].length - 1]?.id || 'c8');
    setDesigns(ds => [...ds, {
      id: newId,
      layers: [],
      shape: newShape,
      sizeId: newSizeId,
      customW: '',
      customH: '',
      customShapeKind: 'rectangle',
      qty: 1,
      notes: '',
      bgColor: '#FFFFFF',
      textOverlay: { text: '', fontSize: 24, color: '#111111', position: { x: 50, y: 50 }, fontFamily: 'Arial', fontStyle: 'normal' },
      cropPreview: null,
      hiResCrop: null,
    }]);
    setPendingShape(null);
    setPendingSizeId(null);
    setActiveDesignId(newId);
    setStep(2);
  };

  const handlePricingCardClick = (shape, sizeId) => {
    trackGA('select_size', { shape, size_id: sizeId });
    setPendingShape(shape);
    setPendingSizeId(sizeId);
    setOrderMode('editor');
    setStep(1);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    addDesignFromFile(file);
  };

  const [isDragOver, setIsDragOver] = useState(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    addDesignFromFile(file);
  };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => { setIsDragOver(false); };

  /* ── "I already have my design" — customer-supplied print-ready file ──
     Reuses the existing designs[] cart (see `sourceType: 'upload'` design
     objects) so checkout/shipping/payment stay entirely shared with the
     editor flow. The file itself is kept as a plain File object and never
     touched here — no canvas re-encoding, no recompression — it's only
     uploaded (byte-exact, via a signed raw upload) at "Place order" time. */
  const uploadFileRef = useRef(null);
  const [pendingUploadShape, setPendingUploadShape] = useState('fullsheet');
  const [uploadFileError, setUploadFileError] = useState('');
  const activeIsUpload = activeDesign?.sourceType === 'upload';

  /* Change-2 validation state — keyed by design id so it survives switching
     between designs and never gets confused about which file it belongs to.
     Page thumbnails are kept OUT of the designs[] array on purpose: they're
     only for the in-browser page picker and shouldn't ride along with the
     design object into checkout metadata. */
  const [uploadValidationStatus, setUploadValidationStatus] = useState({});
  const [uploadPageThumbs, setUploadPageThumbs] = useState({});
  const activeUploadValidation = activeDesign?.validation ?? null;
  const activeUploadNeedsConfirm = !!activeUploadValidation && (
    !activeUploadValidation.sizeExact || (activeUploadValidation.dpiKnown && !activeUploadValidation.dpiOk)
  );

  /* Rendered "as it will print" preview — same render feeds both the inline
     thumbnail and the full-screen modal. Cached per design id so switching
     back to an already-checked design doesn't re-render. Never uploaded or
     stored anywhere; purely for the customer's own review. */
  const [uploadPreviewCache, setUploadPreviewCache] = useState({});
  const [uploadPreviewStatus, setUploadPreviewStatus] = useState({});
  const [showUploadPreviewModal, setShowUploadPreviewModal] = useState(false);
  const activeUploadPreview = activeDesign ? uploadPreviewCache[activeDesign.id] : null;

  useEffect(() => {
    if (step !== 2 || !activeDesign || activeDesign.sourceType !== 'upload' || !activeDesign.file) return;
    const designId = activeDesign.id;
    const selectedPage = activeDesign.selectedPage || 1;
    let cancelled = false;
    /* What's about to be printed just changed (page or sheet type) — any
       earlier "print as-is" approval no longer refers to what the customer
       is now looking at, so it must be re-confirmed. */
    patchDesign(designId, { approvedPrintAsIs: false, approvedAt: null });
    setUploadPreviewCache(s => { const n = { ...s }; delete n[designId]; return n; });
    (async () => {
      setUploadValidationStatus(s => ({ ...s, [designId]: 'loading' }));
      try {
        if (activeDesign.fileMimeType === 'application/pdf' && !uploadPageThumbs[designId]) {
          const numPages = await getPdfPageCount(activeDesign.file);
          if (cancelled) return;
          if (numPages > 1) {
            const thumbs = [];
            for (let p = 1; p <= numPages; p++) {
              const { canvas } = await renderPdfPageToCanvas(activeDesign.file, p, 140);
              thumbs.push(canvas.toDataURL('image/png'));
            }
            if (cancelled) return;
            setUploadPageThumbs(s => ({ ...s, [designId]: thumbs }));
          }
        }
        const result = await validateUploadDesignFile({ ...activeDesign, selectedPage });
        if (cancelled) return;
        patchDesign(designId, { validation: result, pageCount: result.numPages, confirmMismatch: false });
        setUploadValidationStatus(s => ({ ...s, [designId]: 'done' }));

        setUploadPreviewStatus(s => ({ ...s, [designId]: 'loading' }));
        const previewDataUrl = await renderUploadPreviewCanvas({ ...activeDesign, selectedPage });
        if (cancelled) return;
        setUploadPreviewCache(s => ({ ...s, [designId]: previewDataUrl }));
        setUploadPreviewStatus(s => ({ ...s, [designId]: 'done' }));
      } catch (err) {
        if (cancelled) return;
        console.error('[upload-flow] validation/preview failed:', err);
        setUploadValidationStatus(s => ({ ...s, [designId]: 'error' }));
        setUploadPreviewStatus(s => ({ ...s, [designId]: 'error' }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeDesign?.id, activeDesign?.selectedPage, activeDesign?.shape]);

  function validateCustomerFilePick(file) {
    const name = (file.name || '').toLowerCase();
    const isWordDoc = name.endsWith('.doc') || name.endsWith('.docx')
      || file.type === 'application/msword'
      || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (isWordDoc) {
      return {
        ok: false,
        message: "Word documents can't be printed directly. Please export/print this file to PDF from Word (where your fonts are installed), then upload the PDF.",
      };
    }
    const okType = file.type === 'application/pdf' || file.type === 'image/png' || file.type === 'image/jpeg'
      || name.endsWith('.pdf') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
    if (!okType) {
      return { ok: false, message: 'Please upload a PDF, PNG, or JPG file.' };
    }
    if (file.size > UPLOAD_MAX_FILE_MB * 1024 * 1024) {
      return { ok: false, message: `File is too large (max ${UPLOAD_MAX_FILE_MB}MB). Please compress it and try again.` };
    }
    return { ok: true };
  }

  const addDesignFromCustomerFile = (file) => {
    if (!file) return;
    if (designs.length >= 5) { alert('Maximum 5 designs per order.'); return; }
    const check = validateCustomerFilePick(file);
    if (!check.ok) { setUploadFileError(check.message); return; }
    setUploadFileError('');
    trackGA('add_to_design', { method: 'file_upload_print_ready', design_count: designs.length + 1 });
    const newId = String(Date.now());
    const newShape = pendingUploadShape;
    const newSizeObj = (SIZES[newShape] || [])[0];
    trackGA('add_to_cart', {
      currency: 'CAD',
      value: newSizeObj?.price || 0,
      items: [{ item_id: `${newShape}-upload`, item_name: `EdiblePrint ${newShape} (customer file)`, price: newSizeObj?.price || 0, quantity: 1 }],
    });
    setDesigns(ds => [...ds, {
      id: newId,
      sourceType: 'upload',
      shape: newShape,
      sizeId: newSizeObj?.id || '',
      qty: 1,
      notes: '',
      file,
      fileName: file.name,
      fileMimeType: file.type,
      fileSizeBytes: file.size,
      pageCount: null,          // Stage 2: PDF page count
      selectedPage: 1,          // Stage 2: which page to print, if multi-page
      validation: null,         // Stage 2: size/DPI/margin results
      approvedPrintAsIs: false, // Stage 3: explicit "print as-is" confirmation
      approvedAt: null,
      previewThumb: null,       // Stage 3: rendered preview thumbnail
      cropPreview: null,
    }]);
    setActiveDesignId(newId);
    setStep(2);
  };

  const handleUploadFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (uploadFileRef.current) uploadFileRef.current.value = '';
    addDesignFromCustomerFile(file);
  };

  /* Signed direct browser->Cloudinary upload (raw resource, byte-exact) —
     see app/api/upload-print-file/route.js for why this doesn't route
     through our own server first. Runs once per design at "Place order"
     time, same moment editor designs upload their crop today. */
  async function uploadCustomerFileDirect(design) {
    const sigRes = await fetch('/api/upload-print-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: design.fileName,
        fileSizeBytes: design.fileSizeBytes,
        mimeType: design.fileMimeType,
      }),
    });
    if (!sigRes.ok) throw new Error('UPLOAD_SIGN_FAILED');
    const { cloudName, apiKey, timestamp, signature, publicId } = await sigRes.json();

    const form = new FormData();
    form.append('file', design.file);
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('api_key', apiKey);
    form.append('signature', signature);
    form.append('invalidate', '1');
    form.append('overwrite', '1');

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
      method: 'POST',
      body: form,
    });
    if (!uploadRes.ok) throw new Error('UPLOAD_FAILED');
    const result = await uploadRes.json();
    if (!result.secure_url) throw new Error('UPLOAD_FAILED');
    return result.secure_url;
  }

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 320);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (step === 2) {
      trackMeta('ViewContent', { content_category: 'customize', content_type: 'product' });
      if (layers.length > 0) {
        trackGA('view_item', {
          currency: 'CAD',
          value: unitPrice,
          items: [{ item_id: `${shape}-${sizeId}`, item_name: `EdiblePrint ${shape} ${selectedSize?.label || ''}`, price: unitPrice, quantity: 1 }],
        });
      }
    }
  }, [step]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);
  const [bgRemoveTolerance, setBgRemoveTolerance] = useState(15);
  const [bgProcessing, setBgProcessing] = useState(false);
  /* Per-layer "does this image look like it has a white background?" flags
     (see detectBorderWhiteRatio), keyed by layer id. Reset whenever the
     active design changes so a suggestion from a previously-edited design
     can't linger on a different one. */
  const [whiteBgLayerFlags, setWhiteBgLayerFlags] = useState({});
  const whiteBgSuggestion = Object.values(whiteBgLayerFlags).some(Boolean);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => { setWhiteBgLayerFlags({}); }, [activeDesignId]);
  /* Also prune flags for layers removed within the same design (e.g. the
     flagged image gets deleted), so the suggestion doesn't linger stale. */
  useEffect(() => {
    const ids = new Set(layers.map(l => l.id));
    setWhiteBgLayerFlags(prev => {
      let changed = false;
      const next = {};
      Object.keys(prev).forEach(id => {
        if (ids.has(id)) next[id] = prev[id];
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [layers]);

  /* ── Accordion state for Step 2 ── */
  const [accordionText, setAccordionText] = useState(false);

  const [cutoffMsg, setCutoffMsg] = useState(null);
  useEffect(() => {
    function computeCutoff() {
      const torontoStr = new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' });
      const t = new Date(torontoStr);
      const dow = t.getDay();
      const isWeekend = dow === 0 || dow === 6;
      if (isWeekend) {
        setCutoffMsg({ green: false, text: 'Order now — production starts Monday' });
        return;
      }
      const minsLeft = 14 * 60 - (t.getHours() * 60 + t.getMinutes());
      if (minsLeft > 0) {
        const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
        setCutoffMsg({ green: true, text: `Order in the next ${h}h ${m}min for same-day production!` });
      } else {
        setCutoffMsg({ green: false, text: 'Order now — production starts next business day' });
      }
    }
    computeCutoff();
    const iv = setInterval(computeCutoff, 60000);
    return () => clearInterval(iv);
  }, []);

  const updateForm = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleAddressChange = (raw) => {
    const unitPattern = /\s+(#\s*\w+|(?:unit|apt|suite|ste)\s*\.?\s*\w+)\s*$/i;
    const match = raw.match(unitPattern);
    if (match) {
      setForm((prev) => ({ ...prev, address: raw.replace(unitPattern, '').trim(), unit: match[1].trim() }));
    } else {
      updateForm('address', raw);
    }
  };

  const handleDownloadPdfAsAdmin = async () => {
    const hiResDataUrl = hiResCrop;
    if (!hiResDataUrl) { alert('No image to download. Please upload and adjust your image first.'); return; }
    setDownloadingPdf(true);
    try {
      const sizeW = selectedSize?.w || parseFloat(customW) || 8;
      const resp = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: hiResDataUrl, shape, sizeInches: sizeW, customW, customH, customShapeKind, paymentVerified: false }),
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edibleprint-${shape}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Error generating PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadPdfAsCustomer = async () => {
    const hiResDataUrl = hiResCrop;
    if (!hiResDataUrl || !customerEmail.includes('@')) return;
    setShowEmailModal(false);
    setDownloadingPdf(true);
    try {
      const sizeW = selectedSize?.w || parseFloat(customW) || 8;
      const resp = await fetch('/api/create-download-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: hiResDataUrl, shape, sizeInches: sizeW, customW, customH, customShapeKind, email: customerEmail }),
      });
      const { url } = await resp.json();
      window.location.href = url;
    } catch (e) {
      console.error(e);
      alert('Error creating checkout. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (designs.length === 0) { alert('Please add at least one design.'); return; }
    if (!form.name || !form.email || (shipping !== 'pickup' && (!form.address || !form.city || !form.postal))) {
      alert('Please fill in all required fields.');
      return;
    }
    trackGA('begin_checkout', { currency: 'CAD', value: designsSubtotal });
    trackMeta('InitiateCheckout', { currency: 'CAD', value: designsSubtotal });
    setLoading(true);
    try {
      const uploadedDesigns = await Promise.all(designs.map(async (d) => {
        if (d.sourceType === 'upload') {
          let imageUrl = '';
          try {
            imageUrl = await uploadCustomerFileDirect(d);
          } catch {
            throw new Error('IMAGE_UPLOAD_FAILED');
          }
          if (!imageUrl.startsWith('https://res.cloudinary.com')) throw new Error('IMAGE_UPLOAD_FAILED');
          return { ...d, uploadedImageUrl: imageUrl };
        }
        let imageUrl = '';
        const imageToUpload = d.hiResCrop || d.cropPreview || d.layers?.[0]?.src;
        if (imageToUpload) {
          const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dslkizfuj';
          const CLOUDINARY_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'edibleprint_orders';
          let blob = await (await fetch(imageToUpload)).blob();
          if (blob.size > 10 * 1024 * 1024) {
            blob = await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                c.toBlob(resolve, 'image/jpeg', 0.85);
              };
              img.src = imageToUpload;
            });
            console.log('[upload-debug] blob too large, recompressed to JPEG 0.85, new size:', (blob.size/1024/1024).toFixed(2), 'MB');
          }
          const cloudFormData = new FormData();
          cloudFormData.append('file', blob, 'upload.png');
          cloudFormData.append('upload_preset', CLOUDINARY_PRESET);
          cloudFormData.append('folder', 'edibleprint-orders');
          cloudFormData.append('public_id', 'order_' + Date.now() + '_' + (d.layers?.[0]?.name || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80));
          const imgSrc = d.hiResCrop ? 'hiResCrop' : d.cropPreview ? 'cropPreview' : 'layers[0].src';
          console.log('[upload-debug] shape:', d.shape, '| source:', imgSrc, '| dataURL length:', imageToUpload.length);
          console.log('[upload-debug] blob instanceof Blob:', blob instanceof Blob, '| size:', blob.size, 'bytes (', (blob.size/1024/1024).toFixed(2), 'MB) | type:', blob.type);
          console.log('[upload-debug] CLOUDINARY_PRESET:', CLOUDINARY_PRESET);
          console.log('[upload-debug] FormData keys:', [...cloudFormData.keys()]);
          let uploadRes;
          try {
            uploadRes = await fetch(
              `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
              { method: 'POST', body: cloudFormData }
            );
          } catch {
            throw new Error('IMAGE_UPLOAD_FAILED');
          }
          if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({}));
            console.error('[upload-debug] Cloudinary error response:', JSON.stringify(errBody));
            throw new Error('IMAGE_UPLOAD_FAILED');
          }
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.secure_url || '';
          if (!imageUrl.startsWith('https://res.cloudinary.com')) throw new Error('IMAGE_UPLOAD_FAILED');
        }
        return { ...d, uploadedImageUrl: imageUrl };
      }));
      for (const d of uploadedDesigns) {
        if ((d.hiResCrop || d.cropPreview || d.layers?.[0]?.src) &&
            !d.uploadedImageUrl?.startsWith('https://res.cloudinary.com')) {
          throw new Error('IMAGE_UPLOAD_FAILED');
        }
      }
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone,
          shippingAddress: form.address + (form.unit ? ', ' + form.unit : ''),
          shippingCity: form.city,
          shippingProvince: form.province,
          shippingPostal: form.postal,
          shippingMethod: shipping,
          shippingCost: shippingCost,
          designConfirmed: acceptedDesign,
          designConfirmedAt: new Date().toISOString(),
          designs: uploadedDesigns.map(d => {
            const dSizes = SIZES[d.shape] || [];
            const dSel = dSizes.find(sz => sz.id === d.sizeId) || dSizes[0];
            const dPrice = d.shape === 'custom'
              ? (parseFloat(d.customW || 0) * parseFloat(d.customH || 0) <= 36 ? 14.99 : 19.99)
              : dSel?.price || 0;
            const customShapePrefix = d.shape === 'custom' && d.customShapeKind && d.customShapeKind !== 'rectangle'
              ? customShapeLabel(d.customShapeKind) + ' ' : '';
            return {
              shape: d.shape,
              size: d.shape === 'custom' ? customShapePrefix + d.customW + '"x' + d.customH + '"' : (dSel?.label || ''),
              // sizeId/customW/customH/customShapeKind: additive, read by
              // create-checkout to recompute this design's price from the
              // catalog server-side — unitPrice below is a display
              // convenience only, never trusted.
              sizeId: d.sizeId || '',
              customW: d.customW || '',
              customH: d.customH || '',
              customShapeKind: d.customShapeKind || '',
              quantity: d.qty,
              unitPrice: dPrice,
              notes: d.notes || '',
              imageUrl: d.uploadedImageUrl || '',
              ...(d.sourceType === 'upload' ? {
                sourceType: 'upload',
                selectedPage: d.selectedPage || 1,
                pageCount: d.pageCount || 1,
                approvedAt: d.approvedAt || '',
              } : {}),
            };
          }),
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch (error) {
      if (error.message === 'IMAGE_UPLOAD_FAILED') {
        alert('There was a problem uploading your image. Please try again.');
      } else {
        alert('Connection error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /* HOME PAGE */
  const galleryItems = [
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180323/649680716_1500541474823954_8161943662036624436_n_supe0j.jpg', title: '2" Cookie Circles', category: 'Cookie Sheet' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180334/WhatsApp_Image_2026-02-18_at_5.02.46_PM_4_bdffmh.jpg', title: 'Edible Print on Cookie', category: 'Cookie Topper' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180316/631155092_927287009710918_2725418458120497650_n_alqxgi.jpg', title: '8" Round Cake Topper', category: 'Round' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180315/564037940_606689965772579_7150919334617048888_n_vtkhf1.jpg', title: 'Full Sheet on Cake', category: 'Full Sheet' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180321/643374882_1221779420149107_4563453986619431265_n_x0ry5y.jpg', title: 'Full Sheet Print', category: 'Full Sheet' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180326/661142328_1334185021979269_4781349991339791662_n_kjtbdp.jpg', title: '6" Round Cake Topper', category: 'Round' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180330/674461215_2470531503382051_8704629536921250123_n_iztbl6.jpg', title: '6" Round Celebration', category: 'Round' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180311/WhatsApp_Image_2026-02-18_at_5.14.09_PM_z4dkxf.jpg', title: '1.25" Mini Cookie Circles', category: 'Cookie Sheet' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180313/553460353_1257238136170817_2212358949708882210_n_syfirg.jpg', title: '8" Round on Cake', category: 'Round' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180311/WhatsApp_Image_2026-02-18_at_5.02.46_PM_vuvwmr.jpg', title: 'Photo Round 8"', category: 'Round' },
    { url: 'https://res.cloudinary.com/dslkizfuj/image/upload/w_600,h_600,c_fill,q_auto,f_auto/v1777180337/WhatsApp_Image_2026-02-18_at_5.02.46_PM_7_d04sga.jpg', title: '2" Circles on Cupcakes', category: 'Cookie Sheet' },
  ];

  if (step === 0) {
    const stepColors = ['#E8F5EE', '#FFF4EB', '#EEF2FF', '#FFF9E6'];
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
        <nav className="ep-header-nav" style={{
          borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
          <Logo />
          <button className="ep-header-cta-btn" onClick={() => { setOrderMode('editor'); setStep(1); }} style={btnPrimaryHeader}>
            Order Now
          </button>
        </nav>
        <HeroSection
          onOrderClick={() => { setOrderMode('editor'); setStep(1); }}
          onUploadFileClick={() => { setOrderMode('upload'); setStep(1); }}
          cutoffMsg={cutoffMsg}
        />
        <div style={{ background: C.white, borderTop: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap', maxWidth: 760, margin: '0 auto' }}>
            {[
              { icon: '🖨️', title: '300 DPI Print Quality', sub: 'Crystal-clear results' },
              { icon: '🍰', title: '100% Food-Safe', sub: 'FDA-approved inks & sheets' },
              { icon: '🚚', title: '1–2 Day Production', sub: 'Ships in approx. 3–5 days' },
              { icon: '✅', title: '100% Satisfaction', sub: 'We make it right, guaranteed' },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px',
                borderRight: i < 3 ? '1px solid ' + C.border : 'none', flexShrink: 0 }}>
                <span style={{ fontSize: 22 }}>{b.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{b.title}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: '#FFF8E6', border: '1px solid #F4D06F', borderRadius: 8, padding: '10px 20px', textAlign: 'center', fontSize: 13, color: '#5C4A1A', fontWeight: 500, maxWidth: 600, margin: '16px auto 0' }}>
            🎯 Order before <strong>2 PM EST</strong> for same-day production · Ready for pickup or shipping next business day
          </div>
        </div>
        {/* ── DELIVERY TIMES BAR ── */}
        <div style={{ background: C.brandLight, borderBottom: '1px solid #C6E6D6', padding: '12px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 32px', fontSize: 13.5, fontWeight: 600, color: C.brandDark }}>
            <span>📦 Production: 1–2 business days</span>
            <span style={{ color: '#C6E6D6' }}>|</span>
            <span>🚚 Canada-wide shipping: Approx. 3–5 business days</span>
            <span style={{ color: '#C6E6D6' }}>|</span>
            <span>🎯 Order before 2 PM EST for same-day production</span>
          </div>
        </div>
        <section style={{ padding: '56px 24px', maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 10, fontWeight: 700 }}>How It Works</h2>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: 36, fontSize: 15 }}>Four simple steps to your edible print</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 16 }}>
            {[
              { num: '01', icon: '📤', title: 'Upload', desc: 'Upload your photo, logo, or any custom design', bg: stepColors[0] },
              { num: '02', icon: '✂️', title: 'Customize', desc: 'Choose shape, size, and adjust the print area', bg: stepColors[1] },
              { num: '03', icon: '💳', title: 'Pay Securely', desc: 'Visa, Mastercard, Apple Pay & more', bg: stepColors[2] },
              { num: '04', icon: '📬', title: 'Receive', desc: 'We review, print & ship to your door in days', bg: stepColors[3] },
            ].map((item, i) => (
              <div key={i} style={{ background: item.bg, borderRadius: 16, textAlign: 'center', padding: '30px 20px', position: 'relative',
                border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 11, fontWeight: 700, color: '#00000030' }}>{item.num}</div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{item.icon}</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>{item.title}</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section style={{ padding: '44px 24px', maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 32, fontWeight: 700 }}>Perfect For Every Occasion</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12 }}>
            {['🎂 Birthday Cakes','🎓 Graduation Parties','👶 Baby Showers','💼 Corporate Events',
              '🏷️ Brand Logos on Treats','🍪 Cookie Toppers','💒 Weddings & Anniversaries','📸 Photo Cupcakes'].map((item, i) => (
              <div key={i} style={{ background: C.white, borderRadius: 10, padding: '13px 18px', fontSize: 14.5,
                border: '1px solid ' + C.border, fontWeight: 500 }}>{item}</div>
            ))}
          </div>
        </section>
        <section id="pricing" style={{ padding: '52px 24px', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, marginBottom: 8, fontWeight: 700 }}>Simple, Transparent Pricing</h2>
          <p style={{ color: C.muted, marginBottom: 8, fontSize: 15 }}>B&amp;W Sheet from $9.99 · Cake Toppers from $14.99 · Food-safe inks &amp; premium paper included</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.brand, marginBottom: 28 }}>Starting at <strong>$9.99</strong></p>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 0, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28, borderBottom: '2px solid ' + C.border }}>
            {[
              { key: 'circular', label: 'Round' },
              { key: 'heart', label: 'Heart' },
              { key: 'square', label: 'Square' },
              { key: 'multicircle', label: 'Cookie Sheets' },
              { key: 'fullsheet', label: 'Full Sheet' },
              { key: 'bwsheet', label: 'B&W Sheet' },
              { key: 'waferletter', label: 'Wafer Paper' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setPricingTab(tab.key)} style={{
                padding: '10px 20px', fontSize: 14, cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", background: 'transparent', transition: 'all 0.2s',
                border: 'none', borderBottom: pricingTab === tab.key ? '2px solid ' + C.brand : '2px solid transparent',
                marginBottom: -2,
                fontWeight: pricingTab === tab.key ? 700 : 500,
                color: pricingTab === tab.key ? C.brand : C.muted,
              }}>{tab.label}</button>
            ))}
          </div>
          {/* Size cards for selected tab */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            {(SIZES[pricingTab] || []).map((sz) => {
              const popular = sz.id === 'c8';
              const cookieGrid = sz.circleSize ? getCircleGrid(sz.w, sz.h, sz.circleSize) : null;
              // Round/Heart/Square: a topper sits ON a frosted cake's surface,
              // so it must be smaller than the cake itself — these used to
              // suggest cupcakes/brownies for toppers as large as 5"-6",
              // which don't fit any cupcake. Each size now names the cake
              // diameter it's actually meant for (topper diameter -> cake
              // diameter it's cut to sit on, one size up).
              const descriptions = {
                c5: 'Fits 6″ round cakes', c6: 'Fits 7″ round cakes',
                c7: 'Fits 8″ round cakes', c8: 'Fits 9″–10″ round cakes',
                h6: 'Fits 7″ heart cakes', h7: 'Fits 8″ heart cakes', h8: 'Fits 9″–10″ heart cakes',
                s5: 'Fits 6″ square cakes', s6: 'Fits 7″ square cakes',
                s7: 'Fits 8″ square cakes', s8: 'Fits 9″–10″ square cakes',
                mc125: '40 mini toppers/sheet — cupcakes & mini cookies',
                mc2: '15 toppers/sheet — cupcakes & cookies',
                mc3: '6 toppers/sheet — cookies & mini treats',
                a4: 'For full sheet cakes & large projects',
                bw1: 'Economy grayscale — text, logos & portraits',
                wl1: 'A lighter, more economical alternative to icing sheets',
              };
              const isBestValue = sz.id === 'bw1';
              const isHovered = hoveredCardId === sz.id;
              return (
                <div key={sz.id}
                  onClick={() => handlePricingCardClick(pricingTab, sz.id)}
                  onMouseEnter={() => setHoveredCardId(sz.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  style={{ ...card, padding: '28px 20px', position: 'relative', textAlign: 'center',
                    cursor: 'pointer', transition: 'all 0.18s',
                    border: popular ? '2.5px solid ' + C.brand : '1px solid ' + (isHovered ? C.brand : C.border),
                    boxShadow: isHovered ? '0 8px 28px rgba(27,107,74,0.22)' : (popular ? '0 6px 24px rgba(27,107,74,0.15)' : card.boxShadow),
                    transform: isHovered ? 'translateY(-3px)' : 'none' }}>
                  {popular && (
                    <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                      background: C.brand, color: '#fff', fontSize: 11, fontWeight: 700,
                      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>Most Popular</div>
                  )}
                  {isBestValue && (
                    <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                      background: C.accent, color: '#fff', fontSize: 11, fontWeight: 700,
                      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>ECONOMY</div>
                  )}
                  <div style={{ fontSize: 32, fontWeight: 700, color: C.brand, marginBottom: 4 }}>{'$' + sz.price.toFixed(2)}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{sz.label}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 6 }}>{descriptions[sz.id] || ''}</div>
                  <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 10 }}>🚀 Production: 1–2 days · Ships in ~3–5 days</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isHovered ? C.brand : C.muted, opacity: isHovered ? 1 : 0.6 }}>Order this size →</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 20 }}>Custom sizes available · Free local pickup · Flat-rate Canada-wide shipping $9.99 · No tax charged</p>
        </section>

        {/* ── PDF DOWNLOAD SECTION ── */}
        <section style={{ padding: '56px 24px', maxWidth: 1080, margin: '0 auto' }}>
          <div style={{
            background: 'linear-gradient(135deg, #E8F5EE 0%, #FFF8E6 100%)',
            borderRadius: 20,
            padding: '44px 36px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'inline-block',
              background: C.accent,
              color: 'white',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 20,
              letterSpacing: 0.5,
              marginBottom: 16,
            }}>
              NEW · DIGITAL OPTION
            </div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 36,
              fontWeight: 700,
              marginBottom: 12,
            }}>
              Just need the design? Get a PDF for $3.99
            </h2>
            <p style={{
              fontSize: 16,
              color: C.muted,
              maxWidth: 560,
              margin: '0 auto 28px',
              lineHeight: 1.6,
            }}>
              Download your custom design as a print-ready PDF in A4 format.
              Perfect if you already have an edible printer, a local print
              shop, or just want the design file for yourself.
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              flexWrap: 'wrap',
              marginBottom: 28,
              fontSize: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📄</span> Print-ready A4
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚡</span> Instant download
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📧</span> Copy sent to your email
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎨</span> No watermark
              </div>
            </div>
            <button
              onClick={() => {
                setStep(0);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              style={{
                ...btnPrimary,
                background: C.brand,
                padding: '14px 32px',
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              Design Your PDF — $3.99 →
            </button>
            <p style={{
              fontSize: 12,
              color: C.muted,
              marginTop: 16,
              fontStyle: 'italic',
            }}>
              Or order a printed edible print from $9.99 above
            </p>
          </div>
        </section>

        {/* ── QUALITY GUARANTEE SECTION ── */}
        <section style={{ padding: '52px 24px', background: C.brandLight, borderTop: '1px solid #C6E6D6', borderBottom: '1px solid #C6E6D6' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 72, lineHeight: 1, flexShrink: 0 }}>🛡️</div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, margin: '0 0 12px', color: C.brandDark }}>
                Our Quality Guarantee
              </h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.7, color: C.text, margin: '0 0 18px' }}>
                Every edible print is produced with <strong>300 DPI resolution</strong> and <strong>FDA-approved food-safe inks</strong>, on <strong>premium icing sheets or wafer paper</strong> depending on the format you choose — both lay flat and taste great.
                If your order arrives damaged or the print quality doesn't meet your expectations, we'll reprint or refund — no questions asked.
              </p>
              <ul style={{ margin: '0 0 20px', padding: '0 0 0 20px', fontSize: 14.5, lineHeight: 1.85, color: C.text }}>
                <li>We review every image before printing — we'll flag quality issues</li>
                <li>Reprints sent within 24 hours for any production error</li>
                <li>Arrives in protective packaging to prevent damage in transit</li>
                <li>Every batch is taste-tested for colour accuracy</li>
              </ul>
              <button onClick={() => { setOrderMode('editor'); setStep(1); }} style={{ ...btnPrimary, padding: '13px 30px', fontSize: 15, borderRadius: 12 }}>
                Order with Confidence →
              </button>
            </div>
          </div>
        </section>

        {/* ── CUSTOMER GALLERY ── */}
        <section style={{ padding: '64px 24px', background: '#FAFBF9' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 700, marginBottom: 12 }}>
                Real Customer Prints
              </h2>
              <p style={{ fontSize: 16, color: C.muted, maxWidth: 480, margin: '0 auto' }}>
                Fresh from our printer — loved by customers across Canada
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {galleryItems.map((item, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#F0F0F0', aspectRatio: '1 / 1', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.querySelector('.overlay').style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.querySelector('.overlay').style.opacity = '0'; }}
                >
                  <img
                    src={item.url}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                  <div
                    className="overlay"
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)',
                      opacity: 0, transition: 'opacity 0.2s ease',
                      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '16px',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      {item.category}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>
                      {item.title}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 36 }}>
              <button
                onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                style={{ ...btnPrimary, padding: '14px 32px', fontSize: 15 }}
              >
                Order Your Custom Print →
              </button>
            </div>
          </div>
        </section>

        <section style={{ padding: '56px 24px', maxWidth: 920, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>What Our Customers Say</h2>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: 16, fontSize: 15 }}>11 five-star reviews on Facebook Marketplace — verified by real buyers</p>
          {/* Trust metrics */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, background: C.white,
              border: '1px solid ' + C.border, borderRadius: 40, padding: '10px 28px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)', fontSize: 14, fontWeight: 700 }}>
              <span style={{ color: '#FBBF24', fontSize: 18, letterSpacing: 2 }}>★</span>
              <span style={{ color: C.text }}>5.0</span>
              <span style={{ color: C.border }}>·</span>
              <span style={{ color: C.muted }}>11 Reviews</span>
              <span style={{ color: C.border }}>·</span>
              <span style={{ color: '#059669' }}>100% 5-Star</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 28 }}>
            {/* Card 1: Holly */}
            <div style={{ ...card, padding: '24px 22px' }}>
              <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 10, letterSpacing: 2 }}>★★★★★</div>
              <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.7, color: C.text }}>
                "Answered all my questions and helped me figure out what would suit my item best. The result was better than I expected!"
              </p>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>Holly</div>
              <div style={{ fontSize: 12, color: C.muted }}>February 2026 · Facebook Marketplace</div>
            </div>
            {/* Card 2: Valéria */}
            <div style={{ ...card, padding: '24px 22px' }}>
              <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 10, letterSpacing: 2 }}>★★★★★</div>
              <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.7, color: C.text }}>
                "Made a wafer paper photo print and it turned out super cute! Awesome turnaround too."
              </p>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>Valéria</div>
              <div style={{ fontSize: 12, color: C.muted }}>September 2025 · Facebook Marketplace</div>
            </div>
            {/* Card 3: Caro */}
            <div style={{ ...card, padding: '24px 22px' }}>
              <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 10, letterSpacing: 2 }}>★★★★★</div>
              <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.7, color: C.text }}>
                "I'm very happy with both the quality of the work and the customer service. The seller was kind and responsive at all times, answering all of my questions. I've ordered before, and the seller has always met all of my expectations. The prices are very reasonable considering the detailed design and the excellent final result. If you're looking for a professional outcome, I totally recommend this seller's work. Thank you so much!"
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {['Punctuality', 'Communication', 'Pricing', 'Item Description'].map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: '3px 8px', background: C.brandLight,
                    color: C.brandDark, borderRadius: 4 }}>{tag}</span>
                ))}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>Caro</div>
              <div style={{ fontSize: 12, color: C.muted }}>August 2, 2025 · Facebook Marketplace</div>
            </div>
            {/* Card 4: Summary badges */}
            <div style={{ ...card, padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 16 }}>What Buyers Notice Most</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {['✓ Punctuality', '✓ Communication', '✓ Pricing', '✓ Item Description'].map(badge => (
                  <span key={badge} style={{
                    background: C.brandLight, color: C.brandDark, border: '1px solid #C6E6D6',
                    borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600
                  }}>{badge}</span>
                ))}
              </div>
              <div style={{ marginTop: 20, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                Consistently rated across our 11 reviews
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <a href="https://www.facebook.com/marketplace/profile/61556264345219/"
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', background: '#1877F2', color: '#fff',
                fontWeight: 700, fontSize: 14, borderRadius: 10, padding: '12px 28px',
                textDecoration: 'none', fontFamily: "'Outfit', sans-serif",
                boxShadow: '0 4px 14px rgba(24,119,242,0.3)' }}>
              See all 11 reviews on Facebook →
            </a>
          </div>
        </section>
        <section id="faq" style={{ padding: '56px 24px', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>Frequently Asked Questions</h2>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: 36, fontSize: 15 }}>Everything you need to know about edible printing</p>
          {[
            ['What are edible prints made of?', 'We print on two food-safe materials: edible icing sheets (frosting sheets) for our Round, Heart, Square, Cookie Sheet, Full Sheet, and B&W Sheet formats, and wafer paper for our Wafer Paper Letter Sheet option. Both use vibrant, water-based edible inks, are FDA-approved, and are tasteless \u2014 so they won\u2019t affect the flavour of your baked goods. Wafer paper is thinner and more delicate, with slightly softer colour, but it\u2019s a lighter, more economical option.'],
            ['How do I apply the edible print?', 'Peel the backing sheet gently and lay the print directly onto a freshly frosted or fondant-covered surface. Press lightly from the centre outward to remove air bubbles. For best results, apply within 30 minutes of frosting and keep refrigerated until serving.'],
            ['How long does shipping take?', 'Free pickup is available at our London, Ontario location. Canada Post shipping is a flat rate of $9.99 anywhere in Canada — approx. 3–5 business days, no tracking number included.'],
            ['What image resolution do I need for good quality?', 'We recommend a minimum of 1000×1000 pixels at 300 DPI. We review every order before printing — if we spot a quality issue with your file, we\'ll reach out before proceeding.'],
            ['Do you ship to all Canadian provinces and territories?', 'Yes — we ship to all provinces and territories via Canada Post at a flat rate of $9.99. Approx. 3–5 business days.'],
            ['Can I order multiple copies of the same design?', 'Yes — simply increase the quantity at checkout. For bulk orders (20+ units), contact us for a volume pricing quote.'],
            ['Can I include multiple different designs in one order?', 'Absolutely. Use the "Add Another Design" button to include up to 5 different designs in a single order. Each design can have its own shape, size, image, and quantity.'],
            ['How long do edible prints last?', 'Stored in the original sealed packaging in a cool, dry place, edible prints last up to 12 months. Once applied to a frosted cake, they are best consumed within 3–5 days.'],
            ['Are your products allergen-free?', 'Our edible inks and sheets are free from the most common allergens. However, they are produced in a facility that may handle nuts and dairy. Please review our full allergen statement for details.'],
            ['What if my order arrives damaged or the print quality is poor?', 'We stand behind every order. If your print arrives damaged or doesn\'t meet the quality you expected, contact us within 48 hours and we\'ll reprint it or issue a full refund — no questions asked.'],
          ].map(([q, a], i) => (
            <details key={i} style={{ borderBottom: '1px solid ' + C.border, paddingBottom: 16, marginBottom: 16 }}>
              <summary style={{ fontWeight: 600, fontSize: 15, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>{q}</span><span style={{ color: C.brand, fontSize: 20, fontWeight: 400, flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{a}</p>
            </details>
          ))}
        </section>
        <section style={{ background: C.brand, color: '#fff', padding: '52px 24px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, margin: '0 0 16px', fontWeight: 700 }}>Ready to Create Your Edible Print?</h2>
          <p style={{ fontSize: 16, opacity: 0.88, margin: '0 0 28px' }}>Upload your image and get your custom edible print delivered to your door.</p>
          <button onClick={() => { setOrderMode('editor'); setStep(1); }} style={{ ...btnPrimary, background: '#fff', color: C.brand, fontSize: 18, padding: '16px 44px', borderRadius: 14 }}>
            Start Your Order →
          </button>
        </section>
        <footer style={{ background: '#1a1a1a', color: '#d1d5db', fontFamily: "'Outfit', sans-serif" }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px 40px', display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 36 }}>
            {/* Col 1: Brand */}
            <div>
              <Logo footer />
              <p style={{ fontSize: 13.5, lineHeight: 1.7, marginTop: 14, color: '#9CA3AF', maxWidth: 220 }}>
                Custom edible image printing on premium icing sheets. Made with love in London, Ontario.
              </p>
              <p style={{ fontSize: 13, marginTop: 12, color: '#9CA3AF' }}>
                <a href="mailto:edibleprintorders@gmail.com" style={{ color: '#6ee7b7', textDecoration: 'none' }}>edibleprintorders@gmail.com</a>
              </p>
              <p style={{ fontSize: 13, marginTop: 4, color: '#9CA3AF' }}>London, Ontario, Canada 🇨🇦</p>
            </div>
            {/* Col 2: Shop */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 0 }}>Shop</h4>
              {[
                ['Round Cake Toppers', () => handlePricingCardClick('circular', 'c8')],
                ['Heart Cake Toppers', () => handlePricingCardClick('heart', 'h8')],
                ['Square Prints', () => handlePricingCardClick('square', 's8')],
                ['Cookie Sheets', () => handlePricingCardClick('multicircle', 'mc3')],
                ['Full Sheet Prints', () => handlePricingCardClick('fullsheet', 'a4')],
                ['Wafer Paper Prints', () => handlePricingCardClick('waferletter', 'wl1')],
              ].map(([label, action]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <button onClick={action} style={{ background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13.5, color: '#9CA3AF', padding: 0, fontFamily: "'Outfit', sans-serif",
                    textAlign: 'left', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#6ee7b7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
                    {label}
                  </button>
                </div>
              ))}
            </div>
            {/* Col 3: Company */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 0 }}>Company</h4>
              {[
                ['About Us', '/about'],
                ['FAQ', '/#faq'],
                ['Contact', 'mailto:edibleprintorders@gmail.com'],
              ].map(([label, href]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <a href={href} style={{ fontSize: 13.5, color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#6ee7b7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
                    {label}
                  </a>
                </div>
              ))}
            </div>
            {/* Col 4: Legal */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 0 }}>Legal</h4>
              {[
                ['Privacy Policy', '/privacy'],
                ['Terms of Service', '/terms'],
                ['Shipping Policy', '/shipping'],
                ['Refund Policy', '/refund'],
                ['Allergen Info', '/allergens'],
              ].map(([label, href]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <a href={href} style={{ fontSize: 13.5, color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#6ee7b7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
                    {label}
                  </a>
                </div>
              ))}
            </div>
          </div>
          {/* Bottom bar */}
          <div style={{ borderTop: '1px solid #374151', padding: '20px 24px' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexWrap: 'wrap',
              justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>
                © {new Date().getFullYear()} EdiblePrint.net · All rights reserved
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {['VISA', 'MC', 'AMEX', 'Apple Pay', 'Google Pay'].map(card => (
                  <span key={card} style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF',
                    background: '#374151', borderRadius: 4, padding: '3px 7px', letterSpacing: 0.5 }}>{card}</span>
                ))}
                <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>🔒 Powered by Stripe</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  /* ORDER FLOW */
  const stepLabels = orderMode === 'upload' ? ['Upload', 'Review', 'Details', 'Done'] : ['Upload', 'Customize', 'Details', 'Done'];
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <nav style={{ padding: '14px 24px',
        borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div onClick={() => setStep(0)} style={{ cursor: 'pointer' }}><Logo /></div>
          {/* Full node-by-node walk — desktop only. On mobile it overflows past
              360px (4 nodes + chevrons + the wordmark logo don't fit; hiding
              just the text labels via .hide-mobile wasn't enough), so mobile
              gets a completely different, width-independent representation
              below instead of a squeezed version of this one. */}
          <div className="ep-stepper-desktop" style={{ gap: 6, alignItems: 'center' }}>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step >= i + 1 ? C.brand : '#E5E7EB', color: step >= i + 1 ? '#fff' : '#9CA3AF',
                  transition: 'all 0.3s' }}>{i + 1}</div>
                <span style={{ fontSize: 12, color: step >= i + 1 ? C.text : '#bbb',
                  fontWeight: step === i + 1 ? 600 : 400 }}>{label}</span>
                {i < 3 && <span style={{ color: '#ddd', margin: '0 2px', fontSize: 11 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
        {/* Current-step-only + progress bar — mobile only. Constant width
            regardless of step count, label length, or logo size, so this
            can't regress into the same overflow again. */}
        <div className="ep-stepper-mobile">
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: C.text }}>
            Step {step} of {stepLabels.length}: {stepLabels[step - 1]}
          </div>
          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: '#E5E7EB', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (step / stepLabels.length * 100) + '%',
              background: C.brand, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>1</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>
                {orderMode === 'upload'
                  ? (designs.length > 0 ? 'Add Another File' : 'Upload Your Print-Ready File')
                  : (designs.length > 0 ? 'Add Another Design' : 'Upload Your Image')}
              </h2>
              <p style={{ color: C.muted, marginBottom: pendingShape ? 12 : 24 }}>
                {orderMode === 'upload'
                  ? "We print it exactly as provided — no editing or adjustments on our end."
                  : 'JPG, PNG or PDF · High resolution for best results'}
              </p>
            </div>
            {orderMode === 'editor' && pendingShape && pendingSizeId && (() => {
              const pSizes = SIZES[pendingShape] || [];
              const pSel = pSizes.find(s => s.id === pendingSizeId);
              const shapeLabels = { circular: 'Round', heart: 'Heart', square: 'Square', multicircle: 'Cookie Sheet', fullsheet: 'Full Sheet', bwsheet: 'B&W Sheet', waferletter: 'Wafer Paper' };
              return (
                <div style={{ background: C.brandLight, border: '1.5px solid ' + C.brand, borderRadius: 12,
                  padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.brand }}>
                    Pre-selected: {shapeLabels[pendingShape] || pendingShape} — {pSel?.label || pendingSizeId}
                  </span>
                  <button onClick={() => { setPendingShape(null); setPendingSizeId(null); }}
                    style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>✕</button>
                </div>
              );
            })()}

            {designs.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Your Designs ({designs.length}/5)</label>
                {designs.map((d, i) => (
                  <div key={d.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '12px 16px' }}>
                    {d.sourceType === 'upload'
                      ? <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                          {d.fileMimeType === 'application/pdf' ? '📄' : '🖼️'}
                        </div>
                      : d.cropPreview
                        ? <img src={d.cropPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        : d.layers?.[0]?.src
                          ? <img src={d.layers[0].src} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🖼️</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        Design {i + 1}
                        {d.sourceType === 'upload' ? ' — Your file' : (d.layers?.length > 1 ? ` (${d.layers.length} images)` : '')}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.sourceType === 'upload' ? d.fileName : (d.layers?.map(l => l.name).join(', ') || 'No image')}
                      </div>
                    </div>
                    <button onClick={() => { setActiveDesignId(d.id); setStep(2); }}
                      style={{ fontSize: 12, color: C.brand, background: 'none', border: '1px solid ' + C.brand, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", flexShrink: 0 }}>
                      Edit
                    </button>
                    <button onClick={() => {
                        const remaining = designs.filter(x => x.id !== d.id);
                        setDesigns(remaining);
                        if (activeDesignId === d.id) setActiveDesignId(remaining[0]?.id ?? null);
                      }}
                      style={{ fontSize: 12, color: '#EF4444', background: 'none', border: '1px solid #EF4444', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", flexShrink: 0 }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {orderMode === 'editor' ? (
              <>
                {designs.length < 5 && (
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    style={{
                      border: '2.5px dashed ' + (isDragOver ? C.brand : C.border),
                      borderRadius: 20, padding: designs.length > 0 ? '36px 24px' : '56px 24px',
                      cursor: 'pointer', transition: 'all 0.25s',
                      background: isDragOver ? C.brandLight : C.white, textAlign: 'center',
                    }}>
                    <div style={{ fontSize: designs.length > 0 ? 36 : 52, marginBottom: 14, opacity: 0.8 }}>🖼️</div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: designs.length > 0 ? 15 : 17 }}>
                      {isDragOver ? 'Drop your image here!' : designs.length > 0 ? 'Upload another image' : 'Tap to upload your image'}
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#bbb' }}>or drag and drop here</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} style={{ display: 'none' }} />

                {designs.length < 5 && (
                  <button onClick={addTextOnlyDesign} style={{
                    width: '100%', marginTop: 12, padding: '14px 24px', borderRadius: 14,
                    border: '1.5px dashed ' + C.border, background: C.white, cursor: 'pointer',
                    fontSize: 15, fontWeight: 600, color: C.muted, fontFamily: "'Outfit', sans-serif",
                    transition: 'all 0.2s',
                  }}>
                    ✏️ Create text-only design (no image)
                  </button>
                )}
              </>
            ) : (
              designs.length < 5 && (
                <div>
                  <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Sheet type</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                    {UPLOAD_FLOW_SHAPES.map((sh) => {
                      const szObj = (SIZES[sh] || [])[0];
                      const uploadShapeLabels = { fullsheet: 'Full Sheet', bwsheet: 'B&W Sheet', waferletter: 'Wafer Paper' };
                      return (
                        <button key={sh} onClick={() => setPendingUploadShape(sh)} style={{
                          flex: 1, minWidth: 110, padding: '12px 10px', borderRadius: 12,
                          border: pendingUploadShape === sh ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                          background: pendingUploadShape === sh ? C.brandLight : C.white,
                          cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: C.brand }}>{'$' + (szObj?.price ?? 0).toFixed(2)}</div>
                          <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, marginTop: 2 }}>{uploadShapeLabels[sh]}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 12.5, color: C.muted, marginBottom: 10, textAlign: 'center' }}>
                    Accepted formats: PDF, PNG, JPG · Max {UPLOAD_MAX_FILE_MB}MB
                  </p>
                  {uploadFileError && (
                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C',
                      borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
                      {uploadFileError}
                    </div>
                  )}
                  <div
                    onClick={() => uploadFileRef.current?.click()}
                    style={{
                      border: '2.5px dashed ' + C.border,
                      borderRadius: 20, padding: designs.length > 0 ? '36px 24px' : '56px 24px',
                      cursor: 'pointer', transition: 'all 0.25s',
                      background: C.white, textAlign: 'center',
                    }}>
                    <div style={{ fontSize: designs.length > 0 ? 36 : 52, marginBottom: 14, opacity: 0.8 }}>📄</div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: designs.length > 0 ? 15 : 17 }}>
                      Tap to upload your print-ready file
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#bbb' }}>PDF, PNG or JPG</p>
                  </div>
                  <input ref={uploadFileRef} type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                    onChange={handleUploadFileInputChange} style={{ display: 'none' }} />
                </div>
              )
            )}

            {designs.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button onClick={() => { setActiveDesignId(designs[0].id); setStep(2); }} style={{ ...btnPrimary, flex: 1 }}>
                  Continue →
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 (upload flow): REVIEW — Change-2 validation lives here.
            The visual print preview + pdf.js-rendered approval modal land in
            Stage 3; for now results are shown as a text/numbers panel. */}
        {step === 2 && activeDesign && activeIsUpload && (() => {
          const vStatus = uploadValidationStatus[activeDesign.id] || 'loading';
          const v = activeUploadValidation;
          const thumbs = uploadPageThumbs[activeDesign.id];
          const isPdf = activeDesign.fileMimeType === 'application/pdf';
          const uploadShapeLabels = { fullsheet: 'Full Sheet', bwsheet: 'B&W Sheet', waferletter: 'Wafer Paper' };
          const canContinue = vStatus === 'done' && (!activeUploadNeedsConfirm || activeDesign.confirmMismatch) && activeDesign.approvedPrintAsIs === true;
          return (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={stepBadge}>2</div>
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Review Your File</h2>
                <p style={{ color: C.muted, marginBottom: 16 }}>{activeDesign.fileName}</p>
              </div>

              <div style={{ ...card, padding: '20px 22px', marginBottom: 20 }}>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Sheet type</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  {UPLOAD_FLOW_SHAPES.map((sh) => {
                    const szObj = (SIZES[sh] || [])[0];
                    return (
                      <button key={sh} onClick={() => { setShape(sh); setSizeId((SIZES[sh] || [])[0]?.id || ''); }} style={{
                        flex: 1, minWidth: 100, padding: '10px 8px', borderRadius: 12,
                        border: shape === sh ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                        background: shape === sh ? C.brandLight : C.white,
                        cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.brand }}>{'$' + (szObj?.price ?? 0).toFixed(2)}</div>
                        <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600, marginTop: 2 }}>{uploadShapeLabels[sh]}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Multi-page PDF picker */}
                {isPdf && thumbs && thumbs.length > 1 && (
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>
                      This PDF has {thumbs.length} pages — which one do you want printed?
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {thumbs.map((thumb, i) => (
                        <button key={i} onClick={() => updateActive({ selectedPage: i + 1 })} style={{
                          padding: 4, borderRadius: 8, cursor: 'pointer', background: C.white,
                          border: (activeDesign.selectedPage || 1) === i + 1 ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                        }}>
                          <img src={thumb} alt={`Page ${i + 1}`} style={{ display: 'block', width: 70, height: 'auto', borderRadius: 4 }} />
                          <div style={{ fontSize: 11, textAlign: 'center', marginTop: 2, fontWeight: 600, color: (activeDesign.selectedPage || 1) === i + 1 ? C.brand : C.muted }}>
                            Page {i + 1}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validation results */}
                {vStatus === 'loading' && (
                  <div style={{ padding: '14px 0', textAlign: 'center', color: C.muted, fontSize: 13.5 }}>
                    Checking your file…
                  </div>
                )}
                {vStatus === 'error' && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C',
                    borderRadius: 8, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
                    We couldn't read this file to check it. Please go back and try uploading it again.
                  </div>
                )}
                {vStatus === 'done' && v && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8,
                      marginBottom: 8, fontSize: 12.5, lineHeight: 1.5,
                      background: v.sizeExact ? '#ECFDF5' : '#FFF8E6',
                      border: '1px solid ' + (v.sizeExact ? '#6EE7B7' : '#F4D06F'),
                      color: v.sizeExact ? '#065F46' : '#5C4A1A',
                    }}>
                      <span>{v.sizeExact ? '✅' : '⚠️'}</span>
                      <span>
                        {v.sizeExact
                          ? `Your file's proportions match this sheet — it'll print at ${v.printedWidthIn.toFixed(2)}" × ${v.printedHeightIn.toFixed(2)}".`
                          : `Your file's proportions don't exactly match this sheet. It will be scaled to fit within ${v.targetWidthIn}" × ${v.targetHeightIn}" (printing at ${v.printedWidthIn.toFixed(2)}" × ${v.printedHeightIn.toFixed(2)}"), with a small margin on one side. Nothing will be cropped.`}
                      </span>
                    </div>

                    {v.dpiKnown ? (
                      <div style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8,
                        marginBottom: 8, fontSize: 12.5, lineHeight: 1.5,
                        background: v.dpiOk ? '#ECFDF5' : '#FFF8E6',
                        border: '1px solid ' + (v.dpiOk ? '#6EE7B7' : '#F4D06F'),
                        color: v.dpiOk ? '#065F46' : '#5C4A1A',
                      }}>
                        <span>{v.dpiOk ? '✅' : '⚠️'}</span>
                        <span>
                          {v.dpiOk
                            ? `Resolution looks good (~${Math.round(v.dpi)} DPI at print size).`
                            : `This image is ~${Math.round(v.dpi)} DPI at print size — below our recommended ${UPLOAD_MIN_DPI} DPI. It may look pixelated when printed.`}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8,
                        marginBottom: 8, fontSize: 12.5, lineHeight: 1.5, background: '#F5F5F5', color: C.muted }}>
                        <span>ℹ️</span>
                        <span>We can't automatically check the resolution of images inside a PDF — text and vector graphics always print sharp; if you placed a photo, make sure it was at least {UPLOAD_MIN_DPI} DPI at print size.</span>
                      </div>
                    )}

                    {v.marginWarning && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8,
                        marginBottom: 8, fontSize: 12.5, lineHeight: 1.5, background: '#FFF8E6', border: '1px solid #F4D06F', color: '#5C4A1A' }}>
                        <span>⚠️</span>
                        <span>There's content within {UPLOAD_MARGIN_MM}mm of the edge of your file — it may be lost when trimmed.</span>
                      </div>
                    )}

                    {isPdf && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8,
                        marginBottom: 8, fontSize: 12.5, lineHeight: 1.5, background: '#F5F5F5', color: C.muted }}>
                        <span>ℹ️</span>
                        <span>For best color accuracy, submit RGB if possible — CMYK files may shift slightly when printed.</span>
                      </div>
                    )}
                    {!isPdf && activeDesign.fileMimeType === 'image/png' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8,
                        fontSize: 12.5, lineHeight: 1.5, background: '#F5F5F5', color: C.muted }}>
                        <span>ℹ️</span>
                        <span>Transparent areas will print as blank sheet.</span>
                      </div>
                    )}

                    {activeUploadNeedsConfirm && (
                      <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 12,
                        padding: '10px 12px', background: 'white', borderRadius: 6,
                        border: '2px solid ' + (activeDesign.confirmMismatch ? C.brand : '#F4D06F'),
                      }}>
                        <input type="checkbox" checked={!!activeDesign.confirmMismatch}
                          onChange={(e) => updateActive({ confirmMismatch: e.target.checked })}
                          style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer', accentColor: C.brand }} />
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                          I understand the warning{isPdf || !v.dpiKnown ? '' : 's'} above and want to print this file anyway.
                        </span>
                      </label>
                    )}
                  </div>
                )}

                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Quantity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>-</button>
                  <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
                  <button onClick={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>+</button>
                </div>

                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Notes for us (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?"
                  style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: "'Outfit', sans-serif" }} />

                {/* Print preview — rendered exactly as validation computed it
                    will print (contain-fit onto the target sheet). */}
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', margin: '18px 0 8px' }}>Print preview</label>
                <div style={{
                  border: '1px solid ' + C.border, borderRadius: 10, padding: 12,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: '#FAFBF9',
                }}>
                  {uploadPreviewStatus[activeDesign.id] === 'error' ? (
                    <div style={{ padding: '20px 0', color: '#B91C1C', fontSize: 13 }}>Couldn't render a preview for this file.</div>
                  ) : activeUploadPreview ? (
                    <img src={activeUploadPreview} alt="Print preview" style={{ maxWidth: 220, maxHeight: 260, borderRadius: 6, border: '1px solid ' + C.border, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }} />
                  ) : (
                    <div style={{ padding: '20px 0', color: C.muted, fontSize: 13 }}>Rendering preview…</div>
                  )}
                  <button onClick={() => setShowUploadPreviewModal(true)} disabled={!activeUploadPreview}
                    style={{
                      background: 'none', border: '1px solid ' + C.brand, color: C.brand, borderRadius: 8,
                      padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: activeUploadPreview ? 'pointer' : 'not-allowed',
                      opacity: activeUploadPreview ? 1 : 0.5, fontFamily: "'Outfit', sans-serif",
                    }}>
                    View Full Print Preview
                  </button>
                </div>

                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: activeUploadPreview ? 'pointer' : 'not-allowed', marginTop: 16,
                  padding: '12px 14px', background: '#FFF8E6', borderRadius: 8,
                  border: '2px solid ' + (activeDesign.approvedPrintAsIs ? C.brand : '#F4D06F'),
                  opacity: activeUploadPreview ? 1 : 0.6,
                }}>
                  <input type="checkbox" checked={!!activeDesign.approvedPrintAsIs} disabled={!activeUploadPreview}
                    onChange={(e) => updateActive({ approvedPrintAsIs: e.target.checked, approvedAt: e.target.checked ? new Date().toISOString() : null })}
                    style={{ marginTop: 3, width: 18, height: 18, cursor: activeUploadPreview ? 'pointer' : 'not-allowed', accentColor: C.brand }} />
                  <span style={{ fontSize: 13, color: '#5C4A1A', fontWeight: 600 }}>
                    I confirm this file is print-ready. It will be printed exactly as shown, without modifications.
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setStep(1)} style={{ ...btnSecondary, flex: 1 }}>← Back</button>
                <button onClick={() => setStep(3)} disabled={!canContinue}
                  style={{ ...btnPrimary, flex: 2, opacity: canContinue ? 1 : 0.5, cursor: canContinue ? 'pointer' : 'not-allowed' }}>
                  Continue →
                </button>
              </div>

              {/* Full print-preview modal — visually matches the editor's
                  print-preview modal (dark backdrop, white card, close
                  button) but renders a plain composited bitmap instead of
                  the layer-based canvas the editor's modal uses. */}
              {showUploadPreviewModal && activeUploadPreview && (
                <div onClick={() => setShowUploadPreviewModal(false)} style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 700, marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Print Preview — {activeDesign.fileName}</span>
                    <button onClick={() => setShowUploadPreviewModal(false)} style={{
                      background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8,
                      padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontFamily: "'Outfit', sans-serif",
                    }}>✕ Close</button>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} style={{
                    background: '#fff', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
                    padding: 10, maxWidth: '90vw', maxHeight: '78vh', overflow: 'auto',
                  }}>
                    <img src={activeUploadPreview} alt="Print preview" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* STEP 2: CUSTOMIZE */}
        {step === 2 && activeDesign && !activeIsUpload && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>2</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Customize Your Print</h2>
              <p style={{ color: C.muted, marginBottom: 16 }}>Choose shape, size, and adjust the crop area</p>
            </div>

            {/* Design tabs. Delete is a fully separate button with its own
                bounded hit area (right segment, divider line), never an
                overlapping corner badge — so switching designs on a phone
                can't accidentally hit delete instead. Hidden entirely (not
                disabled) when it's the only design left. */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
              {designs.map((d, i) => (
                <div key={d.id} className="ep-tab-wrap" style={{
                  display: 'flex', alignItems: 'stretch', borderRadius: 20, flexShrink: 0,
                  border: activeDesignId === d.id ? '2px solid ' + C.brand : '2px solid ' + C.border,
                  background: activeDesignId === d.id ? C.brandLight : C.white, overflow: 'hidden',
                }}>
                  <button onClick={() => setActiveDesignId(d.id)} style={{
                    padding: designs.length > 1 ? '8px 10px 8px 16px' : '8px 16px', border: 'none', background: 'transparent',
                    fontWeight: activeDesignId === d.id ? 700 : 400,
                    fontSize: 13, cursor: 'pointer', color: activeDesignId === d.id ? C.brand : C.text,
                    fontFamily: "'Outfit', sans-serif",
                  }}>
                    Design {i + 1}
                  </button>
                  {designs.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDesign(d.id); }}
                      aria-label={`Remove Design ${i + 1}`}
                      className="ep-tab-remove"
                      style={{
                        width: 36, minWidth: 36, border: 'none', padding: 0,
                        borderLeft: '1px solid ' + (activeDesignId === d.id ? C.brand : C.border),
                        background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>✕</button>
                  )}
                </div>
              ))}
              {designs.length < 5 && (
                <button onClick={() => setStep(1)} style={{
                  padding: '8px 16px', borderRadius: 20, flexShrink: 0,
                  border: '2px dashed ' + C.border, background: C.white,
                  fontSize: 13, cursor: 'pointer', color: C.muted,
                  fontFamily: "'Outfit', sans-serif",
                }}>+ Add Design</button>
              )}
            </div>

            {/* 1. Preview + ImageEditor */}
            <div style={{ marginBottom: 28 }}>
              {shape === 'bwsheet' && (
                <div style={{
                  background: '#F5F5F5', borderLeft: '3px solid ' + C.accent,
                  padding: '10px 14px', borderRadius: 6, fontSize: 13,
                  marginBottom: 16, color: C.text,
                }}>
                  ℹ️ B&W Sheet prints in grayscale for $9.99 — perfect for text, logos, and portraits.
                </div>
              )}
              {shape === 'waferletter' && (
                <div style={{
                  background: '#F5F5F5', borderLeft: '3px solid ' + C.accent,
                  padding: '10px 14px', borderRadius: 6, fontSize: 13,
                  marginBottom: 16, color: C.text,
                }}>
                  ℹ️ Wafer paper is thinner and more brittle than icing sheets, absorbs moisture more easily, and prints slightly less vivid colour — but it's more economical and needs no transfer step.
                </div>
              )}
              <ImageEditor
                layers={layers}
                onLayersChange={setLayers}
                shape={shape}
                sizeObj={effectiveSize}
                onCrop={setCropPreview}
                onHiResCrop={setHiResCrop}
                bgColor={bgColor}
                textOverlay={textOverlay}
                onTextPositionChange={(pos) => setTextOverlay((p) => ({ ...p, position: pos }))}
                removeWhiteBg={removeWhiteBg}
                bgRemoveTolerance={bgRemoveTolerance}
                onBgProcessingChange={setBgProcessing}
                onWhiteBgSuggestion={(layerId, detected) => setWhiteBgLayerFlags(prev => ({ ...prev, [layerId]: detected }))}
                sizeLabel={sizeLabel}
                isMobile={isMobile}
                designs={designs}
                activeDesignId={activeDesignId}
                customShapeKind={customShapeKind}
              />
              {whiteBgSuggestion && !removeWhiteBg && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  flexWrap: 'wrap', background: '#F5F5F5', borderLeft: '3px solid ' + C.accent,
                  padding: '10px 14px', borderRadius: 6, fontSize: 12.5,
                  marginTop: 10, color: C.text,
                }}>
                  <span>💡 This image has a white background — you can remove it in Advanced options.</span>
                  <button
                    onClick={() => { setRemoveWhiteBg(true); setAdvancedOpen(true); }}
                    style={{
                      flexShrink: 0, background: C.brand, color: '#fff', border: 'none',
                      borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Remove it →
                  </button>
                </div>
              )}
              <div style={{
                marginTop: 12, width: '100%',
                padding: '10px 12px',
                background: isAdmin ? '#E8F5EE' : '#FFF8E6',
                border: '1px solid ' + (isAdmin ? C.brand : '#F4D06F'),
                borderRadius: 8,
              }}>
                <button
                  onClick={isAdmin ? handleDownloadPdfAsAdmin : () => setShowEmailModal(true)}
                  disabled={!hiResCrop || downloadingPdf}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: isAdmin ? C.brand : '#E8873C',
                    color: 'white', border: 'none', borderRadius: 6,
                    cursor: hiResCrop && !downloadingPdf ? 'pointer' : 'not-allowed',
                    opacity: hiResCrop && !downloadingPdf ? 1 : 0.5,
                    fontWeight: 600, fontSize: 13, fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {downloadingPdf
                    ? 'Generating PDF…'
                    : isAdmin
                      ? '⬇ Download PDF (Admin · Free)'
                      : '⬇ Download as PDF — $3.99'}
                </button>
                <div style={{ fontSize: 10.5, color: C.muted, textAlign: 'center', marginTop: 6 }}>
                  A4 sheet · {shape} {selectedSize?.label || (customW && customH ? `${customW}" × ${customH}"` : '')}
                </div>
              </div>
            </div>

            {/* 2. Shape */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Shape</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[{ key: 'circular', icon: '⭕', label: 'Round' }, { key: 'heart', icon: '❤️', label: 'Heart' },
                  { key: 'multicircle', icon: '🍪', label: 'Cookie Sheet' },
                  { key: 'square', icon: '⬜', label: 'Square' },
                  { key: 'fullsheet', icon: '▬', label: 'Full Sheet' },
                  { key: 'bwsheet', icon: '⬛', label: 'B&W Sheet' },
                  { key: 'waferletter', icon: '📄', label: 'Wafer Paper', title: "Wafer paper is thinner and more brittle than icing sheets, absorbs moisture more easily, and prints slightly less vivid colour — but it's more economical and needs no transfer step." },
                  { key: 'custom', icon: '✏️', label: 'Custom' }].map((sh) => (
                  <button key={sh.key} title={sh.title} onClick={() => {
                    setShape(sh.key);
                    const newSizes = SIZES[sh.key] || [];
                    if (newSizes.length > 0 && !newSizes.find(sz => sz.id === sizeId)) setSizeId(newSizes[0].id);
                  }} style={{
                    flex: 1, minWidth: 72, padding: '12px 8px', borderRadius: 12,
                    border: shape === sh.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                    background: shape === sh.key ? C.brandLight : C.white,
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <div style={{ fontSize: 20, marginBottom: 2 }}>{sh.icon}</div>
                      {sh.key === 'bwsheet' && (
                        <span style={{ position: 'absolute', top: -6, right: -22, background: C.accent,
                          color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px',
                          borderRadius: 4, lineHeight: 1 }}>$9.99</span>
                      )}
                    </div>
                    {sh.label}
                    {sh.key === 'bwsheet' && <div style={{ fontSize: 10, color: C.muted, fontWeight: 400, marginTop: 1 }}>Economy</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Size */}
            {shape !== 'custom' ? (
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Size</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sizes.map((sz) => {
                    const cookieGrid = sz.circleSize ? getCircleGrid(sz.w, sz.h, sz.circleSize) : null;
                    return (
                      <button key={sz.id} onClick={() => { setSizeId(sz.id); trackGA('select_size', { shape, size_id: sz.id, price: sz.price }); }} style={{
                        flex: 1, minWidth: 90, padding: '14px 10px', borderRadius: 12,
                        border: sizeId === sz.id ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                        background: sizeId === sz.id ? C.brandLight : C.white,
                        cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                        <div style={{ fontWeight: 700, fontSize: 17, color: C.brand }}>{'$' + sz.price.toFixed(2)}</div>
                        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sz.label}</div>
                        {(sz.sublabel || cookieGrid) && <div style={{ fontSize: 12, color: C.brand, fontWeight: 600, marginTop: 3 }}>{sz.sublabel || (cookieGrid.count + ' cookies/sheet')}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Figure</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {CUSTOM_SHAPES.map((cs) => (
                    <button key={cs.key} onClick={() => {
                      setCustomShapeKind(cs.key);
                      // Circle needs W === H to actually be a circle, not an
                      // oval — sync height to width immediately on pick.
                      if (cs.key === 'circle' && customW) setCustomH(customW);
                    }} style={{
                      flex: 1, minWidth: 64, padding: '10px 6px', borderRadius: 10,
                      border: (customShapeKind || 'rectangle') === cs.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                      background: (customShapeKind || 'rectangle') === cs.key ? C.brandLight : C.white,
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                      <div style={{ fontSize: 18, marginBottom: 2 }}>{cs.icon}</div>
                      {cs.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>{customShapeKind === 'circle' ? 'Diameter (inches)' : 'Width (inches)'}</label>
                    <input type="number" value={customW} onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const clamped = isNaN(v) ? '' : String(Math.min(8, v));
                      setCustomW(clamped);
                      if (customShapeKind === 'circle') setCustomH(clamped);
                    }} placeholder="e.g. 5" style={inputStyle} />
                  </div>
                  {customShapeKind !== 'circle' && (
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Height (inches)</label>
                      <input type="number" value={customH} onChange={(e) => { const v = parseFloat(e.target.value); setCustomH(isNaN(v) ? '' : String(Math.min(11, v))); }} placeholder="e.g. 7" style={inputStyle} />
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 0', textAlign: 'center' }}>Max size: 8″ × 11″ (A4 sheet)</p>
              </div>
            )}

            {/* 4. Quantity */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Quantity</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>-</button>
                <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>+</button>
              </div>
            </div>

            {/* 5. Background Fill — the prominent, always-visible control (most
                people use this); Remove White Background is a niche tool
                (logos/text mostly) tucked into "Advanced options" below. */}
            {shape !== 'bwsheet' && (
              <div style={{ borderTop: '1px solid ' + C.border, paddingTop: 12, marginBottom: 16 }}>
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 8 }}>🎨 Background Fill Color</div>
                  <ColorPickerDropdown value={bgColor} onChange={setBgColor} colors={shape === 'bwsheet' ? BW_PALETTE : PALETTE} label="Fill" allowCustom={shape !== 'bwsheet'} />
                </div>

                <details open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)} style={{ marginTop: 14 }}>
                  <summary style={{ fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer',
                    padding: '4px 0', fontFamily: "'Outfit', sans-serif", listStyle: 'none',
                    display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>▸</span> Advanced options
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: removeWhiteBg ? 12 : 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>✂️ Remove white background around my image</span>
                      <button
                        onClick={() => setRemoveWhiteBg(v => !v)}
                        aria-pressed={removeWhiteBg}
                        style={{
                          flexShrink: 0, marginLeft: 10,
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: removeWhiteBg ? C.brand : C.border,
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 3, left: removeWhiteBg ? 23 : 3,
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.2s', display: 'block',
                        }} />
                      </button>
                    </div>
                    {removeWhiteBg && (
                      <div style={{ padding: '8px 10px', background: '#FAFBF9', borderRadius: 6, fontSize: 11.5 }}>
                        <div style={{
                          display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8,
                          padding: '6px 8px', background: '#FEF3C7', borderRadius: 4,
                          color: '#B45309', fontWeight: 600,
                        }}>
                          <span>⚠️</span>
                          <span>Light areas touching the edge of your image may also be removed.</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, color: C.muted }}>
                          <span>Edge tolerance</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {bgProcessing && (
                              <span aria-live="polite" style={{ fontSize: 10, color: C.brand, fontStyle: 'italic' }}>Processing…</span>
                            )}
                            <span style={{ fontWeight: 600, color: C.brand }}>{bgRemoveTolerance}</span>
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="60"
                          step="5"
                          value={bgRemoveTolerance}
                          onChange={(e) => setBgRemoveTolerance(parseInt(e.target.value))}
                          style={{ width: '100%', accentColor: C.brand, cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginTop: 2 }}>
                          <span>Conservative (white only)</span>
                          <span>Aggressive (light colors)</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>
                          Increase only if white areas remain visible
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {/* 6. Add Text — accordion, closed by default */}
            <div style={{ borderTop: '1px solid ' + C.border, marginBottom: 4 }}>
              <button
                onClick={() => setAccordionText(v => !v)}
                aria-expanded={accordionText}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0',
                  fontWeight: 600, fontSize: 14, fontFamily: "'Outfit', sans-serif", color: C.text }}>
                <span>✏️ Add Text <span style={{ fontWeight: 400, color: C.muted, fontSize: 13 }}>(optional)</span></span>
                <span style={{ transition: 'transform 0.2s', transform: accordionText ? 'rotate(180deg)' : 'none', fontSize: 12, color: C.muted }}>▼</span>
              </button>
              {accordionText && (
                <div style={{ paddingBottom: 16 }}>
                  <input
                    value={textOverlay.text}
                    onChange={(e) => setTextOverlay((p) => ({ ...p, text: e.target.value }))}
                    placeholder="Type your message..."
                    style={{ ...inputStyle, marginBottom: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Size</div>
                      <select value={textOverlay.fontSize} onChange={(e) => setTextOverlay((p) => ({ ...p, fontSize: Number(e.target.value) }))} style={{
                        width: '100%', padding: '8px 6px', borderRadius: 8, border: '1.5px solid ' + C.border,
                        fontSize: 14, cursor: 'pointer', background: C.white, color: C.text, fontFamily: "'Outfit', sans-serif",
                      }}>
                        {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 72, 96].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Style</div>
                      <select value={textOverlay.fontStyle} onChange={(e) => setTextOverlay((p) => ({ ...p, fontStyle: e.target.value }))} style={{
                        width: '100%', padding: '8px 6px', borderRadius: 8, border: '1.5px solid ' + C.border,
                        fontSize: 13, cursor: 'pointer', background: C.white, color: C.text,
                      }}>
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="italic">Italic</option>
                        <option value="bold italic">Bold Italic</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Font</div>
                    <select value={textOverlay.fontFamily} onChange={(e) => setTextOverlay((p) => ({ ...p, fontFamily: e.target.value }))} style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border,
                      fontSize: 15, cursor: 'pointer', background: C.white, color: C.text,
                      fontFamily: textOverlay.fontFamily,
                    }}>
                      {[
                        { value: 'Arial', label: 'Arial' },
                        { value: 'Georgia', label: 'Georgia' },
                        { value: 'Impact', label: 'Impact' },
                        { value: 'Comic Sans MS', label: 'Comic Sans MS' },
                        { value: 'Courier New', label: 'Courier New' },
                        { value: 'Brush Script MT', label: 'Brush Script MT' },
                        { value: 'Lobster', label: 'Lobster — Festive Script' },
                        { value: 'Pacifico', label: 'Pacifico — Birthday Style' },
                        { value: 'Dancing Script', label: 'Dancing Script — Elegant Cursive' },
                        { value: 'Great Vibes', label: 'Great Vibes — Wedding Style' },
                        { value: 'Bangers', label: 'Bangers — Comic/Party' },
                        { value: 'Permanent Marker', label: 'Permanent Marker — Handwritten' },
                        { value: 'Fredoka One', label: 'Fredoka One — Round Bold' },
                      ].map(({ value, label }) => (
                        <option key={value} value={value} style={{ fontFamily: value }}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', textAlign: 'center' }}>Drag text in preview to reposition</p>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Text Color</div>
                    <ColorPickerDropdown
                      value={textOverlay.color}
                      onChange={(color) => setTextOverlay((p) => ({ ...p, color }))}
                      colors={shape === 'bwsheet' ? BW_PALETTE : PALETTE}
                      label="Text color"
                      allowCustom={shape !== 'bwsheet'}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 7. Design Responsibility + Order Summary + Buttons */}
            <div style={{
              background: '#FFF8E6', border: '1px solid #F4D06F',
              borderLeft: '4px solid #E8873C', borderRadius: 8,
              padding: '12px 14px', marginTop: 16, marginBottom: 16,
              fontSize: 12.5, lineHeight: 1.5, color: '#5C4A1A',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ Design Responsibility
              </div>
              <div>
                You are responsible for the design choices you make here — image quality, text, colors, positioning and spelling. Your edible print will be produced <strong>exactly as shown in the preview</strong>. Please review your design carefully before placing the order.
              </div>
            </div>
            <div style={{ ...card, marginTop: 4 }}>
              {designs.map((d, i) => {
                const dSizes = SIZES[d.shape] || [];
                const dSel = dSizes.find(sz => sz.id === d.sizeId) || dSizes[0];
                const dPrice = d.shape === 'custom'
                  ? (parseFloat(d.customW || 0) * parseFloat(d.customH || 0) <= 36 ? 14.99 : 19.99)
                  : dSel?.price || 0;
                return (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: d.id === activeDesignId ? 700 : 500,
                    marginBottom: i < designs.length - 1 ? 8 : 0, paddingBottom: i < designs.length - 1 ? 8 : 0,
                    borderBottom: i < designs.length - 1 ? '1px solid ' + C.border : 'none',
                    color: d.id === activeDesignId ? C.text : C.muted }}>
                    <span>Design {i + 1}: {d.qty}x {d.shape === 'custom' ? (d.customW + '"x' + d.customH + '"') : (dSel?.label || d.shape)}</span>
                    <span style={{ color: C.brand }}>{'$' + (dPrice * d.qty).toFixed(2)}</span>
                  </div>
                );
              })}
              {designs.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 10, paddingTop: 10, borderTop: '1.5px solid ' + C.border }}>
                  <span>Subtotal</span>
                  <span style={{ color: C.brand }}>{'$' + designsSubtotal.toFixed(2)}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setStep(1)} style={{ ...btnSecondary, flex: 1 }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ ...btnPrimary, flex: 2 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 3: SHIPPING & PAYMENT */}
        {step === 3 && (designs.length === 0 ? (
          /* Removing the last line from the Order Summary lands here — a
             clear empty state with a way forward, not a shipping form and
             $0.00 totals for a cart that has nothing in it. */
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🛒</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, margin: '0 0 8px', fontWeight: 700 }}>Your cart is empty</h2>
            <p style={{ color: C.muted, marginBottom: 24 }}>You removed every design from this order. Start a new one to continue.</p>
            <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '12px 28px' }}>Start Over</button>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>3</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Shipping & Payment</h2>
              <p style={{ color: C.muted, marginBottom: 24 }}>Where should we ship your edible prints?</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Full Name *</label>
                <input value={form.name} onChange={(e) => updateForm('name', e.target.value)} style={inputStyle} placeholder="Jane Smith" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} style={inputStyle} placeholder="jane@email.com" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} style={inputStyle} placeholder="(519) 555-1234" />
                </div>
              </div>
              {shipping !== 'pickup' && (<>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Street Address *</label>
                <input value={form.address} onChange={(e) => handleAddressChange(e.target.value)} style={inputStyle} placeholder="e.g. 123 Main Street" autoComplete="off" />
              </div>
              <div style={{ maxWidth: 220 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Unit / Suite (optional)</label>
                <input value={form.unit} onChange={(e) => updateForm('unit', e.target.value)} style={inputStyle} placeholder="e.g. 503, Apt 2B" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>City *</label>
                  <input value={form.city} onChange={(e) => updateForm('city', e.target.value)} style={inputStyle} placeholder="Toronto" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Province *</label>
                  <select value={form.province} onChange={(e) => updateForm('province', e.target.value)} style={inputStyle}>
                    {PROVINCES.map((prov) => <option key={prov} value={prov}>{prov}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ maxWidth: 200 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Postal Code *</label>
                <input value={form.postal} onChange={(e) => updateForm('postal', e.target.value.toUpperCase())} style={inputStyle} placeholder="N6A 1B2" maxLength={7} />
              </div>
              <div style={{ background: C.brandLight, border: '1px solid #C6E6D6', borderRadius: 10,
                padding: '10px 16px', fontSize: 13.5, color: C.brandDark, fontWeight: 600 }}>
                📦 {getDeliveryEstimate()}
              </div>
              </>)}
            </div>
            <div style={{ marginTop: 26 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Shipping Method</label>
              {[
                { key: 'pickup', label: 'Free Pickup — London, ON', price: 0, note: "East London, ON. We'll confirm the exact time by email." },
                { key: 'shipping', label: 'Canada Post Shipping — $9.99', price: getShippingCost('shipping'), note: 'Flat rate shipping across Canada via Canada Post — no tracking number included. Approx. 3–5 business days.' },
              ].map((opt) => (
                <label key={opt.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
                  border: shipping === opt.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shipping === opt.key ? C.brandLight : C.white, marginBottom: 8,
                  cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input type="radio" name="shipping" checked={shipping === opt.key} onChange={() => setShipping(opt.key)} style={{ accentColor: C.brand, width: 18, height: 18 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                    {opt.note && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{opt.note}</div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.brand }}>{'$' + opt.price.toFixed(2)}</span>
                </label>
              ))}
            </div>
            <div style={{ ...card, marginTop: 26 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Order Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                {designs.map((d, i) => {
                  const dSizes = SIZES[d.shape] || [];
                  const dSel = dSizes.find(sz => sz.id === d.sizeId) || dSizes[0];
                  const dPrice = d.shape === 'custom'
                    ? (parseFloat(d.customW || 0) * parseFloat(d.customH || 0) <= 36 ? 14.99 : 19.99)
                    : dSel?.price || 0;
                  return (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div>Design {i + 1}: {d.qty}x {d.shape === 'custom' ? (d.customW + '"x' + d.customH + '"') : (dSel?.label || d.shape)}</div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                          <button onClick={() => { setActiveDesignId(d.id); setStep(2); }} className="ep-summary-link">Edit</button>
                          <button onClick={() => handleDeleteDesign(d.id)} className="ep-summary-link">Remove</button>
                        </div>
                      </div>
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>{'$' + (dPrice * d.qty).toFixed(2)}</span>
                    </div>
                  );
                })}
                {designs.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid ' + C.border, paddingTop: 8 }}>
                    <span style={{ color: C.muted }}>Subtotal</span><span style={{ fontWeight: 600 }}>{'$' + designsSubtotal.toFixed(2)}</span>
                  </div>
                )}
                {shipping !== 'pickup' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Shipping</span><span style={{ fontWeight: 600 }}>{'$' + shippingCost.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1.5px solid ' + C.border, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20 }}>
                  <span>Total</span>
                  <span style={{ color: C.brand }}>{'$' + total.toFixed(2)} <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>CAD</span></span>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: C.muted, marginTop: -4 }}>Final price — no tax charged</div>
              </div>
            </div>
            {/* ── Design Confirmation Checkbox ── */}
            <div style={{
              background: '#FFF8E6', border: '1px solid #F4D06F',
              borderLeft: '4px solid #E8873C', borderRadius: 8,
              padding: '14px 16px', marginTop: 20, marginBottom: 16,
              fontSize: 13, lineHeight: 1.55, color: '#5C4A1A',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>⚠️ Design Confirmation Required</div>
              <div style={{ marginBottom: 12 }}>
                By placing this order, I confirm that I have reviewed my design in the preview and take full responsibility for:
                <ul style={{ margin: '8px 0 0 18px', paddingLeft: 0 }}>
                  <li>Image quality and resolution</li>
                  <li>Text spelling, grammar, and content</li>
                  <li>Colors, positioning, and sizing choices</li>
                  <li>Any design elements added (backgrounds, text, etc.)</li>
                </ul>
                <div style={{ marginTop: 8 }}>
                  I understand my edible print will be produced <strong>exactly as shown in the preview</strong>, and <strong>no refunds or reprints</strong> will be issued due to design errors I made.
                </div>
              </div>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '10px 12px', background: 'white', borderRadius: 6,
                border: '2px solid ' + (acceptedDesign ? C.brand : '#F4D06F'), marginTop: 6,
              }}>
                <input type="checkbox" checked={acceptedDesign}
                  onChange={(e) => setAcceptedDesign(e.target.checked)}
                  style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer', accentColor: C.brand }} />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                  I have reviewed my design and accept responsibility for all design choices. I understand my order will be printed as shown in the preview.
                </span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={() => setStep(2)} style={{ ...btnSecondary, flex: 1 }}>← Back</button>
              <button onClick={handlePlaceOrder} disabled={loading || !acceptedDesign}
                style={{ ...btnPrimary, flex: 2, opacity: (loading || !acceptedDesign) ? 0.5 : 1, cursor: (loading || !acceptedDesign) ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Redirecting to payment...' : 'Place Order →'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 14 }}>
              🔒 Payment processed securely via Stripe
            </p>
          </div>
        ))}
      </div>

      {/* ── Email modal for paid PDF download ── */}
      {showEmailModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowEmailModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '32px 28px',
            maxWidth: 420, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            fontFamily: "'Outfit', sans-serif",
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, color: C.brand }}>Download PDF</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: C.muted }}>
              Enter your email to receive your receipt and access your file after payment.
            </p>
            <input
              type="email"
              placeholder="your@email.com"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #D1D5DB', fontSize: 14,
                marginBottom: 16, outline: 'none', fontFamily: "'Outfit', sans-serif",
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEmailModal(false)}
                style={{ ...btnSecondary, flex: 1 }}
              >Cancel</button>
              <button
                onClick={() => { setShowEmailModal(false); handleDownloadPdfAsCustomer(); }}
                disabled={!customerEmail.includes('@') || downloadingPdf}
                style={{
                  ...btnPrimary, flex: 2,
                  background: '#E8873C',
                  opacity: (!customerEmail.includes('@') || downloadingPdf) ? 0.5 : 1,
                  cursor: (!customerEmail.includes('@') || downloadingPdf) ? 'not-allowed' : 'pointer',
                }}
              >
                {downloadingPdf ? 'Preparing…' : 'Continue to Stripe →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

