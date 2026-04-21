import Link from 'next/link';

export const metadata = {
  title: 'Edible Images for Cakes in Canada | EdiblePrint.net',
  description: 'Order custom edible images for cakes in Canada. Upload your photo online for fast edible image printing and Canada-wide shipping.',
};

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', brandDark: '#14503A',
  bg: '#FAFBF9', text: '#1a1a1a', muted: '#6B7280',
  border: '#E5E7EB', white: '#FFFFFF',
};

export default function EdibleImagesForCakesPage() {
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
        <Link href="/" style={{ background: C.brand, color: '#fff', borderRadius: 10,
          padding: '10px 22px', fontSize: 14, fontWeight: 600,
          fontFamily: "'Outfit', sans-serif", textDecoration: 'none' }}>
          Order Now
        </Link>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 6vw, 52px)',
          fontWeight: 700, margin: '0 0 12px', letterSpacing: -0.5 }}>
          Edible Images for <span style={{ color: C.brand }}>Cakes</span>
        </h1>
        <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, marginBottom: 36 }}>
          Turn any photo, logo, or design into a stunning edible image — printed on premium icing sheets
          and delivered across Canada.
        </p>

        <div style={{ fontSize: 16, lineHeight: 1.8, color: C.text, marginBottom: 28 }}>
          <p>
            At EdiblePrint.net, we make it simple to add a personal touch to any cake. Upload your photo
            online, choose your size and shape, and we'll print it on food-safe edible icing sheets using
            <strong> 300 DPI, FDA-approved inks</strong>. The result is a vibrant, crisp edible image that
            lays flat and looks incredible on buttercream, fondant, or whipped cream.
          </p>
          <p>
            We ship edible cake images to customers across every province and territory in Canada, with
            same-day local delivery available in London, Ontario. Every order is reviewed by a human before
            printing, and backed by our 100% satisfaction guarantee.
          </p>
        </div>

        <div style={{ background: C.brandLight, borderRadius: 16, padding: '32px 28px', marginBottom: 40,
          border: '1px solid #C6E6D6' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700,
            margin: '0 0 20px', color: C.brandDark }}>Why Order With Us</h2>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 15, lineHeight: 2, color: C.text }}>
            <li><strong>300 DPI resolution</strong> — sharp, vibrant results on every edible image</li>
            <li><strong>Food-safe inks & icing sheets</strong> — FDA-approved, tasteless, safe for all ages</li>
            <li><strong>Multiple shapes & sizes</strong> — round, square, heart, full sheet, and more</li>
            <li><strong>Canada-wide shipping</strong> via Canada Post — express available</li>
            <li><strong>Same-day local delivery</strong> in London, Ontario</li>
            <li><strong>100% satisfaction guarantee</strong> — reprint or full refund, no questions asked</li>
          </ul>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: C.muted, marginBottom: 20 }}>
            Ready to create your custom edible cake image?
          </p>
          <Link href="/" style={{ background: C.brand, color: '#fff', borderRadius: 14,
            padding: '16px 40px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(27,107,74,0.25)', display: 'inline-block' }}>
            Upload Your Photo Now →
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
