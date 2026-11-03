// Guards what search engines read: every public page declares itself as its
// own canonical URL (a page inheriting the home page's canonical tells Google
// it's a duplicate), post-checkout pages stay out of the index, the sitemap
// lists real pages only, and landing page CTAs open the editor. Nothing is
// submitted.
import { chromium } from 'playwright';
import { SITE_URL } from '../lib/site-config.js';
import catalog from '../content/design-catalog.json' with { type: 'json' };

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const INDEXABLE = [
  '/', '/edible-images-for-cakes', '/edible-cookie-toppers', '/edible-logo-prints',
  '/edible-images-london-ontario', '/designs', '/cookie-tools', '/about', '/shipping',
  '/refund', '/allergens', '/terms', '/privacy', `/designs/${catalog.designs.find((d) => d.active !== false).id}`,
];
const NOINDEX = ['/success', '/cancel', '/download-pdf'];

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });
// Googlebot gets metadata in the initial HTML — the same response this reads.
const fetchPage = (path) => fetch(BASE_URL + path, { headers: { 'user-agent': 'Googlebot' } });
const canonicalOf = (html) => /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
const titleOf = (html) => /<title>(.*?)<\/title>/.exec(html)?.[1];
const descriptionOf = (html) => /<meta name="description" content="([^"]*)"/.exec(html)?.[1];

(async () => {
  const titles = new Map();
  for (const path of INDEXABLE) {
    const res = await fetchPage(path);
    const html = await res.text();
    const expected = SITE_URL + (path === '/' ? '' : path);
    check(`${path}: 200`, res.status === 200, res.status);
    check(`${path}: canonical is itself`, canonicalOf(html)?.replace(/\/$/, '') === expected, canonicalOf(html));
    check(`${path}: not noindex`, !/<meta name="robots" content="[^"]*noindex/.test(html));
    // The business takes texts and WhatsApp only, and the unit stays private.
    check(`${path}: no call links`, !/href="tel:/.test(html) && !/"telephone"/.test(html));
    check(`${path}: no unit in the public address`, !/"streetAddress":"[^"]*Unit/.test(html));
    check(`${path}: one h1`, path.startsWith('/designs/') || (html.match(/<h1/g) || []).length === 1, (html.match(/<h1/g) || []).length);
    const description = descriptionOf(html) || '';
    check(`${path}: description fits a search result`, description.length >= 50 && description.length <= 170, description.length);
    const title = titleOf(html);
    check(`${path}: unique title`, title && !titles.has(title), `${title} also on ${titles.get(title)}`);
    titles.set(title, path);
  }

  for (const path of NOINDEX) {
    const html = await (await fetchPage(path)).text();
    check(`${path}: noindex`, /<meta name="robots" content="noindex/.test(html));
  }

  const missing = await fetchPage('/designs/this-design-does-not-exist');
  check('unknown design: 404', missing.status === 404, missing.status);

  const robots = await (await fetchPage('/robots.txt')).text();
  check('robots.txt points to the sitemap', robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`), robots);

  const sitemap = await (await fetchPage('/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  check('sitemap has every indexable page', INDEXABLE.every((p) => urls.includes(SITE_URL + (p === '/' ? '' : p))));
  check('sitemap has no private pages', !urls.some((u) => /\/(admin|api|success|cancel|download-pdf)/.test(u)));
  for (const url of urls) {
    const res = await fetchPage(url.replace(SITE_URL, '') || '/');
    check(`sitemap entry resolves: ${url}`, res.status === 200, res.status);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const ctas = [['/edible-cookie-toppers', 'Create Your Cookie Toppers →'], ['/edible-images-for-cakes', 'Upload Your Photo Now →']];
  for (const [path, name] of ctas) {
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name }).last().click();
    await page.waitForURL((u) => u.pathname === '/' && !u.search, { timeout: 20000 });
    await page.getByRole('button', { name: 'Upload Your Photo →' }).waitFor({ state: 'detached', timeout: 20000 });
    check(`${path}: CTA leaves the home page for the editor`, true);
  }
  for (const name of ['Order Your Custom Print →', /^Design Your PDF/]) {
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name }).click();
    await page.getByRole('button', { name: 'Upload Your Photo →' }).waitFor({ state: 'detached', timeout: 20000 });
    check(`home: "${name}" opens the editor`, true);
  }
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
