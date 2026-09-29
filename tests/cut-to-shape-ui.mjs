// "Cut to shape (plotter)" as the customer and the owner see it.
//
// Editor: which shapes show the checkbox, that ticking it disables the cut guide
// with a note (and the guide stops being drawn), that the surcharge shows in the
// summary, and what the browser sends to /api/create-checkout.
// Admin: an order that was cut to shape says so, has no guide, and still offers
// "Download cut SVG" (only for designs that have an outline).
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
const CUT_LABEL = 'Cut to shape (plotter)';
const GUIDE_NOTE = 'Not needed — we cut your design to shape for you, so no guide is printed.';

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
// Anchored (^): "Add a cut guide"'s own description now mentions "Cut to
// shape (plotter)" too (it points the customer at this checkbox instead of
// trimming themselves — see app/page.js), so an unanchored match is ambiguous.
const cutBox = (page) => page.getByLabel(/^Cut to shape \(plotter\)/);
const guideBox = (page) => page.getByLabel(/Add a cut guide/);

(async () => {
  const browser = await launchBrowser();

  // ── Which shapes show the checkbox ──
  {
    const { page, ctx } = await openEditor(browser);
    for (const [name, re] of [['Round', /Round/], ['Heart', /Heart/], ['Square', /Square/], ['Custom', /Custom/]]) {
      await shapeBtn(page, re).click();
      check(`${name}: "${CUT_LABEL}" is offered, +$5.00 per sheet`, await appears(page.getByText(CUT_LABEL, { exact: true })) && await page.getByText('+$5.00 per sheet', { exact: true }).isVisible());
    }
    // Cookie sheets: offered at BOTH sizes (2" of 15 and 3" of 6), +$5.00 each.
    await shapeBtn(page, /Cookie Sheet/).click();
    const mcSizes = page.getByRole('button', { name: /Circles on A4/ });
    await mcSizes.first().waitFor();
    for (let i = 0; i < await mcSizes.count(); i++) {
      await mcSizes.nth(i).click();
      const label = (await mcSizes.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 30);
      check(`Cookie Sheet (${label}): "${CUT_LABEL}" is offered, +$5.00 per sheet`, await appears(page.getByText(CUT_LABEL, { exact: true })) && await page.getByText('+$5.00 per sheet', { exact: true }).isVisible());
    }
    check('Cookie Sheet: both sizes were checked (2 of them)', await mcSizes.count() === 2, await mcSizes.count());
    for (const [name, re] of [['Full Sheet', /Full Sheet/], ['B&W Sheet', /B&W Sheet/]]) {
      await shapeBtn(page, re).click();
      // The size chips re-render; give the page a real signal that the shape switched.
      await page.getByRole('button', { name: /Continue →/ }).waitFor();
      const gone = await page.getByText(CUT_LABEL, { exact: true }).count() === 0;
      check(`${name}: "${CUT_LABEL}" is NOT offered`, gone, await page.getByText(CUT_LABEL, { exact: true }).count());
    }
    await ctx.close();
  }

  // ── Round: guide vs cut, price, payload ──
  {
    const { page, sent, ctx } = await openEditor(browser);
    await shapeBtn(page, /Round/).click();
    await page.getByRole('button', { name: /6" Round Topper/ }).click();
    await guideBox(page).waitFor();
    await page.waitForFunction(() => document.querySelector('canvas') !== null);

    check('round: the guide checkbox is on and enabled by default', await guideBox(page).isChecked() && await guideBox(page).isEnabled());
    // The canvas redraws asynchronously after a change: wait for the count to settle on what we expect.
    let withGuide = 0;
    for (let i = 0; i < 40 && withGuide < 200; i++) { withGuide = await greyPixels(page); if (withGuide < 200) await page.waitForTimeout(150); }
    check('round: the guide is drawn on the canvas (grey pixels)', withGuide >= 200, withGuide);

    await cutBox(page).check();
    check('cut ticked: the guide checkbox is disabled and unticked', !(await guideBox(page).isEnabled()) && !(await guideBox(page).isChecked()));
    check('cut ticked: the note explains why', await appears(page.getByText(GUIDE_NOTE, { exact: true })));
    let withoutGuide = withGuide;
    for (let i = 0; i < 40 && withoutGuide > withGuide - 150; i++) { withoutGuide = await greyPixels(page); if (withoutGuide > withGuide - 150) await page.waitForTimeout(150); }
    check('cut ticked: the guide is no longer drawn on the canvas', withGuide - withoutGuide > 150, { withGuide, withoutGuide });

    await cutBox(page).uncheck();
    check('cut unticked: the guide comes back (checked, enabled, original text)',
      await guideBox(page).isChecked() && await guideBox(page).isEnabled() && await page.getByText(GUIDE_NOTE, { exact: true }).count() === 0);

    // Order with the cut on: summary and payload
    await cutBox(page).check();
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
    await cutBox(page).check();
    check('cookie sheet cut: the guide checkbox is disabled with the note', !(await guideBox(page).isEnabled()) && await appears(page.getByText(GUIDE_NOTE, { exact: true })));
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

  // ── Admin: order panel ──
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
