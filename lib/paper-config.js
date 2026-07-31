// Single source of truth for physical paper size, by print material — not
// by catalog shape. The editor's canvas aspect ratio, the 300 DPI hi-res
// export raster, the server-side print-ready PDF, and the print-preview
// modal all derive their page/sheet dimensions from this file, so they
// can't silently diverge from each other (or from what actually prints).
//
// Icing sheets print on A4 (210mm x 297mm). Wafer paper prints on US Letter
// (8.5in x 11in) — these are genuinely different physical stock, not a
// single "sheet size" that happens to vary by shape.

const MM_PER_IN = 25.4;
const PT_PER_IN = 72;

const A4_IN = { w: 210 / MM_PER_IN, h: 297 / MM_PER_IN };
const LETTER_IN = { w: 8.5, h: 11 };

export const MATERIAL_BY_SHAPE = {
  circular: 'icing', heart: 'icing', square: 'icing', multicircle: 'icing',
  fullsheet: 'icing', bwsheet: 'icing', custom: 'icing',
  waferletter: 'wafer',
};

// Physical sheet size in inches, by material.
export const SHEET_SIZE_IN = { icing: A4_IN, wafer: LETTER_IN };

// bwsheet's printed design square, centered on its icing sheet. Previously
// hand-copied as the literal 6.5 / (6.5/8) in three separate render paths
// (the inline editor's shadow, the shared preview renderer, and the hi-res
// export) — one named constant now, imported everywhere it's needed.
export const BWSHEET_DESIGN_IN = 6.5;

// Minimum breathing room around an individually-sized design (circular/
// heart/square/custom) centered on its icing sheet, so a design that's
// nearly sheet-sized never touches the physical edge.
const DESIGN_MARGIN_IN = 0.25;

export function sheetSizeInForShape(shape) {
  return SHEET_SIZE_IN[MATERIAL_BY_SHAPE[shape] || 'icing'];
}

export function pageSizePtForShape(shape) {
  const { w, h } = sheetSizeInForShape(shape);
  return { w: w * PT_PER_IN, h: h * PT_PER_IN };
}

// A "whole sheet" shape's hi-res raster is composited full-bleed (its
// background fill already reaches every edge) — fullsheet/multicircle/
// waferletter fill the entire sheet; bwsheet is a centered square within
// it. circular/heart/square/custom are individual items with sheet margin
// around them instead.
export function isWholeSheetShape(shape) {
  return shape === 'fullsheet' || shape === 'bwsheet' || shape === 'multicircle' || shape === 'waferletter';
}

/**
 * Where a design sits on its printed sheet, in inches, relative to the
 * sheet's top-left corner (canvas/screen convention — callers drawing into
 * a bottom-left-origin space, like a PDF page, flip Y themselves). This is
 * the ONE function both the hi-res PDF generator (lib/generate-pdf.js) and
 * the print-preview modal (app/page.js) call to find the design's position
 * — so they can't compute two different answers for where the same design
 * lands on the page.
 *
 * @param {string} shape
 * @param {{w?: number}} sizeObj  circular/heart/square: sizeObj.w is the
 *   design's own side length in inches (these shapes are always square).
 * @param {number|string} [customW]  shape === 'custom' only
 * @param {number|string} [customH]
 */
export function computeSheetPlacement(shape, sizeObj, customW, customH) {
  const sheet = sheetSizeInForShape(shape);

  if (isWholeSheetShape(shape)) {
    if (shape === 'bwsheet') {
      const d = BWSHEET_DESIGN_IN;
      return {
        sheetW: sheet.w, sheetH: sheet.h,
        designW: d, designH: d,
        offsetX: (sheet.w - d) / 2, offsetY: (sheet.h - d) / 2,
        isFullBleed: false,
      };
    }
    return {
      sheetW: sheet.w, sheetH: sheet.h,
      designW: sheet.w, designH: sheet.h,
      offsetX: 0, offsetY: 0,
      isFullBleed: true,
    };
  }

  let designW, designH;
  if (shape === 'custom') {
    designW = parseFloat(customW) || 6;
    designH = parseFloat(customH) || 6;
  } else {
    // circular / heart / square — always square, side length is sizeObj.w
    const sz = parseFloat(sizeObj?.w) || 4;
    designW = sz;
    designH = sz;
  }

  const maxW = sheet.w - DESIGN_MARGIN_IN * 2;
  const maxH = sheet.h - DESIGN_MARGIN_IN * 2;
  if (designW > maxW || designH > maxH) {
    const scale = Math.min(maxW / designW, maxH / designH);
    designW *= scale;
    designH *= scale;
  }

  return {
    sheetW: sheet.w, sheetH: sheet.h,
    designW, designH,
    offsetX: (sheet.w - designW) / 2, offsetY: (sheet.h - designH) / 2,
    isFullBleed: false,
  };
}
