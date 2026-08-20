import { sheetSizeInForShape, BWSHEET_DESIGN_IN } from './paper-config.js';

// Canonical, price-free catalog of shape/sizeId combos: id/label/w/h plus
// whatever shape-specific extras that shape needs (multicircle's
// sublabel/circleSize/cols/rows/gap; bwsheet's sublabel/printW/printH/
// grayscale). This is the ONE place these get typed — app/page.js's SIZES
// (client editor + pricing section) and lib/catalog-design-sizes.js's
// CATALOG_DESIGN_SIZES (ready-made design picker) both build off this file
// instead of hand-copying it, so the two can no longer silently drift apart
// (same class of bug the print-preview layout hit before it was centralized
// into lib/paper-config.js).
//
// No 'use client' here — unlike app/page.js, this is a plain data module,
// so server-only code (lib/catalog-design-sizes.js, scripts/validate-
// design-catalog.mjs) can import it directly. That's the actual reason the
// two catalogs were hand-synced instead of sharing a source before: a
// server module can't import from a 'use client' file.
//
// Price is NOT here — prices are server-authoritative and live in
// lib/catalog-prices.js; app/page.js merges the two together into its
// display SIZES so the price shown to the customer and the price
// create-checkout enforces can never be typed in two different places.
//
// 'custom' isn't listed — it has no fixed size (w/h come from user input
// at checkout time), so it stays defined locally in app/page.js.
//
// No per-material variants here either — physical size doesn't depend on
// material (both print on A4), and material is now a choice that crosses
// every shape below rather than a shape/size entry of its own. See
// lib/material-config.js.
const ICING_SHEET_IN = sheetSizeInForShape('fullsheet');

export const CATALOG_SIZES = {
  circular: [
    { id: 'c5', label: '5" Round Topper (13cm)', w: 5, h: 5 },
    { id: 'c6', label: '6" Round Topper (15cm)', w: 6, h: 6 },
    { id: 'c7', label: '7" Round Topper (18cm)', w: 7, h: 7 },
    { id: 'c8', label: '8" Round Topper (20cm)', w: 8, h: 8 },
  ],
  heart: [
    { id: 'h6', label: '6" Heart Topper (15cm)', w: 6, h: 6 },
    { id: 'h7', label: '7" Heart Topper (18cm)', w: 7, h: 7 },
    { id: 'h8', label: '8" Heart Topper (20cm)', w: 8, h: 8 },
  ],
  multicircle: [
    { id: 'mc125', label: '1.25” Circles on A4 Sheet', sublabel: '40 mini cookies/sheet', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, circleSize: 1.25, cols: 5, rows: 8,  gap: 0.10 },
    { id: 'mc2',   label: '2” Circles on A4 Sheet',   sublabel: '15 cookies/sheet',      w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, circleSize: 2,    cols: 3, rows: 5,  gap: 0.15 },
    { id: 'mc3',   label: '3” Circles on A4 Sheet',   sublabel: '6 cookies/sheet',       w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, circleSize: 3,    cols: 2, rows: 3,  gap: 0.20 },
  ],
  square: [
    { id: 's5', label: '5"×5" Topper (13cm)', w: 5, h: 5 },
    { id: 's6', label: '6"×6" Topper (15cm)', w: 6, h: 6 },
    { id: 's7', label: '7"×7" Topper (18cm)', w: 7, h: 7 },
    { id: 's8', label: '8"×8" Topper (20cm)', w: 8, h: 8 },
  ],
  fullsheet: [
    { id: 'a4', label: 'A4 Full Sheet (210×297mm / 8.27"×11.69")', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h },
  ],
  bwsheet: [
    { id: 'bw1', label: '6.5"×6.5" B&W Square', sublabel: 'Centered on A4 sheet', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h, printW: BWSHEET_DESIGN_IN, printH: BWSHEET_DESIGN_IN, grayscale: true },
  ],
};

export function sizesForShape(shape) {
  return CATALOG_SIZES[shape] || [];
}

export function findSize(shape, sizeId) {
  return sizesForShape(shape).find((s) => s.id === sizeId) || null;
}
