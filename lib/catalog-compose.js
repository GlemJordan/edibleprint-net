// Draws a ready-made catalog design for one shape — the SAME function feeds
// the on-screen SheetPreview and the 300 DPI print composite
// (app/designs/[id]/page.js), so what the customer sees is what prints.
//
// Layers, bottom to top:
//   1. white
//   2. the customer's photo (optional), showing ONLY through the design's
//      clear centre — the photo window mask (design.photoZone, built by
//      scripts/build-photo-masks.py) cuts it to shape
//   3. the artwork, with that same window cut out of it, so everything the
//      artwork prints inside the window (headline, rings, bows…) stays on
//      top of the photo
//   4. the name/age text zone
// Round and heart toppers are clipped to their outline (white outside):
// only the part that ends up on the cake prints, the same as the editor's
// own round/heart export. Square and full sheet keep the full artwork.
//
// Browser-only (offscreen canvases).

import { shapeOutlinePath } from './shape-paths.js';
import { drawZoneText } from './catalog-text-render.js';

export const PHOTO_ZOOM_MAX = 3;

// Which outline a catalog shape is clipped to; null = keep the whole box.
export function clipKindForShape(shape) {
  if (shape === 'circular') return 'circle';
  if (shape === 'heart') return 'heart';
  return null;
}

/** Rect that `srcW`×`srcH` covers `boxW`×`boxH` with (crop-to-fill, centred). */
export function coverRect(srcW, srcH, boxW, boxH) {
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

function sourceSize(src) {
  return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
}

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

/**
 * Where the photo lands for a given adjustment, in canvas px.
 * adjust: { zoom: 1..PHOTO_ZOOM_MAX, x: -1..1, y: -1..1 } — x/y move the
 * photo across whatever part of it overflows the window at that zoom.
 */
export function photoRect(photo, box, adjust = {}) {
  const { w: pw, h: ph } = sourceSize(photo);
  const zoom = Math.min(PHOTO_ZOOM_MAX, Math.max(1, adjust.zoom || 1));
  const base = coverRect(pw, ph, box.w, box.h);
  const w = base.w * zoom;
  const h = base.h * zoom;
  const panX = Math.max(-1, Math.min(1, adjust.x || 0));
  const panY = Math.max(-1, Math.min(1, adjust.y || 0));
  return {
    x: box.x + (box.w - w) / 2 + panX * ((w - box.w) / 2),
    y: box.y + (box.h - h) / 2 + panY * ((h - box.h) / 2),
    w,
    h,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx  target, drawn at [0,0,w,h]
 * @param {number} w
 * @param {number} h
 * @param {{
 *   shape: string,
 *   design: { textZone: object, photoZone?: { box: {x,y,w,h} } },
 *   art?: CanvasImageSource|null,     // loaded artwork (null while loading)
 *   mask?: CanvasImageSource|null,    // loaded photo window mask
 *   photo?: CanvasImageSource|null,   // the customer's photo
 *   photoAdjust?: { zoom: number, x: number, y: number },
 *   text?: { text: string, fontFamily: string, color: string },
 * }} opts
 */
export function drawCatalogDesign(ctx, w, h, { shape, design, art, mask, photo, photoAdjust, text }) {
  ctx.save();
  const clip = clipKindForShape(shape);
  if (clip) ctx.clip(new Path2D(shapeOutlinePath(clip, 0, 0, w, h)));

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  if (art) {
    const a = sourceSize(art);
    const artRect = coverRect(a.w, a.h, w, h);
    const zone = design.photoZone;
    if (photo && mask && zone?.box) {
      const box = {
        x: artRect.x + (zone.box.x / 100) * artRect.w,
        y: artRect.y + (zone.box.y / 100) * artRect.h,
        w: (zone.box.w / 100) * artRect.w,
        h: (zone.box.h / 100) * artRect.h,
      };
      const [photoLayer, pctx] = layer(w, h);
      const r = photoRect(photo, box, photoAdjust);
      pctx.drawImage(photo, r.x, r.y, r.w, r.h);
      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(mask, artRect.x, artRect.y, artRect.w, artRect.h);
      ctx.drawImage(photoLayer, 0, 0);

      const [frame, fctx] = layer(w, h);
      fctx.drawImage(art, artRect.x, artRect.y, artRect.w, artRect.h);
      fctx.globalCompositeOperation = 'destination-out';
      fctx.drawImage(mask, artRect.x, artRect.y, artRect.w, artRect.h);
      ctx.drawImage(frame, 0, 0);
    } else {
      ctx.drawImage(art, artRect.x, artRect.y, artRect.w, artRect.h);
    }
  } else {
    ctx.fillStyle = '#f4f6f1';
    ctx.fillRect(0, 0, w, h);
  }

  if (text?.text) {
    drawZoneText(ctx, { ...text, baseFontSizePx: Math.round(w * 0.09) }, design.textZone, w, h);
  }
  ctx.restore();
}

/**
 * Loads the customer's photo for drawing. Very large camera photos are
 * scaled down once here (to PHOTO_MAX_SIDE) so every preview redraw and the
 * print composite stay fast on a phone — still far more pixels than the
 * window prints at 300 DPI.
 */
const PHOTO_MAX_SIDE = 4000;

export function loadCustomerPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      if (s >= 1) { resolve(img); return; }
      const [c, cctx] = layer(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
      cctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that photo'));
    };
    img.src = url;
  });
}
