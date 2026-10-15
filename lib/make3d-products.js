// MAKE3D baking tools shown on /cookie-tools.
//
// Single source of truth for the tool catalog on this site: names, images,
// starting prices and the copy on each card. Prices are display-only here —
// nothing on edibleprint.net charges for these items. Orders go to the
// MAKE3D store when NEXT_PUBLIC_MAKE3D_STORE_URL is set, otherwise to a
// text/email request (see app/cookie-tools/page.js).
//
// PRICES ARE A PROPOSAL (CAD) — confirm before merging.

export const MAKE3D_PRODUCTS = [
  {
    id: 'cake-pop-roller',
    name: 'Cake Pop Roller',
    tagline: 'Perfectly round cake pops, two at a time',
    image: '/make3d/cake-pop-roller-set.webp',
    imageAlt: 'MAKE3D cake pop roller set in 1, 1.25 and 1.5 inch sizes',
    fromPrice: 24.99,
    priceNote: 'Set of 3 sizes: $69.99',
    bullets: [
      'Sizes: 1", 1.25" and 1.5" balls',
      'Two halves slide on guide rails — no wobble',
      'End stops keep the ball in the channel',
    ],
    storePath: '/products/cake-pop-roller',
  },
  {
    id: 'logo-stamp',
    name: 'Custom Logo Cookie Stamp',
    tagline: 'Your logo pressed into every cookie',
    image: '/make3d/logo-stamp-mockup.webp',
    imageAlt: 'Preview of a cookie stamped with a custom logo',
    fromPrice: 24.99,
    priceNote: 'Cutter + stamp set: $32.99',
    bullets: [
      'Send your logo — approve a to-scale preview before we print',
      'Round, scalloped, square or plaque · 2.5", 3" or 3.5"',
      'Also works as a fondant embosser',
    ],
    storePath: '/products/custom-logo-stamp',
    custom: true,
  },
  {
    id: 'cookie-cutters',
    name: 'Cookie Cutters',
    tagline: 'Clean-cutting shapes that match our edible prints',
    image: '/make3d/cookie-cutters.webp',
    imageAlt: 'Round, scalloped, square and plaque cookie cutters',
    fromPrice: 5.99,
    priceNote: 'Set of 4 shapes: $17.99',
    bullets: [
      'Sized to fit our cookie-sheet edible prints',
      'Thin 0.8 mm cutting edge, reinforced rim',
      'Round, scalloped, square and plaque',
    ],
    storePath: '/products/cookie-cutters',
  },
  {
    id: 'stl-files',
    name: 'STL Files (Digital)',
    tagline: 'Print our tools on your own 3D printer',
    image: '/make3d/cake-pop-roller-open.webp',
    imageAlt: 'Cake pop roller halves shown apart',
    fromPrice: 7.99,
    priceNote: 'Instant download · personal use licence',
    bullets: [
      'Print-ready, no supports needed',
      'Fits 180 × 180 mm beds (Bambu Lab A1 mini and up)',
      'Includes a print guide',
    ],
    storePath: '/products/stl-files',
    digital: true,
  },
];

export function formatCad(amount) {
  return `CA$${amount.toFixed(2)}`;
}
