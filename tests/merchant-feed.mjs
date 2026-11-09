// Guards the Google Merchant Center feed (/merchant-feed.xml): Google
// disapproves an item whose landing page doesn't load, whose image doesn't
// load, or whose page shows a different price than the feed. So for every
// item this checks the product page answers, declares itself canonical, shows
// the feed's price and carries the same price in its Product markup; and that
// the "Upload Your Photo" button there opens the editor on that exact size.
// Nothing is submitted.
import { chromium } from 'playwright';
import { SITE_URL } from '../lib/site-config.js';
import { PRODUCTS } from '../lib/products.js';
import { CATALOG_SIZES } from '../lib/catalog-sizes.js';
import { CATALOG_PRICES } from '../lib/catalog-prices.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });
const get = (path) => fetch(BASE_URL + path, { headers: { 'user-agent': 'Storebot-Google' } });
const field = (xml, name) => new RegExp(`<g:${name}>([^<]*)</g:${name}>`).exec(xml)?.[1];
const unescape = (s) => s?.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// React separates adjacent text nodes with <!-- --> in server HTML.
const visibleText = (html) => html.replace(/<!-- -->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

(async () => {
  const res = await get('/merchant-feed.xml');
  const xml = await res.text();
  check('feed: 200', res.status === 200, res.status);
  check('feed: served as XML', /xml/.test(res.headers.get('content-type') || ''), res.headers.get('content-type'));
  check('feed: RSS 2.0 with the g: namespace', xml.startsWith('<?xml') && xml.includes('xmlns:g="http://base.google.com/ns/1.0"'));

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const sizeCount = Object.values(CATALOG_SIZES).flat().length;
  check('feed: one item per catalog size', items.length === sizeCount && items.length === PRODUCTS.length, `${items.length} items, ${sizeCount} sizes`);
  const ids = items.map((i) => field(i, 'id'));
  check('feed: ids are unique', new Set(ids).size === ids.length, ids);

  const sitemap = await (await get('/sitemap.xml')).text();
  const titles = new Set();

  for (const it of items) {
    const id = field(it, 'id');
    const product = PRODUCTS.find((p) => p.id === id);
    const link = unescape(field(it, 'link'));
    const price = field(it, 'price');
    const title = unescape(field(it, 'title'));
    const description = unescape(field(it, 'description'));
    check(`${id}: matches a product`, product, id);
    if (!product) continue;

    check(`${id}: price is the price checkout charges`, price === `${CATALOG_PRICES[product.shape][product.sizeId].toFixed(2)} CAD`, price);
    check(`${id}: title fits (150)`, title && title.length <= 150, title?.length);
    check(`${id}: description fits (5000)`, description && description.length >= 50 && description.length <= 5000, description?.length);
    for (const name of ['availability', 'condition', 'brand', 'identifier_exists', 'google_product_category', 'image_link']) {
      check(`${id}: has ${name}`, field(it, name), it);
    }
    check(`${id}: ships within Canada`, /<g:shipping>\s*<g:country>CA<\/g:country>/.test(it));
    check(`${id}: link is the product page`, link === SITE_URL + product.path, link);
    check(`${id}: product page is in the sitemap`, sitemap.includes(`<loc>${SITE_URL + product.path}</loc>`));

    const page = await get(product.path);
    const html = await page.text();
    check(`${id}: product page 200`, page.status === 200, page.status);
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    check(`${id}: product page is its own canonical`, canonical === SITE_URL + product.path, canonical);
    check(`${id}: product page not noindex`, !/<meta name="robots" content="[^"]*noindex/.test(html));

    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((j) => j['@type'] === 'Product');
    check(`${id}: Product markup has the feed price`, ld?.offers?.price === price.replace(' CAD', '') && ld?.offers?.priceCurrency === 'CAD', ld?.offers);
    check(`${id}: Product markup has one offer, not a range`, ld?.offers?.['@type'] === 'Offer', ld?.offers?.['@type']);
    check(`${id}: page shows the feed price`, visibleText(html).includes(`$${price.replace(' CAD', '')}`));
    check(`${id}: page shows no call link or street`, !/href="tel:/.test(html) && !/Burslem/.test(html));

    const pageTitle = /<title>(.*?)<\/title>/.exec(html)?.[1];
    check(`${id}: unique page title`, pageTitle && !titles.has(pageTitle), pageTitle);
    titles.add(pageTitle);
    const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || '';
    check(`${id}: description fits a search result`, desc.length >= 50 && desc.length <= 170, desc.length);

    const img = await get(unescape(field(it, 'image_link')).replace(SITE_URL, ''));
    check(`${id}: image loads`, img.status === 200 && /^image\//.test(img.headers.get('content-type') || ''), `${img.status} ${img.headers.get('content-type')}`);
  }

  const missing = await get('/products/this-product-does-not-exist');
  check('unknown product: 404', missing.status === 404, missing.status);

  // The product page's button must open the editor on its own size, not the
  // default one: a shopper who clicked "7 inch" in Google expects 7 inch.
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  for (const product of [PRODUCTS.find((p) => p.sizeId === 'c6'), PRODUCTS.find((p) => p.sizeId === 'mc2')]) {
    const label = CATALOG_SIZES[product.shape].find((s) => s.id === product.sizeId).label;
    await page.goto(BASE_URL + product.path, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Upload Your Photo →' }).click();
    await page.waitForURL((u) => u.pathname === '/' && !u.search, { timeout: 20000 });
    await page.getByRole('button', { name: 'Upload Your Photo →' }).waitFor({ state: 'detached', timeout: 20000 });
    const opened = await page.getByText(label, { exact: false }).first().isVisible().catch(() => false);
    check(`${product.id}: "Upload Your Photo" opens the editor on ${label}`, opened);
  }
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
