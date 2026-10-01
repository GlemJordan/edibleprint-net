// Full Sheet print margins (lib/paper-config.js): 15mm top for the printer's
// grip, 13mm bottom (raised from 8mm — designs reaching the bottom of the old
// box printed past the printer's usable area), sides unchanged. Also checks
// that an order made while the bottom was still 8mm keeps its proportions
// when its PDF is regenerated now (fitRasterInPlacement()), instead of being
// squashed into the new, shorter box.
//
// Pure functions — nothing external is touched, no dev server needed.
import { computeSheetPlacement, designAreaInForShape, fitRasterInPlacement } from '../lib/paper-config.js';

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
