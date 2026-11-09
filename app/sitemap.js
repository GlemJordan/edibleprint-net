import { SITE_URL } from '../lib/site-config.js';
import { getActiveDesigns } from '../lib/design-catalog.js';
import { PRODUCTS } from '../lib/products.js';

const PATHS = [
  '/',
  '/edible-images-for-cakes',
  '/edible-cookie-toppers',
  '/edible-logo-prints',
  '/edible-images-london-ontario',
  '/designs',
  '/cookie-tools',
  '/about',
  '/shipping',
  '/refund',
  '/allergens',
  '/terms',
  '/privacy',
];

export default function sitemap() {
  return [
    ...PATHS.map((path) => ({ url: SITE_URL + (path === '/' ? '' : path) })),
    ...PRODUCTS.map((p) => ({ url: SITE_URL + p.path })),
    ...getActiveDesigns().map((d) => ({ url: `${SITE_URL}/designs/${d.id}` })),
  ];
}
