// The one address search engines should treat as the site: the apex domain
// (edibleprint.net) redirects to www at the host level, so www is what actually
// answers. Canonical URLs, the sitemap and structured data all build off this.
export const SITE_URL = 'https://www.edibleprint.net';

export const OG_IMAGE_URL = `${SITE_URL}/logo-assets/og-image.png`;

// schema.org Product for a landing page. Prices come in from
// lib/catalog-prices.js so the markup can't disagree with what checkout charges.
export function productJsonLd({ name, description, path, prices }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image: `${SITE_URL}/hero/ejemplo-1-after.jpg`,
    brand: { '@type': 'Brand', name: 'EdiblePrint.net' },
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
