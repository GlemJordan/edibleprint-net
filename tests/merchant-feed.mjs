// Guards the Google Merchant Center products (lib/products.js): Google
// disapproves an item whose landing page doesn't load, whose image doesn't
// load, or whose page shows a different price than the listing. For every
// product this checks, in the page's initial HTML (what Google's crawler
// reads, before any JavaScript): the H1 is the listing title, the price is the
// price checkout charges, the Product markup carries the same sku/price/url,
// and the required notice and policy links are there. Also: the feed, the
// sitemap, the redirects from the first product URLs, the home page "View
// details" links, and that "Customize this size" opens the editor on that
// exact size. Nothing is submitted.
import { chromium } from 'playwright';
import { SITE_URL } from '../lib/site-config.js';
import { PRODUCTS, LEGACY_PRODUCT_SLUGS } from '../lib/products.js';
import { CATALOG_SIZES } from '../lib/catalog-sizes.js';
import { CATALOG_PRICES } from '../lib/catalog-prices.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });
const get = (path, opts = {}) => fetch(BASE_URL + path, { headers: { 'user-agent': 'Storebot-Google' }, ...opts });
const field = (xml, name) => new RegExp(`<g:${name}>([^<]*)</g:${name}>`).exec(xml)?.[1];
const unescape = (s) => s?.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
// React separates adjacent text nodes with <!-- --> in server HTML.
const visibleText = (html) => unescape(html.replace(/<!-- -->/g, '').replace(/<script[\s\S]*?<\/script>/g, ''));

(async () => {
  // ── the products themselves ──
  check('15 products', PRODUCTS.length === 15, PRODUCTS.length);
  check('product ids are unique', new Set(PRODUCTS.map((p) => p.id)).size === PRODUCTS.length);
  check('product slugs are unique', new Set(PRODUCTS.map((p) => p.slug)).size === PRODUCTS.length);
  for (const p of PRODUCTS) {
    check(`${p.id}: price is the catalog price`, p.price === CATALOG_PRICES[p.shape][p.sizeId], p.price);
  }

  // ── feed ──
  const res = await get('/merchant-feed.xml');
  const xml = await res.text();
  check('feed: 200', res.status === 200, res.status);
  check('feed: served as XML', /xml/.test(res.headers.get('content-type') || ''), res.headers.get('content-type'));
  check('feed: RSS 2.0 with the g: namespace', xml.startsWith('<?xml') && xml.includes('xmlns:g="http://base.google.com/ns/1.0"'));
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  check('feed: one item per product', items.length === PRODUCTS.length, items.length);
  for (const it of items) {
    const id = field(it, 'id');
    const p = PRODUCTS.find((x) => x.id === id);
    check(`feed ${id}: is a product`, p, id);
    if (!p) continue;
    check(`feed ${id}: title is the page title`, unescape(field(it, 'title')) === p.title, field(it, 'title'));
    check(`feed ${id}: price`, field(it, 'price') === `${p.price.toFixed(2)} CAD`, field(it, 'price'));
    check(`feed ${id}: link`, unescape(field(it, 'link')) === SITE_URL + p.path, field(it, 'link'));
    check(`feed ${id}: image`, unescape(field(it, 'image_link')) === SITE_URL + p.image, field(it, 'image_link'));
    check(`feed ${id}: brand`, field(it, 'brand') === 'EdiblePrint', field(it, 'brand'));
    const description = unescape(field(it, 'description')) || '';
    check(`feed ${id}: description fits (5000)`, description.length >= 50 && description.length <= 5000, description.length);
    for (const name of ['availability', 'condition', 'identifier_exists', 'google_product_category']) check(`feed ${id}: has ${name}`, field(it, name));
    check(`feed ${id}: ships within Canada`, /<g:shipping>\s*<g:country>CA<\/g:country>/.test(it));
  }

  // ── each product page, as first served ──
  const sitemap = await (await get('/sitemap.xml')).text();
  const titles = new Set();
  for (const p of PRODUCTS) {
    const page = await get(p.path);
    const html = await page.text();
    const text = visibleText(html);
    check(`${p.id}: page 200`, page.status === 200, page.status);
    check(`${p.id}: in the sitemap`, sitemap.includes(`<loc>${SITE_URL + p.path}</loc>`));
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    check(`${p.id}: canonical is itself`, canonical === SITE_URL + p.path, canonical);
    check(`${p.id}: not noindex`, !/<meta name="robots" content="[^"]*noindex/.test(html));

    const h1 = unescape(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<!-- -->/g, ''));
    check(`${p.id}: H1 is the title`, h1 === p.title, h1);
    check(`${p.id}: one h1`, (html.match(/<h1/g) || []).length === 1);
    check(`${p.id}: shows the price in CAD`, text.includes(`$${p.price.toFixed(2)} CAD`));
    check(`${p.id}: shows the size`, text.includes(p.sizeText), p.sizeText);
    check(`${p.id}: shows what it fits or is for`, text.includes(p.use), p.use);
    check(`${p.id}: shows the material`, text.includes(p.material), p.material);
    check(`${p.id}: shows production time`, /Ready in 1–2 business days/.test(text));
    check(`${p.id}: shows free pickup in London`, /Free pickup in London, ON/.test(text));
    check(`${p.id}: shows standard and tracked shipping`, text.includes('Standard shipping') && text.includes('Tracked shipping'));
    check(`${p.id}: image-rights notice`, text.includes('Only upload images you own or have permission to use.'));
    for (const href of ['/shipping', '/refund', '/allergens']) check(`${p.id}: links ${href}`, html.includes(`href="${href}"`));
    check(`${p.id}: Customize this size → editor on its size`, html.includes(`href="/?start=${p.sizeId}"`) && text.includes('Customize this size'));
    check(`${p.id}: shows the product image`, html.includes(`src="${p.image}"`));
    check(`${p.id}: no call link or unit number`, !/href="tel:/.test(html) && !/Unit 7/.test(html));

    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((j) => j['@type'] === 'Product');
    const o = ld?.offers || {};
    check(`${p.id}: Product markup in the initial HTML`, ld, html.slice(0, 200));
    check(`${p.id}: markup name/sku/brand/image`, ld?.name === p.title && ld?.sku === p.id && ld?.brand?.name === 'EdiblePrint'
      && ld?.image === SITE_URL + p.image && ld?.description, { name: ld?.name, sku: ld?.sku, brand: ld?.brand, image: ld?.image });
    check(`${p.id}: markup Offer`, o['@type'] === 'Offer' && o.price === p.price.toFixed(2) && o.priceCurrency === 'CAD'
      && o.availability === 'https://schema.org/InStock' && o.itemCondition === 'https://schema.org/NewCondition'
      && o.url === SITE_URL + p.path, o);

    const title = /<title>(.*?)<\/title>/.exec(html)?.[1];
    check(`${p.id}: unique page title`, title && !titles.has(title), title);
    titles.add(title);
    const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || '';
    check(`${p.id}: description fits a search result`, desc.length >= 50 && desc.length <= 170, desc.length);

    const img = await get(p.image);
    check(`${p.id}: image loads as PNG`, img.status === 200 && (img.headers.get('content-type') || '') === 'image/png', `${img.status} ${img.headers.get('content-type')}`);
  }

  const missing = await get('/products/this-product-does-not-exist');
  check('unknown product: 404', missing.status === 404, missing.status);

  // The first product URLs (2026-11-08) send people and Google to the new ones.
  for (const [from, to] of Object.entries(LEGACY_PRODUCT_SLUGS)) {
    const r = await get(`/products/${from}`, { redirect: 'manual' });
    const loc = r.headers.get('location') || '';
    check(`old /products/${from}: 301 to /products/${to}`, r.status === 301 && loc.endsWith(`/products/${to}`), `${r.status} ${loc}`);
  }

  // ── in a browser ──
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  // "Customize this size" opens the editor on that exact size, not the default.
  for (const p of [PRODUCTS.find((x) => x.sizeId === 'c6'), PRODUCTS.find((x) => x.sizeId === 'mc2'), PRODUCTS.find((x) => x.sizeId === 'bw1')]) {
    const label = CATALOG_SIZES[p.shape].find((s) => s.id === p.sizeId).label;
    await page.goto(BASE_URL + p.path, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Customize this size' }).click();
    await page.waitForURL((u) => u.pathname === '/' && !u.search, { timeout: 20000 });
    await page.getByRole('button', { name: 'Upload Your Photo →' }).waitFor({ state: 'detached', timeout: 20000 });
    const opened = await page.getByText(`Pre-selected:`).filter({ hasText: label }).first().isVisible().catch(() => false);
    check(`${p.id}: "Customize this size" opens the editor on ${label}`, opened);
  }

  // Home price cards: "View details" goes to the product page; the card
  // itself ("Order this size") still opens the editor.
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  const details = page.getByRole('link', { name: 'View details' });
  check('home: a "View details" link on every Round card', (await details.count()) === CATALOG_SIZES.circular.length, await details.count());
  await details.last().click();
  await page.waitForURL((u) => u.pathname === '/products/round-8-inch', { timeout: 20000 }).catch(() => {});
  check('home: "View details" opens the product page', new URL(page.url()).pathname === '/products/round-8-inch', page.url());
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await page.getByText('Order this size →').first().click();
  await page.getByRole('button', { name: 'Upload Your Photo →' }).waitFor({ state: 'detached', timeout: 20000 });
  const preselected = await page.getByText('Pre-selected:').filter({ hasText: CATALOG_SIZES.circular[0].label }).first().isVisible().catch(() => false);
  check('home: "Order this size" still opens the editor on that size', preselected && new URL(page.url()).pathname === '/');

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
