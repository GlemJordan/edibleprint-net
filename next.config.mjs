import { LEGACY_PRODUCT_SLUGS } from './lib/products.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The first product URLs (2026-11-08) moved to the Merchant Center slugs.
  // 301 so search engines move the old URL's standing to the new one.
  async redirects() {
    return Object.entries(LEGACY_PRODUCT_SLUGS).map(([from, to]) => ({
      source: `/products/${from}`,
      destination: `/products/${to}`,
      statusCode: 301,
    }));
  },
};

export default nextConfig;
