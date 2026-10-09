// Single source of truth for the "cut to shape" plotter option. Parallel to
// lib/material-config.js (which centralizes icing-vs-wafer the same way):
// no 'use client' here, so both the client editor and server routes
// (create-checkout price enforcement, production slip) import it directly.
//
import { CATALOG_SIZES } from './catalog-sizes.js';

// FEATURE FLAG — read this before touching anything else in this file.
// ON since the ScanNCut SDX85 cutting test passed (2026-09). Turning it off
// again hides the option from customers and makes it unpriceable server-side:
// every helper below checks this flag, so nothing else needs to change.
export const CUTTING_ENABLED = true;

// Shapes that offer the cut-to-shape option. fullsheet/bwsheet are
// deliberately excluded — both print to the full A4 sheet edge-to-edge (or,
// for bwsheet, a centered square with no separate outline), so there's
// nothing for the plotter to cut around.
export const CUT_SHAPES = ['circular', 'heart', 'square', 'custom', 'multicircle'];

// Per-shape surcharge for cutting, in dollars, PER SHEET (it is added to each
// unit of a design's quantity, and a sheet is one unit). Flat for round/heart/
// square/custom — one pass around one outline regardless of size. multicircle
// is keyed by circle size because a sheet of smaller circles takes more
// plotter passes than a sheet of larger ones; both sizes are $4.99 by the
// owner's decision — the whole cut of a sheet takes at most 10 minutes
// (measured on the ScanNCut SDX85). A size set to `null` would mean "not
// available yet": shapeSupportsCut() and cutSurchargeFor() treat `null` as
// not offered rather than free, so a size can be withdrawn without touching
// anything else.
//
// Every customer-facing text that states this amount (the "How would you
// like it?" cards, the FAQ, the pricing note, the Stripe line-item
// description, the order-summary cut line) reads it from here via
// cutSurchargeFor() rather than hardcoding "$4.99" — see the repo-wide grep
// this comment's own commit describes for how that was verified.
export const CUT_SURCHARGE = {
  circular: 4.99,
  heart:    4.99,
  square:   4.99,
  custom:   4.99,
  multicircle: {
    mc3: 4.99, // cookie sheet of 6 (3" circles)
    mc2: 4.99, // cookie sheet of 15 (2" circles)
  },
};

// True only when the cut option is something a customer can actually pick
// and pay for right now: the feature flag is on, the shape offers cutting,
// and (for multicircle) that specific size has a price. A size set to `null`
// returns false here — same as the feature being off entirely — so the UI
// simply doesn't offer it instead of advertising something that can't be
// fulfilled.
export function shapeSupportsCut(shape, sizeId) {
  if (!CUTTING_ENABLED) return false;
  if (!CUT_SHAPES.includes(shape)) return false;
  const entry = CUT_SURCHARGE[shape];
  if (typeof entry === 'number') return true;
  return typeof entry?.[sizeId] === 'number';
}

// The dollar amount to charge for cutting this shape/size. 0 whenever
// shapeSupportsCut() would be false for the same shape/size — callers still
// have to check shapeSupportsCut() themselves to know WHETHER to charge it,
// this just answers HOW MUCH.
export function cutSurchargeFor(shape, sizeId) {
  const entry = CUT_SURCHARGE[shape];
  const price = typeof entry === 'number' ? entry : entry?.[sizeId];
  return typeof price === 'number' ? price : 0;
}

// The ONE place that decides "was this design actually cut" — every
// consumer (production slip, admin order view, order-record snapshot)
// reads this instead of poking at design.cutToShape directly, same
// reasoning as resolveMaterial() in lib/material-config.js. Nothing legacy
// to fall back to here (this field never existed before this feature), so
// it's a plain boolean read for now — kept as a function anyway so a future
// legacy case has one place to land instead of being re-derived per caller.
export function resolveCut(design) {
  return design?.cutToShape === true;
}

// The client-side twin of resolveCut(): a design in the editor is only really
// cut when it is marked AND its shape/size still offers cutting (the editor
// resets a stale mark, but this keeps every reader honest in the meantime).
// A cut design never prints the cut guide — we cut it ourselves, so the
// dashed line would only be ink on the finished product.
export function cutIsActive(design) {
  return resolveCut(design) && shapeSupportsCut(design.shape, design.sizeId);
}

// Customer-facing names of the shapes that can be cut, in display order.
export const CUT_SHAPE_LABELS = {
  circular: 'Round',
  heart: 'Heart',
  square: 'Square',
  custom: 'Custom',
  multicircle: 'Cookie Sheets',
};

// What marketing copy (home page section, pricing note, landing pages) can
// honestly promise right now: every shape/size combo shapeSupportsCut()
// accepts, with its price. Derived instead of assuming every shape is on and
// costs what Round costs, so a per-shape price or a size withdrawn with
// `null` in CUT_SURCHARGE is reflected in the copy too.
export function cutOffer() {
  const items = [];
  for (const shape of CUT_SHAPES) {
    const sizeIds = (CATALOG_SIZES[shape] || []).map((s) => s.id);
    for (const sizeId of sizeIds.length ? sizeIds : [null]) {
      if (shapeSupportsCut(shape, sizeId)) items.push({ shape, sizeId, price: cutSurchargeFor(shape, sizeId) });
    }
  }
  const prices = items.map((i) => i.price);
  const cutShapes = [...new Set(items.map((i) => i.shape))];
  return {
    available: items.length > 0,
    shapeLabels: cutShapes.map((s) => CUT_SHAPE_LABELS[s] || s),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    // Toppers per sheet for each Cookie Sheet size that can be cut, e.g. [6, 15].
    cookieSheetCounts: items
      .filter((i) => i.shape === 'multicircle')
      .map((i) => CATALOG_SIZES.multicircle.find((s) => s.id === i.sizeId))
      .map((sz) => sz.cols * sz.rows)
      .sort((a, b) => a - b),
  };
}

// "+$4.99 per sheet", or "from +$3.99 per sheet" once prices differ by shape.
export function cutPriceLabel(offer = cutOffer()) {
  const amount = '$' + offer.minPrice.toFixed(2);
  return (offer.minPrice === offer.maxPrice ? '+' : 'from +') + amount + ' per sheet';
}

// "Round, Heart, Square, Custom & Cookie Sheets" (conjunction configurable).
export function cutShapesList(offer = cutOffer(), conjunction = '&') {
  const labels = offer.shapeLabels;
  if (labels.length <= 1) return labels.join('');
  return labels.slice(0, -1).join(', ') + ' ' + conjunction + ' ' + labels[labels.length - 1];
}
