import Link from 'next/link';
import Image from 'next/image';
import { MAKE3D_PRODUCTS, formatCad } from '../../lib/make3d-products.js';
import { BUSINESS_PHONE_E164 } from '../../lib/business-info.js';

export const metadata = {
  title: 'Cookie Cutters, Logo Stamps & Cake Pop Rollers | EdiblePrint.net',
  description: 'Custom logo cookie stamps, cookie cutters and cake pop rollers by MAKE3D, made in London, Ontario. Pair them with a matching edible print.',
  alternates: { canonical: 'https://edibleprint.net/cookie-tools' },
};

const C = {
  brand: '#1f5236', brandDeep: '#163d28', accent: '#e8704a', text: '#1a2420',
  muted: '#5c6b62', border: '#d9e2d6', cream: '#f4f6f1', white: '#fff', bg: '#FAFBF9',
};

const ORDER_EMAIL = 'edibleprintorders@gmail.com';

// When the MAKE3D store is live, set NEXT_PUBLIC_MAKE3D_STORE_URL (no trailing
// slash) and every card links straight to its product page there. Until
// then, customers request an order by text or email.
function orderLinks(product) {
  const store = process.env.NEXT_PUBLIC_MAKE3D_STORE_URL;
  if (store) {
    return [{ label: product.custom ? 'Start your order →' : 'Shop now →', href: store + product.storePath, primary: true }];
  }
  const msg = `Hi! I'd like to order the ${product.name}.`;
  const links = [{
    label: 'Email to order',
    href: `mailto:${ORDER_EMAIL}?subject=${encodeURIComponent('MAKE3D order: ' + product.name)}&body=${encodeURIComponent(msg)}`,
    primary: true,
  }];
  if (!product.digital) {
    links.push({ label: 'Text us', href: `sms:${BUSINESS_PHONE_E164}?&body=${encodeURIComponent(msg)}`, primary: false });
  }
  return links;
}

export default function CookieToolsPage() {
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <style>{`
        .ct-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .ct-card { background: ${C.white}; border: 1px solid ${C.border}; border-radius: 16px; overflow: hidden;
          display: flex; flex-direction: column; transition: transform .15s, box-shadow .15s; }
        .ct-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.07); }
        .ct-btn { display: inline-block; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600;
          text-align: center; text-decoration: none; }
        .ct-btn-primary { background: ${C.brand}; color: #fff; }
        .ct-btn-primary:hover { background: ${C.brandDeep}; }
        .ct-btn-ghost { border: 1px solid ${C.border}; color: ${C.text}; background: ${C.white}; }
        .ct-btn-ghost:hover { background: ${C.cream}; }
        .ct-facts { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 14px; color: ${C.muted}; }
      `}</style>

      <header style={{ borderBottom: '1px solid ' + C.border, background: C.white }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <Image src="/logo-assets/logo-header.png" alt="EdiblePrint.net" width={160} height={40}
              style={{ height: 36, width: 'auto' }} priority />
          </Link>
          <Link href="/" style={{ color: C.muted, fontSize: 13.5, textDecoration: 'none' }}>← Edible prints</Link>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 64px' }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
          color: C.accent, margin: '0 0 10px' }}>
          Baking tools by MAKE3D
        </p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 5.5vw, 48px)',
          fontWeight: 700, margin: '0 0 12px', letterSpacing: -0.5, lineHeight: 1.1 }}>
          Cookie &amp; Cake Pop <span style={{ color: C.brand }}>Tools</span>
        </h1>
        <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.65, margin: '0 0 18px', maxWidth: 640 }}>
          Logo stamps, cutters and cake pop rollers designed and 3D printed in London, Ontario —
          made to work with the edible prints you already order from us.
        </p>
        <div className="ct-facts" style={{ marginBottom: 36 }}>
          <span>✓ Free pickup in London, ON</span>
          <span>✓ Shipping across Canada</span>
          <span>✓ Custom logos approved before printing</span>
        </div>

        <div className="ct-grid">
          {MAKE3D_PRODUCTS.map((p) => (
            <article key={p.id} className="ct-card">
              <div style={{ background: C.white, borderBottom: '1px solid ' + C.border }}>
                <Image src={p.image} alt={p.imageAlt} width={800} height={800}
                  style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
              <div style={{ padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <div>
                  <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 4px' }}>{p.name}</h2>
                  <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{p.tagline}</p>
                </div>
                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13.5, lineHeight: 1.7, color: C.text }}>
                  {p.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <div style={{ marginTop: 'auto' }}>
                  <p style={{ margin: '6px 0 2px', fontSize: 15 }}>
                    <span style={{ color: C.muted, fontSize: 13 }}>From </span>
                    <strong style={{ fontSize: 20 }}>{formatCad(p.fromPrice)}</strong>
                  </p>
                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: C.muted }}>{p.priceNote}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {orderLinks(p).map((l) => (
                      <a key={l.label} href={l.href}
                        className={'ct-btn ' + (l.primary ? 'ct-btn-primary' : 'ct-btn-ghost')}
                        style={{ flex: l.primary ? '1 1 auto' : '0 0 auto' }}>
                        {l.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section style={{ marginTop: 48, background: C.cream, border: '1px solid ' + C.border,
          borderRadius: 16, padding: '28px 26px', display: 'flex', flexWrap: 'wrap', gap: 20,
          alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
              Make it a matching set
            </h2>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              Stamp your logo into the dough, then top the cookie with the same design as an edible print.
              Order both and pick them up together.
            </p>
          </div>
          <Link href="/" className="ct-btn ct-btn-primary" style={{ padding: '14px 26px', fontSize: 15 }}>
            Order an edible print →
          </Link>
        </section>

        <section style={{ marginTop: 40, fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          <h2 style={{ fontSize: 16, color: C.text, margin: '0 0 6px' }}>Care</h2>
          <p style={{ margin: 0 }}>
            Hand wash in warm (not hot) water and dry completely. Not dishwasher safe — high heat can warp
            3D-printed tools.
          </p>
        </section>
      </main>

      <footer style={{ padding: '28px 24px', textAlign: 'center', borderTop: '1px solid ' + C.border,
        color: C.muted, fontSize: 13 }}>
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} EdiblePrint.net · Baking tools by MAKE3D ·{' '}
          <Link href="/" style={{ color: C.brand, textDecoration: 'none' }}>Home</Link>
        </p>
      </footer>
    </div>
  );
}
