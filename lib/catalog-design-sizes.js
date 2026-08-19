import { sheetSizeInForShape } from './paper-config.js';

// Display labels + physical dimensions (inches) for the shape/sizeId combos
// offered through the ready-made design catalog. Deliberately a hand-synced
// mirror of the relevant entries in app/page.js's SIZES — same tradeoff
// lib/catalog-prices.js already accepts and documents (page.js is a
// 'use client' component and can't be imported into this standalone route).
// Every id here MUST also exist in lib/catalog-prices.js's CATALOG_PRICES —
// that's what actually prices it; this file only supplies the label/w/h
// used to render the picker and drive the hi-res canvas size.
//
// Only shapes that make sense for a "PNG with a clear center" catalog design
// are listed — multicircle/bwsheet/waferletter aren't offered here (nothing
// stops a future design from adding one if it ever fits).
const ICING_SHEET_IN = sheetSizeInForShape('fullsheet');

export const CATALOG_DESIGN_SIZES = {
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
  square: [
    { id: 's5', label: '5"×5" Topper (13cm)', w: 5, h: 5 },
    { id: 's6', label: '6"×6" Topper (15cm)', w: 6, h: 6 },
    { id: 's7', label: '7"×7" Topper (18cm)', w: 7, h: 7 },
    { id: 's8', label: '8"×8" Topper (20cm)', w: 8, h: 8 },
  ],
  fullsheet: [
    { id: 'a4', label: 'A4 Full Sheet (210×297mm / 8.27"×11.69")', w: ICING_SHEET_IN.w, h: ICING_SHEET_IN.h },
  ],
};

export function sizesForShape(shape) {
  return CATALOG_DESIGN_SIZES[shape] || [];
}

export function findSize(shape, sizeId) {
  return sizesForShape(shape).find((s) => s.id === sizeId) || null;
}
