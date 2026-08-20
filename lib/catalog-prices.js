// Server-authoritative prices for every catalog shape + sizeId. Mirrors the
// client-side SIZES config in app/page.js — kept in sync by hand since that
// file is a 'use client' component and can't be imported into a server
// route. create-checkout recomputes EVERY design's price from this table
// (by shape + sizeId, or customShapePrice() below for shape === 'custom')
// rather than trusting the client-sent unitPrice.
//
// Before this, only waferletter and "I already have my design" upload-flow
// designs were price-enforced server-side — circular/heart/square/
// multicircle/fullsheet/bwsheet reached through the ordinary editor had
// their price trusted as-is from the client, so a tampered request could
// check out any of those at any price. Every catalog shape is covered now.
//
// Material (icing vs wafer, lib/material-config.js) is NOT a key here —
// both cost exactly the same for a given shape+size, so there's no separate
// wafer price row anymore (there used to be, back when wafer was its own
// 'waferletter' shape instead of a material crossing every shape below).
export const CATALOG_PRICES = {
  circular:    { c5: 14.99, c6: 14.99, c7: 19.99, c8: 19.99 },
  heart:       { h6: 14.99, h7: 19.99, h8: 19.99 },
  multicircle: { mc125: 19.99, mc2: 19.99, mc3: 19.99 },
  square:      { s5: 14.99, s6: 14.99, s7: 19.99, s8: 19.99 },
  fullsheet:   { a4: 19.99 },
  bwsheet:     { bw1: 9.99 },
};

// shape === 'custom' has no catalog id — price is area-based instead.
// Mirrors the identical formula in app/page.js's Order Summary blocks.
export function customShapePrice(customW, customH) {
  const area = (parseFloat(customW) || 0) * (parseFloat(customH) || 0);
  return area > 0 && area <= 36 ? 14.99 : 19.99;
}
