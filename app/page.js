'use client';

import { useState, useRef, useEffect } from 'react';
import './globals.css';

/* ═══ PRICING CONFIG ═══ */
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
    { id: 'mc125', label: '1.25” Circles on A4 Sheet', sublabel: '40 mini cookies/sheet', w: 8, h: 11, price: 19.99, circleSize: 1.25, cols: 5, rows: 8,  gap: 0.10 },
    { id: 'mc2',   label: '2” Circles on A4 Sheet',   sublabel: '15 cookies/sheet',      w: 8, h: 11, price: 19.99, circleSize: 2,    cols: 3, rows: 5,  gap: 0.15 },
    { id: 'mc3',   label: '3” Circles on A4 Sheet',   sublabel: '6 cookies/sheet',       w: 8, h: 11, price: 19.99, circleSize: 3,    cols: 2, rows: 3,  gap: 0.20 },
  ],
  square: [
    { id: 's5', label: '5"×5" (13cm)', w: 5, h: 5, price: 14.99 },
    { id: 's6', label: '6"×6" (15cm)', w: 6, h: 6, price: 14.99 },
    { id: 's7', label: '7"×7" (18cm)', w: 7, h: 7, price: 19.99 },
    { id: 's8', label: '8"×8" (20cm)', w: 8, h: 8, price: 19.99 },
  ],
  fullsheet: [
    { id: 'a4', label: 'A4 Full Sheet (8"×11" / 20×28cm)', w: 8, h: 11, price: 19.99 },
  ],
  bwsheet: [
    { id: 'bw1', label: '6.5"×6.5" B&W Square', sublabel: 'Centered on A4 sheet', w: 8, h: 11, printW: 6.5, printH: 6.5, price: 9.99, grayscale: true },
  ],
  custom: [{ id: 'custom', label: 'Custom Size', w: 0, h: 0, price: 0 }],
};

/* ═══ SHIPPING & DELIVERY ZONES ═══ */
const SHIPPING = { standard: 9.99, express: 19.99 };
const LOCAL_ZONES = {
  south:   { name: 'South London',   price: 6.99, fsas: ['N5Z','N6E','N6J','N6L','N6M','N6N','N6P'] },
  central: { name: 'Central London', price: 7,    fsas: ['N6A','N6B','N6C'] },
  east:    { name: 'East London',    price: 8,    fsas: ['N5V','N5W'] },
  west:    { name: 'West London',    price: 8,    fsas: ['N5P','N6G','N6H','N6K'] },
  north:   { name: 'North London',   price: 10,   fsas: ['N5X','N5Y'] },
};

function getLocalZone(postalCode) {
  if (!postalCode) return null;
  const fsa = postalCode.replace(/\s/g, '').toUpperCase().slice(0, 3);
  for (const [key, zone] of Object.entries(LOCAL_ZONES)) {
    if (zone.fsas.includes(fsa)) return { key, ...zone };
  }
  return null;
}

function getDeliveryEstimate(province, postal) {
  if (postal && getLocalZone(postal)) return 'Same-day or next-day delivery (London, ON)';
  if (province === 'Ontario') return '2–3 business days';
  if (province === 'Quebec' || province === 'Manitoba') return '3–4 business days';
  if (province === 'Alberta' || province === 'Saskatchewan' || province === 'British Columbia') return '4–6 business days';
  if (province === 'New Brunswick' || province === 'Nova Scotia' || province === 'Prince Edward Island' || province === 'Newfoundland and Labrador') return '4–7 business days';
  if (province === 'Yukon' || province === 'Northwest Territories' || province === 'Nunavut') return '6–11 business days';
  return 'Typically 2–5 business days across Canada';
}

function trackGA(event, params) {
  if (typeof window !== 'undefined' && window.gtag) window.gtag('event', event, params || {});
}
function trackMeta(event, params) {
  if (typeof window !== 'undefined' && window.fbq) window.fbq('track', event, params || {});
}

const TAX_RATE = 0.13;

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
const stepBadge = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, borderRadius: '50%', background: C.brand,
  color: '#fff', fontWeight: 700, fontSize: 15,
};
const card = {
  background: C.white, borderRadius: 14, padding: 20,
  boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid ' + C.border,
};

/* ═══ LOGO ═══ */
function Logo({ size = 28 }) {
  return (
    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: size, fontWeight: 700, letterSpacing: -0.5 }}>
      <span style={{ color: C.brand }}>edible</span>
      <span style={{ color: C.text }}>print</span>
      <span style={{ fontSize: size * 0.42, color: C.muted, fontWeight: 400, marginLeft: 5, fontFamily: "'Outfit', sans-serif" }}>.net</span>
    </span>
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
function drawHeartPath(ctx, x, y, width, height) {
  ctx.beginPath();
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
  } else if (shape === 'multicircle' || shape === 'fullsheet' || shape === 'bwsheet') {
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

function drawShapeShadow(ctx, shape, canvasW, canvasH, isMobile) {
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
    const sq = canvasW * (6.5 / 8);
    ctx.fillRect((canvasW - sq) / 2, (canvasH - sq) / 2, sq, sq);
  } else {
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
  ctx.restore();
}

async function removeWhiteBackground(img, tolerance = 30) {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const w = img.width;
  const h = img.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const visited = new Uint8Array(w * h);

  function isWhiteish(idx) {
    return Math.min(data[idx], data[idx + 1], data[idx + 2]) >= 255 - tolerance;
  }

  const queue = [];
  for (let x = 0; x < w; x++) { queue.push(x, 0); queue.push(x, h - 1); }
  for (let y = 0; y < h; y++) { queue.push(0, y); queue.push(w - 1, y); }

  while (queue.length > 0) {
    const y = queue.pop();
    const x = queue.pop();
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const pixelIdx = y * w + x;
    if (visited[pixelIdx]) continue;
    const dataIdx = pixelIdx * 4;
    if (!isWhiteish(dataIdx)) continue;
    visited[pixelIdx] = 1;
    data[dataIdx + 3] = 0;
    queue.push(x + 1, y); queue.push(x - 1, y);
    queue.push(x, y + 1); queue.push(x, y - 1);
  }

  /* Anti-aliasing pass on border pixels */
  const dataCopy = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (dataCopy[idx + 3] === 0 || dataCopy[idx + 3] < 255) continue;
      let transparentNeighbors = 0;
      for (const off of [-4, 4, -w * 4, w * 4]) {
        if (dataCopy[idx + off + 3] === 0) transparentNeighbors++;
      }
      if (transparentNeighbors >= 2) {
        const minCh = Math.min(data[idx], data[idx + 1], data[idx + 2]);
        const edge = 255 - tolerance - 20;
        if (minCh >= edge) {
          const fade = (minCh - edge) / 20;
          data[idx + 3] = Math.round(255 * (1 - Math.min(1, fade)));
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve) => {
    const newImg = new Image();
    newImg.onload = () => resolve(newImg);
    newImg.src = off.toDataURL('image/png');
  });
}

function ImageEditor({ layers, onLayersChange, shape, sizeObj, onCrop, onHiResCrop, bgColor = '#FFFFFF', textOverlay = null, onTextPositionChange, removeWhiteBg = false, bgRemoveTolerance = 30, sizeLabel = '', isMobile = false }) {
  const canvasRef = useRef(null);
  const hiResCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const imgRefs = useRef({});
  const processedImgRefs = useRef({});
  const addLayerFileRef = useRef(null);
  const onLayersChangeRef = useRef(onLayersChange);
  onLayersChangeRef.current = onLayersChange;

  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragLayerId, setDragLayerId] = useState(null);
  const [dragStart, setDragStart] = useState({ clientX: 0, clientY: 0, layerX: 0, layerY: 0 });
  const [textDragging, setTextDragging] = useState(false);
  const textDragOffset = useRef({ dx: 0, dy: 0 });
  const activePointers = useRef(new Map());
  const pinchStateRef = useRef(null);
  const [redrawTick, setRedrawTick] = useState(0);
  const [canvasW, setCanvasW] = useState(360);
  const [canvasH, setCanvasH] = useState(360);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  );

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

  /* Multi-circle layout */
  const isMultiCircle = shape === 'multicircle';
  const isBWSheet = shape === 'bwsheet';
  const circleSize = sizeObj.circleSize || 2;
  const mcGapInches = isMultiCircle ? (sizeObj.gap ?? MC_GAP) : 0;
  const previewPPI = canvasW / (sizeObj.w || 8);
  const circlePx = isMultiCircle ? Math.round(circleSize * previewPPI) : canvasW;
  const { cols: mcCols, rows: mcRows } = isMultiCircle
    ? (sizeObj.cols && sizeObj.rows
        ? { cols: sizeObj.cols, rows: sizeObj.rows }
        : getCircleGrid(sizeObj.w || 8, sizeObj.h || 11, circleSize))
    : { cols: 1, rows: 1 };
  const mcGapPx  = isMultiCircle ? mcGapInches * previewPPI : 0;
  const mcStepPx = circlePx + mcGapPx;
  const mcTotalW  = isMultiCircle ? mcCols * circlePx + Math.max(0, mcCols - 1) * mcGapPx : 0;
  const mcTotalH  = isMultiCircle ? mcRows * circlePx + Math.max(0, mcRows - 1) * mcGapPx : 0;
  const mcOffsetX = isMultiCircle ? (canvasW - mcTotalW) / 2 : 0;
  const mcOffsetY = isMultiCircle ? (canvasH - mcTotalH) / 2 : 0;

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
      const sc = Math.max(effW / img.width, effH / img.height);
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
      const sc = Math.max(effW / img.width, effH / img.height);
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
          const coverSc = Math.max(effW / img.width, effH / img.height);
          onLayersChangeRef.current(prev => prev.map(l =>
            l.id === layer.id ? { ...l, x: (effW - img.width * coverSc) / 2, y: (effH - img.height * coverSc) / 2, scale: coverSc, _autoFit: false } : l
          ));
        }
        return;
      }
      const img = new Image();
      img.onload = async () => {
        imgRefs.current[layer.id] = img;
        if (removeWhiteBg) {
          processedImgRefs.current[layer.id] = await removeWhiteBackground(img, bgRemoveTolerance);
        }
        const effW = isMultiCircle ? circlePx : canvasW;
        const effH = isMultiCircle ? circlePx : canvasH;
        const coverSc = Math.max(effW / img.width, effH / img.height);
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
    Object.keys(processedImgRefs.current).forEach(id => { if (!ids.has(id)) delete processedImgRefs.current[id]; });
  }, [layers]);

  /* Re-process all loaded images when removeWhiteBg or tolerance changes */
  useEffect(() => {
    let cancelled = false;
    const process = async () => {
      const ids = Object.keys(imgRefs.current);
      if (removeWhiteBg) {
        await Promise.all(ids.map(async id => {
          try {
            const processed = await removeWhiteBackground(imgRefs.current[id], bgRemoveTolerance);
            if (!cancelled) processedImgRefs.current[id] = processed;
          } catch (e) {
            if (!cancelled) delete processedImgRefs.current[id];
          }
        }));
      } else {
        processedImgRefs.current = {};
      }
      if (!cancelled) setRedrawTick(t => t + 1);
    };
    process();
    return () => { cancelled = true; };
  }, [removeWhiteBg, bgRemoveTolerance]);

  const getImg = (id) => (removeWhiteBg && processedImgRefs.current[id]) ? processedImgRefs.current[id] : imgRefs.current[id];

  /* Draw canvases */
  useEffect(() => {
    const canvas = canvasRef.current;
    const hiResCanvas = hiResCanvasRef.current;
    if (!canvas || !hiResCanvas) return;

    /* ── Preview canvas ── */
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);
    drawShapeShadow(ctx, shape, canvasW, canvasH, isMobile);

    if (isBWSheet) {
      const squareSize = canvasW * (6.5 / 8);
      const sqX = (canvasW - squareSize) / 2;
      const sqY = (canvasH - squareSize) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sqX, sqY, squareSize, squareSize);
      ctx.clip();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);
      if (bgColor && bgColor !== 'transparent') {
        ctx.filter = 'grayscale(100%)';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.filter = 'none';
      }
      layers.forEach(layer => {
        const img = getImg(layer.id);
        if (!img) return;
        ctx.save();
        ctx.filter = 'grayscale(100%)';
        const imgW = img.width * layer.scale;
        const imgH = img.height * layer.scale;
        if (layer.rotation !== 0) {
          ctx.translate(layer.x + imgW / 2, layer.y + imgH / 2);
          ctx.rotate(layer.rotation * Math.PI / 180);
          ctx.translate(-(layer.x + imgW / 2), -(layer.y + imgH / 2));
        }
        ctx.drawImage(img, layer.x, layer.y, imgW, imgH);
        ctx.filter = 'none';
        ctx.restore();
      });
      if (textOverlay?.text) {
        ctx.filter = 'grayscale(100%)';
        drawText(ctx, textOverlay, canvasW, canvasH);
        ctx.filter = 'none';
      }
      ctx.restore();
      ctx.beginPath();
      ctx.rect(sqX, sqY, squareSize, squareSize);
      ctx.strokeStyle = '#C8C8C8';
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isMultiCircle) {
      /* Build a single source-crop canvas (what the user sees) then tile it */
      const sc = document.createElement('canvas');
      sc.width = circlePx; sc.height = circlePx;
      const sctx = sc.getContext('2d');
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
      layers.forEach(layer => {
        const img = getImg(layer.id);
        if (!img) return;
        sctx.save();
        const iw = img.width * layer.scale;
        const ih = img.height * layer.scale;
        if (layer.rotation !== 0) {
          sctx.translate(layer.x + iw / 2, layer.y + ih / 2);
          sctx.rotate(layer.rotation * Math.PI / 180);
          sctx.translate(-(layer.x + iw / 2), -(layer.y + ih / 2));
        }
        sctx.drawImage(img, layer.x, layer.y, iw, ih);
        sctx.restore();
      });
      sctx.restore();
      drawText(sctx, textOverlay, circlePx, circlePx);
      /* Tile source crop into the grid */
      for (let row = 0; row < mcRows; row++) {
        for (let col = 0; col < mcCols; col++) {
          const ox = mcOffsetX + col * mcStepPx;
          const oy = mcOffsetY + row * mcStepPx;
          ctx.drawImage(sc, ox, oy, circlePx, circlePx);
        }
      }
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
    } else {
      ctx.save();
      if (shape === 'circular') {
        ctx.beginPath();
        ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2, 0, Math.PI * 2);
        ctx.clip();
      } else if (shape === 'heart') {
        drawHeartPath(ctx, 0, 0, canvasW, canvasH);
        ctx.clip();
      } else {
        ctx.beginPath();
        ctx.rect(0, 0, canvasW, canvasH);
        ctx.clip();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);
      if (bgColor && bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
      layers.forEach(layer => {
        const img = getImg(layer.id);
        if (!img) return;
        ctx.save();
        const imgW = img.width * layer.scale;
        const imgH = img.height * layer.scale;
        if (layer.rotation !== 0) {
          ctx.translate(layer.x + imgW / 2, layer.y + imgH / 2);
          ctx.rotate(layer.rotation * Math.PI / 180);
          ctx.translate(-(layer.x + imgW / 2), -(layer.y + imgH / 2));
        }
        ctx.drawImage(img, layer.x, layer.y, imgW, imgH);
        ctx.restore();
      });
      drawText(ctx, textOverlay, canvasW, canvasH);
      ctx.restore();
      /* Selection outline for active layer */
      if (effectiveSelectedId) {
        const sel = layers.find(l => l.id === effectiveSelectedId);
        const selImg = sel ? imgRefs.current[sel.id] : null;
        if (sel && selImg) {
          ctx.save();
          ctx.strokeStyle = '#22C55E';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.strokeRect(sel.x - 1, sel.y - 1, selImg.width * sel.scale + 2, selImg.height * sel.scale + 2);
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
      ctx.strokeStyle = '#C8C8C8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      if (shape === 'circular') {
        ctx.beginPath();
        ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape === 'heart') {
        drawHeartPath(ctx, 1, 1, canvasW - 2, canvasH - 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);
      }
      ctx.setLineDash([]);
    }

    /* Watermark — preview only, never in hi-res */
    drawWatermark(ctx, canvasW, canvasH);

    if (onCrop) onCrop(canvas.toDataURL());

    /* ── Hi-res canvas ── */
    hiResCanvas.width = hiResW;
    hiResCanvas.height = hiResH;
    const hctx = hiResCanvas.getContext('2d');
    hctx.clearRect(0, 0, hiResW, hiResH);
    hctx.fillStyle = '#FFFFFF';
    hctx.fillRect(0, 0, hiResW, hiResH);

    if (isBWSheet) {
      const hrSquarePx = Math.round(6.5 * DPI);
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
        const img = getImg(layer.id);
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
      const hrCirclePx = circleSize * DPI;
      const hrSf       = hrCirclePx / circlePx; /* preview→hi-res scale for this circle */
      const hrGapPx    = mcGapInches * DPI;
      const hrStepPx   = hrCirclePx + hrGapPx;
      const hrTotalW   = mcCols * hrCirclePx + Math.max(0, mcCols - 1) * hrGapPx;
      const hrTotalH   = mcRows * hrCirclePx + Math.max(0, mcRows - 1) * hrGapPx;
      const hrOffsetX  = (hiResW - hrTotalW) / 2;
      const hrOffsetY  = (hiResH - hrTotalH) / 2;
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
        const img = getImg(layer.id);
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
        const img = getImg(layer.id);
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
      }
      hctx.setLineDash([]);
    }

    if (onHiResCrop) onHiResCrop(hiResCanvas.toDataURL('image/jpeg', 0.95));
  }, [layers, redrawTick, effectiveSelectedId, shape, hiResW, hiResH, scaleFactor, bgColor, textOverlay, isMultiCircle, isBWSheet, circlePx, mcCols, mcRows, mcOffsetX, mcOffsetY, mcStepPx, circleSize, canvasW, canvasH]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* Pinch-to-zoom: 2 simultaneous pointers */
    if (activePointers.current.size >= 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const selLayer = layers.find(l => l.id === effectiveSelectedId);
      pinchStateRef.current = {
        initialDist: dist,
        initialScale: selLayer?.scale ?? 1,
        layerId: effectiveSelectedId,
      };
      setDragging(false);
      setDragLayerId(null);
      setTextDragging(false);
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
      const { initialDist, initialScale, layerId } = pinchStateRef.current;
      const selImg = layerId ? imgRefs.current[layerId] : null;
      const mn = selImg ? Math.max(20 / selImg.width, 20 / selImg.height) : 0.05;
      const mx = selImg ? Math.max(canvasW * 4 / selImg.width, canvasH * 4 / selImg.height) : 8;
      const newScale = Math.min(mx, Math.max(mn, initialScale * (dist / initialDist)));
      if (layerId) {
        onLayersChangeRef.current(prev => prev.map(l =>
          l.id === layerId ? { ...l, scale: newScale } : l
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
        <canvas ref={canvasRef} width={canvasW} height={canvasH}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
          style={{ cursor: textDragging ? 'move' : dragging ? 'grabbing' : 'grab', touchAction: 'none',
            maxWidth: '100%', display: 'block',
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
              const ratio = newScale / (selectedLayer.scale || newScale);
              const cx = canvasW / 2, cy = canvasH / 2;
              updateSelectedLayer({ scale: newScale, x: cx - ratio * (cx - selectedLayer.x), y: cy - ratio * (cy - selectedLayer.y) });
            }}
            disabled={!effectiveSelectedId}
            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.border, background: C.white,
              cursor: effectiveSelectedId ? 'pointer' : 'default', fontSize: 15, fontWeight: 700,
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: effectiveSelectedId ? 1 : 0.4, fontFamily: "'Outfit', sans-serif" }}>−</button>
          <input type="range" min={minScale} max={maxScale} step={0.001} value={currentScale}
            onChange={(e) => {
              const newScale = parseFloat(e.target.value);
              if (!effectiveSelectedId || !selectedLayer) return;
              const ratio = newScale / (selectedLayer.scale || newScale);
              const cx = canvasW / 2, cy = canvasH / 2;
              updateSelectedLayer({ scale: newScale, x: cx - ratio * (cx - selectedLayer.x), y: cy - ratio * (cy - selectedLayer.y) });
            }}
            disabled={!effectiveSelectedId}
            style={{ flex: 1, accentColor: C.brand, cursor: effectiveSelectedId ? 'pointer' : 'default' }} />
          <button
            onClick={() => {
              if (!effectiveSelectedId || !selectedLayer) return;
              const newScale = Math.min(maxScale, currentScale + (maxScale - minScale) / 10);
              const ratio = newScale / (selectedLayer.scale || newScale);
              const cx = canvasW / 2, cy = canvasH / 2;
              updateSelectedLayer({ scale: newScale, x: cx - ratio * (cx - selectedLayer.x), y: cy - ratio * (cy - selectedLayer.y) });
            }}
            disabled={!effectiveSelectedId}
            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid ' + C.border, background: C.white,
              cursor: effectiveSelectedId ? 'pointer' : 'default', fontSize: 15, fontWeight: 700,
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: effectiveSelectedId ? 1 : 0.4, fontFamily: "'Outfit', sans-serif" }}>+</button>
          <span style={{ fontSize: 10.5, color: C.muted, minWidth: 36, textAlign: 'right', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
            {Math.round(currentScale * 100)}%
          </span>
        </div>
        {/* Rotation row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: C.muted, minWidth: 28, textAlign: 'right', fontFamily: "'Outfit', sans-serif" }}>−180°</span>
          <input type="range" min={-180} max={180} step={1} value={currentRotation}
            onChange={(e) => updateSelectedLayer({ rotation: parseInt(e.target.value) })}
            disabled={!effectiveSelectedId}
            style={{ flex: 1, accentColor: C.brand, cursor: effectiveSelectedId ? 'pointer' : 'default' }} />
          <span style={{ fontSize: 10, color: C.muted, minWidth: 28, fontFamily: "'Outfit', sans-serif" }}>+180°</span>
          <span style={{ fontSize: 10.5, color: C.muted, minWidth: 36, textAlign: 'right', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
            {currentRotation}°
          </span>
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
  const [designs, setDesigns] = useState([]);
  const [activeDesignId, setActiveDesignId] = useState(null);
  const [shipping, setShipping] = useState('standard');
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
  const addressRef = useRef(null);
  const autocompleteRef = useRef(null);

  /* Active design aliases */
  const activeDesign = designs.find(d => d.id === activeDesignId) ?? designs[0] ?? null;
  const layers      = activeDesign?.layers      ?? [];
  const shape       = activeDesign?.shape       ?? 'circular';
  const sizeId      = activeDesign?.sizeId      ?? 'c8';
  const customW     = activeDesign?.customW     ?? '';
  const customH     = activeDesign?.customH     ?? '';
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
  const setLayers      = (v) => updateActive({ layers: typeof v === 'function' ? v(layers) : v });
  const setShape       = (v) => updateActive({ shape: v });
  const setSizeId      = (v) => updateActive({ sizeId: v });
  const setCustomW     = (v) => updateActive({ customW: v });
  const setCustomH     = (v) => updateActive({ customH: v });
  const setQty         = (v) => updateActive({ qty: v });
  const setNotes       = (v) => updateActive({ notes: v });
  const setBgColor     = (v) => updateActive({ bgColor: v });
  const setTextOverlay = (v) => updateActive({ textOverlay: typeof v === 'function' ? v(textOverlay) : v });
  const setCropPreview = (v) => updateActive({ cropPreview: v });
  const setHiResCrop   = (v) => updateActive({ hiResCrop: v });

  const sizes = SIZES[shape] || [];
  const selectedSize = sizes.find((sz) => sz.id === sizeId) || sizes[0];
  const unitPrice = shape === 'custom'
    ? (parseFloat(customW || 0) * parseFloat(customH || 0) <= 36 ? 14.99 : 19.99)
    : selectedSize?.price || 0;
  const subtotal = unitPrice * qty;

  const sizeLabel = shape === 'fullsheet' ? 'FULL SHEET 8" × 11"'
    : shape === 'bwsheet' ? 'B&W 6.5" × 6.5"'
    : shape === 'custom' ? `${customW || '?'}" × ${customH || '?'}"`
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

  const localZone = getLocalZone(form.postal);
  const shippingCost = shipping === 'local' ? (localZone?.price || 0) : shipping === 'pickup' ? 0 : (SHIPPING[shipping] || 0);
  const tax = (designsSubtotal + shippingCost) * TAX_RATE;
  const total = designsSubtotal + shippingCost + tax;

  useEffect(() => {
    if (shipping === 'local' && form.postal && !getLocalZone(form.postal)) {
      setShipping('standard');
    }
  }, [form.postal]);

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

  useEffect(() => {
    if (step !== 3 || !addressRef.current || autocompleteRef.current) return;
    const checkGoogle = setInterval(() => {
      if (window.google?.maps?.places) {
        clearInterval(checkGoogle);
        const ac = new window.google.maps.places.Autocomplete(addressRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'ca' },
          fields: ['address_components', 'formatted_address'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place.address_components) return;
          let street = '', city = '', province = '', postal = '';
          for (const comp of place.address_components) {
            const t = comp.types;
            if (t.includes('street_number')) street = comp.long_name + ' ';
            if (t.includes('route')) street += comp.long_name;
            if (t.includes('locality')) city = comp.long_name;
            if (t.includes('administrative_area_level_1')) province = comp.long_name;
            if (t.includes('postal_code')) postal = comp.short_name;
          }
          setForm((prev) => ({
            ...prev,
            address: street.trim(),
            city: city || prev.city,
            province: province || prev.province,
            postal: postal || prev.postal,
          }));
        });
        autocompleteRef.current = ac;
      }
    }, 200);
    return () => { clearInterval(checkGoogle); autocompleteRef.current = null; };
  }, [step]);

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

  const [removeWhiteBg, setRemoveWhiteBg] = useState(true);
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
  const [bgRemoveTolerance, setBgRemoveTolerance] = useState(30);

  /* ── Accordion state for Step 2 ── */
  const [accordionBg, setAccordionBg] = useState(true);
  const [accordionText, setAccordionText] = useState(true);
  const accordionInited = useRef(false);
  useEffect(() => {
    if (isMobile && !accordionInited.current) {
      accordionInited.current = true;
      setAccordionBg(false);
      setAccordionText(false);
    }
  }, [isMobile]);
  const toggleAccordion = (name) => {
    const nb = name === 'bg' ? !accordionBg : (isMobile ? false : accordionBg);
    const nt = name === 'text' ? !accordionText : (isMobile ? false : accordionText);
    setAccordionBg(nb); setAccordionText(nt);
  };

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
        body: JSON.stringify({ imageDataUrl: hiResDataUrl, shape, sizeInches: sizeW, customW, customH, paymentVerified: false }),
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
        body: JSON.stringify({ imageDataUrl: hiResDataUrl, shape, sizeInches: sizeW, customW, customH, email: customerEmail }),
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
        let imageUrl = '';
        const imageToUpload = d.hiResCrop || d.cropPreview || d.layers?.[0]?.src;
        if (imageToUpload) {
          const uploadRes = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData: imageToUpload, fileName: d.imageName }),
          });
          const uploadData = await uploadRes.json();
          if (uploadData.url) imageUrl = uploadData.url;
        }
        return { ...d, uploadedImageUrl: imageUrl };
      }));
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
            return {
              shape: d.shape,
              size: d.shape === 'custom' ? d.customW + '"x' + d.customH + '"' : (dSel?.label || ''),
              quantity: d.qty,
              unitPrice: dPrice,
              imageUrl: d.uploadedImageUrl || '',
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
      alert('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* HOME PAGE */
  if (step === 0) {
    const stepColors = ['#E8F5EE', '#FFF4EB', '#EEF2FF', '#FFF9E6'];
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px',
          borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
          <Logo />
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14, borderRadius: 10 }}>
            Order Now
          </button>
        </nav>
        <section style={{ padding: '60px 24px 52px', textAlign: 'center', maxWidth: 740, margin: '0 auto',
          background: 'linear-gradient(180deg, #E8F5EE 0%, #FAFBF9 100%)', borderRadius: '0 0 40px 40px' }}>
          <div style={{ display: 'inline-block', background: 'rgba(27,107,74,0.12)', color: C.brand,
            borderRadius: 24, padding: '7px 18px', fontSize: 13, fontWeight: 600, marginBottom: 22 }}>
            🇨🇦 Free Local Pickup · Same-Day London Delivery · Canada-Wide Shipping
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px, 7vw, 62px)',
            lineHeight: 1.08, margin: '0 0 20px', fontWeight: 700, letterSpacing: -1 }}>
            Turn Any Photo Into an<br />
            <span style={{ color: C.brand }}>Edible Masterpiece</span>
          </h1>
          <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, margin: '0 auto 28px', maxWidth: 500 }}>
            Custom printed on premium edible sheets. Perfect for cakes, cookies &amp; celebrations.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.white,
            border: '1px solid ' + C.border, borderRadius: 40, padding: '8px 18px',
            fontSize: 13.5, fontWeight: 600, marginBottom: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <span style={{ color: '#FBBF24', letterSpacing: 1 }}>★★★★★</span>
            <span style={{ color: C.text }}>Trusted by 200+ happy customers across Canada</span>
          </div>
          <div>
            <button onClick={() => setStep(1)} style={{ ...btnPrimary, fontSize: 20, padding: '20px 52px',
              borderRadius: 16, boxShadow: '0 8px 28px rgba(27,107,74,0.35)', letterSpacing: 0.3 }}>
              Upload Your Photo Now →
            </button>
          </div>
          {cutoffMsg && (
            <div style={{
              display: 'inline-block', borderRadius: 10, padding: '8px 20px', marginTop: 14,
              fontSize: 13.5, fontWeight: 600,
              background: cutoffMsg.green ? '#ECFDF5' : '#FFF4EB',
              border: '1px solid ' + (cutoffMsg.green ? '#6EE7B7' : '#FDDBB6'),
              color: cutoffMsg.green ? '#065F46' : '#B45309',
            }}>
              {cutoffMsg.green ? '🟢' : '🟡'} {cutoffMsg.text}
            </div>
          )}
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 12 }}>No account needed · Takes under 2 minutes</p>
        </section>
        <div style={{ background: C.white, borderTop: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap', maxWidth: 760, margin: '0 auto' }}>
            {[
              { icon: '🖨️', title: '300 DPI Print Quality', sub: 'Crystal-clear results' },
              { icon: '🍰', title: '100% Food-Safe', sub: 'FDA-approved inks & sheets' },
              { icon: '🚚', title: 'Ships in 1–2 Days', sub: 'Same-day local delivery' },
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
        </div>
        {/* ── DELIVERY TIMES BAR ── */}
        <div style={{ background: C.brandLight, borderBottom: '1px solid #C6E6D6', padding: '12px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 32px', fontSize: 13.5, fontWeight: 600, color: C.brandDark }}>
            <span>📦 Production: 1–2 business days</span>
            <span style={{ color: '#C6E6D6' }}>|</span>
            <span>🚚 Canada-wide shipping: 2–5 days</span>
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
        <section style={{ padding: '52px 24px', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, marginBottom: 8, fontWeight: 700 }}>Simple, Transparent Pricing</h2>
          <p style={{ color: C.muted, marginBottom: 8, fontSize: 15 }}>Premium edible paper + food-safe inks included in every order.</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.brand, marginBottom: 28 }}>Starting at <strong>$14.99</strong></p>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 0, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28, borderBottom: '2px solid ' + C.border }}>
            {[
              { key: 'circular', label: 'Round' },
              { key: 'heart', label: 'Heart' },
              { key: 'square', label: 'Square' },
              { key: 'multicircle', label: 'Cookie Sheets' },
              { key: 'fullsheet', label: 'Full Sheet' },
              { key: 'bwsheet', label: 'B&W Sheet' },
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
              const descriptions = {
                c5: 'Perfect for cupcakes', c6: 'Great for small cakes',
                c7: 'Popular choice for cakes', c8: 'Most popular — birthday cakes',
                h6: 'Romantic touch for cupcakes', h7: 'Perfect for occasion cakes', h8: 'Statement piece for celebrations',
                s5: 'Great for brownies & cookies', s6: 'Ideal for square cakes',
                s7: 'Perfect for layer cakes', s8: 'Large format prints',
                mc125: '40 mini cookies per sheet',
                mc2: '15 cookies per sheet',
                mc3: '6 large cookies per sheet',
                a4: 'Covers the full 8″×11″ sheet',
                bw1: 'Economy grayscale — text, logos & portraits',
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
                  <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 10 }}>🚀 Ships in 1–2 business days</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isHovered ? C.brand : C.muted, opacity: isHovered ? 1 : 0.6 }}>Order this size →</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 20 }}>Custom sizes available · Free local pickup · Shipping from $6.99 · HST calculated at checkout</p>
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
              Or order a printed edible print for $14.99+ above
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
                Every edible print is produced with <strong>300 DPI resolution</strong>, <strong>FDA-approved food-safe inks</strong>, and <strong>premium icing sheets</strong> that lay flat and taste great.
                If your order arrives damaged or the print quality doesn't meet your expectations, we'll reprint or refund — no questions asked.
              </p>
              <ul style={{ margin: '0 0 20px', padding: '0 0 0 20px', fontSize: 14.5, lineHeight: 1.85, color: C.text }}>
                <li>We review every image before printing — we'll flag quality issues</li>
                <li>Reprints sent within 24 hours for any production error</li>
                <li>Arrives in protective packaging to prevent damage in transit</li>
                <li>Every batch is taste-tested for colour accuracy</li>
              </ul>
              <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '13px 30px', fontSize: 15, borderRadius: 12 }}>
                Order with Confidence →
              </button>
            </div>
          </div>
        </section>

        {/* ── CUSTOMER GALLERY ── */}
        <section style={{ padding: '52px 24px', maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>Real Customer Prints</h2>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: 32, fontSize: 15 }}>Fresh from our printer — loved by customers across Canada</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Birthday Cake Topper', emoji: '🎂' },
              { label: 'Cookie Sheet Print', emoji: '🍪' },
              { label: 'Heart-Shape Cake', emoji: '❤️' },
              { label: 'Corporate Logo Print', emoji: '🏢' },
              { label: 'Baby Shower Cupcakes', emoji: '👶' },
              { label: 'Wedding Cake Topper', emoji: '💍' },
            ].map((item, i) => (
              <div key={i} style={{ aspectRatio: '1', background: 'linear-gradient(135deg, #E8F5EE 0%, #C6E6D6 100%)',
                borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, border: '1px solid #C6E6D6', cursor: 'default' }}>
                <span style={{ fontSize: 40 }}>{item.emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textAlign: 'center', padding: '0 12px' }}>{item.label}</span>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#bbb', marginTop: 16 }}>📸 Gallery photos coming soon — we're building our collection!</p>
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
            ['What are edible prints made of?', 'Our prints use FDA-approved, food-safe edible icing sheets printed with vibrant, water-based edible inks. Every ingredient is certified safe for consumption and tasteless \u2014 so they won\u2019t affect the flavour of your baked goods.'],
            ['How do I apply the edible print?', 'Peel the backing sheet gently and lay the print directly onto a freshly frosted or fondant-covered surface. Press lightly from the centre outward to remove air bubbles. For best results, apply within 30 minutes of frosting and keep refrigerated until serving.'],
            ['How long does shipping take?', 'Free pickup is available at our London, Ontario location. Same-day local delivery in London is available for $5–$10 depending on your postal code zone. Canada-wide shipping via Canada Post takes 3–5 business days (from $6.99), with express options available at checkout.'],
            ['What image resolution do I need for good quality?', 'We recommend a minimum of 1000×1000 pixels at 300 DPI. We review every order before printing — if we spot a quality issue with your file, we\'ll reach out before proceeding.'],
            ['Do you ship to all Canadian provinces and territories?', 'Yes — we ship to all provinces and territories via Canada Post. Delivery times vary by location; remote areas may take an additional 1–2 business days.'],
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
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, background: '#fff', color: C.brand, fontSize: 18, padding: '16px 44px', borderRadius: 14 }}>
            Start Your Order →
          </button>
        </section>
        <footer style={{ background: '#1a1a1a', color: '#d1d5db', fontFamily: "'Outfit', sans-serif" }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px 40px', display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 36 }}>
            {/* Col 1: Brand */}
            <div>
              <Logo size={26} />
              <p style={{ fontSize: 13.5, lineHeight: 1.7, marginTop: 14, color: '#9CA3AF', maxWidth: 220 }}>
                Custom edible image printing on premium icing sheets. Made with love in London, Ontario.
              </p>
              <p style={{ fontSize: 13, marginTop: 12, color: '#9CA3AF' }}>
                <a href="mailto:hello@edibleprint.net" style={{ color: '#6ee7b7', textDecoration: 'none' }}>hello@edibleprint.net</a>
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
                ['Contact', 'mailto:hello@edibleprint.net'],
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
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px',
        borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div onClick={() => setStep(0)} style={{ cursor: 'pointer' }}><Logo /></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['Upload', 'Customize', 'Details', 'Done'].map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step >= i + 1 ? C.brand : '#E5E7EB', color: step >= i + 1 ? '#fff' : '#9CA3AF',
                transition: 'all 0.3s' }}>{i + 1}</div>
              <span className="hide-mobile" style={{ fontSize: 12, color: step >= i + 1 ? C.text : '#bbb',
                fontWeight: step === i + 1 ? 600 : 400 }}>{label}</span>
              {i < 3 && <span style={{ color: '#ddd', margin: '0 2px', fontSize: 11 }}>›</span>}
            </div>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>1</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>
                {designs.length > 0 ? 'Add Another Design' : 'Upload Your Image'}
              </h2>
              <p style={{ color: C.muted, marginBottom: pendingShape ? 12 : 24 }}>JPG, PNG or PDF · High resolution for best results</p>
            </div>
            {pendingShape && pendingSizeId && (() => {
              const pSizes = SIZES[pendingShape] || [];
              const pSel = pSizes.find(s => s.id === pendingSizeId);
              const shapeLabels = { circular: 'Round', heart: 'Heart', square: 'Square', multicircle: 'Cookie Sheet', fullsheet: 'Full Sheet', bwsheet: 'B&W Sheet' };
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
                    {d.cropPreview
                      ? <img src={d.cropPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      : d.layers?.[0]?.src
                        ? <img src={d.layers[0].src} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🖼️</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Design {i + 1}{d.layers?.length > 1 ? ` (${d.layers.length} images)` : ''}</div>
                      <div style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.layers?.map(l => l.name).join(', ') || 'No image'}</div>
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

            {designs.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button onClick={() => { setActiveDesignId(designs[0].id); setStep(2); }} style={{ ...btnPrimary, flex: 1 }}>
                  Continue to Customize →
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CUSTOMIZE */}
        {step === 2 && activeDesign && (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>2</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Customize Your Print</h2>
              <p style={{ color: C.muted, marginBottom: 16 }}>Choose shape, size, and adjust the crop area</p>
            </div>

            {/* Design tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
              {designs.map((d, i) => (
                <button key={d.id}
                  onClick={() => setActiveDesignId(d.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, flexShrink: 0,
                    border: activeDesignId === d.id ? '2px solid ' + C.brand : '2px solid ' + C.border,
                    background: activeDesignId === d.id ? C.brandLight : C.white,
                    fontWeight: activeDesignId === d.id ? 700 : 400,
                    fontSize: 13, cursor: 'pointer', color: activeDesignId === d.id ? C.brand : C.text,
                    fontFamily: "'Outfit', sans-serif",
                  }}>
                  Design {i + 1}
                </button>
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

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 28, alignItems: 'flex-start' }}>
              {/* ── LEFT: 60% preview ── */}
              <div style={{
                flex: isMobile ? 'none' : '0 0 58%',
                width: isMobile ? '100%' : undefined,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: isMobile ? 0 : '12px 20px 12px 0',
                position: isMobile ? 'static' : 'sticky',
                top: isMobile ? undefined : 16,
                alignSelf: isMobile ? undefined : 'flex-start',
              }}>
                {shape === 'bwsheet' && (
                  <div style={{
                    background: '#F5F5F5', borderLeft: '3px solid ' + C.accent,
                    padding: '10px 14px', borderRadius: 6, fontSize: 13,
                    marginBottom: 16, color: C.text, alignSelf: 'stretch',
                  }}>
                    ℹ️ B&W Sheet prints in grayscale for $9.99 — perfect for text, logos, and portraits.
                  </div>
                )}
                <ImageEditor
                  layers={layers}
                  onLayersChange={setLayers}
                  shape={shape}
                  sizeObj={selectedSize || { w: parseFloat(customW) || 6, h: parseFloat(customH) || 6 }}
                  onCrop={setCropPreview}
                  onHiResCrop={setHiResCrop}
                  bgColor={bgColor}
                  textOverlay={textOverlay}
                  onTextPositionChange={(pos) => setTextOverlay((p) => ({ ...p, position: pos }))}
                  removeWhiteBg={removeWhiteBg}
                  bgRemoveTolerance={bgRemoveTolerance}
                  sizeLabel={sizeLabel}
                  isMobile={isMobile}
                />

                {/* ── Download PDF button ── */}
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

              {/* ── RIGHT: 40% controls ── */}
              <div style={{ flex: isMobile ? 1 : '0 0 42%', minWidth: 0, width: isMobile ? '100%' : undefined }}>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Shape</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
                  {[{ key: 'circular', icon: '⭕', label: 'Round' }, { key: 'heart', icon: '❤️', label: 'Heart' },
                    { key: 'multicircle', icon: '🍪', label: 'Cookie Sheet' },
                    { key: 'square', icon: '⬜', label: 'Square' },
                    { key: 'fullsheet', icon: '▬', label: 'Full Sheet' },
                    { key: 'bwsheet', icon: '⬛', label: 'B&W Sheet' },
                    { key: 'custom', icon: '✏️', label: 'Custom' }].map((sh) => (
                    <button key={sh.key} onClick={() => {
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

                {shape !== 'custom' ? (
                  <>
                    <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Size</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
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
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Width (inches)</label>
                        <input type="number" value={customW} onChange={(e) => { const v = parseFloat(e.target.value); setCustomW(isNaN(v) ? '' : String(Math.min(8, v))); }} placeholder="e.g. 5" style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Height (inches)</label>
                        <input type="number" value={customH} onChange={(e) => { const v = parseFloat(e.target.value); setCustomH(isNaN(v) ? '' : String(Math.min(11, v))); }} placeholder="e.g. 7" style={inputStyle} />
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, margin: '-14px 0 22px', textAlign: 'center' }}>Max size: 8″ × 11″ (A4 sheet)</p>
                  </>
                )}

                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Quantity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                  <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>-</button>
                  <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
                  <button onClick={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>+</button>
                </div>

                {/* ── Remove White Background toggle ── */}
                {shape !== 'bwsheet' && (
                  <div style={{ borderTop: '1px solid ' + C.border, paddingTop: 12, marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: removeWhiteBg ? 8 : 12 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>✂️ Remove white background around my image</span>
                      <button
                        onClick={() => setRemoveWhiteBg(v => !v)}
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
                      <div style={{ padding: '8px 10px', background: '#FAFBF9', borderRadius: 6, marginBottom: 10, fontSize: 11.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: C.muted }}>
                          <span>Edge tolerance</span>
                          <span style={{ fontWeight: 600, color: C.brand }}>{bgRemoveTolerance}</span>
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
                          <span>Strict (white only)</span>
                          <span>Relaxed (light grays)</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ACCORDION: Background Fill Color ── */}
                <div style={{ borderTop: '1px solid ' + C.border, marginBottom: 4 }}>
                  <button
                    onClick={() => toggleAccordion('bg')}
                    aria-expanded={accordionBg}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0',
                      fontWeight: 600, fontSize: 14, fontFamily: "'Outfit', sans-serif", color: C.text }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      🎨 Background Fill Color
                      <span style={{ width: 20, height: 20, borderRadius: 4, background: bgColor, flexShrink: 0,
                        border: '2px solid ' + C.border, boxShadow: bgColor === '#FFFFFF' ? 'inset 0 0 0 1px #d1d5db' : 'none', display: 'inline-block' }} />
                    </span>
                    <span style={{ transition: 'transform 0.2s', transform: accordionBg ? 'rotate(180deg)' : 'none', fontSize: 12, color: C.muted }}>▼</span>
                  </button>
                  {accordionBg && (
                    <div style={{ paddingBottom: 16 }}>
                      <ColorPickerDropdown value={bgColor} onChange={setBgColor} colors={shape === 'bwsheet' ? BW_PALETTE : PALETTE} label="Fill" allowCustom={shape !== 'bwsheet'} />
                    </div>
                  )}
                </div>

                {/* ── ACCORDION: Add Text ── */}
                <div style={{ borderTop: '1px solid ' + C.border, marginBottom: 4 }}>
                  <button
                    onClick={() => toggleAccordion('text')}
                    aria-expanded={accordionText}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0',
                      fontWeight: 600, fontSize: 14, fontFamily: "'Outfit', sans-serif", color: C.text }}>
                    ✏️ Add Text <span style={{ fontWeight: 400, color: C.muted, fontSize: 13 }}>(optional)</span>
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

                {/* ── Design Responsibility Disclaimer ── */}
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

                {/* Order summary — inside right column so sticky persists to the end */}
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
            </div>
          </div>
        )}

        {/* STEP 3: SHIPPING & PAYMENT */}
        {step === 3 && (
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
                <input ref={addressRef} value={form.address} onChange={(e) => handleAddressChange(e.target.value)} style={inputStyle} placeholder="e.g. 123 Main Street" autoComplete="off" />
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
              {(form.province || form.postal) && (
                <div style={{ background: C.brandLight, border: '1px solid #C6E6D6', borderRadius: 10,
                  padding: '10px 16px', fontSize: 13.5, color: C.brandDark, fontWeight: 600 }}>
                  📦 Estimated delivery: <strong>{getDeliveryEstimate(form.province, form.postal)}</strong>
                  <span style={{ fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 8 }}>after production (1–2 days)</span>
                </div>
              )}
              </>)}
            </div>
            <div style={{ marginTop: 26 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Shipping Method</label>
              {[
                { key: 'pickup', label: 'Free Pickup — London, ON', price: 0, disabled: false, note: "South London (Glen Cairn / Westmount area). We'll confirm the exact time by email." },
                { key: 'local', label: localZone ? 'Local Delivery — ' + localZone.name : 'Local Delivery (London zones)', price: localZone?.price || 0, disabled: !localZone },
                { key: 'standard', label: 'Canada Post Standard — 3–5 business days', price: SHIPPING.standard, disabled: false },
                { key: 'express', label: 'Canada Post Express — 1–2 business days', price: SHIPPING.express, disabled: false },
              ].map((opt) => (
                <label key={opt.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
                  border: shipping === opt.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shipping === opt.key ? C.brandLight : opt.disabled ? '#f9fafb' : C.white, marginBottom: 8,
                  cursor: opt.disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: opt.disabled ? 0.5 : 1 }}>
                  <input type="radio" name="shipping" checked={shipping === opt.key} onChange={() => { if (!opt.disabled) setShipping(opt.key); }} disabled={opt.disabled} style={{ accentColor: C.brand, width: 18, height: 18 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                    {opt.key === 'local' && !localZone && form.postal && (
                      <div style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>Not available for your postal code</div>
                    )}
                    {opt.key === 'local' && !form.postal && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Enter your postal code above</div>
                    )}
                    {opt.note && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{opt.note}</div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: opt.disabled ? C.muted : C.brand }}>{opt.key === 'local' && localZone ? '$' + localZone.price.toFixed(2) : opt.key === 'local' ? '—' : '$' + opt.price.toFixed(2)}</span>
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
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Design {i + 1}: {d.qty}x {d.shape === 'custom' ? (d.customW + '"x' + d.customH + '"') : (dSel?.label || d.shape)}</span>
                      <span style={{ fontWeight: 600 }}>{'$' + (dPrice * d.qty).toFixed(2)}</span>
                    </div>
                  );
                })}
                {designs.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid ' + C.border, paddingTop: 8 }}>
                    <span style={{ color: C.muted }}>Subtotal</span><span style={{ fontWeight: 600 }}>{'$' + designsSubtotal.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Shipping</span><span style={{ fontWeight: 600 }}>{'$' + shippingCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted }}>
                  <span>HST (13%)</span><span>{'$' + tax.toFixed(2)}</span>
                </div>
                <div style={{ borderTop: '1.5px solid ' + C.border, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20 }}>
                  <span>Total</span>
                  <span style={{ color: C.brand }}>{'$' + total.toFixed(2)} <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>CAD</span></span>
                </div>
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
        )}
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

