// The admin cut file for the Brother ScanNCut (lib/cut-svg.js): a real A4 page
// in millimetres holding only the cut outline — no raster — in the same
// positions the print-ready PDF's cut guide uses, and offered only for designs
// that have a shape to cut.
//
// Pure functions — nothing external is touched, no dev server needed. (The
// download route itself needs an admin session and a stored order, so it isn't
// exercised here.)
import { buildCutSvg } from '../lib/cut-svg.js';
import { cutGuidePaths, cutGuideSizeObj, parseDesignSizeForPdf } from '../lib/generate-pdf.js';
import { designHasCutOutline } from '../lib/cut-guide-config.js';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

const nums = (s) => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const pathsIn = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

const designs = {
  round:       { shape: 'circular', size: '6" Round', shapeLabel: 'Round' },
  heart:       { shape: 'heart', size: '5" Heart' },
  square:      { shape: 'square', size: '4" Square' },
  customOval:  { shape: 'custom', size: '5"x7"', customShapeKind: 'oval' },
  customHex:   { shape: 'custom', size: '4"x4"', customShapeKind: 'hexagon' },
  cookies2:    { shape: 'multicircle', size: '2” Circles on A4 Sheet' },
  cookies3:    { shape: 'multicircle', size: '3” Circles on A4 Sheet' },
  bw:          { shape: 'bwsheet', size: 'B&W Sheet' },
};

for (const [name, d] of Object.entries(designs)) {
  check(`${name}: has a cut outline`, designHasCutOutline(d));
  const svg = buildCutSvg(d);
  const paths = pathsIn(svg);
  check(`${name}: A4 in real millimetres`, /width="210mm" height="297mm" viewBox="0 0 210 297"/.test(svg), svg.slice(0, 200));
  check(`${name}: outline only — no raster, no dashes`, !/<image|<img|data:|stroke-dasharray/.test(svg) && /fill="none"/.test(svg));
  check(`${name}: at least one path`, paths.length >= 1);

  // Same positions as the PDF's guide: the mm coordinates are the inch ones × 25.4.
  const { sizeInches, customW, customH } = parseDesignSizeForPdf(d);
  const inchPaths = cutGuidePaths({ shape: d.shape, customShapeKind: d.customShapeKind, sizeObj: cutGuideSizeObj(d.shape, sizeInches), customW, customH });
  check(`${name}: same number of outlines as the PDF guide`, inchPaths.length === paths.length, [inchPaths.length, paths.length]);
  const same = inchPaths.every((p, i) => {
    const a = nums(p), b = nums(paths[i]);
    return a.length === b.length && a.every((v, k) => Math.abs(v * 25.4 - b[k]) < 0.002 || Math.abs(v - b[k]) < 0.002 /* arc flags */);
  });
  check(`${name}: positions match the PDF guide (×25.4 mm)`, same, paths[0]);

  // Everything lands on the sheet.
  const all = paths.flatMap(nums);
  check(`${name}: stays inside the 210×297 mm page`, all.every((v) => v >= -0.01 && v <= 297.01), [Math.min(...all), Math.max(...all)]);
}

// A round 6" design is a 152.4 mm circle centred horizontally on the sheet.
{
  // "M cx+rx cy A rx ry 0 1 0 cx-rx cy …": p[0] is the right edge, p[7] the left.
  const p = nums(pathsIn(buildCutSvg(designs.round))[0]);
  check('round 6": diameter is 152.4 mm', Math.abs((p[0] - p[7]) - 152.4) < 0.01, p);
  check('round 6": centred across the 210 mm width', Math.abs((p[0] + p[7]) / 2 - 105) < 0.01, p);
}

// Cookie sheets: one outline per circle, grid from the catalog (3×5 and 2×3).
check('2" cookie sheet: 15 circles', pathsIn(buildCutSvg(designs.cookies2)).length === 15, pathsIn(buildCutSvg(designs.cookies2)).length);
check('3" cookie sheet: 6 circles', pathsIn(buildCutSvg(designs.cookies3)).length === 6, pathsIn(buildCutSvg(designs.cookies3)).length);

// Who gets the button.
check('no cut outline for a Full Sheet', !designHasCutOutline({ shape: 'fullsheet', size: 'A4' }));
check('no cut outline for Wafer Paper', !designHasCutOutline({ shape: 'waferletter', size: 'A4' }));
check('no cut outline for a Custom design with no sub-shape (legacy)', !designHasCutOutline({ shape: 'custom', size: '5"x7"' }));
check('no cut outline for a customer-supplied upload', !designHasCutOutline({ shape: 'circular', size: '6"', sourceType: 'upload' }));
check('no cut outline for a missing design', !designHasCutOutline(undefined));
check('a legacy order with no cutGuide field still gets one (needs no image)', designHasCutOutline({ shape: 'circular', size: '6" Round' }));

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
