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
import { deliverDispatchEmail, prepareDispatchEmail } from '../lib/dispatch-email-send.js';

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
// For the customer-email tests: a standard order with a ship date but no customer email; a TEST order
// (Stripe test mode) that must only ever reach the owner; a tracked order ready to send.
const NO_EMAIL = base('EP-NOML', {
  designs: [design(1)], shippingMethod: 'standard', shippingPackages: 1, shippedAt: '2026-09-25', customer: { name: 'No Email' },
  shipping: { method: 'canada_post_shipping', label: 'Canada Post Lettermail', address },
});
const TEST_ORDER = base('EP-TEST', {
  isTest: true, designs: [design(1)], shippingMethod: 'standard', shippingPackages: 1, shippedAt: '2026-09-25',
  customer: { name: 'Real Looking Customer', email: 'real.customer@example.com' },
  shipping: { method: 'canada_post_shipping', label: 'Canada Post Lettermail', address },
});
const READY_TRACKED = base('EP-RDY1', {
  designs: [design(2)], shippingMethod: 'tracked', shippingPackages: 1, shippingCostCharged: 29.99, shippedAt: '2026-09-25', trackingNumber: 'RB123456789CA',
  customer: { name: 'Ready Customer', email: 'ready@example.com' },
  shipping: { method: 'canada_post_shipping', label: 'Canada Post Xpresspost', address },
});
const RECORDS = Object.fromEntries([NEW_STANDARD, NEW_TRACKED, NEW_PICKUP, MANUAL_TRACKED, OLD_SHIP, OLD_PICKUP, SHIPPED_ALREADY, NO_EMAIL, TEST_ORDER, READY_TRACKED].map((r) => [r.orderId, r]));

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
  // A private, mutable copy of the fabricated orders: saves in this page change what the next read shows.
  const records = structuredClone(RECORDS);
  // What the (real) email code sees as its environment, and what its fake "Resend" was asked to send.
  const emailEnv = { EMAIL_MODE: 'dry-run', RESEND_API_KEY: 'key_test', ORDER_NOTIFICATION_EMAIL: 'me@example.com' };
  const emailGets = [];
  const emailPosts = [];
  const resendCalls = [];
  const fakeResend = async (url, init) => { resendCalls.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '' }; };
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.route('**/api/admin/check', (r) => r.fulfill({ json: { isAdmin: true } }));
  await page.route(/\/api\/admin\/orders(\?.*)?$/, (r) => r.fulfill({ json: { orders: LIST, nextCursor: null, scannedAllResults: true } }));
  await page.route(/\/api\/admin\/orders\/(EP-[A-Z0-9]+)$/, (r) => {
    const id = /(EP-[A-Z0-9]+)$/.exec(r.request().url())[1];
    return records[id] ? r.fulfill({ json: records[id] }) : r.fulfill({ status: 404, json: { error: 'Not found' } });
  });
  await page.route(/\/api\/admin\/orders\/EP-[A-Z0-9]+\/status$/, async (r) => {
    const body = r.request().postDataJSON();
    const id = /(EP-[A-Z0-9]+)\/status$/.exec(r.request().url())[1];
    statusPosts.push({ id, ...body });
    if (id === 'EP-NEW1') return r.fulfill({ status: 500, json: { error: 'Cloudinary hiccup' } }); // the failure case
    records[id].production = { ...records[id].production, status: body.status };
    return r.fulfill({ json: { ok: true, orderId: id, status: body.status, updatedAt: '2026-09-28T12:00:00.000Z' } });
  });
  await page.route(/\/api\/admin\/orders\/EP-[A-Z0-9]+\/dispatch$/, async (r) => {
    const body = r.request().postDataJSON();
    dispatchPosts.push(body);
    if (body.trackingNumber === 'FORCE-ERROR') return r.fulfill({ status: 400, json: { error: 'trackingNumber can only use letters' } });
    const id = /(EP-[A-Z0-9]+)\/dispatch$/.exec(r.request().url())[1];
    for (const key of ['shippedAt', 'trackingNumber']) {
      if (!(key in body)) continue;
      if (body[key]) records[id][key] = body[key]; else delete records[id][key];
    }
    return r.fulfill({ json: { ok: true, shippedAt: records[id].shippedAt ?? null, trackingNumber: records[id].trackingNumber ?? null } });
  });
  // The customer-email endpoint: the REAL preview/send code from lib/, against the fake order and a fake Resend.
  await page.route(/\/api\/admin\/orders\/EP-[A-Z0-9]+\/dispatch-email$/, async (r) => {
    const id = /(EP-[A-Z0-9]+)\/dispatch-email$/.exec(r.request().url())[1];
    const rec = records[id];
    if (r.request().method() === 'GET') {
      emailGets.push(id);
      if (rec.shippingMethod === 'pickup') return r.fulfill({ status: 400, json: { error: 'Pickup orders are not shipped, so there is no shipping email.' } });
      return r.fulfill({ json: prepareDispatchEmail(rec, { env: emailEnv, siteUrl: 'https://edibleprint.net', today: '2026-09-28' }) });
    }
    const body = r.request().postDataJSON() || {};
    emailPosts.push({ id, ...body });
    try {
      const result = await deliverDispatchEmail(rec, { resend: body.resend === true, env: emailEnv, fetchImpl: fakeResend, now: new Date('2026-09-28T15:00:00.000Z'), siteUrl: 'https://edibleprint.net' });
      rec.notifications = { ...rec.notifications, ...result.notifications };
      return r.fulfill({ json: { ok: true, mode: result.mode, sent: result.sent, to: result.to, subject: result.subject, redirected: result.redirected, at: result.at, notifications: result.notifications, recorded: true } });
    } catch (e) {
      return r.fulfill({ status: e.status || 500, json: { error: e.message, code: e.code } });
    }
  });
  return { page, problems, dispatchPosts, statusPosts, emailEnv, emailGets, emailPosts, resendCalls, records, ctx };
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

  // ── Customer shipping email: preview, guarded send, explicit resend ──
  {
    const { page, problems, statusPosts, emailEnv, emailGets, emailPosts, resendCalls, ctx } = await newAdminPage(browser);
    const box = () => page.getByTestId('customer-email');
    const sendBtn = () => page.getByRole('button', { name: /^(Send shipping email|Shipping email sent|Sending…)$/ });
    const saveDispatch = page.getByRole('button', { name: 'Save dispatch details' });
    const previewFrame = () => page.frameLocator('iframe[title="Customer email preview"]').locator('body');
    const inbox = async () => text(box());
    const setDispatch = async (date, tracking) => {
      if (date !== undefined) await page.getByLabel('Shipped on').fill(date);
      if (tracking !== undefined) await page.getByLabel('Tracking number').fill(tracking);
      await saveDispatch.click();
      await page.getByText('Saved ✓').last().waitFor();
    };

    // 1. Tracked order, nothing recorded yet
    await openDetail(page, 'EP-NEW2');
    await box().waitFor();
    check('email: the Customer email section is there (dry-run banner shown)', (await inbox()).includes('Email mode: DRY RUN'), await inbox());
    check('email: not sent yet is stated', (await inbox()).includes('Shipping email not sent yet'));
    check('email: Send is disabled without a ship date, and says why', await sendBtn().isDisabled() && (await inbox()).includes('Save a ship date first: a shipping email needs one.'), await inbox());

    await page.getByRole('button', { name: 'Preview customer email' }).click();
    await page.getByTestId('email-preview').waitFor();
    const pv = await text(page.getByTestId('email-preview'));
    check('email preview: shows subject, recipient, and that no ship date is saved yet (assumes today)',
      pv.includes('Subject: Your EdiblePrint order EP-NEW2 has shipped') && pv.includes('To: fake@example.com') && pv.includes('No ship date is saved yet, so this assumes today (2026-09-28)'), pv);
    check('email preview: the email itself is rendered, with the tracking placeholder for a tracked order not yet numbered',
      (await text(previewFrame())).includes('Your order has shipped') && (await text(previewFrame())).includes('(tracking number not recorded yet)'), await text(previewFrame()));
    check('email preview: reading it sent nothing and changed nothing', emailPosts.length === 0 && resendCalls.length === 0);

    await setDispatch('2026-09-25');
    check('email: after saving a date, tracked still cannot send until the number is recorded', await sendBtn().isDisabled() && (await inbox()).includes('Record the tracking number first'), await inbox());
    await setDispatch(undefined, 'RB123456789CA');
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Send shipping email'); return b && !b.disabled; });
    check('email: with date and tracking number, Send is enabled', await sendBtn().isEnabled());
    check('email: saving the date and the number sent NO email by itself', emailPosts.length === 0 && resendCalls.length === 0);
    const pv2 = await text(previewFrame());
    check('email preview (after saving): real ship date, expected-by (Sep 29), tracking number and Canada Post link',
      pv2.includes('Friday, September 25, 2026') && pv2.includes('Tuesday, September 29, 2026') && pv2.includes('RB123456789CA')
      && (await page.frameLocator('iframe[title="Customer email preview"]').getByRole('link', { name: 'Track your package' }).getAttribute('href')) === 'https://www.canadapost-postescanada.ca/track-reperage/en#/details/RB123456789CA', pv2);

    // marking as shipped is its own action and must not send anything
    await page.getByText('This order is not marked as shipped. Mark as shipped?', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mark as shipped' }).click();
    await page.getByText('Marked as shipped ✓').waitFor();
    check('email: marking the order shipped changed the status but sent NO email', statusPosts.some((s) => s.id === 'EP-NEW2' && s.status === 'shipped') && emailPosts.length === 0 && resendCalls.length === 0);

    // 2. Dry run: recorded, sends nothing, does not lock the button
    await sendBtn().click();
    await page.getByText(/^Dry run: nothing was sent/).waitFor();
    check('email dry-run: the request was made, but nothing reached the (fake) email service', emailPosts.length === 1 && resendCalls.length === 0, { emailPosts, resendCalls });
    check('email dry-run: records what would have been sent, and to whom', (await inbox()).includes('Last dry run:') && (await inbox()).includes('would have sent to fake@example.com'), await inbox());
    check('email dry-run: still says not sent, and Send stays available', (await inbox()).includes('Shipping email not sent yet') && await sendBtn().isEnabled());

    // 3. Live mode → really sends, once
    emailEnv.EMAIL_MODE = 'send';
    await openDetail(page, 'EP-NEW2');
    await box().waitFor();
    check('email send-mode: the dry-run banner is gone', !(await inbox()).includes('DRY RUN'));
    await sendBtn().click();
    await page.getByText(/^Sent ✓ to fake@example.com/).waitFor();
    check('email send: exactly one email went out, to the customer', resendCalls.length === 1 && resendCalls[0].to.join() === 'fake@example.com' && emailPosts[emailPosts.length - 1].resend === undefined, resendCalls);
    check('email send: the button now reads "Shipping email sent" and is disabled', await sendBtn().innerText() === 'Shipping email sent' && await sendBtn().isDisabled());
    check('email send: shows when it was sent and to whom', /Shipping email sent on .* to fake@example\.com/.test(await inbox()), await inbox());
    check('email send: there is no second automatic send', resendCalls.length === 1);

    // 4. Resending is a separate, explicit action
    await page.getByRole('button', { name: 'Send again…' }).click();
    await page.getByRole('alert').filter({ hasText: 'Send it again?' }).waitFor();
    check('email resend: asks first ("was already sent to … Send it again?")', (await text(page.getByRole('alert').filter({ hasText: 'Send it again?' }))).includes('fake@example.com'));
    await page.getByRole('button', { name: 'Cancel' }).click();
    check('email resend: Cancel sends nothing', resendCalls.length === 1 && (await page.getByRole('button', { name: 'Yes, send it again' }).count()) === 0);
    await page.getByRole('button', { name: 'Send again…' }).click();
    await page.getByRole('button', { name: 'Yes, send it again' }).click();
    await page.getByText(/sent 2 times/).waitFor();
    check('email resend: "Yes, send it again" sends with resend:true and counts 2', resendCalls.length === 2 && emailPosts[emailPosts.length - 1].resend === true, emailPosts);
    check('email: no page errors so far', problems.length === 0, problems);
    await ctx.close();
  }

  {
    // 5. No customer email
    const { page, emailPosts, ctx } = await newAdminPage(browser);
    await openDetail(page, 'EP-NOML');
    await page.getByTestId('customer-email').waitFor();
    const b = page.getByRole('button', { name: 'Send shipping email' });
    check('email: an order with no customer email cannot send, and says nobody to notify',
      await b.isDisabled() && (await text(page.getByTestId('customer-email'))).includes('This order has no customer email, so there is nobody to notify.'));
    check('email: a disabled Send sends nothing', emailPosts.length === 0);
    await ctx.close();
  }

  {
    // 6. TEST order in live mode: only ever the owner
    const { page, emailEnv, emailPosts, resendCalls, ctx } = await newAdminPage(browser);
    emailEnv.EMAIL_MODE = 'send';
    await openDetail(page, 'EP-TEST');
    await page.getByTestId('customer-email').waitFor();
    check('email test order: says the email goes to the owner, never the customer',
      (await text(page.getByTestId('customer-email'))).includes('Test order: the email goes to you (me@example.com), never to the customer.'));
    await page.getByRole('button', { name: 'Preview customer email' }).click();
    const pv = await text(page.getByTestId('email-preview'));
    check('email test order: the preview shows the owner as recipient, the [TEST] subject, and who it would have gone to',
      pv.includes('Subject: [TEST] Your EdiblePrint order EP-TEST has shipped') && pv.includes('To: me@example.com') && pv.includes('instead of real.customer@example.com'), pv);
    await page.getByRole('button', { name: 'Send shipping email' }).click();
    await page.getByText(/^Sent ✓ to me@example.com/).waitFor();
    check('email test order: the only recipient of the real send is the owner — the customer address never appears in "to"',
      resendCalls.length === 1 && resendCalls[0].to.join() === 'me@example.com' && !JSON.stringify(resendCalls[0].to).includes('real.customer') && resendCalls[0].subject.startsWith('[TEST] '), resendCalls);
    check('email test order: the panel says it went to the owner', (await text(page.getByTestId('customer-email'))).includes('test order: delivered to you, not the customer'));
    check('email test order: one request only', emailPosts.length === 1);
    await ctx.close();
  }

  {
    // 7. Pickup orders: no email section, and the preview endpoint is never asked
    const { page, emailGets, ctx } = await newAdminPage(browser);
    await openDetail(page, 'EP-PICK');
    check('email pickup: no Customer email section', (await page.getByTestId('customer-email').count()) === 0);
    check('email pickup: the preview is never requested', emailGets.length === 0, emailGets);
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
