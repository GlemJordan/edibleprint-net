// Verifies the standard/tracked shipping selector in BOTH checkouts (the main
// editor at "/" and the ready-made design form at "/designs/[id]"): what's
// shown, that prices come from lib/shipping-config.js, that pickup hides it,
// that the needed-by warning appears/disappears (and never blocks), and what
// payload the browser actually sends to /api/create-checkout.
//
// Fully isolated — no external service is touched: the Cloudinary signing +
// upload calls and /api/create-checkout itself are intercepted, so nothing is
// uploaded and no Stripe session is created. (What Stripe really charges is
// covered separately by hitting the real endpoint; see the stage-2 notes.)
//
// "Today" is pinned so the date-warning cases are deterministic:
// Thu 2026-09-24. Latest arrival = max production (2) + method's max transport,
// skipping weekends and CANADA_POST_HOLIDAYS (Sep 30, Oct 12):
//   tracked  (2+2  = 4 business days)  -> 2026-10-01
//   standard (2+10 = 12 business days) -> 2026-10-14
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getShippingMethod } from '../lib/shipping-config.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-shipsel-'));
const STD = getShippingMethod('standard');
const TRK = getShippingMethod('tracked');
const TODAY = new Date('2026-09-24T12:00:00-04:00');
const WARN_SLOW = 'Standard shipping may not arrive in time for that date. We recommend tracked shipping.';
const WARN_NONE = 'We may not be able to deliver by that date. Please contact us before placing your order.';
const PRODUCTION_LINE = 'Orders are printed within 1–2 business days before shipping.';
const SHIP_ROW = 'Ship to my address';
const DATE_LABEL = 'Do you need your order by a specific date? (optional)';
const money = (n) => '$' + n.toFixed(2);

const results = [];
const check = (test, pass, detail) => { results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) }); };

async function makeExactPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([8 * 72, 11 * 72]);
  page.drawRectangle({ x: 40, y: 40, width: 8 * 72 - 80, height: 11 * 72 - 80, color: rgb(0.2, 0.4, 0.8) });
  const p = path.join(TMP_DIR, 'ship-selector.pdf');
  fs.writeFileSync(p, await doc.save());
  return p;
}

// Returns { page, sent } where sent collects every create-checkout payload.
async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(TODAY); // fixes Date only — timers keep running
  const sent = [];
  await page.route('**/api/upload-print-file', (r) => r.fulfill({
    json: { cloudName: 'test', apiKey: 'k', timestamp: 1, signature: 's', publicId: 'p' },
  }));
  await page.route('https://api.cloudinary.com/**', (r) => r.fulfill({
    json: { secure_url: 'https://res.cloudinary.com/test/raw/upload/p.pdf' },
  }));
  await page.route('**/api/create-checkout', async (r) => {
    sent.push(r.request().postDataJSON());
    await r.fulfill({ json: { url: BASE_URL + '/cancel' } });
  });
  return { page, sent };
}

async function openMainStep3(page, pdfPath) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Already have a print-ready file? Upload it directly →' }).click();
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles(pdfPath);
  await page.waitForTimeout(1500);
  await page.locator('input[type="checkbox"]').last().check();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('heading', { name: 'Shipping & Payment' }).waitFor();
  await page.locator('input[placeholder="Jane Smith"]').fill('Test Customer');
  await page.locator('input[placeholder="jane@email.com"]').fill('test-shipping@example.com');
}

async function fillMainAddress(page) {
  await page.locator('input[placeholder="e.g. 123 Main Street"]').fill('1 Test St');
  await page.locator('input[placeholder="Toronto"]').fill('London');
  await page.locator('input[placeholder="N6A 1B2"]').fill('N6A 1B2');
}

const summaryCard = (page) => page.locator('h3', { hasText: 'Order Summary' }).locator('..');
async function summaryTotal(page) {
  const txt = await summaryCard(page).innerText();
  const m = /Total\s*\$([\d.]+)/.exec(txt);
  return m ? parseFloat(m[1]) : NaN;
}
const radio = (page, method) => page.getByRole('radio', { name: new RegExp('^' + method.label + ' — ' + method.carrier) });
const dateInput = (page) => page.getByLabel(DATE_LABEL);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// Shared assertions for the selector itself, run in each checkout once it is showing.
async function checkSelectorUi(page, prefix) {
  check(`${prefix}: Standard preselected`, await radio(page, STD).isChecked());
  check(`${prefix}: Tracked not preselected`, !(await radio(page, TRK).isChecked()));
  check(`${prefix}: standard title + terms text`,
    await page.getByText('Standard shipping — Canada Post Lettermail', { exact: true }).isVisible()
    && await page.getByText(money(STD.price) + ' · 3–10 business days · No tracking number', { exact: true }).isVisible());
  check(`${prefix}: tracked title + terms text`,
    await page.getByText('Tracked shipping — Canada Post Xpresspost', { exact: true }).isVisible()
    && await page.getByText(money(TRK.price) + ' · 1–2 business days · Tracking number included', { exact: true }).isVisible());
  check(`${prefix}: date field + label`, await dateInput(page).isVisible());
  const link = page.getByRole('link', { name: 'Shipping policy' });
  check(`${prefix}: Shipping policy link -> /shipping (new tab)`,
    (await link.getAttribute('href')) === '/shipping' && (await link.getAttribute('target')) === '_blank');
  check(`${prefix}: production-time line above the selector`, await page.getByText(PRODUCTION_LINE, { exact: true }).isVisible());
  const shown = async () => ({
    slow: await page.getByText(WARN_SLOW, { exact: true }).isVisible(),
    none: await page.getByText(WARN_NONE, { exact: true }).isVisible(),
  });
  const expectState = async (label, want) => {
    const got = await shown();
    check(`${prefix}: ${label}`, got.slow === !!want.slow && got.none === !!want.none, { want, got });
  };
  const setDate = (d) => dateInput(page).fill(d);

  // Standard selected (default). Latest arrivals: standard 10-14, tracked 10-01.
  await expectState('no warning before a date is entered', {});
  await setDate('2026-10-30'); await expectState('no warning for a comfortably later date', {});
  await setDate('2026-10-14'); await expectState("no warning when standard's latest arrival == needed-by (10-14)", {});
  await setDate('2026-10-13'); await expectState('standard-too-slow warning one day short (10-13)', { slow: true });
  await setDate('2026-10-01'); await expectState('standard-too-slow warning when only tracked makes it (10-01)', { slow: true });
  await setDate('2026-09-30'); await expectState("can't-deliver warning when not even tracked makes it (09-30)", { none: true });
  await setDate('2026-09-01'); await expectState("can't-deliver warning for a date already in the past", { none: true });

  await setDate('2026-10-13');
  await radio(page, TRK).check();
  await expectState('slow warning disappears when Tracked is chosen', {});
  await radio(page, STD).check();
  await expectState('slow warning returns when Standard is chosen again', { slow: true });

  await setDate('2026-09-30');
  await radio(page, TRK).check();
  await expectState("can't-deliver warning stays with Tracked selected (the date is the problem)", { none: true });
  await radio(page, STD).check();
  await expectState("can't-deliver warning shown with Standard selected too", { none: true });

  await setDate('');
  await expectState('warnings clear when the date is emptied', {});
}

(async () => {
  const browser = await chromium.launch();
  const pdfPath = await makeExactPdf();
  const desktop = { width: 1280, height: 1400 };
  const phone = { width: 390, height: 844 };

  // ── Main checkout, desktop: Standard + a needed-by date the warning flags ──
  let totalStd, totalTrk, totalPickup;
  {
    const { page, sent } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath);
    await fillMainAddress(page);
    await checkSelectorUi(page, 'main');

    const sum = await summaryCard(page).innerText();
    check('main: summary shows the Standard method name + its cost',
      sum.includes(STD.label) && sum.includes(money(STD.price)), sum);
    totalStd = await summaryTotal(page);

    await radio(page, TRK).check();
    const sumT = await summaryCard(page).innerText();
    check('main: summary switches to the Tracked name + cost',
      sumT.includes(TRK.label) && sumT.includes(money(TRK.price)) && !sumT.includes(STD.label), sumT);
    totalTrk = await summaryTotal(page);
    check('main: switching to Tracked changes the total by exactly the price difference',
      (totalTrk - totalStd).toFixed(2) === (TRK.price - STD.price).toFixed(2), { totalStd, totalTrk });
    await radio(page, STD).check();

    // Warning showing must not stop the order going through.
    await dateInput(page).fill('2026-10-13');
    check('main: warning is visible for the order about to be placed', await page.getByText(WARN_SLOW, { exact: true }).isVisible());
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Place Order/ }).click();
    await page.waitForURL('**/cancel', { timeout: 15000 }).catch(() => {});
    const body = sent[0];
    check('main: create-checkout was reached despite the warning', !!body, sent);
    check('main: sends shippingMethod "standard" (not the old "shipping")', body?.shippingMethod === 'standard', body?.shippingMethod);
    check('main: sends neededByDate', body?.neededByDate === '2026-10-13', body?.neededByDate);
    check('main: no longer sends a shippingCost for the server to (not) trust', !('shippingCost' in (body || {})), body);
    await page.context().close();
  }

  // ── Main checkout: Tracked, no date ──
  {
    const { page, sent } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath);
    await fillMainAddress(page);
    await radio(page, TRK).check();
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Place Order/ }).click();
    await page.waitForURL('**/cancel', { timeout: 15000 }).catch(() => {});
    const body = sent[0];
    check('main: sends shippingMethod "tracked"', body?.shippingMethod === 'tracked', body?.shippingMethod);
    check('main: omits neededByDate when none was entered', !('neededByDate' in (body || {})), body);
    await page.context().close();
  }

  // ── Main checkout: a date nothing can meet warns but still orders ──
  {
    const { page, sent } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath);
    await fillMainAddress(page);
    await radio(page, TRK).check();
    await dateInput(page).fill('2026-09-30');
    check("main: can't-deliver warning visible before placing", await page.getByText(WARN_NONE, { exact: true }).isVisible());
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Place Order/ }).click();
    await page.waitForURL('**/cancel', { timeout: 15000 }).catch(() => {});
    check("main: order still goes through with the can't-deliver warning showing",
      sent[0]?.shippingMethod === 'tracked' && sent[0]?.neededByDate === '2026-09-30', sent);
    await page.context().close();
  }

  // ── Main checkout: Pickup — even with a date typed before switching ──
  {
    const { page, sent } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath);
    await dateInput(page).fill('2026-10-13');
    await page.getByText('Free Pickup — London, ON', { exact: false }).click();
    check('main pickup: no method radios', (await page.getByRole('radio', { name: /shipping — Canada Post/ }).count()) === 0);
    check('main pickup: no date field', (await page.getByLabel(DATE_LABEL).count()) === 0);
    check('main pickup: no production-time line', (await page.getByText(PRODUCTION_LINE, { exact: true }).count()) === 0);
    check('main pickup: no warning', !(await page.getByText(WARN_SLOW, { exact: true }).isVisible()) && !(await page.getByText(WARN_NONE, { exact: true }).isVisible()));
    const sum = await summaryCard(page).innerText();
    check('main pickup: no shipping line or cost in the summary', !/shipping/i.test(sum), sum);
    totalPickup = await summaryTotal(page);
    check('main pickup: total is the Standard total minus its shipping', (totalStd - totalPickup).toFixed(2) === STD.price.toFixed(2), { totalStd, totalPickup });
    check('main pickup: total is the Tracked total minus its shipping', (totalTrk - totalPickup).toFixed(2) === TRK.price.toFixed(2), { totalTrk, totalPickup });
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Place Order/ }).click();
    await page.waitForURL('**/cancel', { timeout: 15000 }).catch(() => {});
    const body = sent[0];
    check('main pickup: sends shippingMethod "pickup"', body?.shippingMethod === 'pickup', body?.shippingMethod);
    check('main pickup: does NOT send the stale neededByDate', !('neededByDate' in (body || {})), body);
    await page.context().close();
  }

  // ── Main checkout at phone width ──
  {
    const { page } = await newPage(browser, phone);
    await openMainStep3(page, pdfPath);
    await radio(page, TRK).scrollIntoViewIfNeeded();
    check('main phone: selector visible', await radio(page, TRK).isVisible() && await dateInput(page).isVisible());
    await radio(page, TRK).check();
    check('main phone: Tracked selectable', await radio(page, TRK).isChecked());
    check('main phone: page does not scroll horizontally', await noHorizontalScroll(page));
    await page.context().close();
  }

  // ── Design-catalog checkout ──
  const DESIGN_URL = BASE_URL + '/designs/birthday-confetti-01';
  async function openDesignsCheckout(page) {
    await page.goto(DESIGN_URL, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('e.g. Emma').fill('Emma');
    await page.getByRole('button', { name: 'Continue →' }).click();
    await page.getByRole('button', { name: /Continue to payment/ }).waitFor({ timeout: 20000 });
  }
  {
    const { page, sent } = await newPage(browser, desktop);
    await openDesignsCheckout(page);
    check('designs: pickup is the default and shows no selector', (await page.getByRole('radio', { name: /shipping — Canada Post/ }).count()) === 0);
    await page.getByText(SHIP_ROW, { exact: true }).click();
    await checkSelectorUi(page, 'designs');

    await radio(page, TRK).check();
    const trkRow = await page.locator('form').innerText();
    check('designs: summary shows the Tracked name + cost', trkRow.includes(TRK.label) && trkRow.includes(money(TRK.price)), trkRow);
    await radio(page, STD).check();
    const stdRow = await page.locator('form').innerText();
    check('designs: summary shows the Standard name + cost', stdRow.includes(STD.label) && stdRow.includes(money(STD.price)), stdRow);

    await dateInput(page).fill('2026-10-13');
    check('designs: warning visible while submitting', await page.getByText(WARN_SLOW, { exact: true }).isVisible());
    await page.getByLabel('Name *', { exact: true }).fill('Test Customer');
    await page.getByLabel('Email *', { exact: true }).fill('test-shipping@example.com');
    await page.getByLabel('Address *', { exact: true }).fill('1 Test St');
    await page.getByLabel('City *', { exact: true }).fill('London');
    await page.getByLabel('Postal code *', { exact: true }).fill('N6A 1B2');
    await page.getByText('I confirm the name/text I entered').click();
    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await page.waitForURL('**/cancel', { timeout: 15000 }).catch(() => {});
    const body = sent[0];
    check('designs: create-checkout reached despite the warning', !!body, sent);
    check('designs: sends shippingMethod "standard"', body?.shippingMethod === 'standard', body?.shippingMethod);
    check('designs: sends neededByDate', body?.neededByDate === '2026-10-13', body?.neededByDate);
    check('designs: no shippingCost sent', !('shippingCost' in (body || {})), body);
    await page.context().close();
  }
  {
    const { page, sent } = await newPage(browser, desktop);
    await openDesignsCheckout(page);
    await page.getByText(SHIP_ROW, { exact: true }).click();
    await radio(page, TRK).check();
    await dateInput(page).fill('2026-10-13');
    await page.getByText('Pickup — East London, ON (free)').click(); // switch back
    check('designs pickup: selector + date field hidden again', (await page.getByLabel(DATE_LABEL).count()) === 0);
    check('designs pickup: shipping cost shown as Free', /Shipping\s*Free/.test((await page.locator('form').innerText()).replace(/\n/g, '')));
    await page.getByLabel('Name *', { exact: true }).fill('Test Customer');
    await page.getByLabel('Email *', { exact: true }).fill('test-shipping@example.com');
    await page.getByText('I confirm the name/text I entered').click();
    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await page.waitForURL('**/cancel', { timeout: 15000 }).catch(() => {});
    const body = sent[0];
    check('designs pickup: sends "pickup" and no neededByDate', body?.shippingMethod === 'pickup' && !('neededByDate' in body), body);
    await page.context().close();
  }
  {
    const { page } = await newPage(browser, phone);
    await openDesignsCheckout(page);
    await page.getByText(SHIP_ROW, { exact: true }).click();
    await radio(page, TRK).scrollIntoViewIfNeeded();
    check('designs phone: selector visible + Tracked selectable',
      await radio(page, TRK).isVisible() && (await radio(page, TRK).check(), await radio(page, TRK).isChecked()));
    check('designs phone: page does not scroll horizontally', await noHorizontalScroll(page));
    await page.context().close();
  }

  await browser.close();

  console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  const failures = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
