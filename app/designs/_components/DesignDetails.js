import Link from 'next/link';
import { getActiveDesigns, getCategories, supportsPhoto } from '../../../lib/design-catalog.js';
import { sizesForShape } from '../../../lib/catalog-design-sizes.js';
import { CATALOG_PRICES } from '../../../lib/catalog-prices.js';
import { shapeDisplayLabel } from '../../../lib/paper-config.js';
import { shapeSupportsMaterial } from '../../../lib/material-config.js';
import { formatProductionWindow } from '../../../lib/shipping-config.js';
import { LandingFooter } from '../../_components/LandingChrome.js';
import DesignCard from './DesignCard.js';

// Server-rendered details under each design's customizer (app/designs/[id]).
// The customizer itself is a client component with almost no text of its own,
// so without this block every design page looked the same to Google apart
// from its name, and some were left as "Crawled - currently not indexed".
// Everything here comes from the catalog manifest and the price/size tables,
// so it can't disagree with what the customizer and checkout charge.

const C = {
  brand: '#1f5236', text: '#1a2420', muted: '#5c6b62', border: '#d9e2d6', white: '#fff', bg: '#FAFBF9',
};
const RELATED_COUNT = 4;
const money = (n) => `$${n.toFixed(2)}`;
const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 12px' };
const cell = { padding: '9px 12px 9px 0', borderBottom: '1px solid ' + C.border, verticalAlign: 'top', fontSize: 14.5 };

function relatedDesigns(design) {
  const others = getActiveDesigns().filter((d) => d.id !== design.id);
  const sameCategory = others.filter((d) => d.category === design.category);
  const rest = others.filter((d) => d.category !== design.category);
  return [...sameCategory, ...rest].slice(0, RELATED_COUNT);
}

export default function DesignDetails({ design }) {
  const categories = getCategories();
  const labelOf = (id) => categories.find((c) => c.id === id)?.label || id;
  const rows = design.supportedShapes.flatMap((shape) => sizesForShape(shape).map((size) => ({
    key: `${shape}-${size.id}`,
    format: shapeDisplayLabel(shape),
    size: size.label,
    price: CATALOG_PRICES[shape]?.[size.id],
  }))).filter((r) => typeof r.price === 'number');
  const photo = design.supportedShapes.some((shape) => supportsPhoto(design, shape));
  const material = design.supportedShapes.every(shapeSupportsMaterial);
  const related = relatedDesigns(design);
  const sameCategoryOnly = related.every((d) => d.category === design.category);

  return (
    <section style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, color: C.text, borderTop: '1px solid ' + C.border }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 8px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 style={h2}>Formats and prices</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 13 }}>Format</th>
                <th style={{ ...cell, textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 13 }}>Size</th>
                <th style={{ ...cell, textAlign: 'right', color: C.muted, fontWeight: 600, fontSize: 13, paddingRight: 0 }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={cell}>{r.format}</td>
                  <td style={cell}>{r.size}</td>
                  <td style={{ ...cell, textAlign: 'right', paddingRight: 0, fontWeight: 600 }}>{money(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Prices in CAD, per sheet. No tax charged.</p>
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <h2 style={h2}>What you can personalize</h2>
          <ul style={{ margin: '0 0 24px', paddingLeft: 20, lineHeight: 1.7, fontSize: 14.5 }}>
            <li>A name and, if you like, an age or year, in your choice of fonts and text colours.</li>
            {photo && <li>Your own photo in the clear centre of the design, with zoom and position controls before you order.</li>}
            {material && <li>Printed on an icing sheet or on wafer paper, at the same price.</li>}
            <li>A live preview of the finished topper before checkout.</li>
          </ul>

          <h2 style={h2}>Pickup and shipping</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
            Ready in {formatProductionWindow()}. Free pickup in London, ON, or shipping anywhere in Canada with Canada Post.{' '}
            <Link href="/shipping" style={{ color: C.brand }}>Shipping details</Link>
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 0' }}>
          <h2 style={h2}>{sameCategoryOnly ? `More ${labelOf(design.category)} designs` : 'More ready-made designs'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
            {related.map((d) => <DesignCard key={d.id} design={d} categoryLabel={labelOf(d.category)} />)}
          </div>
          <p style={{ margin: '18px 0 0', fontSize: 14.5 }}>
            <Link href="/designs" style={{ color: C.brand, fontWeight: 600 }}>See all designs →</Link>
          </p>
        </div>
      )}

      <LandingFooter path={`/designs/${design.id}`} />
    </section>
  );
}
