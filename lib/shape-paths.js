// Single source of truth for a printable shape's outline geometry, returned
// as an SVG path `d` string in whatever x/y/w/h unit the caller passes in
// (canvas px for the on-screen preview, PDF points for the print-ready
// file). Both renderers stroke this exact string — the browser via
// `ctx.stroke(new Path2D(d))`, pdf-lib via `page.drawSvgPath(d, ...)` — so
// the cut guide a customer sees before buying can never trace a different
// line than the one that actually prints.
//
// No 'use client' here — this is a plain, DOM-free function, so the
// server-side PDF generator (lib/generate-pdf.js) can import it directly
// alongside the client editor (app/page.js).
//
// Mirrors the geometry of drawHeartPath()/appendCustomShapeClipPath() in
// app/page.js (used there for the design's own clip masks) but returns path
// DATA instead of replaying calls onto a live ctx, so it works with no
// canvas at all.
export function shapeOutlinePath(kind, x, y, w, h) {
  if (kind === 'circle' || kind === 'oval') {
    const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z`;
  }
  if (kind === 'heart') {
    const centerX = x + w / 2;
    const notchY = y + h * 0.28;
    return [
      `M ${centerX} ${notchY}`,
      `C ${centerX - w * 0.1} ${y} ${x} ${y + h * 0.1} ${x + w * 0.02} ${y + h * 0.38}`,
      `C ${x + w * 0.02} ${y + h * 0.58} ${x + w * 0.3} ${y + h * 0.78} ${centerX} ${y + h * 0.99}`,
      `C ${x + w * 0.7} ${y + h * 0.78} ${x + w * 0.98} ${y + h * 0.58} ${x + w * 0.98} ${y + h * 0.38}`,
      `C ${x + w} ${y + h * 0.1} ${centerX + w * 0.1} ${y} ${centerX} ${notchY}`,
      'Z',
    ].join(' ');
  }
  if (kind === 'triangle') {
    return `M ${x + w / 2} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  if (kind === 'hexagon') {
    const cx = x + w / 2, cy = y + h / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 3);
      pts.push(`${cx + (w / 2) * Math.cos(angle)} ${cy + (h / 2) * Math.sin(angle)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  }
  // 'rectangle' and any unrecognized/undefined kind
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}
