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
// bottom, left }. Both print on A4 and both shipped full-bleed (0mm every
// side) at first, coming back from print with the design almost touching
// the top edge. Top needs more room than the other three sides —
// icing-sheet/wafer-paper printers commonly have a larger non-printable
// zone at the paper's leading edge (the top, given feed direction) than at
// the sides or trailing edge. bwsheet/multicircle are untouched (stay
// full-bleed) — add an entry here if one of them ever needs the same
// treatment; every consumer (hi-res PDF + print-preview) reads this one
// place, so there's nowhere else a margin value could get out of sync.
//
// fullsheet's bottom is 8mm, not 1mm like waferletter. Originally raised to
// clear dark roller-slip banding this business's Canon printer left in the
// last ~2-2.5cm of the sheet — since resolved by switching to matte photo
// paper, not a margin change, so 8mm is a smaller safety margin against the
// same failure mode (not zero, since this was a real physical printer
// limitation once and matte stock hasn't been tested exhaustively), not the
// original clearance this was raised to. Deliberately separate objects
// (previously one shared WHOLE_SHEET_MARGIN_MM, by design, so the two could
// never drift apart) — this is fullsheet-specific stock/printer behavior,
// so waferletter keeps the original 1mm bottom.
//
// fullsheet's left/right are pinned to the exact side margin it already
// had before this fix (560/99mm ≈ 5.657mm, the side margin the OLD
// uniform-scale-to-A4-aspect formula produced at top=15/bottom=1) — raising
// bottom to clear the printer artifact must not also silently widen the
// sides. To hold that while still avoiding crop/distortion, fullsheet uses
// 'box' fitMode below: the design area becomes EXACTLY the box these four
// margins carve out of the sheet (no forced A4 aspect ratio), and the
// client editor's own working canvas for fullsheet is sized to that exact
// same box (see designAreaInForShape() below, read by app/page.js's
// computeCanvasSize()/printW/printH) — so the source raster already has the
// box's proportions and placing it full-size onto the PDF page needs no
// scaling that would distort it. waferletter has no fitMode (defaults to
// the original scale-to-fit-A4-aspect behavior below) and is completely
// unaffected — different object, different formula branch, untouched
// config values.
const FULLSHEET_SIDE_MARGIN_MM = 560 / 99; // ≈ 5.657mm — see comment above
const FULLSHEET_MARGIN_MM = { top: 15, right: FULLSHEET_SIDE_MARGIN_MM, bottom: 8, left: FULLSHEET_SIDE_MARGIN_MM, fitMode: 'box' };
const WAFERLETTER_MARGIN_MM = { top: 15, right: 1, bottom: 1, left: 1 };
const SHEET_MARGIN_MM = {
  fullsheet: FULLSHEET_MARGIN_MM,
  waferletter: WAFERLETTER_MARGIN_MM,
};
function marginInForShape(shape) {
  const m = SHEET_MARGIN_MM[shape];
  if (!m) return null;
  return {
    top: m.top / MM_PER_IN, right: m.right / MM_PER_IN,
    bottom: m.bottom / MM_PER_IN, left: m.left / MM_PER_IN,
    fitMode: m.fitMode,
  };
}

// The exact box a 'box'-fitMode shape's design needs to fill — in inches,
// same units as sheetSizeInForShape(). Read by app/page.js so the client
// editor's own working canvas (and its 300 DPI hi-res export) is shaped
// like this box from the start, instead of the full untrimmed sheet — see
// the fullsheet margin comment above for why that's required to avoid
// distortion. Returns null for a shape with no margin, or one using the
// default scale-to-fit-A4-aspect behavior (there the working canvas
// legitimately IS the full sheet shape — computeSheetPlacement() scales
// that down uniformly afterward).
export function designAreaInForShape(shape) {
  const margin = marginInForShape(shape);
  if (!margin || margin.fitMode !== 'box') return null;
  const sheet = sheetSizeInForShape(shape);
  return { w: sheet.w - margin.left - margin.right, h: sheet.h - margin.top - margin.bottom };
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

// Multi-circle sheet grid math — moved here (from app/page.js, its only
// former home) so the server-side PDF generator can lay out the same grid
// of circles as the client preview does, for the cut-guide feature. Every
// consumer (inline editor, print-preview modal, hi-res export, and now the
// print-ready PDF) calls this one function/pair, so the grid can't
// silently diverge between what a customer sees and what prints.
export const MC_MARGIN = 0.25; // inches on each side
export const MC_GAP    = 0.15; // inches between circles
export function getCircleGrid(sheetW, sheetH, circleSize) {
  const usableW = sheetW - 2 * MC_MARGIN;
  const usableH = sheetH - 2 * MC_MARGIN;
  const step = circleSize + MC_GAP;
  const cols = Math.floor((usableW + MC_GAP) / step);
  const rows = Math.floor((usableH + MC_GAP) / step);
  return { cols, rows, count: cols * rows };
}

// cw/ch are the destination's own width/height, in whatever unit the caller
// is working in (px for a canvas, inches for the PDF's inch-based cut-guide
// placement) — every value returned below is in that same unit, since it's
// all just ratios of cw/ch and sizeObj's own inch measurements.
export function computeMultiCircleLayout(cw, ch, isMultiCircle, sizeObj) {
  if (!isMultiCircle) return { circlePx: cw, mcCols: 1, mcRows: 1, mcGapPx: 0, mcStepPx: cw, mcOffsetX: 0, mcOffsetY: 0 };
  const circleSize = sizeObj.circleSize || 2;
  const mcGapInches = sizeObj.gap ?? MC_GAP;
  const previewPPI = cw / (sizeObj.w || A4_IN.w);
  const circlePx = Math.round(circleSize * previewPPI);
  const { cols: mcCols, rows: mcRows } = (sizeObj.cols && sizeObj.rows)
    ? { cols: sizeObj.cols, rows: sizeObj.rows }
    : getCircleGrid(sizeObj.w || A4_IN.w, sizeObj.h || A4_IN.h, circleSize);
  const mcGapPx = mcGapInches * previewPPI;
  const mcStepPx = circlePx + mcGapPx;
  const mcTotalW = mcCols * circlePx + Math.max(0, mcCols - 1) * mcGapPx;
  const mcTotalH = mcRows * circlePx + Math.max(0, mcRows - 1) * mcGapPx;
  const mcOffsetX = (cw - mcTotalW) / 2;
  const mcOffsetY = (ch - mcTotalH) / 2;
  return { circlePx, mcCols, mcRows, mcGapPx, mcStepPx, mcOffsetX, mcOffsetY };
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
      const availW = sheet.w - margin.left - margin.right;
      const availH = sheet.h - margin.top - margin.bottom;
      let designW, designH;
      if (margin.fitMode === 'box') {
        // The design area IS the available box, exactly — no forced sheet
        // aspect ratio, no scale factor. Only correct because the source
        // raster for a 'box'-fitMode shape is captured at this exact same
        // proportion in the first place (see designAreaInForShape() above,
        // and its use in app/page.js) — placing it here at availW x availH
        // needs no scaling that would otherwise distort it.
        designW = availW;
        designH = availH;
      } else {
        // Scale the full-bleed composition down (uniformly — never distort,
        // never crop, same "always scale to fit" policy already used for
        // mismatched upload-flow files, see app/page.js's
        // getUploadTargetSizeIn comment) until it fits inside the margins.
        // This keeps the design at the sheet's own A4 aspect ratio, so the
        // actual left/right whitespace ends up as a side effect of whichever
        // axis is more constraining, not the literal margin.left/right
        // values — see marginInForShape() callers' docs for shapes that use
        // this branch (waferletter today).
        const scale = Math.min(availW / sheet.w, availH / sheet.h);
        designW = sheet.w * scale;
        designH = sheet.h * scale;
      }
      return {
        sheetW: sheet.w, sheetH: sheet.h,
        designW, designH,
        // Anchored to the required top margin exactly rather than centering
        // vertically — centering would let a tall/narrow scale factor starve
        // the top of its required clearance. Horizontal centering is always
        // safe since nothing needs asymmetric side clearance.
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
