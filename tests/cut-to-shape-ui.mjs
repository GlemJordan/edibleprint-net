// "How would you like it?" — the Printed sheet / Cut to shape choice, as the
// customer and the owner see it.
//
// Editor: which shapes show the two cards, that "Printed sheet" is the
// default and never the cut option, that choosing "Cut to shape" hides the
// cut guide checkbox entirely (and stops the guide being drawn) while
// "Printed sheet" keeps it, checked by default, that the surcharge shows in
// the summary, and what the browser sends to /api/create-checkout.
// Admin: an order that was cut to shape says so, has no guide, and still
// offers "Download cut SVG" (only for designs that have an outline). The
// admin panel and Stripe/slip/email wording all still say
// "Cut to shape (plotter)" — only the customer-facing editor choice changed.
//
// Fully isolated — Cloudinary uploads, /api/create-checkout and every /api/admin/*
// call are answered here, so nothing is uploaded, charged or read from production.
import { launchBrowser, hydrated, appears, WAIT } from './_stress.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cut-'));
const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

async function makeDesign(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 900;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFF6DC'; ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = '#FBD3E0'; ctx.beginPath(); ctx.arc(450, 450, 320, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  });
  const p = path.join(TMP_DIR, 'design.png');
  fs.writeFileSync(p, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return p;
}

// Pixels of the live canvas that look like the guide's grey (#8C8C8C).
const greyPixels = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200 && Math.abs(data[i] - 140) < 22 && Math.abs(data[i + 1] - 140) < 22 && Math.abs(data[i + 2] - 140) < 22) n++;
  }
  return n;
});

async function openEditor(browser, viewport = { width: 1280, height: 1500 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(WAIT);
  const sent = [];
  await page.route('https://api.cloudinary.com/**', (r) => r.fulfill({ json: { secure_url: 'https://res.cloudinary.com/test/image/upload/p.png' } }));
  await page.route('**/api/create-checkout', async (r) => { sent.push(r.request().postDataJSON()); await r.fulfill({ json: { url: BASE_URL + '/cancel' } }); });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const up = page.getByRole('button', { name: 'Upload Your Photo →' });
  await hydrated(page, up);
  await up.click();
  await page.locator('input[type="file"][accept="image/*,.pdf"]').setInputFiles(await makeDesign(page));
  const round = page.getByRole('button', { name: /Round/ }).first();
  await round.waitFor();
  return { page, sent, ctx };
}
const shapeBtn = (page, re) => page.getByRole('button', { name: re }).first();
const heading = (page) => page.getByText('How would you like it?', { exact: true });
const printedRadio = (page) => page.getByRole('radio', { name: /^Printed sheet/ });
const cutRadio = (page) => page.getByRole('radio', { name: /^Cut to shape/ });
const guideBox = (page) => page.getByLabel(/Print a cut guide/);

(async () => {
  const browser = await launchBrowser();

  // ── Which shapes show the choice, and what "Printed sheet" is the default ──
  {
    const { page, ctx } = await openEditor(browser);
    for (const [name, re] of [['Round', /Round/], ['Heart', /Heart/], ['Square', /Square/], ['Custom', /Custom/]]) {
      await shapeBtn(page, re).click();
      await heading(page).waitFor();
      check(`${name}: the choice is offered, "Printed sheet" is selected by default`,
        await printedRadio(page).isChecked() && !(await cutRadio(page).isChecked()));
      check(`${name}: "Cut to shape" states +$5.00 per sheet`, await page.getByText('+$5.00 per sheet', { exact: true }).isVisible());
    }
    // Cookie sheets: offered at BOTH sizes (2" of 15 and 3" of 6), +$5.00 each, still defaulting to Printed sheet.
    await shapeBtn(page, /Cookie Sheet/).click();
    const mcSizes = page.getByRole('button', { name: /Circles on A4/ });
    await mcSizes.first().waitFor();
    for (let i = 0; i < await mcSizes.count(); i++) {
      await mcSizes.nth(i).click();
      const label = (await mcSizes.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 30);
      check(`Cookie Sheet (${label}): the choice is offered, defaults to "Printed sheet"`,
        await appears(heading(page)) && await printedRadio(page).isChecked() && !(await cutRadio(page).isChecked()));
    }
    check('Cookie Sheet: both sizes were checked (2 of them)', await mcSizes.count() === 2, await mcSizes.count());
    for (const [name, re] of [['Full Sheet', /Full Sheet/], ['B&W Sheet', /B&W Sheet/]]) {
      await shapeBtn(page, re).click();
      // The size chips re-render; give the page a real signal that the shape switched.
      await page.getByRole('button', { name: /Continue →/ }).waitFor();
      const gone = await heading(page).count() === 0;
      check(`${name}: the "How would you like it?" choice is NOT offered`, gone, await heading(page).count());
    }
    // B&W Sheet keeps only the discreet guide checkbox (no cutting on this shape).
    check('B&W Sheet: the guide checkbox is still offered on its own', await guideBox(page).count() === 1);
    await ctx.close();
  }

  // ── Round: guide vs cut, price, payload ──
  {
    const { page, sent, ctx } = await openEditor(browser);
    await shapeBtn(page, /Round/).click();
    await page.getByRole('button', { name: /6" Round Topper/ }).click();
    await guideBox(page).waitFor();
    await page.waitForFunction(() => document.querySelector('canvas') !== null);

    check('round: "Printed sheet" is selected, the guide checkbox is on by default', await printedRadio(page).isChecked() && await guideBox(page).isChecked());
    // The canvas redraws asynchronously after a change: wait for the count to settle on what we expect.
    let withGuide = 0;
    for (let i = 0; i < 40 && withGuide < 200; i++) { withGuide = await greyPixels(page); if (withGuide < 200) await page.waitForTimeout(150); }
    check('round: the guide is drawn on the canvas (grey pixels)', withGuide >= 200, withGuide);

    await cutRadio(page).check();
    check('cut selected: "Printed sheet" is no longer selected', !(await printedRadio(page).isChecked()));
    check('cut selected: the guide checkbox is gone entirely (not just disabled)', await guideBox(page).count() === 0);
    let withoutGuide = withGuide;
    for (let i = 0; i < 40 && withoutGuide > withGuide - 150; i++) { withoutGuide = await greyPixels(page); if (withoutGuide > withGuide - 150) await page.waitForTimeout(150); }
    check('cut selected: the guide is no longer drawn on the canvas', withGuide - withoutGuide > 150, { withGuide, withoutGuide });

    await printedRadio(page).check();
    check('back to printed sheet: the guide checkbox returns, checked (the earlier choice was kept)',
      await appears(guideBox(page)) && await guideBox(page).isChecked());

    // Order with the cut selected: summary and payload
    await cutRadio(page).check();
    await page.getByRole('button', { name: 'Continue →' }).click();
    await page.getByRole('heading', { name: 'Shipping & Payment' }).waitFor();
    await page.getByText('Free Pickup — London, ON').click();
    await page.locator('input[placeholder="Jane Smith"]').fill('Cut Tester');
    await page.locator('input[placeholder="jane@email.com"]').fill('cut-test@example.com');
    const summary = () => page.locator('h3', { hasText: 'Order Summary' }).locator('..').innerText().then((t) => t.replace(/\s+/g, ' '));
    const s = await summary();
    check('summary: $19.99 = $14.99 + $5.00 cut, total $19.99', /\$19\.99/.test(s) && /Total \$19\.99/.test(s), s);
    await page.getByLabel(/I have reviewed my design/).check();
    await page.getByRole('button', { name: 'Place Order →' }).click();
    const deadline = Date.now() + WAIT;
    while (sent.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
    const d = sent[0]?.designs?.[0];
    check('payload: cutToShape true', d?.cutToShape === true, d);
    check('payload: cutGuide false (never sent on for a cut design)', d?.cutGuide === false, d);
    await ctx.close();
  }

  // ── 3 cookie sheets cut: $15.00 of surcharge in the cart and in what the browser sends ──
  {
    const { page, sent, ctx } = await openEditor(browser);
    await shapeBtn(page, /Cookie Sheet/).click();
    await page.getByRole('button', { name: /2” Circles on A4/ }).click();
    const plus = page.getByRole('button', { name: 'Increase quantity' });
    await plus.click(); await plus.click();
    await cutRadio(page).check();
    check('cookie sheet cut: the guide checkbox is gone (nothing to trim)', await guideBox(page).count() === 0);
    await page.getByRole('button', { name: 'Continue →' }).click();
    await page.getByRole('heading', { name: 'Shipping & Payment' }).waitFor();
    await page.getByText('Free Pickup — London, ON').click();
    await page.locator('input[placeholder="Jane Smith"]').fill('Cut Tester');
    await page.locator('input[placeholder="jane@email.com"]').fill('cut-test@example.com');
    const s = (await page.locator('h3', { hasText: 'Order Summary' }).locator('..').innerText()).replace(/\s+/g, ' ');
    check('cookie sheet cut, 3 sheets: cart total is $74.97 = 3 × ($19.99 + $5.00)', /3x/.test(s) && /Total \$74\.97/.test(s), s);
    await page.getByLabel(/I have reviewed my design/).check();
    await page.getByRole('button', { name: 'Place Order →' }).click();
    const deadline = Date.now() + WAIT;
    while (sent.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
    const d = sent[0]?.designs?.[0];
    check('cookie sheet cut: payload is 3 sheets, cutToShape true, cutGuide false', d?.quantity === 3 && d?.cutToShape === true && d?.cutGuide === false, d);
    await ctx.close();
  }

  // ── Admin: order panel (unaffected by the editor's choice UI — still says "Cut to shape (plotter)") ──
  {
    const design = (over) => ({ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity: 1, unitPrice: 19.99, material: 'icing', cutToShape: false, cutGuide: false, imageUrl: 'https://res.cloudinary.com/x/y.png', ...over });
    const order = (id, designs) => ({
      orderId: id, orderNumber: id, createdAt: '2026-09-28T15:00:00.000Z', isTest: false,
      customer: { name: 'Fake Customer', email: 'fake@example.com' },
      payment: { amountCents: 2499, currency: 'CAD', status: 'paid', method: 'stripe_card' },
      production: { status: 'printed', updatedAt: '2026-09-28T16:00:00.000Z' }, source: 'stripe', channel: 'website',
      designs, shippingMethod: 'pickup', shippingPackages: 0, shippingCostCharged: 0, shipping: { method: 'pickup', label: 'Pickup — East London, ON' },
    });
    const RECORDS = {
      'EP-CUTA': order('EP-CUTA', [design({ cutToShape: true, cutGuide: false }), design({ shape: 'fullsheet', shapeLabel: 'Full Sheet', size: 'A4' }), design({ shape: 'multicircle', shapeLabel: 'Cookie Sheet', size: '2” Circles on A4 Sheet', cutToShape: true })]),
      'EP-GUID': order('EP-GUID', [design({ cutToShape: false, cutGuide: true })]),
    };
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(WAIT);
    await page.route('**/api/admin/check', (r) => r.fulfill({ json: { isAdmin: true } }));
    await page.route(/\/api\/admin\/orders\/(EP-[A-Z0-9]+)$/, (r) => {
      const id = /(EP-[A-Z0-9]+)$/.exec(r.request().url())[1];
      return RECORDS[id] ? r.fulfill({ json: RECORDS[id] }) : r.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.route(/\/api\/admin\/orders\/EP-[A-Z0-9]+\/dispatch-email$/, (r) => r.fulfill({ status: 400, json: { error: 'Pickup orders are not shipped, so there is no shipping email.' } }));
    const designsSection = () => page.locator('h3', { hasText: /^Designs$/i }).locator('..');

    await page.goto(`${BASE_URL}/admin/orders/EP-CUTA`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'EP-CUTA' }).waitFor();
    const s = (await designsSection().innerText()).replace(/\s+/g, ' ');
    check('admin, cut order: the design carries the CUT TO SHAPE badge', s.includes('CUT TO SHAPE'), s);
    check('admin, cut order: no CUT GUIDE badge', !s.includes('CUT GUIDE'), s);
    const links = await designsSection().locator('a', { hasText: 'Download cut SVG' }).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check('admin, cut order: "Download cut SVG" for the round and the cookie sheet, not the full sheet',
      links.length === 2 && links[0] === '/api/admin/orders/EP-CUTA/download?type=cutsvg&index=0' && links[1] === '/api/admin/orders/EP-CUTA/download?type=cutsvg&index=2', links);

    await page.goto(`${BASE_URL}/admin/orders/EP-GUID`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'EP-GUID' }).waitFor();
    const g = (await designsSection().innerText()).replace(/\s+/g, ' ');
    check('admin, guide order: CUT GUIDE badge, no CUT TO SHAPE badge', g.includes('CUT GUIDE') && !g.includes('CUT TO SHAPE'), g);
    await ctx.close();
  }

  await browser.close();
  const failures = results.filter((r) => !r.pass);
  console.log(JSON.stringify(failures, null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})();
