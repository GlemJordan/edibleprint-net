// Guards the "the site says one thing about shipping" requirement: no page
// may still carry the old single-rate wording, the general shipping sentence
// must come from lib/shipping-config.js, and the legal pages must agree with
// each other. Pure text checks against rendered pages — nothing is submitted.
import { chromium } from 'playwright';
import {
  getShippingMethod, shippingTimesSentence, formatProductionWindow, formatBusinessDayRange, describeShippingMethod,
  getShippingPackages, getShippingCost, orderLimitMessage, SHEETS_PER_PACKAGE, TRACKED_MAX_SHEETS,
  standardNotArrivedSentence,
} from '../lib/shipping-config.js';

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
const PAGES_WITHOUT_OLD_WORDING = ['/', '/about', '/edible-images-for-cakes', '/terms', '/refund', '/shipping'];

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
  check('/: FAQ states both prices from config, standard per package',
    pages['/'].includes(`Standard shipping ($${STD.price.toFixed(2)} per package of up to ${SHEETS_PER_PACKAGE} sheets)`)
    && pages['/'].includes(`Tracked shipping ($${TRK.price.toFixed(2)})`));
  check('/: FAQ says orders are printed within the production window',
    pages['/'].includes(`Orders are printed within ${formatProductionWindow()} before shipping.`));
  check('/: delivery bar names both methods with business days',
    pages['/'].includes(`Standard shipping: ${STD.minBusinessDays}–${STD.maxBusinessDays} business days · Tracked: ${TRK.minBusinessDays}–${TRK.maxBusinessDays} business days`));
  check('/: badge says business days for both methods',
    pages['/'].includes(`Standard: ${STD.minBusinessDays}–${STD.maxBusinessDays} business days`)
    && pages['/'].includes(`Tracked: ${TRK.minBusinessDays}–${TRK.maxBusinessDays} business days`));
  check('/: price footer says shipping is "from" the lowest price', pages['/'].includes(`Canada-wide shipping from $${STD.price.toFixed(2)}`));
  check('/: banner promises pickup/shipping in the production window, not "next business day"',
    pages['/'].includes(`Ready for pickup or shipping in ${formatProductionWindow()}`) && !/Ready for pickup or shipping next business day/.test(pages['/']));
  check('/: "How it works" no longer promises delivery "in days"', !/ship to your door in days/.test(pages['/']));
  const cardLines = (pages['/'].match(/🚀 Production:/g) || []).length;
  const cleanCardLines = (pages['/'].match(new RegExp('🚀 Production: ' + formatProductionWindow() + '(?! ·)', 'g')) || []).length;
  check('/: every size card shows production only (no shipping window)', cardLines > 0 && cardLines === cleanCardLines, { cardLines, cleanCardLines });

  check('/terms: carries the general shipping sentence', pages['/terms'].includes(general));
  check('/terms: carve-out points to the Shipping Policy', pages['/terms'].includes('Except as described in our Shipping Policy'));
  const NOT_ARRIVED = `If part of a standard shipping order has not arrived ${STD.maxBusinessDays} business days after it was mailed, contact us and we will reprint and resend that part once, at no cost.`;
  check('/refund: only the part that did not arrive is reprinted, once, at no cost', pages['/refund'].includes(NOT_ARRIVED));
  check('the not-arrived sentence is the config one, word for word', standardNotArrivedSentence() === NOT_ARRIVED, standardNotArrivedSentence());
  check('/refund + /shipping: no page still promises to reprint "it" (the whole order)',
    !/reprint and resend it once/.test(pages['/refund']) && !/reprint and resend it once/.test(pages['/shipping']));
  check('/terms + /refund + /shipping: same "Last updated" date',
    ['/terms', '/refund', '/shipping'].every((path) => pages[path].includes('Last updated: September 25, 2026')));
  const ship = pages['/shipping'];
  check('/shipping: carries the general shipping sentence', ship.includes(general));
  for (const m of [STD, TRK]) {
    check(`/shipping: lists ${m.id} with carrier, price, window and tracking from config`,
      ship.includes(`${m.label} — ${m.carrier} ${describeShippingMethod(m)}`), describeShippingMethod(m));
  }
  check('/shipping: explains per-package standard, one-package tracked, and the order limit (all from config)',
    ship.includes(`Standard shipping is charged for each package of up to ${SHEETS_PER_PACKAGE} sheets: an order of 5 sheets ships in ${getShippingPackages('standard', 5)} packages and costs $${getShippingCost('standard', 5).toFixed(2)}.`)
    && ship.includes(`Tracked shipping sends your whole order in one package for one price, up to ${TRACKED_MAX_SHEETS} sheets.`)
    && ship.includes(orderLimitMessage()));
  check('/shipping: free local pickup line', ship.includes('Free local pickup is available in London, Ontario.'));
  check('/shipping: production time from config, delivery times start at shipping',
    ship.includes(`Orders are printed within ${formatProductionWindow()} before they are shipped. The delivery times above start once your order ships.`));
  check('/shipping: says exactly the same not-arrived rule as /refund', ship.includes(NOT_ARRIVED));
  check('/refund and /shipping both point at the same 10-business-day window and neither offers a full-order reprint',
    pages['/refund'].includes(NOT_ARRIVED) && ship.includes(NOT_ARRIVED));
  check('/shipping: recommends tracked for deadlines and has the address + deadline sections',
    ship.includes('we recommend tracked shipping') && ship.includes('Your address') && ship.includes('Orders with a deadline'));
  check('/shipping: old lost-package rule is gone',
    !/neighbors|hasn't arrived within|Lettermail does not include/i.test(ship), (/neighbors|hasn't arrived within|Lettermail does not include/i.exec(ship) || [])[0]);
  for (const path of ['/about', '/edible-images-for-cakes']) {
    check(`${path}: names both methods and their windows`,
      pages[path].includes(`standard (${STD.minBusinessDays}–${STD.maxBusinessDays} business days, no tracking number) or tracked (${TRK.minBusinessDays}–${TRK.maxBusinessDays} business days)`));
  }

  const successText = async (shipping_method) => {
    const ctx = await browser.newContext();
    const sp = await ctx.newPage();
    await sp.route('**/api/get-order-summary*', (route) => route.fulfill({ json: {
      transaction_id: 'EP-TEST0000', value: 10, currency: 'CAD', items: [], payment_status: 'paid', session_status: 'complete',
      ...(shipping_method ? { shipping_method } : {}),
    } }));
    await sp.goto(BASE_URL + '/success?session_id=cs_test_copycheck_' + (shipping_method || 'none'), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sp.getByText('What happens next?').waitFor({ timeout: 90000 });
    const text = (await sp.locator('body').innerText()).replace(/\s+/g, ' ');
    await ctx.close();
    return text;
  };
  const pickup = await successText('pickup');
  check('/success pickup: pickup message, no Canada Post or shipping windows',
    pickup.includes('confirm your pickup time') && !/Canada Post|business days|ship/i.test(pickup), pickup);
  for (const m of [STD, TRK]) {
    const t = await successText(m.id);
    check(`/success ${m.id}: names ${m.carrier}, its window and tracking`,
      t.includes(`ship it via ${m.carrier}`) && t.includes(formatBusinessDayRange(m))
      && t.includes(m.tracking ? 'tracking number included' : 'no tracking number') && !t.includes('pickup time'), t);
  }
  const legacy = await successText(null);
  check('/success with no stored method reads as standard', legacy.includes(`ship it via ${STD.carrier}`), legacy);

  await browser.close();
  console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  const failures = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
