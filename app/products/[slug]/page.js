import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PRODUCTS, findProduct, sizesOf } from '../../../lib/products.js';
import { SITE_URL } from '../../../lib/site-config.js';
import { shapeSupportsCut, cutSurchargeFor } from '../../../lib/cutting-config.js';
import {
  getShippingMethods, describeShippingMethod, formatProductionWindow, PRODUCTION_BUSINESS_DAYS,
} from '../../../lib/shipping-config.js';
import { C, LandingNav, LandingFooter, ContactLine } from '../../_components/LandingChrome.js';

// One page per Merchant Center product (lib/products.js), rendered at build
// time so the price and the Product markup are in the initial HTML: Google
// compares them with the listing before approving it.
export const dynamicParams = false;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

const money = (n) => `$${n.toFixed(2)}`;
const describe = (p) => `${p.title}. Printed with your photo or logo, ${money(p.price)} CAD. Free pickup in London, ON or shipping across Canada.`;

export async function generateMetadata({ params }) {
  const product = findProduct((await params).slug);
  if (!product) return {};
  const title = `${product.title} | EdiblePrint.net`;
  return {
    title,
    description: describe(product),
    alternates: { canonical: product.path },
    openGraph: {
      title, description: describe(product), url: product.path, siteName: 'EdiblePrint.net',
      locale: 'en_CA', type: 'website', images: [{ url: product.image, width: 1200, height: 1200, alt: product.title }],
    },
  };
}

function productJsonLd(p) {
  const url = SITE_URL + p.path;
  const delivery = (method) => ({
    '@type': 'OfferShippingDetails',
    shippingLabel: method.label,
    shippingRate: { '@type': 'MonetaryAmount', value: method.price, currency: 'CAD' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CA' },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: PRODUCTION_BUSINESS_DAYS.min, maxValue: PRODUCTION_BUSINESS_DAYS.max, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: method.minBusinessDays, maxValue: method.maxBusinessDays, unitCode: 'DAY' },
    },
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.title,
    description: p.blurb,
    image: SITE_URL + p.image,
    sku: p.id,
    brand: { '@type': 'Brand', name: 'EdiblePrint' },
    offers: {
      '@type': 'Offer',
      url,
      price: p.price.toFixed(2),
      priceCurrency: 'CAD',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${SITE_URL}/#business` },
      shippingDetails: getShippingMethods().map(delivery),
      // Made to order from the customer's own image, so it can't be
      // returned; a faulty or damaged print is reprinted or refunded (/refund).
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'CA',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
      },
    },
  };
}

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 12px' };
const cell = { padding: '10px 12px 10px 0', borderBottom: '1px solid ' + C.border, verticalAlign: 'top', lineHeight: 1.5 };

export default async function ProductPage({ params }) {
  const product = findProduct((await params).slug);
  if (!product) notFound();
  const customizeHref = `/?start=${product.sizeId}`;
  const sizes = sizesOf(product);
  const cut = shapeSupportsCut(product.shape, product.sizeId) ? cutSurchargeFor(product.shape, product.sizeId) : null;

  const details = [
    ['Size', product.sizeText],
    ['Best for', product.use],
    ['Material', product.material],
    cut !== null && ['Cut to shape', `Optional, ${money(cut)} per sheet: we cut it on our plotter so it's ready to place`],
    ['Production', `Ready in ${formatProductionWindow()}`],
  ].filter(Boolean);

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }} />
      <LandingNav ctaHref={customizeHref} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image} alt={product.title} width={1200} height={1200}
            style={{ flex: '1 1 300px', maxWidth: 440, width: '100%', height: 'auto', borderRadius: 16,
              border: '1px solid ' + C.border, background: C.white }} />

          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(28px, 4.5vw, 40px)',
              fontWeight: 700, margin: '0 0 10px', lineHeight: 1.15 }}>
              {product.title}
            </h1>
            <p style={{ fontSize: 30, fontWeight: 700, color: C.brandDark, margin: '0 0 16px' }}>
              {money(product.price)} CAD <span style={{ fontSize: 15, fontWeight: 500, color: C.muted }}>per sheet</span>
            </p>
            <p style={{ fontSize: 16.5, lineHeight: 1.7, margin: '0 0 20px' }}>{product.blurb}</p>

            {sizes.length > 1 && (
              <div style={{ marginBottom: 22 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Other sizes</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sizes.map((s) => {
                    const current = s.slug === product.slug;
                    return (
                      <Link key={s.slug} href={s.path} aria-current={current ? 'page' : undefined}
                        style={{ border: '1.5px solid ' + (current ? C.brand : C.border), background: current ? C.brandLight : C.white,
                          color: C.text, borderRadius: 10, padding: '8px 12px', fontSize: 14, textDecoration: 'none' }}>
                        {s.sizeLabel}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <Link href={customizeHref} style={{ background: C.brand, color: '#fff', borderRadius: 14,
              padding: '16px 36px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(27,107,74,0.25)', display: 'inline-block' }}>
              Customize this size
            </Link>
            <p role="note" style={{ fontSize: 14, color: C.brandDark, background: C.brandLight, border: '1px solid #C6E6D6',
              borderRadius: 10, padding: '10px 14px', margin: '16px 0 0', lineHeight: 1.5 }}>
              Only upload images you own or have permission to use.
            </p>
          </div>
        </div>

        <section style={{ marginTop: 48 }}>
          <h2 style={h2}>Product Details</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15.5 }}>
            <tbody>
              {details.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 600, width: 140 }}>{k}</th>
                  <td style={cell}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginTop: 36 }}>
          <h2 style={h2}>Pickup & Shipping</h2>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 15.5, lineHeight: 1.9 }}>
            <li><strong>Free pickup</strong> in London, ON</li>
            {getShippingMethods().map((m) => (
              <li key={m.id}><strong>{m.label}</strong> across Canada ({m.carrier}): {describeShippingMethod(m)}</li>
            ))}
          </ul>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: '12px 0 0' }}>
            Shipping times start once your print is ready. See{' '}
            <Link href="/shipping" style={{ color: C.brand }}>Shipping</Link>,{' '}
            <Link href="/refund" style={{ color: C.brand }}>Refunds & Reprints</Link> and{' '}
            <Link href="/allergens" style={{ color: C.brand }}>Ingredients & Allergens</Link>.
          </p>
        </section>

        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <ContactLine />
        </div>
      </main>

      <LandingFooter path={product.path} />
    </div>
  );
}
