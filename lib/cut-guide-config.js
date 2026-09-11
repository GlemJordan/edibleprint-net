// Single source of truth for the "cut guide" feature — the dashed outline a
// customer can opt into so the printed sheet shows exactly where their
// design's shape ends. Parallel to lib/material-config.js / lib/cutting-
// config.js's resolveX() pattern: every consumer (client editor/preview,
// checkout payload, PDF generation, admin downloads) reads this file
// instead of re-deriving which shapes support a guide or restyling the
// line independently — see lib/shape-paths.js for the matching geometry
// that both the canvas preview and the PDF stroke from this same spec.
//
// OFF BY DEFAULT: a design with no explicit choice (including every design
// saved before this feature existed) prints clean — matching what most
// customers expect and never guessed would show up on the physical sheet.

// fullsheet/waferletter print full-bleed edge-to-edge with no outline to
// trace (see isWholeSheetShape()/hasSheetMargin() in lib/paper-config.js) —
// a cut guide is meaningless for them, so they're deliberately excluded.
export const CUT_GUIDE_SHAPES = ['circular', 'heart', 'square', 'custom', 'multicircle', 'bwsheet'];

export function shapeSupportsCutGuide(shape, customShapeKind) {
  if (!CUT_GUIDE_SHAPES.includes(shape)) return false;
  // A Custom design saved before the sub-shape picker existed has no
  // customShapeKind at all — same "leave legacy designs exactly as they
  // rendered before" rule appendCustomShapeClipPath() already follows in
  // app/page.js, so this stays consistent with what the picker itself does.
  if (shape === 'custom' && !customShapeKind) return false;
  return true;
}

// The ONE place that decides "does this design get a cut guide" — every
// consumer reads this instead of poking at design.cutGuide directly, same
// reasoning as resolveMaterial()/resolveCut().
export function resolveCutGuide(design) {
  return design?.cutGuide === true && shapeSupportsCutGuide(design?.shape, design?.customShapeKind);
}

// Shapes whose hi-res export canvas baked the guide into the raster image
// UNCONDITIONALLY, before this feature existed and gave it an off-by-default
// toggle (see app/page.js's removed hi-res-canvas guide-drawing code). Same
// as CUT_GUIDE_SHAPES minus 'square' — square was the one guide-eligible
// shape that old hi-res canvas never actually drew a line for (its "else"
// branch only special-cased circular/heart/custom-with-a-kind), so a legacy
// square design's stored image genuinely is clean.
const ALWAYS_BAKED_PRE_FEATURE_SHAPES = CUT_GUIDE_SHAPES.filter((s) => s !== 'square');

// True for a design whose stored imageUrl already has the guide baked into
// its pixels from BEFORE this feature existed, with no way to regenerate a
// clean version from it. Every order created before this shipped has no
// `cutGuide` field at all (buildOrderRecord always writes a real boolean
// going forward, via resolveCutGuide() above) — verified against real
// production orders (a pre-feature circular/bwsheet design's Cloudinary
// image does show the old dashed line baked in). For these, neither "with
// guide" nor "without guide" can honestly deliver what it promises: without
// guide would still show the baked-in line, and with guide would draw a
// second line on top of it. Callers (the admin order page, the admin
// on-demand download route) MUST check this before offering/honoring either
// override, rather than silently generating a PDF that doesn't match what
// the button said.
export function hasLegacyBakedGuide(design) {
  return design?.cutGuide === undefined
    && ALWAYS_BAKED_PRE_FEATURE_SHAPES.includes(design?.shape)
    && shapeSupportsCutGuide(design?.shape, design?.customShapeKind);
}

// The shape-outline "kind" fed to shapeOutlinePath() (lib/shape-paths.js)
// for a given design — circular/heart map to their own curve, custom reads
// its chosen sub-shape, everything else (square, and bwsheet's centered
// margin square) is a plain rectangle.
export function cutGuideShapeKind(shape, customShapeKind) {
  if (shape === 'circular') return 'circle';
  if (shape === 'heart') return 'heart';
  if (shape === 'custom') return customShapeKind || 'rectangle';
  return 'rectangle';
}

// Compact single-character encoding for a Custom design's chosen sub-shape,
// used to pack all 5 order slots into one Stripe metadata key (mirrors
// cutFlags' one-char-per-design packing in app/api/create-checkout/
// route.js) instead of spending a d{i}_customShapeKind key per design —
// budget too tight to spare (see that file's designMeta comment). '-' means
// "not custom, or custom with no sub-shape chosen (legacy)" and correctly
// round-trips to shapeSupportsCutGuide()'s "no guide" case for both.
const CUSTOM_SHAPE_CODE = { rectangle: 'r', circle: 'c', oval: 'o', triangle: 't', hexagon: 'h' };
const CUSTOM_SHAPE_CODE_REVERSE = Object.fromEntries(Object.entries(CUSTOM_SHAPE_CODE).map(([k, v]) => [v, k]));

export function encodeCustomShapeKind(shape, customShapeKind) {
  if (shape !== 'custom') return '-';
  return CUSTOM_SHAPE_CODE[customShapeKind] || '-';
}

export function decodeCustomShapeKind(code) {
  return CUSTOM_SHAPE_CODE_REVERSE[code] || undefined;
}

// Visual spec, in two unit spaces — canvas px for the live/print-preview
// and PDF points for the printed file — since the two renderers work in
// physically different units. Same color both places so the guide reads as
// one consistent design language on screen and on paper.
export const CUT_GUIDE_COLOR = '#E8873C';
export const CUT_GUIDE_CANVAS_STYLE = { widthPx: 1.5, dashPx: [6, 4] };
export const CUT_GUIDE_PDF_STYLE = { widthPt: 1, dashPt: [4, 3] };
