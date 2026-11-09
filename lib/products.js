// One product per catalog size, for the /products/<slug> pages and the Google
// Merchant Center feed (app/merchant-feed.xml). Google checks that the price
// on an item's landing page matches the feed, so every size gets its own page
// with exactly one price — a landing page listing several prices gets the item
// disapproved for a price mismatch.
//
// Names, sizes and prices are read from lib/catalog-sizes.js and
// lib/catalog-prices.js, the tables checkout enforces, so a product page and
// the feed can't advertise a price checkout won't charge.
import { CATALOG_SIZES } from './catalog-sizes.js';
import { CATALOG_PRICES } from './catalog-prices.js';

const cmOf = (label) => /\((\d+)\s*cm\)/.exec(label)?.[1];

// image: a photo of the printed product with no celebrity or trademarked
// character on it (Google Shopping rejects those). Round, square and B&W are
// mockups from scripts/make-product-images.mjs until real photos exist.
const LINES = {
  circular: {
    name: 'Round Edible Cake Topper',
    slug: (s) => `round-edible-cake-topper-${s.w}-inch`,
    size: (s) => `${s.w} inch (${cmOf(s.label)} cm)`,
    image: '/products/round-edible-cake-topper.jpg',
    type: 'Edible Images > Cake Toppers > Round',
    blurb: 'A round edible image printed with your photo, logo or design, ready to lay on top of a frosted cake.',
  },
  heart: {
    name: 'Heart Edible Cake Topper',
    slug: (s) => `heart-edible-cake-topper-${s.w}-inch`,
    size: (s) => `${s.w} inch (${cmOf(s.label)} cm)`,
    image: '/gallery/heart-eighteen.webp',
    type: 'Edible Images > Cake Toppers > Heart',
    blurb: 'A heart-shaped edible image printed with your photo, name or design, made for heart cakes, anniversaries and Valentine treats.',
  },
  square: {
    name: 'Square Edible Cake Topper',
    slug: (s) => `square-edible-cake-topper-${s.w}-inch`,
    size: (s) => `${s.w} × ${s.w} inch (${cmOf(s.label)} cm)`,
    image: '/products/square-edible-cake-topper.jpg',
    type: 'Edible Images > Cake Toppers > Square',
    blurb: 'A square edible image printed with your photo, logo or design, for square cakes, sheet cakes and brownies.',
  },
  multicircle: {
    name: 'Edible Cookie Toppers',
    slug: (s) => `edible-cookie-toppers-${s.circleSize}-inch`,
    size: (s) => `${s.circleSize} inch circles, ${s.cols * s.rows} per sheet`,
    image: (s) => (s.id === 'mc2' ? '/hero/ejemplo-4-after.jpg' : '/gallery/cookie-circles-happily-ever-after.webp'),
    type: 'Edible Images > Cookie & Cupcake Toppers',
    blurb: 'A full sheet of matching round edible toppers printed with your photo or logo, for cookies, cupcakes and party favours.',
  },
  fullsheet: {
    name: 'A4 Full Sheet Edible Image',
    slug: () => 'a4-full-sheet-edible-image',
    size: () => '8.27 × 11.69 inch (21 × 29.7 cm)',
    image: '/gallery/fullsheet-calendar-keepsake.webp',
    type: 'Edible Images > Full Sheets',
    blurb: 'A full A4 edible sheet printed edge to edge with your photo or design, for sheet cakes or to cut into your own shapes.',
  },
  bwsheet: {
    name: 'Black & White Edible Image',
    slug: () => 'black-and-white-edible-image-6-5-inch',
    size: (s) => `${s.printW} × ${s.printH} inch on an A4 sheet`,
    image: '/products/black-and-white-edible-image.jpg',
    type: 'Edible Images > Black & White',
    blurb: 'A 6.5 inch square edible image printed in black and white, centred on an A4 sheet. Our lowest-priced print.',
  },
};

export const PRODUCTS = Object.entries(LINES).flatMap(([shape, line]) =>
  CATALOG_SIZES[shape].map((s) => {
    const size = line.size(s);
    return {
      id: `EP-${s.id.toUpperCase()}`,
      shape,
      sizeId: s.id,
      slug: line.slug(s),
      path: `/products/${line.slug(s)}`,
      lineName: line.name,
      title: `${line.name}, ${size}`,
      size,
      price: CATALOG_PRICES[shape][s.id],
      image: typeof line.image === 'function' ? line.image(s) : line.image,
      productType: line.type,
      blurb: line.blurb,
    };
  }),
);

export function findProduct(slug) {
  return PRODUCTS.find((p) => p.slug === slug) || null;
}

// The other sizes of the same product, for the size picker.
export function sizesOf(product) {
  return PRODUCTS.filter((p) => p.shape === product.shape);
}
