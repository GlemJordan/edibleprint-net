import Link from 'next/link';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE',
  bg: '#FAFBF9', text: '#1a1a1a', muted: '#6B7280',
  border: '#E5E7EB', white: '#FFFFFF',
};

export default function LegalLayout({ title, lastUpdated, children }) {
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 24px', borderBottom: '1px solid ' + C.border,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: C.brand }}>edible</span>
            <span style={{ color: C.text }}>print</span>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 4, fontFamily: "'Outfit', sans-serif" }}>.net</span>
          </span>
        </Link>
        <Link href="/" style={{
          background: C.brand, color: '#fff', borderRadius: 10,
          padding: '10px 22px', fontSize: 14, fontWeight: 600,
          textDecoration: 'none', fontFamily: "'Outfit', sans-serif",
        }}>
          Order Now
        </Link>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '52px 24px 64px' }}>
        {/* Last updated badge */}
        <div style={{
          display: 'inline-block', background: C.brandLight, color: C.brand,
          borderRadius: 20, padding: '5px 14px', fontSize: 12.5, fontWeight: 600,
          marginBottom: 20, border: '1px solid #C6E6D6',
        }}>
          {lastUpdated}
        </div>

        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(30px, 5.5vw, 48px)',
          fontWeight: 700, margin: '0 0 36px', letterSpacing: -0.5, lineHeight: 1.1,
        }}>
          {title}
        </h1>

        <div style={{ fontSize: 15.5, lineHeight: 1.8, color: C.text }}>
          {children}
        </div>

        {/* Back link */}
        <div style={{ marginTop: 52, paddingTop: 28, borderTop: '1px solid ' + C.border }}>
          <Link href="/" style={{
            color: C.brand, textDecoration: 'none', fontWeight: 600, fontSize: 14.5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            ← Back to EdiblePrint.net
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '22px 24px', textAlign: 'center',
        borderTop: '1px solid ' + C.border, color: C.muted, fontSize: 12.5,
      }}>
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} EdiblePrint.net · All rights reserved ·{' '}
          <Link href="/privacy" style={{ color: C.brand, textDecoration: 'none' }}>Privacy</Link>
          {' · '}
          <Link href="/terms" style={{ color: C.brand, textDecoration: 'none' }}>Terms</Link>
          {' · '}
          <Link href="/shipping" style={{ color: C.brand, textDecoration: 'none' }}>Shipping</Link>
          {' · '}
          <Link href="/refund" style={{ color: C.brand, textDecoration: 'none' }}>Refunds</Link>
          {' · '}
          <Link href="/allergens" style={{ color: C.brand, textDecoration: 'none' }}>Allergens</Link>
        </p>
      </footer>
    </div>
  );
}
