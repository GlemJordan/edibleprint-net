// Google Merchant Center product feed (RSS 2.0 with the g: namespace), at
// https://www.edibleprint.net/merchant-feed.xml. Same IDs, titles, links,
// images and prices as the product pages (lib/products.js), so it can be
// used instead of a spreadsheet as the Merchant Center data source. Use one
// or the other, not both: two sources with the same IDs overwrite each other.
// Built at deploy time, so a price change in lib/catalog-prices.js reaches
// the feed and the product pages together.
import { PRODUCTS, sizesOf } from '../../lib/products.js';
import { SITE_URL } from '../../lib/site-config.js';
import { getShippingMethods, PRODUCTION_BUSINESS_DAYS, formatProductionWindow } from '../../lib/shipping-config.js';

export const dynamic = 'force-static';

// Google's product taxonomy id for "Food, Beverages & Tobacco > Food Items >
// Cooking & Baking Ingredients > Edible Baking Decorations".
const GOOGLE_CATEGORY = '6775';

const PRODUCT_TYPE = {
  circular: 'Edible Images > Cake Toppers > Round',
  heart: 'Edible Images > Cake Toppers > Heart',
  square: 'Edible Images > Cake Toppers > Square',
  multicircle: 'Edible Images > Cookie Toppers',
  fullsheet: 'Edible Images > Full Sheets',
  bwsheet: 'Edible Images > Black and White',
};

const esc = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const tag = (name, value) => `      <g:${name}>${esc(value)}</g:${name}>`;

function description(p) {
  return [
    p.blurb,
    `Size: ${p.sizeText}.`,
    `${p.use}.`,
    `Material: ${p.material}.`,
    'Upload your image online when you order; we check it before printing.',
    `Ready in ${formatProductionWindow()}. Free pickup in London, ON, or shipping anywhere in Canada with Canada Post.`,
  ].join(' ');
}

function item(p) {
  const shipping = getShippingMethods().map((m) => [
    '      <g:shipping>',
    '        <g:country>CA</g:country>',
    `        <g:service>${esc(m.label)}</g:service>`,
    `        <g:price>${m.price.toFixed(2)} CAD</g:price>`,
    `        <g:min_transit_time>${m.minBusinessDays}</g:min_transit_time>`,
    `        <g:max_transit_time>${m.maxBusinessDays}</g:max_transit_time>`,
    '      </g:shipping>',
  ].join('\n'));
  return [
    '    <item>',
    tag('id', p.id),
    tag('title', p.title),
    tag('description', description(p)),
    tag('link', SITE_URL + p.path),
    tag('image_link', SITE_URL + p.image),
    tag('availability', 'in_stock'),
    tag('price', `${p.price.toFixed(2)} CAD`),
    tag('condition', 'new'),
    tag('brand', 'EdiblePrint'),
    // Made to order: there is no barcode or manufacturer part number.
    tag('identifier_exists', 'no'),
    tag('google_product_category', GOOGLE_CATEGORY),
    tag('product_type', PRODUCT_TYPE[p.shape]),
    // Sizes of one shape are variants of one group; a one-size product has none.
    ...(sizesOf(p).length > 1 ? [tag('item_group_id', `EP-${p.shape.toUpperCase()}`)] : []),
    tag('size', p.sizeLabel),
    tag('is_bundle', 'no'),
    tag('min_handling_time', PRODUCTION_BUSINESS_DAYS.min),
    tag('max_handling_time', PRODUCTION_BUSINESS_DAYS.max),
    ...shipping,
    '    </item>',
  ].join('\n');
}

export function GET() {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>EdiblePrint</title>',
    `    <link>${SITE_URL}</link>`,
    '    <description>Custom edible image prints for cakes, cookies and cupcakes, made in London, Ontario.</description>',
    ...PRODUCTS.map(item),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
