// Single source of truth for the "cut to shape" plotter option. Parallel to
// lib/material-config.js (which centralizes icing-vs-wafer the same way):
// no 'use client' here, so both the client editor and server routes
// (create-checkout price enforcement, production slip) import it directly.
//
// FEATURE FLAG — read this before touching anything else in this file.
// The whole option stays invisible to customers and unpriceable server-side
// while CUTTING_ENABLED is false. Flip it to true only once the plotter is
// physically in hand and calibrated — and only after the two null prices
// below are filled in with real, timed values. Every helper below already
// checks this flag, so nothing else needs to change when it flips.
export const CUTTING_ENABLED = false;

// Shapes that offer the cut-to-shape option. fullsheet/bwsheet are
// deliberately excluded — both print to the full A4 sheet edge-to-edge (or,
// for bwsheet, a centered square with no separate outline), so there's
// nothing for the plotter to cut around.
export const CUT_SHAPES = ['circular', 'heart', 'square', 'custom', 'multicircle'];

// Per-shape surcharge for cutting, in dollars. Flat for round/heart/square/
// custom — one pass around one outline regardless of size. multicircle
// needs one price per circle size instead, since a sheet of smaller circles
// takes more plotter passes (more perimeter) than a sheet of larger ones.
//
// mc2/mc3 start at `null`, not a guessed number: shipping a wrong price
// here is worse than shipping no option at all, and every consumer below
// (shapeSupportsCut, cutSurchargeFor) already treats `null` as "not
// available yet" rather than "free". Replace each with the real price after
// timing the plotter on that size — do not fill these in with a guess.
export const CUT_SURCHARGE = {
  circular: 5.00,
  heart:    5.00,
  square:   5.00,
  custom:   5.00,
  multicircle: {
    mc3: null, // TODO(plotter-timing): cookie sheet of 6 (3" circles) — time the plotter, then set this
    mc2: null, // TODO(plotter-timing): cookie sheet of 15 (2" circles) — time the plotter, then set this
  },
};

// True only when the cut option is something a customer can actually pick
// and pay for right now: the feature flag is on, the shape offers cutting,
// and (for multicircle) that specific size already has a real timed price.
// A multicircle size still at `null` returns false here — same as the
// feature being off entirely — so the UI simply doesn't offer it instead of
// advertising something that can't be fulfilled yet.
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
