// The printer's safe band on A4 (lib/paper-config.js): 15mm clear at the top
// for the printer's grip, 13mm at the bottom (raised from 8mm — designs
// reaching the bottom of the old box printed past the printer's usable area).
//
// - Full Sheet: exactly 15mm top / 13mm bottom, sides unchanged. An order
//   made while the bottom was still 8mm keeps its proportions when its PDF
//   is regenerated (fitRasterInPlacement()) instead of being squashed.
// - Custom: limited to CUSTOM_MAX_IN (10.5" tall), which clears the band
//   when centered; an older, taller Custom order is scaled/nudged inside it.
// - Every catalog size (round/heart/square/cookie sheets/B&W) keeps exactly
//   the position it had before, so stored PDFs and cut files still match.
//
// Pure functions — nothing external is touched, no dev server needed.
import { computeSheetPlacement, designAreaInForShape, fitRasterInPlacement, CUSTOM_MAX_IN } from '../lib/paper-config.js';
import { CATALOG_SIZES } from '../lib/catalog-sizes.js';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

const MM = 25.4;
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const marginsMm = (p, f = p) => ({
  top: f.offsetY * MM,
  bottom: (p.sheetH - f.offsetY - f.designH) * MM,
  left: f.offsetX * MM,
  right: (p.sheetW - f.offsetX - f.designW) * MM,
});

const p = computeSheetPlacement('fullsheet', {});
const m = marginsMm(p);
check('full sheet: 15mm top', near(m.top, 15), m.top);
check('full sheet: 13mm bottom', near(m.bottom, 13), m.bottom);
check('full sheet: sides unchanged (560/99mm)', near(m.left, 560 / 99) && near(m.right, 560 / 99), m);
const box = designAreaInForShape('fullsheet');
check('editor canvas box matches the PDF box', near(box.w, p.designW, 1e-9) && near(box.h, p.designH, 1e-9), { box, p });

// A raster made with today's box fills it exactly (300 DPI rounding included).
const cur = fitRasterInPlacement('fullsheet', p, Math.round(box.w * 300), Math.round(box.h * 300));
check('current raster: drawn at the box, unchanged', cur.designW === p.designW && cur.designH === p.designH && cur.offsetX === p.offsetX && cur.offsetY === p.offsetY, cur);

// A raster from an order made with the old 8mm bottom: taller than today's box.
const oldW = Math.round(box.w * 300);
const oldH = Math.round(((297 - 15 - 8) / MM) * 300);
const old = fitRasterInPlacement('fullsheet', p, oldW, oldH);
const om = marginsMm(p, old);
check('legacy raster: proportions kept (no stretch)', near((old.designW / old.designH) / (oldW / oldH), 1, 1e-9), old);
check('legacy raster: still 15mm top', near(om.top, 15), om);
check('legacy raster: never past the 13mm bottom', om.bottom >= 13 - 0.01, om);
check('legacy raster: centered, inside the side margins', near(om.left, om.right) && om.left >= 560 / 99 - 0.01, om);

// Custom: the largest size the editor accepts clears the safe band, centered.
const cmax = computeSheetPlacement('custom', {}, CUSTOM_MAX_IN.w, CUSTOM_MAX_IN.h);
const cm = marginsMm(cmax);
check(`custom ${CUSTOM_MAX_IN.w}"x${CUSTOM_MAX_IN.h}": at least 15mm top`, cm.top >= 15 - 0.01, cm);
check(`custom ${CUSTOM_MAX_IN.w}"x${CUSTOM_MAX_IN.h}": at least 13mm bottom`, cm.bottom >= 13 - 0.01, cm);
check(`custom ${CUSTOM_MAX_IN.w}"x${CUSTOM_MAX_IN.h}": still centered`, near(cm.top, cm.bottom), cm);
check('custom max height is 10.5"', CUSTOM_MAX_IN.h === 10.5, CUSTOM_MAX_IN);

// An older 8"x11" Custom order (the previous limit) no longer prints past the band.
const c11 = computeSheetPlacement('custom', {}, 8, 11);
const c11m = marginsMm(c11);
check('legacy custom 8"x11": 15mm top', c11m.top >= 15 - 0.01, c11m);
check('legacy custom 8"x11": 13mm bottom', c11m.bottom >= 13 - 0.01, c11m);
check('legacy custom 8"x11": proportions kept', near(c11.designW / c11.designH, 8 / 11, 1e-9), c11);

// Every catalog size keeps its previous (sheet-centered) position exactly.
// (Cookie sheets lay out their grid in computeMultiCircleLayout(), which this
// change doesn't touch, so they're not listed here.)
for (const [shape, sizes] of Object.entries(CATALOG_SIZES)) {
  if (shape === 'fullsheet' || shape === 'multicircle') continue;
  for (const s of sizes) {
    const sp = computeSheetPlacement(shape, s);
    check(`${shape} ${s.id}: position unchanged (centered)`, near(sp.offsetY, (sp.sheetH - sp.designH) / 2, 1e-9), sp);
  }
}

// Other shapes are untouched by the raster fit.
for (const shape of ['circular', 'multicircle', 'bwsheet', 'waferletter']) {
  const sp = computeSheetPlacement(shape, { w: 6, h: 11.69, circleSize: 2 });
  const sf = fitRasterInPlacement(shape, sp, 1000, 777);
  check(`${shape}: placement unchanged by the raster fit`, sf.designW === sp.designW && sf.designH === sp.designH && sf.offsetX === sp.offsetX && sf.offsetY === sp.offsetY, sf);
}

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
