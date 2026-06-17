import Link from 'next/link';

export const metadata = {
  title: 'About Us — EdiblePrint.net',
  description: 'Learn about EdiblePrint.net — custom edible image printing made with care in London, Ontario, Canada.',
};

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', brandDark: '#14503A',
  bg: '#FAFBF9', text: '#1a1a1a', muted: '#6B7280',
  border: '#E5E7EB', white: '#FFFFFF',
};

export default function AboutPage() {
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
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
        <Link href="/" style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'Outfit', sans-serif", textDecoration: 'none' }}>
          Order Now
        </Link>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 6vw, 52px)',
          fontWeight: 700, margin: '0 0 12px', letterSpacing: -0.5 }}>
          About <span style={{ color: C.brand }}>EdiblePrint.net</span>
        </h1>
        <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, marginBottom: 36 }}>
          Custom edible image printing — made with care in London, Ontario.
        </p>

        <div style={{ fontSize: 16, lineHeight: 1.8, color: C.text, marginBottom: 28 }}>
          <p>
            EdiblePrint.net was born out of a simple idea: <strong>everyone deserves a stunning, personalised cake</strong>.
            We started as a small operation in London, Ontario, printing custom edible images for local bakers and home decorators.
            Word spread quickly — because the quality spoke for itself.
          </p>
          <p>
            Today we ship custom edible prints to customers across every province and territory in Canada.
            Whether you're a home baker putting the finishing touch on a birthday cake, a professional pastry chef
            needing consistent batch prints, or a business looking to brand your corporate treats — we've got you covered.
          </p>
          <p>
            We use only <strong>FDA-approved, food-safe inks</strong> and <strong>premium icing sheets</strong> to ensure every print
            is vibrant, crisp at 300 DPI, and completely safe to eat. Every order is reviewed by a human before printing,
            and we stand behind every sheet we produce with our 100% satisfaction guarantee.
          </p>
        </div>

        <div style={{ background: C.brandLight, borderRadius: 16, padding: '32px 28px', marginBottom: 40,
          border: '1px solid #C6E6D6' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700,
            margin: '0 0 20px', color: C.brandDark }}>Why Choose Us</h2>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 15, lineHeight: 2, color: C.text }}>
            <li><strong>300 DPI resolution</strong> — crystal-clear results on every print</li>
            <li><strong>FDA-approved food-safe inks & icing sheets</strong> — safe for all ages</li>
            <li><strong>Human review</strong> of every order before printing — no surprises</li>
            <li><strong>Same-day local delivery</strong> across London, Ontario from $6.99</li>
            <li><strong>Canada-wide shipping</strong> via Canada Post — express available</li>
            <li><strong>100% satisfaction guarantee</strong> — reprints or full refund, no questions asked</li>
            <li><strong>Up to 5 designs</strong> in a single order — mix shapes, sizes, and images</li>
            <li><strong>Secure checkout</strong> powered by Stripe — Visa, MC, Apple Pay & more</li>
          </ul>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: C.muted, marginBottom: 20 }}>
            Questions? Reach us anytime at{' '}
            <a href="mailto:glenj.belmar@gmail.com" style={{ color: C.brand, textDecoration: 'none', fontWeight: 600 }}>
              glenj.belmar@gmail.com
            </a>
          </p>
          <Link href="/" style={{ background: C.brand, color: '#fff', borderRadius: 14,
            padding: '16px 40px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(27,107,74,0.25)', display: 'inline-block' }}>
            Start Your Order →
          </Link>
        </div>
      </main>

      <footer style={{ padding: '28px 24px', textAlign: 'center', borderTop: '1px solid ' + C.border,
        color: C.muted, fontSize: 13, marginTop: 40 }}>
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} EdiblePrint.net · All rights reserved ·{' '}
          <Link href="/" style={{ color: C.brand, textDecoration: 'none' }}>Home</Link>
        </p>
      </footer>
    </div>
  );
}
