import { WAFER_PAPER_PRICE } from './wafer-paper-config.js';

// Server-authoritative prices for the three flat-sheet formats reachable
// through the "I already have my design" customer-file flow. Mirrors the
// client-side SIZES config in app/page.js — kept in sync by hand since the
// client file can't be imported into a server route (it's a 'use client'
// component). Must match SIZES.fullsheet[0].price / SIZES.bwsheet[0].price.
export const PRINT_FORMAT_PRICES = {
  fullsheet: 19.99,
  bwsheet: 9.99,
  waferletter: WAFER_PAPER_PRICE,
};
