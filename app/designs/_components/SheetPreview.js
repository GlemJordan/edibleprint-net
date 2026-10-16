'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeSheetPlacement, sheetSizeInForShape } from '../../../lib/paper-config.js';
import { designForShape } from '../../../lib/design-catalog.js';
import { clipKindForShape, drawCatalogDesign } from '../../../lib/catalog-compose.js';
import { shapeOutlinePath } from '../../../lib/shape-paths.js';

const PREVIEW_MAX_W = 420;

/**
 * Sheet-boundary preview: draws the design (via the same drawCatalogDesign()
 * the 300 DPI print composite uses) plus the live text zone, positioned on
 * the physical sheet exactly the way computeSheetPlacement() places it in
 * the real print-ready PDF (see lib/generate-pdf.js's generatePrintPdf,
 * which calls the SAME function) — so this can't show a layout that
 * diverges from what actually prints.
 */
export default function SheetPreview({ design: baseDesign, shape, sizeObj, text, fontFamily, color, photo, photoAdjust }) {
  // Some designs ship a separate artwork/text zone for a shape (e.g. a
  // portrait full-sheet version) — always draw the one for this shape.
  const design = useMemo(() => designForShape(baseDesign, shape), [baseDesign, shape]);
  const canvasRef = useRef(null);
  const imgCacheRef = useRef({});
  // Bumped when an image finishes loading so the draw effect below re-runs
  // (otherwise a freshly selected artwork stays blank until the text changes).
  const [loadTick, forceRedraw] = useState(0);
  const maskSrc = design.photoZone?.mask || '';

  useEffect(() => {
    for (const src of [design.sourceFile, maskSrc]) {
      if (!src || imgCacheRef.current[src]) continue;
      const img = new Image();
      img.onload = () => forceRedraw((t) => t + 1);
      img.src = src;
      imgCacheRef.current[src] = img;
    }
  }, [design.sourceFile, maskSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sizeObj) return;
    const sheet = sheetSizeInForShape(shape);
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Drawn in device pixels; the CSS below scales it to the column width
    // and keeps its proportions (height: auto), so a round topper stays a
    // circle on a narrow phone screen instead of being squashed into an oval.
    const cw = Math.round(PREVIEW_MAX_W * dpr);
    const ch = Math.round(cw * (sheet.h / sheet.w));
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = '#FBFAF7';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#E2E0D9';
    ctx.lineWidth = dpr;
    ctx.strokeRect(dpr / 2, dpr / 2, cw - dpr, ch - dpr);

    const placement = computeSheetPlacement(shape, sizeObj);
    const pxPerIn = cw / placement.sheetW;
    const dw = Math.max(1, Math.round(placement.designW * pxPerIn));
    const dh = Math.max(1, Math.round(placement.designH * pxPerIn));
    const ox = placement.offsetX * pxPerIn, oy = placement.offsetY * pxPerIn;

    const ready = (img) => (img?.complete && img.naturalWidth > 0 ? img : null);
    const sub = document.createElement('canvas');
    sub.width = dw;
    sub.height = dh;
    const sctx = sub.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    drawCatalogDesign(sctx, dw, dh, {
      shape,
      design,
      art: ready(imgCacheRef.current[design.sourceFile]),
      mask: ready(imgCacheRef.current[maskSrc]),
      photo,
      photoAdjust,
      text: { text, fontFamily, color },
    });
    ctx.drawImage(sub, ox, oy, dw, dh);

    // Outline: the topper's cut line (round/heart), or the printed box.
    ctx.save();
    ctx.translate(ox, oy);
    ctx.strokeStyle = '#BFBFBF';
    ctx.setLineDash([4 * dpr, 5 * dpr]);
    ctx.lineWidth = 1.25 * dpr;
    ctx.stroke(new Path2D(shapeOutlinePath(clipKindForShape(shape) || 'rectangle', 0, 0, dw, dh)));
    ctx.restore();
  }, [design, maskSrc, shape, sizeObj, text, fontFamily, color, photo, photoAdjust, loadTick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', borderRadius: 10, width: '100%', maxWidth: PREVIEW_MAX_W, height: 'auto' }}
    />
  );
}

/**
 * Small live view of just the topper/design area (no sheet around it),
 * shown next to the photo controls so a customer on a phone sees the photo
 * move while adjusting it, without scrolling back up to the sheet preview.
 * Same drawCatalogDesign() as the sheet preview and the print file.
 */
export function DesignThumb({ design: baseDesign, shape, sizeObj, text, fontFamily, color, photo, photoAdjust, size = 168 }) {
  const design = useMemo(() => designForShape(baseDesign, shape), [baseDesign, shape]);
  const canvasRef = useRef(null);
  const imgCacheRef = useRef({});
  const [loadTick, forceRedraw] = useState(0);
  const maskSrc = design.photoZone?.mask || '';

  useEffect(() => {
    for (const src of [design.sourceFile, maskSrc]) {
      if (!src || imgCacheRef.current[src]) continue;
      const img = new Image();
      img.onload = () => forceRedraw((t) => t + 1);
      img.src = src;
      imgCacheRef.current[src] = img;
    }
  }, [design.sourceFile, maskSrc]);

  const placement = sizeObj ? computeSheetPlacement(shape, sizeObj) : null;
  const ratio = placement ? placement.designH / placement.designW : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sizeObj) return;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const w = Math.round(size * dpr);
    const h = Math.round(w * ratio);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const ready = (img) => (img?.complete && img.naturalWidth > 0 ? img : null);
    drawCatalogDesign(ctx, w, h, {
      shape,
      design,
      art: ready(imgCacheRef.current[design.sourceFile]),
      mask: ready(imgCacheRef.current[maskSrc]),
      photo,
      photoAdjust,
      text: { text, fontFamily, color },
    });
  }, [design, maskSrc, shape, sizeObj, ratio, size, text, fontFamily, color, photo, photoAdjust, loadTick]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Preview of your design with the photo"
      style={{ display: 'block', width: size, maxWidth: '100%', height: 'auto', margin: '0 auto 10px' }}
    />
  );
}
