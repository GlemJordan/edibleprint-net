// Per-package shipping in both checkouts, as the customer sees it: the cost
// follows the number of sheets live, standard says when an order splits across
// packages, tracked is disabled past its envelope, the order limit stops the
// quantity controls, and the payload carries the quantity the server prices from.
//
// What Stripe is actually charged for each of these is verified against the
// real route handler in checkout-pricing.mjs; here the create-checkout call is
// intercepted, so nothing external is touched and no session is created.
//
// Sheets -> standard packages -> cost:  1→1 $9.99 · 2→1 $9.99 · 3→2 $19.98 ·
// 4→2 $19.98 · 5→3 $29.97 · 7→4 $39.96 (tracked unavailable) · tracked is $29.99.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getShippingMethod, getShippingCost, multiPackageNotice, orderLimitMessage,
  TRACKED_UNAVAILABLE_MESSAGE, TRACKED_MAX_SHEETS, MAX_SHEETS_PER_ORDER,
} from '../lib/shipping-config.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-shippkg-'));
const STD = getShippingMethod('standard');
const TRK = getShippingMethod('tracked');
const money = (n) => '$' + n.toFixed(2);
const LIMIT = orderLimitMessage();

// Every wait is for a CONDITION, never a fixed time: a generous ceiling reached
// only when something is actually broken. (A fixed sleep, or a click right after
// "network idle", passes on a warm machine and fails when the page is slow to
// hydrate.) EP_CPU_THROTTLE=6 slows the page's CPU to hunt for such bugs.
const WAIT = 90000;
const CPU_THROTTLE = Number(process.env.EP_CPU_THROTTLE || 1);

// React attaches its props to a DOM node (a __reactProps$… key) once it has
// hydrated it; clicking or typing before that silently does nothing.
async function hydrated(page, locator) {
  const handle = await locator.elementHandle({ timeout: WAIT });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith('__reactProps$')), handle, { timeout: WAIT });
}

// The mocked create-checkout reply sends the browser to /cancel; wait for the
// request itself (what the tests assert on), then for that navigation to settle.
async function submitted(page, sent) {
  const deadline = Date.now() + WAIT;
  while (sent.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
  await page.waitForURL('**/cancel', { timeout: WAIT }).catch(() => {});
}

const results = [];
const check = (test, pass, detail) => { results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) }); };

async function makeExactPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([8 * 72, 11 * 72]);
  page.drawRectangle({ x: 40, y: 40, width: 8 * 72 - 80, height: 11 * 72 - 80, color: rgb(0.2, 0.4, 0.8) });
  const p = path.join(TMP_DIR, 'ship-pkg.pdf');
  fs.writeFileSync(p, await doc.save());
  return p;
}

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(WAIT);
  if (CPU_THROTTLE > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  const sent = [];
  await page.route('**/api/upload-print-file', (r) => r.fulfill({ json: { cloudName: 'test', apiKey: 'k', timestamp: 1, signature: 's', publicId: 'p' } }));
  await page.route('https://api.cloudinary.com/**', (r) => r.fulfill({ json: { secure_url: 'https://res.cloudinary.com/test/raw/upload/p.pdf' } }));
  await page.route('**/api/create-checkout', async (r) => {
    sent.push(r.request().postDataJSON());
    await r.fulfill({ json: { url: BASE_URL + '/cancel' } });
  });
  return { page, sent };
}

const plus = (page) => page.getByRole('button', { name: 'Increase quantity' }).first();

// Main editor, upload flow: raise the quantity to `sheets`, then land on step 3 ready to ship.
async function openMainStep3(page, pdfPath, sheets) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const uploadButton = page.getByRole('button', { name: 'Already have a print-ready file? Upload it directly →' });
  await hydrated(page, uploadButton);
  await uploadButton.click();
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles(pdfPath);
  // The approval checkbox stays disabled until the file is validated and its
  // preview drawn: that, not a delay, is the signal the editor is ready.
  await page.waitForFunction(() => {
    const boxes = document.querySelectorAll('input[type="checkbox"]');
    const last = boxes[boxes.length - 1];
    return !!last && !last.disabled;
  }, null, { timeout: WAIT });
  for (let i = 1; i < sheets; i++) {
    if (await plus(page).isDisabled()) break;
    await plus(page).click();
  }
  await page.locator('input[type="checkbox"]').last().check();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('heading', { name: 'Shipping & Payment' }).waitFor();
  await page.locator('input[placeholder="Jane Smith"]').fill('Test Customer');
  await page.locator('input[placeholder="jane@email.com"]').fill('test-shipping@example.com');
  await page.locator('input[placeholder="e.g. 123 Main Street"]').fill('1 Test St');
  await page.locator('input[placeholder="Toronto"]').fill('London');
  await page.locator('input[placeholder="N6A 1B2"]').fill('N6A 1B2');
}

const summaryCard = (page) => page.locator('h3', { hasText: 'Order Summary' }).locator('..');
async function summaryTotal(page) {
  const m = /Total\s*\$([\d.]+)/.exec(await summaryCard(page).innerText());
  return m ? parseFloat(m[1]) : NaN;
}
const radio = (page, method) => page.getByRole('radio', { name: new RegExp('^' + method.label + ' — ' + method.carrier) });
const stdLine = (sheets) => `${money(getShippingCost('standard', sheets))} · 3–10 business days · No tracking number`;
const trkLine = `${money(TRK.price)} · 1–2 business days · Tracking number included`;
const visible = (page, text) => page.getByText(text, { exact: true }).isVisible();
const count = (page, text) => page.getByText(text, { exact: false }).count();

// Everything that should be true once a checkout is showing `sheets` sheets with Standard selected.
async function checkShippingFor(page, prefix, sheets, { totalOf }) {
  const p = `${prefix}, ${sheets} sheet(s)`;
  check(`${p}: standard shows ${money(getShippingCost('standard', sheets))}`, await visible(page, stdLine(sheets)));
  check(`${p}: tracked shows a flat ${money(TRK.price)}`, await visible(page, trkLine));

  const notice = multiPackageNotice('standard', sheets);
  if (notice) check(`${p}: says "${notice}"`, await visible(page, notice));
  else check(`${p}: no packages notice for a single package`, (await count(page, 'Your order ships in')) === 0);

  const fits = sheets <= TRACKED_MAX_SHEETS;
  check(`${p}: tracked is ${fits ? 'selectable' : 'disabled'}`, (await radio(page, TRK).isDisabled()) === !fits);
  check(`${p}: tracked-unavailable message is ${fits ? 'absent' : 'shown'}`,
    fits ? (await count(page, TRACKED_UNAVAILABLE_MESSAGE)) === 0 : await visible(page, TRACKED_UNAVAILABLE_MESSAGE));

  const atLimit = sheets >= MAX_SHEETS_PER_ORDER;
  check(`${p}: order-limit message is ${atLimit ? 'shown' : 'absent'}`, (await count(page, LIMIT)) > 0 === atLimit);

  // Shown total moves by exactly the shipping cost as the method changes.
  const totalStd = await totalOf();
  if (fits) {
    await radio(page, TRK).check();
    const totalTrk = await totalOf();
    check(`${p}: total changes by exactly (tracked − standard) = ${(TRK.price - getShippingCost('standard', sheets)).toFixed(2)} on switching to tracked`,
      (totalTrk - totalStd).toFixed(2) === (TRK.price - getShippingCost('standard', sheets)).toFixed(2), { totalStd, totalTrk });
    await radio(page, STD).check();
  }
  return totalStd;
}

(async () => {
  const browser = await chromium.launch();
  const pdfPath = await makeExactPdf();
  const desktop = { width: 1280, height: 1600 };

  // ── Main editor: 1..5 sheets, then past tracked's limit, then the order limit ──
  for (const sheets of [1, 2, 3, 4, 5, TRACKED_MAX_SHEETS + 1, MAX_SHEETS_PER_ORDER]) {
    const { page, sent } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath, sheets);
    const totalStd = await checkShippingFor(page, 'main', sheets, { totalOf: () => summaryTotal(page) });

    const sum = await summaryCard(page).innerText();
    const expectedPackages = Math.ceil(sheets / 2);
    check(`main, ${sheets} sheet(s): summary shipping row = ${money(getShippingCost('standard', sheets))}${expectedPackages > 1 ? ` (${expectedPackages} packages)` : ''}`,
      sum.includes(money(getShippingCost('standard', sheets))) && (expectedPackages > 1 ? sum.includes(`(${expectedPackages} packages)`) : !/packages\)/.test(sum)), sum);

    // Pickup: no shipping at all, whatever the quantity.
    await page.getByText('Free Pickup — London, ON', { exact: false }).click();
    const totalPickup = await summaryTotal(page);
    check(`main, ${sheets} sheet(s): pickup total = standard total − ${money(getShippingCost('standard', sheets))} (pickup is free)`,
      (totalStd - totalPickup).toFixed(2) === getShippingCost('standard', sheets).toFixed(2), { totalStd, totalPickup });
    check(`main, ${sheets} sheet(s): pickup shows no shipping line, no packages notice`,
      !/shipping/i.test(await summaryCard(page).innerText()) && (await count(page, 'Your order ships in')) === 0);
    await page.getByText('Ship to my address', { exact: true }).click();

    // What the browser sends: the quantity the server prices from, and only a method, never an amount.
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: /Place Order/ }).click();
    await submitted(page, sent);
    const body = sent[0];
    check(`main, ${sheets} sheet(s): sends quantity ${sheets} as a number, method "standard", and no shipping amount`,
      body?.designs?.[0]?.quantity === sheets && body?.shippingMethod === 'standard' && !('shippingCost' in body), body);
    await page.context().close();
  }

  // ── Main editor: the + button stops at the limit and says why ──
  {
    const { page } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath, MAX_SHEETS_PER_ORDER + 5); // tries to go past it
    await page.getByRole('button', { name: 'Edit' }).first().click();
    check(`main: quantity stops at ${MAX_SHEETS_PER_ORDER} (the + button is disabled)`, await plus(page).isDisabled());
    check('main: the order-limit message shows under the quantity control', await visible(page, LIMIT));
    await page.context().close();
  }

  // ── Main editor: tracked chosen, then the order outgrows it → falls back to standard ──
  {
    const { page, sent } = await newPage(browser, desktop);
    await openMainStep3(page, pdfPath, TRACKED_MAX_SHEETS);
    await radio(page, TRK).check();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await plus(page).click();
    await page.locator('input[type="checkbox"]').last().check().catch(() => {});
    await page.getByRole('button', { name: 'Continue →' }).click();
    await page.getByRole('heading', { name: 'Shipping & Payment' }).waitFor();
    check(`main: a tracked choice falls back to standard once the order passes ${TRACKED_MAX_SHEETS} sheets`,
      await radio(page, STD).isChecked() && await radio(page, TRK).isDisabled());
    await page.context().close();
  }

  // ── Ready-made designs checkout ──
  const DESIGN_URL = BASE_URL + '/designs/birthday-confetti-01';
  async function openDesignsCheckout(page, quantityText) {
    await page.goto(DESIGN_URL, { waitUntil: 'networkidle' });
    const nameInput = page.getByPlaceholder('e.g. Emma');
    await hydrated(page, nameInput);
    await nameInput.fill('Emma');
    if (quantityText !== undefined) await page.locator('input[type="number"]').first().fill(String(quantityText));
    const continueButton = page.getByRole('button', { name: 'Continue →' });
    await hydrated(page, continueButton);
    await continueButton.click();
    await page.getByRole('button', { name: /Continue to payment/ }).waitFor({ timeout: WAIT });
    await page.getByText('Ship to my address', { exact: true }).click();
  }
  const formTotal = (page) => page.locator('form').innerText().then((t) => parseFloat(/Total\s*\$([\d.]+)/.exec(t.replace(/\n/g, ' '))[1]));
  for (const sheets of [1, 3, 5, TRACKED_MAX_SHEETS + 1]) {
    const { page, sent } = await newPage(browser, desktop);
    await openDesignsCheckout(page, sheets);
    await checkShippingFor(page, 'designs', sheets, { totalOf: () => formTotal(page) });
    await page.getByLabel('Name *', { exact: true }).fill('Test Customer');
    await page.getByLabel('Email *', { exact: true }).fill('test-shipping@example.com');
    await page.getByLabel('Address *', { exact: true }).fill('1 Test St');
    await page.getByLabel('City *', { exact: true }).fill('London');
    await page.getByLabel('Postal code *', { exact: true }).fill('N6A 1B2');
    await page.getByText('I confirm the name/text I entered').click();
    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await submitted(page, sent);
    check(`designs, ${sheets} sheet(s): sends quantity ${sheets} and method "standard", no shipping amount`,
      sent[0]?.designs?.[0]?.quantity === sheets && sent[0]?.shippingMethod === 'standard' && !('shippingCost' in sent[0]), sent[0]);
    await page.context().close();
  }
  {
    // Typing far past the limit is clamped, and says why.
    const { page, sent } = await newPage(browser, desktop);
    await page.goto(DESIGN_URL, { waitUntil: 'networkidle' });
    await hydrated(page, page.getByPlaceholder('e.g. Emma'));
    await page.getByPlaceholder('e.g. Emma').fill('Emma');
    const qty = page.locator('input[type="number"]').first();
    await qty.fill('500');
    check(`designs: typing 500 is clamped to ${MAX_SHEETS_PER_ORDER}`, (await qty.inputValue()) === String(MAX_SHEETS_PER_ORDER), await qty.inputValue());
    check('designs: the order-limit message shows at the limit', await visible(page, LIMIT));
    await page.getByRole('button', { name: 'Continue →' }).click();
    await page.getByRole('button', { name: /Continue to payment/ }).waitFor({ timeout: 20000 });
    await page.getByLabel('Name *', { exact: true }).fill('Test Customer');
    await page.getByLabel('Email *', { exact: true }).fill('test-shipping@example.com');
    await page.getByText('I confirm the name/text I entered').click();
    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await submitted(page, sent);
    check(`designs: what is sent is quantity ${MAX_SHEETS_PER_ORDER}, not 500`, sent[0]?.designs?.[0]?.quantity === MAX_SHEETS_PER_ORDER, sent[0]?.designs);
    await page.context().close();
  }

  await browser.close();

  console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  const failures = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
