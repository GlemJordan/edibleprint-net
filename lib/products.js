// The 15 products listed on Google Merchant Center, one per catalog size, with
// a page each at /products/<slug>. Google checks that an item's landing page
// shows the same price as the listing, so every size gets its own page with
// exactly one price.
//
// IDs, slugs and titles are fixed: they're what Merchant Center knows the
// products by. Prices are NOT here — they come from lib/catalog-prices.js,
// the table checkout charges, so a page or listing can't advertise a price
// checkout won't charge. Plain data module: the home page (a client
// component) imports it too.
import { CATALOG_SIZES } from './catalog-sizes.js';
import { CATALOG_PRICES } from './catalog-prices.js';
import { designAreaInForShape, BWSHEET_DESIGN_IN } from './paper-config.js';
import { shapeSupportsMaterial, MATERIALS } from './material-config.js';

// What each size is for. Shown on the home page price cards and on the
// product pages. A topper sits on top of a frosted cake, so it's one size
// smaller than the cake it fits. "round"/"heart"/"square" and "cakes" are
// joined by a non-breaking space so "cakes" never wraps onto a line alone.
export const SIZE_USE = {
  c5: 'Fits 6″ round cakes', c6: 'Fits 7″ round cakes',
  c7: 'Fits 8″ round cakes', c8: 'Fits 9″–10″ round cakes',
  h6: 'Fits 7″ heart cakes', h7: 'Fits 8″ heart cakes', h8: 'Fits 9″–10″ heart cakes',
  s5: 'Fits 6″ square cakes', s6: 'Fits 7″ square cakes',
  s7: 'Fits 8″ square cakes', s8: 'Fits 9″–10″ square cakes',
  mc2: '15 toppers/sheet — cupcakes & cookies',
  mc3: '6 toppers/sheet — cookies & mini treats',
  a4: 'For full sheet cakes & large projects',
  bw1: 'Economy grayscale — text, logos & portraits',
};

// Original artwork from scripts/build-product-art.mjs — one per shape.
const IMAGE = {
  circular: '/products/round.png',
  heart: '/products/heart.png',
  square: '/products/square.png',
  mc2: '/products/cookie-2.png',
  mc3: '/products/cookie-3.png',
  fullsheet: '/products/full-sheet.png',
  bwsheet: '/products/bw-square.png',
};

const BLURB = {
  circular: 'A round edible image printed with your own photo, logo or design, made to lay on top of a frosted cake.',
  heart: 'A heart-shaped edible image printed with your own photo, name or design, made for heart cakes, anniversaries and Valentine treats.',
  square: 'A square edible image printed with your own photo, logo or design, for square cakes, sheet cakes and brownies.',
  multicircle: 'A full A4 sheet of matching round edible toppers printed with your own photo or logo, for cookies, cupcakes and party favours.',
  fullsheet: 'A full A4 edible sheet printed with your own photo or design, for sheet cakes or to cut into your own shapes.',
  bwsheet: 'A 6.5″ square edible image printed in black and white, centred on an A4 sheet. Our lowest-priced print, made for text, logos and portraits.',
};

const mm = (inches) => Math.round(inches * 25.4);

// The physical size, in words, for the product page and the listing.
function sizeText(shape, s) {
  if (shape === 'multicircle') return `${s.circleSize}" circles, ${s.cols * s.rows} per A4 sheet (210 × 297 mm)`;
  if (shape === 'fullsheet') {
    const area = designAreaInForShape('fullsheet');
    return `A4 sheet, 210 × 297 mm (8.27" × 11.69"); printed area about ${mm(area.w)} × ${mm(area.h)} mm`;
  }
  if (shape === 'bwsheet') return `${BWSHEET_DESIGN_IN}" × ${BWSHEET_DESIGN_IN}" (${(BWSHEET_DESIGN_IN * 2.54).toFixed(1)} cm) square, centred on an A4 sheet`;
  return `${s.label.replace(' Topper', ' print').replace(/\((\d+)cm\)/, '($1 cm)')}, on an A4 sheet`;
}

function materialText(shape) {
  const icing = MATERIALS.icing.label.toLowerCase();
  if (!shapeSupportsMaterial(shape)) return `${icing[0].toUpperCase() + icing.slice(1)} only, printed in black and white`;
  return `${icing[0].toUpperCase() + icing.slice(1)} or ${MATERIALS.wafer.label.toLowerCase()}, same price`;
}

// [Merchant Center ID, slug, title, shape, catalog size id]
const TABLE = [
  ['EP-ROUND-5', 'round-5-inch', 'Custom Edible Image Cake Topper, 5" Round (13 cm)', 'circular', 'c5'],
  ['EP-ROUND-6', 'round-6-inch', 'Custom Edible Image Cake Topper, 6" Round (15 cm)', 'circular', 'c6'],
  ['EP-ROUND-7', 'round-7-inch', 'Custom Edible Image Cake Topper, 7" Round (18 cm)', 'circular', 'c7'],
  ['EP-ROUND-8', 'round-8-inch', 'Custom Edible Image Cake Topper, 8" Round (20 cm)', 'circular', 'c8'],
  ['EP-HEART-6', 'heart-6-inch', 'Custom Edible Image Cake Topper, 6" Heart (15 cm)', 'heart', 'h6'],
  ['EP-HEART-7', 'heart-7-inch', 'Custom Edible Image Cake Topper, 7" Heart (18 cm)', 'heart', 'h7'],
  ['EP-HEART-8', 'heart-8-inch', 'Custom Edible Image Cake Topper, 8" Heart (20 cm)', 'heart', 'h8'],
  ['EP-SQUARE-5', 'square-5-inch', 'Custom Edible Image Cake Topper, 5" x 5" Square (13 cm)', 'square', 's5'],
  ['EP-SQUARE-6', 'square-6-inch', 'Custom Edible Image Cake Topper, 6" x 6" Square (15 cm)', 'square', 's6'],
  ['EP-SQUARE-7', 'square-7-inch', 'Custom Edible Image Cake Topper, 7" x 7" Square (18 cm)', 'square', 's7'],
  ['EP-SQUARE-8', 'square-8-inch', 'Custom Edible Image Cake Topper, 8" x 8" Square (20 cm)', 'square', 's8'],
  ['EP-COOKIE-2', 'cookie-toppers-2-inch', 'Custom Edible Cookie Toppers, 2" Circles, 15 per A4 Sheet', 'multicircle', 'mc2'],
  ['EP-COOKIE-3', 'cookie-toppers-3-inch', 'Custom Edible Cookie Toppers, 3" Circles, 6 per A4 Sheet', 'multicircle', 'mc3'],
  ['EP-FULL-A4', 'full-sheet-a4', 'Custom Edible Image Full Sheet, A4 (210 x 297 mm)', 'fullsheet', 'a4'],
  ['EP-BW-65', 'black-and-white-6-5-inch', 'Custom Edible Print, Black and White, 6.5" x 6.5" Square', 'bwsheet', 'bw1'],
];

export const PRODUCTS = TABLE.map(([id, slug, title, shape, sizeId]) => {
  const size = CATALOG_SIZES[shape]?.find((s) => s.id === sizeId);
  const price = CATALOG_PRICES[shape]?.[sizeId];
  // A size or price missing from the catalog must break the build, not
  // publish a product page without a price.
  if (!size || typeof price !== 'number') throw new Error(`lib/products.js: ${id} has no catalog size or price (${shape}/${sizeId})`);
  return {
    id, slug, title, shape, sizeId, price,
    path: `/products/${slug}`,
    sizeLabel: size.label,
    sizeText: sizeText(shape, size),
    material: materialText(shape),
    use: SIZE_USE[sizeId],
    image: IMAGE[sizeId] || IMAGE[shape],
    blurb: BLURB[shape],
  };
});

export function findProduct(slug) {
  return PRODUCTS.find((p) => p.slug === slug) || null;
}

export function productFor(shape, sizeId) {
  return PRODUCTS.find((p) => p.shape === shape && p.sizeId === sizeId) || null;
}

// The other sizes of the same shape, for the size picker on a product page.
export function sizesOf(product) {
  return PRODUCTS.filter((p) => p.shape === product.shape);
}

// Yesterday's first product URLs (published 2026-11-08, before the IDs and
// slugs above were fixed) → today's. next.config.mjs redirects them, so a
// link Google already picked up keeps working.
export const LEGACY_PRODUCT_SLUGS = {
  'round-edible-cake-topper-5-inch': 'round-5-inch',
  'round-edible-cake-topper-6-inch': 'round-6-inch',
  'round-edible-cake-topper-7-inch': 'round-7-inch',
  'round-edible-cake-topper-8-inch': 'round-8-inch',
  'heart-edible-cake-topper-6-inch': 'heart-6-inch',
  'heart-edible-cake-topper-7-inch': 'heart-7-inch',
  'heart-edible-cake-topper-8-inch': 'heart-8-inch',
  'square-edible-cake-topper-5-inch': 'square-5-inch',
  'square-edible-cake-topper-6-inch': 'square-6-inch',
  'square-edible-cake-topper-7-inch': 'square-7-inch',
  'square-edible-cake-topper-8-inch': 'square-8-inch',
  'edible-cookie-toppers-2-inch': 'cookie-toppers-2-inch',
  'edible-cookie-toppers-3-inch': 'cookie-toppers-3-inch',
  'a4-full-sheet-edible-image': 'full-sheet-a4',
  'black-and-white-edible-image-6-5-inch': 'black-and-white-6-5-inch',
};
