// The admin order list and order detail as the owner sees them when deciding
// what to take to the post office: how each order ships and in how many
// packages (list); method, carrier, packages, what was charged, the customer's
// needed-by date and the editable ship date + tracking number (detail). Older
// orders that lack every new field must render complete and without errors.
//
// Fully isolated: the admin session check and every /api/admin/* call are
// answered here with fabricated orders, so no production data is read or
// written and no admin login is needed.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Every wait is for a condition, not a fixed time. EP_CPU_THROTTLE=6 slows the
// page's CPU to hunt for timing bugs. (The order form only renders after its data
// arrives, so there is no pre-hydration window to guard here.)
const WAIT = 90000;
const CPU_THROTTLE = Number(process.env.EP_CPU_THROTTLE || 1);

const results = [];
const check = (test, pass, detail) => { results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) }); };

const design = (quantity) => ({ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity, unitPrice: 14.99, material: 'icing' });
const address = { line1: '1 Test St', city: 'London', province: 'Ontario', postalCode: 'N6A 1B2', country: 'CA' };
const base = (orderId, over) => ({
  orderId, orderNumber: orderId, createdAt: '2026-09-25T15:00:00.000Z', isTest: false,
  customer: { name: 'Fake Customer', email: 'fake@example.com' },
  payment: { amountCents: 5000, currency: 'CAD', status: 'paid', method: 'stripe_card' },
  production: { status: 'printed', updatedAt: '2026-09-25T16:00:00.000Z' },
  source: 'stripe', channel: 'website',
  ...over,
});

// Orders as saved by the code as it is now…
const NEW_STANDARD = base('EP-NEW1', {
  designs: [design(5)], shippingMethod: 'standard', shippingCarrier: 'Canada Post Lettermail', shippingPackages: 3, shippingCostCharged: 29.97,
  neededByDate: '2026-10-01', shipping: { method: 'canada_post_shipping', label: 'Canada Post Lettermail', address },
});
const NEW_TRACKED = base('EP-NEW2', {
  designs: [design(4)], shippingMethod: 'tracked', shippingCarrier: 'Canada Post Xpresspost', shippingPackages: 1, shippingCostCharged: 29.99,
  shipping: { method: 'canada_post_shipping', label: 'Canada Post Xpresspost', address },
});
const NEW_PICKUP = base('EP-PICK', {
  designs: [design(2)], shippingMethod: 'pickup', shippingPackages: 0, shippingCostCharged: 0,
  shipping: { method: 'pickup', label: 'Pickup — East London, ON' },
});
const MANUAL_TRACKED = base('EP-MANU', {
  source: 'manual', channel: 'walk_in', payment: { amountCents: 4000, currency: 'CAD', status: 'paid', method: 'cash' },
  designs: [design(3)], shippingMethod: 'tracked', shippingCarrier: 'Canada Post Xpresspost', shippingPackages: 1,
  shipping: { method: 'local_delivery', label: 'Canada Post Xpresspost', address },
});
// …and orders saved before shippingMethod / shippingPackages / shippingCostCharged existed.
const OLD_SHIP = base('EP-OLD1', {
  designs: [design(2), design(3)], shipping: { method: 'canada_post_shipping', label: 'Canada Post Lettermail', address },
});
const OLD_PICKUP = base('EP-OLD2', { designs: [design(1)], shipping: { method: 'pickup', label: 'Pickup — East London, ON' } });
const SHIPPED_ALREADY = base('EP-DONE', {
  designs: [design(1)], shippingMethod: 'tracked', shippingPackages: 1, shippingCostCharged: 29.99,
  shipping: { method: 'canada_post_shipping', label: 'Canada Post Xpresspost', address },
  production: { status: 'shipped', updatedAt: '2026-09-26T16:00:00.000Z' }, shippedAt: '2026-09-26', trackingNumber: 'RB123456789CA',
});
const RECORDS = Object.fromEntries([NEW_STANDARD, NEW_TRACKED, NEW_PICKUP, MANUAL_TRACKED, OLD_SHIP, OLD_PICKUP, SHIPPED_ALREADY].map((r) => [r.orderId, r]));

// List rows exactly as GET /api/admin/orders shapes them; the two old ones omit
// the new keys entirely, as a row from before this change would.
const row = (r, extra) => ({
  orderId: r.orderId, customerName: 'Fake Customer', total: 50, status: r.production.status, hasUploadDesign: false, designCount: r.designs.length,
  createdAt: r.createdAt, source: r.source, channel: r.channel, paymentMethod: r.payment.method, missingAssets: false,
  committedDate: null, isPickup: r.shipping.method === 'pickup', paymentStatus: 'paid', ...extra,
});
const LIST = [
  row(NEW_STANDARD, { shippingMethod: 'standard', packages: 3 }),
  row(NEW_TRACKED, { shippingMethod: 'tracked', packages: 1 }),
  row(NEW_PICKUP, { shippingMethod: 'pickup', packages: 0 }),
  row(OLD_SHIP, {}),
  row(OLD_PICKUP, {}),
  row(SHIPPED_ALREADY, { shippingMethod: 'tracked', packages: 1 }),
];

async function newAdminPage(browser, viewport = { width: 1400, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(WAIT);
  if (CPU_THROTTLE > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  const problems = [];
  const dispatchPosts = [];
  const statusPosts = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.route('**/api/admin/check', (r) => r.fulfill({ json: { isAdmin: true } }));
  await page.route(/\/api\/admin\/orders(\?.*)?$/, (r) => r.fulfill({ json: { orders: LIST, nextCursor: null, scannedAllResults: true } }));
  await page.route(/\/api\/admin\/orders\/(EP-[A-Z0-9]+)$/, (r) => {
    const id = /(EP-[A-Z0-9]+)$/.exec(r.request().url())[1];
    return RECORDS[id] ? r.fulfill({ json: RECORDS[id] }) : r.fulfill({ status: 404, json: { error: 'Not found' } });
  });
  await page.route(/\/api\/admin\/orders\/EP-[A-Z0-9]+\/status$/, async (r) => {
    const body = r.request().postDataJSON();
    const id = /(EP-[A-Z0-9]+)\/status$/.exec(r.request().url())[1];
    statusPosts.push({ id, ...body });
    if (id === 'EP-NEW1') return r.fulfill({ status: 500, json: { error: 'Cloudinary hiccup' } }); // the failure case
    return r.fulfill({ json: { ok: true, orderId: id, status: body.status, updatedAt: '2026-09-28T12:00:00.000Z' } });
  });
  await page.route(/\/api\/admin\/orders\/EP-[A-Z0-9]+\/dispatch$/, async (r) => {
    const body = r.request().postDataJSON();
    dispatchPosts.push(body);
    if (body.trackingNumber === 'FORCE-ERROR') return r.fulfill({ status: 400, json: { error: 'trackingNumber can only use letters' } });
    return r.fulfill({ json: { ok: true, shippedAt: body.shippedAt ?? null, trackingNumber: body.trackingNumber ?? null } });
  });
  return { page, problems, dispatchPosts, statusPosts, ctx };
}

const section = (page, title) => page.locator('h3', { hasText: new RegExp('^' + title + '$', 'i') }).locator('..');
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

async function openDetail(page, id) {
  await page.goto(`${BASE_URL}/admin/orders/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: id }).waitFor();
  await section(page, 'Shipping').waitFor();
}

(async () => {
  const browser = await chromium.launch();

  // ── List ──
  {
    const { page, problems, ctx } = await newAdminPage(browser);
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('columnheader', { name: 'Ships' }).waitFor();
    const shipsOf = async (id) => text(page.locator('tr', { hasText: id }).getByTestId('ships-cell'));

    check('list: has a "Ships" column', await page.getByRole('columnheader', { name: 'Ships' }).isVisible());
    check('list: standard order shows Standard · 3 packages', (await shipsOf('EP-NEW1')) === 'Standard 3 packages', await shipsOf('EP-NEW1'));
    check('list: tracked order shows Tracked · 1 package', (await shipsOf('EP-NEW2')) === 'Tracked 1 package', await shipsOf('EP-NEW2'));
    check('list: pickup order shows Pickup and no package count', (await shipsOf('EP-PICK')) === 'Pickup', await shipsOf('EP-PICK'));
    check('list: an old order with none of the new fields reads as Standard, without error', (await shipsOf('EP-OLD1')) === 'Standard', await shipsOf('EP-OLD1'));
    check('list: an old pickup order (no new fields) reads as Pickup', (await shipsOf('EP-OLD2')) === 'Pickup', await shipsOf('EP-OLD2'));
    check('list: a shipped tracked order still shows its method', (await shipsOf('EP-DONE')) === 'Tracked 1 package', await shipsOf('EP-DONE'));
    check("list: hovering a cell gives the full line with the carrier",
      (await page.locator('tr', { hasText: 'EP-NEW1' }).getByTestId('ships-cell').locator('div[title]').getAttribute('title')) === 'Standard — Canada Post Lettermail — 3 packages');
    check('list: every row still renders (6 rows, none dropped by the new column)', (await page.locator('tbody tr').count()) === LIST.length, await page.locator('tbody tr').count());
    check('list: no page errors', problems.length === 0, problems);
    await ctx.close();
  }

  // ── Detail: orders as saved now ──
  {
    const { page, problems, ctx } = await newAdminPage(browser);
    await openDetail(page, 'EP-NEW1');
    let s = await text(section(page, 'Shipping'));
    check('detail, standard: method Standard', /Method: Standard(?! —)/.test(s), s);
    check('detail, standard: carrier Canada Post Lettermail', s.includes('Carrier: Canada Post Lettermail'), s);
    check('detail, standard: 3 packages', s.includes('Packages: 3 packages'), s);
    check('detail, standard: charged $29.97', s.includes('Charged: $29.97'), s);
    check("detail, standard: the customer's needed-by date (Thu, Oct 1, 2026)", /Needed by: Thu,? Oct\.? 1,? 2026/.test(s), s);
    check('detail, standard: the address is still there', s.includes('1 Test St, London, Ontario N6A 1B2'), s);
    check('detail, standard: says there is no tracking number to record', (await text(section(page, 'Dispatch'))).includes('no tracking number'));
    check('detail: no page errors (standard)', problems.length === 0, problems);

    await openDetail(page, 'EP-NEW2');
    s = await text(section(page, 'Shipping'));
    check('detail, tracked: Tracked / Xpresspost / 1 package / $29.99',
      /Method: Tracked/.test(s) && s.includes('Carrier: Canada Post Xpresspost') && s.includes('Packages: 1 package') && s.includes('Charged: $29.99'), s);
    check('detail, tracked: no needed-by row when the customer gave none', !s.includes('Needed by'), s);
    check('detail, tracked: asks to record the tracking number', (await text(section(page, 'Dispatch'))).includes('record the number'));

    await openDetail(page, 'EP-PICK');
    s = await text(section(page, 'Shipping'));
    check('detail, pickup: says pickup / nothing to ship, no carrier, no packages', s.includes('Method: Pickup — East London, ON (nothing to ship)') && !/Carrier|Packages|Canada Post/.test(s), s);
    check('detail, pickup: charged reads free', s.includes('Charged: Free (pickup)'), s);
    check('detail, pickup: no Dispatch section (nothing is shipped)', (await page.locator('h3', { hasText: /^Dispatch$/i }).count()) === 0);

    await openDetail(page, 'EP-MANU');
    s = await text(section(page, 'Shipping'));
    check('detail, manual tracked: method, carrier and 1 package shown; charge explained',
      /Method: Tracked/.test(s) && s.includes('Packages: 1 package') && s.includes('Charged: Included in the total entered'), s);
    check('detail: no page errors (tracked, pickup, manual)', problems.length === 0, problems);
    await ctx.close();
  }

  // ── Detail: orders saved before any of this ──
  {
    const { page, problems, ctx } = await newAdminPage(browser);
    await openDetail(page, 'EP-OLD1');
    let s = await text(section(page, 'Shipping'));
    check('detail, old order: reads as Standard with its carrier', /Method: Standard/.test(s) && s.includes('Carrier: Canada Post Lettermail'), s);
    check('detail, old order: packages worked out from its 5 sheets = 3', s.includes('Packages: 3 packages'), s);
    check('detail, old order: charge is "not recorded", not a wrong $0.00', s.includes('Charged: Not recorded (older order)') && !s.includes('$0.00'), s);
    check('detail, old order: address still shown', s.includes('1 Test St'), s);
    check('detail, old order: Dispatch section available', (await page.getByLabel('Shipped on').count()) === 1);
    await openDetail(page, 'EP-OLD2');
    s = await text(section(page, 'Shipping'));
    check('detail, old pickup order: pickup, no carrier, free', s.includes('Pickup — East London, ON (nothing to ship)') && s.includes('Free (pickup)') && !s.includes('Carrier'), s);
    check('detail, old orders: no page errors', problems.length === 0, problems);
    await ctx.close();
  }

  // ── Detail: recording the dispatch ──
  {
    const { page, problems, dispatchPosts, ctx } = await newAdminPage(browser);
    await openDetail(page, 'EP-NEW2');
    const save = page.getByRole('button', { name: 'Save dispatch details' });
    check('dispatch: Save is disabled until something changes', await save.isDisabled());
    check('dispatch: fields start empty for an order not yet shipped', (await page.getByLabel('Shipped on').inputValue()) === '' && (await page.getByLabel('Tracking number').inputValue()) === '');
    await page.getByLabel('Shipped on').fill('2026-09-28');
    await page.getByLabel('Tracking number').fill('  RB123456789CA ');
    check('dispatch: Save enables once edited', await save.isEnabled());
    await save.click();
    await page.getByText('Saved ✓').last().waitFor();
    check('dispatch: sends the date and the trimmed tracking number',
      dispatchPosts.length === 1 && dispatchPosts[0].shippedAt === '2026-09-28' && dispatchPosts[0].trackingNumber === 'RB123456789CA', dispatchPosts);
    check('dispatch: shows the saved values and disables Save again', (await page.getByLabel('Tracking number').inputValue()) === 'RB123456789CA' && await save.isDisabled());

    await page.getByLabel('Tracking number').fill('FORCE-ERROR');
    await save.click();
    await page.getByText(/^Error: /).waitFor();
    check('dispatch: a rejected save shows the server message and keeps what was typed',
      (await page.getByText(/^Error: /).innerText()).includes('trackingNumber can only use letters') && (await page.getByLabel('Tracking number').inputValue()) === 'FORCE-ERROR');

    await page.getByLabel('Tracking number').fill('');
    await save.click();
    await page.getByText('Saved ✓').last().waitFor();
    const last = dispatchPosts[dispatchPosts.length - 1];
    check('dispatch: clearing the tracking number sends null (keeps the date)', last.trackingNumber === null && last.shippedAt === '2026-09-28', last);

    await openDetail(page, 'EP-DONE');
    check('dispatch: an already-shipped order shows its saved date and tracking number',
      (await page.getByLabel('Shipped on').inputValue()) === '2026-09-26' && (await page.getByLabel('Tracking number').inputValue()) === 'RB123456789CA');
    check('dispatch: no page errors', problems.length === 0, problems);
    await ctx.close();
  }

  // ── Saving a ship date offers to mark the order shipped — it never does it itself ──
  {
    const { page, problems, dispatchPosts, statusPosts, ctx } = await newAdminPage(browser);
    const PROMPT = 'This order is not marked as shipped. Mark as shipped?';
    const save = page.getByRole('button', { name: 'Save dispatch details' });
    const statusSelect = () => page.locator('select').first().inputValue();
    const prompt = () => page.getByText(PROMPT, { exact: true });

    await openDetail(page, 'EP-NEW2');
    check('shipped prompt: order starts in the printed state', (await statusSelect()) === 'printed', await statusSelect());
    await page.getByLabel('Tracking number').fill('RB123456789CA');
    await save.click();
    await page.getByText('Saved ✓').last().waitFor();
    check('shipped prompt: saving only a tracking number does not ask', (await prompt().count()) === 0);

    await page.getByLabel('Shipped on').fill('2026-09-28');
    await save.click();
    await prompt().waitFor();
    check('shipped prompt: saving a ship date asks "This order is not marked as shipped. Mark as shipped?"', await prompt().isVisible());
    check('shipped prompt: offers a Mark as shipped button and a Not now button',
      await page.getByRole('button', { name: 'Mark as shipped' }).isVisible() && await page.getByRole('button', { name: 'Not now' }).isVisible());
    check('shipped prompt: saving the date did NOT change the status by itself (no status request, still printed)',
      statusPosts.length === 0 && (await statusSelect()) === 'printed', { statusPosts, status: await statusSelect() });
    check('shipped prompt: the dispatch request carries only the dispatch fields',
      dispatchPosts.every((b) => Object.keys(b).every((k) => k === 'shippedAt' || k === 'trackingNumber')), dispatchPosts);

    await page.getByRole('button', { name: 'Not now' }).click();
    check('shipped prompt: "Not now" closes it and still changes nothing', (await prompt().count()) === 0 && statusPosts.length === 0 && (await statusSelect()) === 'printed');

    await page.getByLabel('Shipped on').fill('2026-09-29');
    await save.click();
    await prompt().waitFor();
    check('shipped prompt: saving another date offers it again', await prompt().isVisible());
    await page.getByRole('button', { name: 'Mark as shipped' }).click();
    await page.getByText('Marked as shipped ✓').waitFor();
    check('shipped prompt: clicking Mark as shipped sends exactly one status change to "shipped"',
      statusPosts.length === 1 && statusPosts[0].id === 'EP-NEW2' && statusPosts[0].status === 'shipped', statusPosts);
    check('shipped prompt: afterwards the prompt is gone and the status shows shipped', (await prompt().count()) === 0 && (await statusSelect()) === 'shipped');

    await page.getByLabel('Shipped on').fill('2026-09-30');
    await save.click();
    await page.getByText('Saved ✓').last().waitFor();
    check('shipped prompt: an order already marked shipped is never asked again', (await prompt().count()) === 0 && statusPosts.length === 1);

    await openDetail(page, 'EP-DONE');
    await page.getByLabel('Shipped on').fill('2026-09-27');
    await save.click();
    await page.getByText('Saved ✓').last().waitFor();
    check('shipped prompt: an order that was already shipped when opened is not asked either', (await prompt().count()) === 0);

    await openDetail(page, 'EP-MANU');
    await page.getByLabel('Shipped on').fill('2026-09-28');
    await save.click();
    await prompt().waitFor();
    await page.getByLabel('Shipped on').fill('');
    await save.click();
    await page.getByText('Saved ✓').last().waitFor();
    check('shipped prompt: clearing the ship date withdraws the offer', (await prompt().count()) === 0);

    // A failed status change reports the error and leaves the prompt open to retry.
    await openDetail(page, 'EP-NEW1');
    await page.getByLabel('Shipped on').fill('2026-09-28');
    await save.click();
    await prompt().waitFor();
    await page.getByRole('button', { name: 'Mark as shipped' }).click();
    await page.getByText(/^Error: Cloudinary hiccup/).waitFor();
    check('shipped prompt: a failed status change shows the error, keeps the prompt, and the status stays', await prompt().isVisible() && (await statusSelect()) === 'printed');
    check('shipped prompt: no page errors', problems.length === 0, problems);
    await ctx.close();
  }

  // ── Phone width: nothing spills off the page ──
  {
    const { page, ctx } = await newAdminPage(browser, { width: 390, height: 844 });
    await openDetail(page, 'EP-NEW1');
    check('detail at phone width: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await ctx.close();
  }

  await browser.close();

  console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  const failures = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
