// Single source of truth for physical paper size. The editor's canvas
// aspect ratio, the 300 DPI hi-res export raster, the server-side
// print-ready PDF, and the print-preview modal all derive their page/sheet
// dimensions from this file, so they can't silently diverge from each other
// (or from what actually prints).
//
// Every catalog shape prints on A4 (210mm x 297mm) — icing sheets and wafer
// paper alike. (Wafer paper was previously treated as US Letter / 8.5"x11"
// here; that was wrong — it's the same A4 stock as everything else — and
// has been corrected.)

const MM_PER_IN = 25.4;
const PT_PER_IN = 72;

const A4_IN = { w: 210 / MM_PER_IN, h: 297 / MM_PER_IN };

// bwsheet's printed design square, centered on its icing sheet. Previously
// hand-copied as the literal 6.5 / (6.5/8) in three separate render paths
// (the inline editor's shadow, the shared preview renderer, and the hi-res
// export) — one named constant now, imported everywhere it's needed.
export const BWSHEET_DESIGN_IN = 6.5;

// Minimum breathing room around an individually-sized design (circular/
// heart/square/custom) centered on its icing sheet, so a design that's
// nearly sheet-sized never touches the physical edge.
const DESIGN_MARGIN_IN = 0.25;

// Print margins for whole-sheet shapes, in millimeters — { top, right,
// bottom, left }. fullsheet and waferletter share this exact object (not
// just equal values) so the two can never drift apart — both print on A4
// and both shipped full-bleed (0mm every side) at first, coming back from
// print with the design almost touching the top edge. Top needs more room
// than the other three sides — icing-sheet/wafer-paper printers commonly
// have a larger non-printable zone at the paper's leading edge (the top,
// given feed direction) than at the sides or trailing edge. bwsheet/
// multicircle are untouched (stay full-bleed) — add an entry here if one of
// them ever needs the same treatment; every consumer (hi-res PDF +
// print-preview) reads this one place, so there's nowhere else a margin
// value could get out of sync.
// Note: right/left don't map 1:1 to rendered side margin — the uniform
// "scale to fit, never crop/distort" factor in computeSheetPlacement() is
// height-bound (top+bottom eat more of the sheet's proportional room than
// left+right do here), so actual left/right whitespace is a side effect of
// that ratio, layered on top of whatever right/left ask for. bottom, by
// contrast, is exact: whatever's set here is exactly what's left under the
// design. At top=15mm/bottom=1mm the resulting side margin lands at
// ~5.66mm (down from ~7.4mm at top=20mm) — lowering top tightens the
// height/width scale mismatch, so the sides shrink along with it.
const WHOLE_SHEET_MARGIN_MM = { top: 15, right: 1, bottom: 1, left: 1 };
const SHEET_MARGIN_MM = {
  fullsheet: WHOLE_SHEET_MARGIN_MM,
  waferletter: WHOLE_SHEET_MARGIN_MM,
};
function marginInForShape(shape) {
  const m = SHEET_MARGIN_MM[shape];
  if (!m) return null;
  return { top: m.top / MM_PER_IN, right: m.right / MM_PER_IN, bottom: m.bottom / MM_PER_IN, left: m.left / MM_PER_IN };
}

// Whether computeSheetPlacement() reserves a print margin for this
// whole-sheet shape (true for fullsheet and waferletter today). The
// print-preview modal (app/page.js) needs this to decide whether to render
// the shape through the margin-aware placement path or the legacy
// full-bleed path — so the preview can't fall out of sync with what
// computeSheetPlacement() actually returns for the PDF.
export function hasSheetMargin(shape) {
  return SHEET_MARGIN_MM[shape] != null;
}

// Every catalog shape prints on the same A4 stock — see the file header.
// Kept as a "for shape" function (rather than a bare constant export) so
// callers keep reading intent at the call site (sheetSizeInForShape('fullsheet')
// / sheetSizeInForShape('waferletter')), and so a future format that's
// genuinely a different physical size has one obvious place to branch.
export function sheetSizeInForShape(shape) {
  return A4_IN;
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

// Human-readable sheet format for whole-sheet shapes — these print a fixed
// sheet, not a per-item size, so labeling them with a "size" built from
// sheetSizeInForShape()'s raw sheet width (e.g. 8.267716535433072") is
// meaningless. Every caller that labels a whole-sheet PDF (print-ready
// footer, download-PDF checkout line item) reads this one function instead
// of inlining its own guess, so they can't independently repeat that bug.
// Always 'A4' now — every catalog shape prints on the same A4 stock (see
// the file header); kept as a function, not a bare constant, for the same
// reason as sheetSizeInForShape() above.
export function sheetFormatLabel(shape) {
  return 'A4';
}

// Friendly display name for each catalog shape. The print-ready PDF
// footer and the download-PDF checkout line item previously interpolated
// the raw shape id (shape.toUpperCase() / shape) directly — which for
// 'circular' prints the literal word "circular", identical to the
// Spanish word for the same shape and inconsistent with the "Round"
// terminology used everywhere else on the site (app/page.js's own
// SHAPE_LABEL). Every caller that needs a shape's display name reads this
// one map instead of inlining the shape id.
const SHAPE_DISPLAY_LABEL = {
  circular: 'Round', heart: 'Heart', square: 'Square', multicircle: 'Cookie Sheet',
  fullsheet: 'Full Sheet', bwsheet: 'B&W Sheet', waferletter: 'Wafer Paper', custom: 'Custom',
};
export function shapeDisplayLabel(shape) {
  return SHAPE_DISPLAY_LABEL[shape] || shape;
}

// Display name for each Custom sub-shape (the figure a customer picks
// within shape === 'custom' — rectangle/circle/oval/triangle/hexagon).
// Used by the Custom shape picker (app/page.js) and by every place that
// labels a Custom design server-side (print-ready PDF footer/email,
// download-PDF checkout's Stripe line item) so they can't disagree on
// what to call a given sub-shape.
const CUSTOM_SHAPE_LABEL = {
  rectangle: 'Rectangle', circle: 'Circle', oval: 'Oval', triangle: 'Triangle', hexagon: 'Hexagon',
};
export function customShapeLabel(kind) {
  return CUSTOM_SHAPE_LABEL[kind] || '';
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

    const margin = marginInForShape(shape);
    if (margin) {
      // Scale the full-bleed composition down (uniformly — never distort,
      // never crop, same "always scale to fit" policy already used for
      // mismatched upload-flow files, see app/page.js's
      // getUploadTargetSizeIn comment) until it fits inside the margins,
      // then anchor it to the required top margin exactly rather than
      // centering — centering would let a tall/narrow scale factor starve
      // the top of its required clearance.
      const availW = sheet.w - margin.left - margin.right;
      const availH = sheet.h - margin.top - margin.bottom;
      const scale = Math.min(availW / sheet.w, availH / sheet.h);
      const designW = sheet.w * scale;
      const designH = sheet.h * scale;
      return {
        sheetW: sheet.w, sheetH: sheet.h,
        designW, designH,
        offsetX: (sheet.w - designW) / 2,
        offsetY: margin.top,
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
