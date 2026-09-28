import { sheetSizeInForShape } from './paper-config.js';
import { cutGuidePaths, cutGuideSizeObj, parseDesignSizeForPdf } from './generate-pdf.js';

// Admin-only cut file for the Brother ScanNCut SDX85: one A4 page in real
// millimetres holding ONLY the design's cut outline — no raster image, no
// fill, no dashes — placed exactly where the print-ready PDF puts the same
// shape, so the machine cuts along the printed sheet. Canvas Workspace turns
// the SVG into a .fcm. The positions come from cutGuidePaths() (the function
// the PDF's cut guide also draws from), scaled to millimetres.

const MM_PER_IN = 25.4;
// Hairline: the machine only reads the path, this just keeps it visible in
// a viewer. Black + no fill is what cutter software reads as a cut line.
const STROKE_MM = 0.25;

// Three decimals (1 µm) is far below what a blade can follow, and keeps the
// file readable instead of carrying 15-digit floats.
function tidy(d) {
  return d.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, (n) => String(Math.round(parseFloat(n) * 1000) / 1000).replace(/^-0$/, '0'));
}

/**
 * @param {{ shape: string, size: string, customShapeKind?: string }} design  a stored order design
 * @returns {string} the SVG document
 */
export function buildCutSvg(design) {
  const { sizeInches, customW, customH } = parseDesignSizeForPdf(design);
  const sheet = sheetSizeInForShape(design.shape);
  const wMm = Math.round(sheet.w * MM_PER_IN * 1000) / 1000;
  const hMm = Math.round(sheet.h * MM_PER_IN * 1000) / 1000;

  const paths = cutGuidePaths({
    shape: design.shape,
    customShapeKind: design.customShapeKind,
    sizeObj: cutGuideSizeObj(design.shape, sizeInches),
    customW, customH,
  }, MM_PER_IN);

  const lines = paths.map((d) => `    <path d="${tidy(d)}"/>`).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}">`,
    `  <g id="cut" fill="none" stroke="#000000" stroke-width="${STROKE_MM}">`,
    lines,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}
