import Link from 'next/link';
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_WHATSAPP_URL } from '../../lib/business-info.js';

// The nav, footer and contact line shared by the landing pages
// (LandingPage.js) and the product pages (app/products/[slug]).

export const C = {
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

export function LandingNav({ ctaHref }) {
  return (
    <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 24px', borderBottom: '1px solid ' + C.border,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 100 }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: C.brand }}>edible</span>
          <span style={{ color: C.text }}>print</span>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 4, fontFamily: "'Outfit', sans-serif" }}>.ca</span>
        </span>
      </Link>
      <Link href={ctaHref} style={{ background: C.brand, color: '#fff', borderRadius: 10,
        padding: '10px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
        Order Now
      </Link>
    </nav>
  );
}

export function ContactLine() {
  return (
    <p style={{ fontSize: 14, color: C.muted, marginTop: 18 }}>
      Questions? <a href="mailto:edibleprintorders@gmail.com" style={{ color: C.brand }}>edibleprintorders@gmail.com</a>
      {' · '}
      <a href={'sms:' + BUSINESS_PHONE_E164} style={{ color: C.brand }}>Text</a>
      {' or '}
      <a href={BUSINESS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.brand }}>WhatsApp</a>
      {' ' + BUSINESS_PHONE_DISPLAY}
    </p>
  );
}

export function LandingFooter({ path }) {
  return (
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
      <p style={{ margin: 0 }}>© {new Date().getFullYear()} EdiblePrint.ca · All rights reserved ·{' '}
        <Link href="/" style={{ color: C.brand, textDecoration: 'none' }}>Home</Link>
      </p>
    </footer>
  );
}
