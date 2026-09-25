// Guards the "the site says one thing about shipping" requirement: no page
// may still carry the old single-rate wording, the general shipping sentence
// must come from lib/shipping-config.js, and the legal pages must agree with
// each other. Pure text checks against rendered pages — nothing is submitted.
//
// /shipping is deliberately NOT in the stale-wording sweep yet: that page is
// rewritten in its own stage. Add it to PAGES_WITHOUT_OLD_WORDING once done.
import { chromium } from 'playwright';
import { getShippingMethod, shippingTimesSentence, formatProductionWindow } from '../lib/shipping-config.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STD = getShippingMethod('standard');
const TRK = getShippingMethod('tracked');

// Wording from the single-flat-rate era that must not survive anywhere.
const OLD_WORDING = [
  [/3\s*[–-]\s*5\s*business days/i, '"3–5 business days"'],
  [/approx\.?\s*3\s*[–-]\s*5/i, '"approx. 3–5"'],
  [/ships in (approx\.|~)/i, '"Ships in approx./~ …"'],
  [/flat[- ]rate/i, '"flat rate"'],
  [/Canada Post Shipping —/i, 'the old "Canada Post Shipping — $9.99" option label'],
];
const PAGES_WITHOUT_OLD_WORDING = ['/', '/about', '/edible-images-for-cakes', '/terms', '/refund'];

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const textOf = async (path) => {
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  };

  const pages = {};
  for (const path of PAGES_WITHOUT_OLD_WORDING) {
    pages[path] = await textOf(path);
    for (const [re, label] of OLD_WORDING) {
      check(`${path}: no ${label}`, !re.test(pages[path]), (re.exec(pages[path]) || [])[0]);
    }
  }

  const general = shippingTimesSentence();
  check('sentence from config matches the agreed wording',
    general === 'Standard shipping takes 3 to 10 business days and does not include a tracking number. Tracked shipping arrives in 1 to 2 business days.', general);
  check('/: FAQ carries the general shipping sentence', pages['/'].includes(general));
  check('/: FAQ states both prices from config',
    pages['/'].includes(`Standard shipping ($${STD.price.toFixed(2)})`) && pages['/'].includes(`Tracked shipping ($${TRK.price.toFixed(2)})`));
  check('/: FAQ says orders are printed within the production window',
    pages['/'].includes(`Orders are printed within ${formatProductionWindow()} before shipping.`));
  check('/: delivery bar names both methods with business days',
    pages['/'].includes(`Standard shipping: ${STD.minBusinessDays}–${STD.maxBusinessDays} business days · Tracked: ${TRK.minBusinessDays}–${TRK.maxBusinessDays} business days`));
  check('/: badge says business days for both methods',
    pages['/'].includes(`Standard: ${STD.minBusinessDays}–${STD.maxBusinessDays} business days`)
    && pages['/'].includes(`Tracked: ${TRK.minBusinessDays}–${TRK.maxBusinessDays} business days`));
  check('/: price footer says shipping is "from" the lowest price', pages['/'].includes(`Canada-wide shipping from $${STD.price.toFixed(2)}`));
  const cardLines = (pages['/'].match(/🚀 Production:/g) || []).length;
  const cleanCardLines = (pages['/'].match(new RegExp('🚀 Production: ' + formatProductionWindow() + '(?! ·)', 'g')) || []).length;
  check('/: every size card shows production only (no shipping window)', cardLines > 0 && cardLines === cleanCardLines, { cardLines, cleanCardLines });

  check('/terms: carries the general shipping sentence', pages['/terms'].includes(general));
  check('/terms: carve-out points to the Shipping Policy', pages['/terms'].includes('Except as described in our Shipping Policy'));
  check('/refund: lost standard orders get a one-time reprint',
    pages['/refund'].includes(`has not arrived ${STD.maxBusinessDays} business days after it was mailed`)
    && pages['/refund'].includes('reprint and resend it once, at no cost'));
  check('/terms + /refund: "Last updated" refreshed',
    pages['/terms'].includes('Last updated: September 24, 2026') && pages['/refund'].includes('Last updated: September 24, 2026'));
  for (const path of ['/about', '/edible-images-for-cakes']) {
    check(`${path}: names both methods and their windows`,
      pages[path].includes(`standard (${STD.minBusinessDays}–${STD.maxBusinessDays} business days, no tracking number) or tracked (${TRK.minBusinessDays}–${TRK.maxBusinessDays} business days)`));
  }

  await browser.close();
  console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  const failures = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
