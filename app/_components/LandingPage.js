import Link from 'next/link';
import { CATALOG_SIZES } from '../../lib/catalog-sizes.js';
import { CATALOG_PRICES } from '../../lib/catalog-prices.js';
import { productJsonLd } from '../../lib/site-config.js';
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164 } from '../../lib/business-info.js';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', brandDark: '#14503A',
  bg: '#FAFBF9', text: '#1a1a1a', muted: '#6B7280',
  border: '#E5E7EB', white: '#FFFFFF',
};

const RELATED = [
  ['Edible Images for Cakes', '/edible-images-for-cakes'],
  ['Edible Cookie Toppers', '/edible-cookie-toppers'],
  ['Edible Logo Prints', '/edible-logo-prints'],
  ['Edible Printing in London, ON', '/edible-images-london-ontario'],
  ['Ready-Made Designs', '/designs'],
];

// [shape, sizeId] -> { label, price }, read from the same tables checkout
// enforces so a landing page can't advertise a stale price.
function priceRows(items) {
  return items.map(([shape, sizeId, note]) => ({
    key: shape + sizeId,
    label: CATALOG_SIZES[shape].find((s) => s.id === sizeId).label,
    price: CATALOG_PRICES[shape][sizeId],
    note,
  }));
}

export default function LandingPage({ path, productName, description, heading, intro, ctaHref, ctaLabel, prices, priceNote, sections, faqs }) {
  const rows = priceRows(prices);
  const jsonLd = productJsonLd({ name: productName, description, path, prices: rows.map((r) => r.price) });

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 24px', borderBottom: '1px solid ' + C.border,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: C.brand }}>edible</span>
            <span style={{ color: C.text }}>print</span>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 4, fontFamily: "'Outfit', sans-serif" }}>.net</span>
          </span>
        </Link>
        <Link href={ctaHref} style={{ background: C.brand, color: '#fff', borderRadius: 10,
          padding: '10px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Order Now
        </Link>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 6vw, 52px)',
          fontWeight: 700, margin: '0 0 12px', letterSpacing: -0.5, lineHeight: 1.1 }}>
          {heading}
        </h1>
        <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, marginBottom: 24 }}>{intro}</p>
        <Link href={ctaHref} style={{ background: C.brand, color: '#fff', borderRadius: 14,
          padding: '16px 36px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
          boxShadow: '0 4px 16px rgba(27,107,74,0.25)', display: 'inline-block', marginBottom: 44 }}>
          {ctaLabel}
        </Link>

        <section style={{ background: C.brandLight, borderRadius: 16, padding: '28px', marginBottom: 40, border: '1px solid #C6E6D6' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 16px', color: C.brandDark }}>Pricing</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderBottom: '1px solid #C6E6D6' }}>
                  <td style={{ padding: '10px 12px 10px 0', lineHeight: 1.4 }}>
                    {r.label}
                    {r.note && <div style={{ fontSize: 13, color: C.muted }}>{r.note}</div>}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: C.brandDark, whiteSpace: 'nowrap' }}>${r.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {priceNote && <p style={{ fontSize: 13.5, color: C.muted, margin: '14px 0 0', lineHeight: 1.6 }}>{priceNote}</p>}
        </section>

        {sections.map((s) => (
          <section key={s.title} style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>{s.title}</h2>
            {s.paragraphs?.map((p, i) => <p key={i} style={{ fontSize: 16, lineHeight: 1.75, margin: '0 0 12px' }}>{p}</p>)}
            {s.list && (
              <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 15.5, lineHeight: 1.9 }}>
                {s.list.map((li, i) => <li key={i}>{li}</li>)}
              </ul>
            )}
          </section>
        ))}

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>Common Questions</h2>
          {faqs.map(([q, a]) => (
            <div key={q} style={{ borderBottom: '1px solid ' + C.border, padding: '14px 0' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>{q}</h3>
              <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7, margin: 0 }}>{a}</p>
            </div>
          ))}
        </section>

        <div style={{ textAlign: 'center' }}>
          <Link href={ctaHref} style={{ background: C.brand, color: '#fff', borderRadius: 14,
            padding: '16px 40px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(27,107,74,0.25)', display: 'inline-block' }}>
            {ctaLabel}
          </Link>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 18 }}>
            Questions? <a href="mailto:edibleprintorders@gmail.com" style={{ color: C.brand }}>edibleprintorders@gmail.com</a>
            {' · '}
            <a href={'tel:' + BUSINESS_PHONE_E164} style={{ color: C.brand }}>{BUSINESS_PHONE_DISPLAY}</a>
          </p>
        </div>
      </main>

      <footer style={{ padding: '28px 24px', textAlign: 'center', borderTop: '1px solid ' + C.border,
        color: C.muted, fontSize: 13, marginTop: 40 }}>
        <p style={{ margin: '0 0 10px', lineHeight: 2 }}>
          {RELATED.filter(([, href]) => href !== path).map(([label, href], i) => (
            <span key={href}>
              {i > 0 && ' · '}
              <Link href={href} style={{ color: C.brand, textDecoration: 'none' }}>{label}</Link>
            </span>
          ))}
        </p>
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} EdiblePrint.net · All rights reserved ·{' '}
          <Link href="/" style={{ color: C.brand, textDecoration: 'none' }}>Home</Link>
        </p>
      </footer>
    </div>
  );
}
