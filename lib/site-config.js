// The one address search engines should treat as the site: the apex domain
// (edibleprint.ca) redirects to www at the host level, so www is what actually
// answers. Canonical URLs, the sitemap and structured data all build off this.
export const SITE_URL = 'https://www.edibleprint.ca';

// Base URL for links the server builds: Stripe redirects, emails, PDF assets.
// Live production always uses SITE_URL, so moving the domain only takes this
// file. NEXT_PUBLIC_SITE_URL still applies to local dev and preview deployments.
export function getBaseUrl(fallback = SITE_URL) {
  if (process.env.VERCEL_ENV === 'production') return SITE_URL;
  return process.env.NEXT_PUBLIC_SITE_URL || fallback;
}

export const OG_IMAGE_URL = `${SITE_URL}/logo-assets/og-image.png`;

// schema.org Product for a landing page. Prices come in from
// lib/catalog-prices.js so the markup can't disagree with what checkout charges.
// The image shows no celebrity or trademarked character: Google Shopping reads
// this markup too, and rejects images like that.
export function productJsonLd({ name, description, path, prices }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image: `${SITE_URL}/products/round-edible-cake-topper.jpg`,
    brand: { '@type': 'Brand', name: 'EdiblePrint.ca' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'CAD',
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: prices.length,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}${path}`,
    },
  };
}
