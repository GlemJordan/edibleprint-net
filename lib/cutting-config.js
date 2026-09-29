// Single source of truth for the "cut to shape" plotter option. Parallel to
// lib/material-config.js (which centralizes icing-vs-wafer the same way):
// no 'use client' here, so both the client editor and server routes
// (create-checkout price enforcement, production slip) import it directly.
//
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
// plotter passes than a sheet of larger ones; both sizes are $5.00 by the
// owner's decision — the whole cut of a sheet takes at most 10 minutes
// (measured on the ScanNCut SDX85). A size set to `null` would mean "not
// available yet": shapeSupportsCut() and cutSurchargeFor() treat `null` as
// not offered rather than free, so a size can be withdrawn without touching
// anything else.
export const CUT_SURCHARGE = {
  circular: 5.00,
  heart:    5.00,
  square:   5.00,
  custom:   5.00,
  multicircle: {
    mc3: 5.00, // cookie sheet of 6 (3" circles)
    mc2: 5.00, // cookie sheet of 15 (2" circles)
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
