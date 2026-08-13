// Canvas rendering for the ready-made design catalog. Deliberately separate
// from app/page.js's drawText()/ImageEditor — that engine anchors text to a
// single free-dragged point with no max-width or alignment, which can't
// guarantee text stays inside a catalog design's pre-defined clear zone.
// This module adds: a bounded zone (position + max width + alignment) with
// auto-shrink-then-wrap so a long name can never spill out of the clear
// area, and it's the ONLY thing this feature needed that couldn't just reuse
// existing app/page.js logic.

// Five fonts curated from the full set app/layout.js already loads via
// Google Fonts (see the <link> in the root layout) — a deliberately small,
// pre-vetted list rather than exposing every font the editor offers.
export const CATALOG_FONTS = [
  { id: 'outfit', label: 'Modern (Outfit)', family: "'Outfit', sans-serif" },
  { id: 'fraunces', label: 'Elegant (Fraunces)', family: "'Fraunces', serif" },
  { id: 'dancing-script', label: 'Script (Dancing Script)', family: "'Dancing Script', cursive" },
  { id: 'pacifico', label: 'Playful (Pacifico)', family: "'Pacifico', cursive" },
  { id: 'bangers', label: 'Bold (Bangers)', family: "'Bangers', cursive" },
];

// Catalog source PNGs always leave a WHITE clear center (see the manifest
// contract), so white text — the editor's own default — would be nearly
// invisible here. Lead with a dark color instead; white stays available for
// designs with a non-white clear zone.
export const CATALOG_TEXT_COLORS = [
  '#111111', '#1B6B4A', '#E8704A', '#B08D57', '#C2185B', '#1E6FBF', '#FFFFFF',
];

const MIN_FONT_PX = 14;
const LINE_GAP_RATIO = 1.15;

/**
 * Draws `text` inside a design's textZone, shrinking (and, if still too
 * wide at the minimum readable size, wrapping to a second line) so it never
 * overflows `zone.maxWidthPercent` of the canvas. zone.position is a
 * percentage point (0-100), matching the convention app/page.js's
 * textOverlay.position already uses.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ text: string, fontFamily: string, color: string, baseFontSizePx: number }} opts
 * @param {{ position: {x:number,y:number}, maxWidthPercent: number, align: 'left'|'center'|'right' }} zone
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function drawZoneText(ctx, { text, fontFamily, color, baseFontSizePx }, zone, canvasW, canvasH) {
  const value = (text || '').trim();
  if (!value) return;

  const cx = (zone.position?.x ?? 50) / 100 * canvasW;
  const cy = (zone.position?.y ?? 50) / 100 * canvasH;
  const maxWidthPx = (zone.maxWidthPercent ?? 60) / 100 * canvasW;
  const align = zone.align || 'center';

  let fontSize = baseFontSizePx;
  let lines = [value];

  const fits = (size, str) => {
    ctx.font = `600 ${size}px ${fontFamily}`;
    return ctx.measureText(str).width <= maxWidthPx;
  };

  while (fontSize > MIN_FONT_PX && !fits(fontSize, value)) {
    fontSize -= 2;
  }

  if (!fits(fontSize, value)) {
    // Still doesn't fit at the minimum size — wrap onto a second line at
    // the nearest whitespace to the midpoint, rather than shrinking further
    // into illegibility.
    const words = value.split(/\s+/);
    if (words.length > 1) {
      let mid = Math.ceil(words.length / 2);
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
      while (fontSize > MIN_FONT_PX && lines.some((l) => !fits(fontSize, l))) {
        fontSize -= 2;
      }
    }
  }

  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const tx = align === 'left' ? cx - maxWidthPx / 2 : align === 'right' ? cx + maxWidthPx / 2 : cx;
  const lineHeight = fontSize * LINE_GAP_RATIO;
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    const ty = startY + i * lineHeight;
    ctx.strokeStyle = 'rgba(0,0,0,0.70)';
    ctx.lineWidth = Math.max(1, fontSize * 0.06);
    ctx.strokeText(line, tx, ty);
    ctx.fillStyle = color || '#FFFFFF';
    ctx.fillText(line, tx, ty);
  });
}

/**
 * Draws `img` into the canvas fully covering [0,0,boxW,boxH] (crop-to-fill,
 * never letterboxed/distorted) — same "cover" convention app/page.js's
 * fitMode uses for non-custom shapes, so a catalog design's source PNG
 * behaves the way customers already expect a design to behave on a given
 * shape.
 */
export function drawCoverFit(ctx, img, boxW, boxH) {
  const scale = Math.max(boxW / img.width, boxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (boxW - drawW) / 2;
  const dy = (boxH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}
