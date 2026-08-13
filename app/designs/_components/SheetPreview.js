'use client';

import { useEffect, useRef, useState } from 'react';
import { computeSheetPlacement, sheetSizeInForShape } from '../../../lib/paper-config.js';
import { drawZoneText, drawCoverFit } from '../../../lib/catalog-text-render.js';

const PREVIEW_MAX_W = 420;

/**
 * Sheet-boundary preview: draws the design (cover-fit into its computed box)
 * plus the live text zone, positioned on the physical sheet exactly the way
 * computeSheetPlacement() places it in the real print-ready PDF (see
 * lib/generate-pdf.js's generatePrintPdf, which calls the SAME function) —
 * so this can't show a layout that diverges from what actually prints.
 */
export default function SheetPreview({ design, shape, sizeObj, text, fontFamily, color }) {
  const canvasRef = useRef(null);
  const imgCacheRef = useRef({});
  const [, forceRedraw] = useState(0);

  useEffect(() => {
    const cached = imgCacheRef.current[design.sourceFile];
    if (cached?.complete) return;
    const img = new Image();
    img.onload = () => forceRedraw((t) => t + 1);
    img.src = design.sourceFile;
    imgCacheRef.current[design.sourceFile] = img;
  }, [design.sourceFile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sizeObj) return;
    const sheet = sheetSizeInForShape(shape);
    const cw = PREVIEW_MAX_W;
    const ch = Math.round(cw * (sheet.h / sheet.w));
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = '#FBFAF7';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#E2E0D9';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    const placement = computeSheetPlacement(shape, sizeObj);
    const pxPerInX = cw / placement.sheetW, pxPerInY = ch / placement.sheetH;
    const designPxW = Math.max(1, Math.round(placement.designW * pxPerInX));
    const designPxH = Math.max(1, Math.round(placement.designH * pxPerInY));
    const offPxX = placement.offsetX * pxPerInX, offPxY = placement.offsetY * pxPerInY;

    const sub = document.createElement('canvas');
    sub.width = designPxW * dpr;
    sub.height = designPxH * dpr;
    const sctx = sub.getContext('2d');
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';

    const img = imgCacheRef.current[design.sourceFile];
    if (img?.complete && img.naturalWidth > 0) {
      drawCoverFit(sctx, img, designPxW, designPxH);
    } else {
      sctx.fillStyle = '#f4f6f1';
      sctx.fillRect(0, 0, designPxW, designPxH);
    }
    drawZoneText(
      sctx,
      { text, fontFamily, color, baseFontSizePx: Math.round(designPxW * 0.09) },
      design.textZone,
      designPxW,
      designPxH
    );

    ctx.drawImage(sub, offPxX, offPxY, designPxW, designPxH);

    ctx.save();
    ctx.strokeStyle = '#BFBFBF';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (shape === 'circular') {
      ctx.arc(offPxX + designPxW / 2, offPxY + designPxH / 2, designPxW / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(offPxX, offPxY, designPxW, designPxH);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }, [design, shape, sizeObj, text, fontFamily, color]);

  return <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 10, maxWidth: '100%' }} />;
}
