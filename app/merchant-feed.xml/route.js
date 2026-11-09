// Google Merchant Center product feed (RSS 2.0 with the g: namespace), at
// https://www.edibleprint.ca/merchant-feed.xml. Merchant Center fetches it on
// a schedule and lists every item for free on Google Shopping and in search.
// Built at deploy time from lib/products.js, so a price change in
// lib/catalog-prices.js reaches the feed and the product pages together.
import { PRODUCTS, sizesOf } from '../../lib/products.js';
import { SITE_URL } from '../../lib/site-config.js';
import { getShippingMethods, PRODUCTION_BUSINESS_DAYS, formatProductionWindow } from '../../lib/shipping-config.js';
import { shapeSupportsMaterial } from '../../lib/material-config.js';

export const dynamic = 'force-static';

// Google's product taxonomy id for "Food, Beverages & Tobacco > Food Items >
// Cooking & Baking Ingredients > Edible Baking Decorations".
const GOOGLE_CATEGORY = '6775';

const esc = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const tag = (name, value) => `      <g:${name}>${esc(value)}</g:${name}>`;

function description(p) {
  return [
    p.blurb,
    `Size: ${p.size}.`,
    shapeSupportsMaterial(p.shape) ? 'Choose icing sheet or wafer paper at the same price.' : 'Printed on an icing sheet.',
    'Upload your image online when you order; we check it before printing.',
    `Ready in ${formatProductionWindow()}. Free pickup in London, Ontario, or shipping anywhere in Canada with Canada Post.`,
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
    tag('title', `${p.title} – Custom Photo or Logo`),
    tag('description', description(p)),
    tag('link', SITE_URL + p.path),
    tag('image_link', SITE_URL + p.image),
    tag('availability', 'in_stock'),
    tag('price', `${p.price.toFixed(2)} CAD`),
    tag('condition', 'new'),
    tag('brand', 'EdiblePrint.ca'),
    // Made to order: there is no barcode or manufacturer part number.
    tag('identifier_exists', 'no'),
    tag('google_product_category', GOOGLE_CATEGORY),
    tag('product_type', p.productType),
    // Sizes of one product are variants of one group; a one-size product has no group.
    ...(sizesOf(p).length > 1 ? [tag('item_group_id', `EP-${p.shape.toUpperCase()}`)] : []),
    tag('size', p.size),
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
    '    <title>EdiblePrint.ca</title>',
    `    <link>${SITE_URL}</link>`,
    '    <description>Custom edible image prints for cakes, cookies and cupcakes, made in London, Ontario.</description>',
    ...PRODUCTS.map(item),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
