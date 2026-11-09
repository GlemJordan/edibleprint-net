import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PRODUCTS, findProduct, sizesOf } from '../../../lib/products.js';
import { SITE_URL } from '../../../lib/site-config.js';
import { shapeSupportsMaterial, MATERIALS } from '../../../lib/material-config.js';
import { shapeSupportsCut, cutSurchargeFor } from '../../../lib/cutting-config.js';
import {
  getShippingMethods, describeShippingMethod, formatProductionWindow, PRODUCTION_BUSINESS_DAYS,
} from '../../../lib/shipping-config.js';
import { C, LandingNav, LandingFooter, ContactLine } from '../../_components/LandingChrome.js';

// One page per catalog size: the landing page Google Merchant Center sends
// shoppers to, so its one visible price and its Offer must equal the feed's.
export const dynamicParams = false;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

const describe = (p) => `${p.title}, printed with your photo or logo. $${p.price.toFixed(2)} CAD. Free pickup in London, ON or shipping across Canada.`;

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
      locale: 'en_CA', type: 'website', images: [{ url: product.image, alt: product.title }],
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
    sku: p.id,
    image: SITE_URL + p.image,
    category: 'Edible Baking Decorations',
    brand: { '@type': 'Brand', name: 'EdiblePrint.net' },
    offers: {
      '@type': 'Offer',
      url,
      price: p.price.toFixed(2),
      priceCurrency: 'CAD',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${SITE_URL}/#business` },
      shippingDetails: getShippingMethods().map(delivery),
      // Every print is made to order from the customer's own image, so it
      // can't be returned; a faulty or damaged print is reprinted or refunded
      // instead (see /refund).
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'CA',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
      },
    },
  };
}

export default async function ProductPage({ params }) {
  const product = findProduct((await params).slug);
  if (!product) notFound();
  const ctaHref = `/?start=${product.sizeId}`;
  const cut = shapeSupportsCut(product.shape, product.sizeId) ? cutSurchargeFor(product.shape, product.sizeId) : null;
  const sizes = sizesOf(product);

  const details = [
    'Printed with your own photo, logo or design: you upload it while ordering, no account needed',
    shapeSupportsMaterial(product.shape)
      ? `Printed on ${MATERIALS.icing.label.toLowerCase()} or ${MATERIALS.wafer.label.toLowerCase()}, same price`
      : `Printed on ${MATERIALS.icing.label.toLowerCase()}`,
    cut !== null && `Optional: cut to shape on our plotter for $${cut.toFixed(2)} per sheet`,
    'We check your image before printing and tell you about any quality issue',
    `Ready in ${formatProductionWindow()}`,
  ].filter(Boolean);

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }} />
      <LandingNav ctaHref={ctaHref} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image} alt={product.title} width={1200} height={1200}
            style={{ flex: '1 1 320px', maxWidth: 440, width: '100%', height: 'auto', borderRadius: 16,
              border: '1px solid ' + C.border, background: C.white, objectFit: 'cover', aspectRatio: '1 / 1' }} />

          <div style={{ flex: '1 1 320px' }}>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(30px, 5vw, 44px)',
              fontWeight: 700, margin: '0 0 10px', lineHeight: 1.1 }}>
              {product.title}
            </h1>
            <p style={{ fontSize: 30, fontWeight: 700, color: C.brandDark, margin: '0 0 18px' }}>
              ${product.price.toFixed(2)} <span style={{ fontSize: 15, fontWeight: 500, color: C.muted }}>CAD per sheet</span>
            </p>
            <p style={{ fontSize: 16.5, lineHeight: 1.7, margin: '0 0 22px' }}>{product.blurb}</p>

            {sizes.length > 1 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Size</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sizes.map((s) => {
                    const current = s.slug === product.slug;
                    return (
                      <Link key={s.slug} href={s.path} aria-current={current ? 'page' : undefined}
                        style={{ border: '1.5px solid ' + (current ? C.brand : C.border), background: current ? C.brandLight : C.white,
                          color: C.text, borderRadius: 10, padding: '8px 12px', fontSize: 14, textDecoration: 'none' }}>
                        {s.size}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <Link href={ctaHref} style={{ background: C.brand, color: '#fff', borderRadius: 14,
              padding: '16px 36px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(27,107,74,0.25)', display: 'inline-block' }}>
              Upload Your Photo →
            </Link>
          </div>
        </div>

        <section style={{ marginTop: 48 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>What You Get</h2>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 15.5, lineHeight: 1.9 }}>
            {details.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>Pickup & Shipping</h2>
          <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: 15.5, lineHeight: 1.9 }}>
            <li><strong>Free pickup</strong> in London, Ontario</li>
            {getShippingMethods().map((m) => (
              <li key={m.id}><strong>{m.label}</strong> across Canada ({m.carrier}): {describeShippingMethod(m)}</li>
            ))}
          </ul>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: '12px 0 0' }}>
            Shipping times start once your print is ready. Read our{' '}
            <Link href="/shipping" style={{ color: C.brand }}>shipping</Link>,{' '}
            <Link href="/refund" style={{ color: C.brand }}>refund and reprint</Link> and{' '}
            <Link href="/allergens" style={{ color: C.brand }}>ingredients and allergens</Link> pages.
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
