import { CATALOG_SIZES } from './catalog-sizes.js';

// Display labels + physical dimensions (inches) for the shape/sizeId combos
// offered through the ready-made design catalog — sourced from the same
// lib/catalog-sizes.js that app/page.js's SIZES builds off of, so this
// picker's labels/dimensions can't drift from what the editor shows for
// the same id (see lib/catalog-sizes.js's header comment for why that used
// to be a hand-synced copy).
// Every id here MUST also exist in lib/catalog-prices.js's CATALOG_PRICES —
// that's what actually prices it.
//
// Only shapes that make sense for a "PNG with a clear center" catalog design
// are listed — multicircle/bwsheet/waferletter aren't offered here (nothing
// stops a future design from adding one if it ever fits).
export const CATALOG_DESIGN_SIZES = {
  circular: CATALOG_SIZES.circular,
  heart: CATALOG_SIZES.heart,
  square: CATALOG_SIZES.square,
  fullsheet: CATALOG_SIZES.fullsheet,
};

export function sizesForShape(shape) {
  return CATALOG_DESIGN_SIZES[shape] || [];
}

export function findSize(shape, sizeId) {
  return sizesForShape(shape).find((s) => s.id === sizeId) || null;
}
