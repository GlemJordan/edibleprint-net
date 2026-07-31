// Verifies the admin orders UI: logged-out gate, list table, detail view
// (including the sourceType/selectedPage badge), and the status-update flow.
//
// CURRENTLY BROKEN, kept for reference: this depends on a temporary
// /api/debug-mint-cookie route (mints an ep_admin session without going
// through the real magic-link flow) and a hardcoded EP-DEBUGADM test order,
// both created ad hoc during the original admin-UI verification session and
// deleted afterward. To revive this: either restore a similar dev-only
// cookie-mint route, or rewrite steps 2+ to drive the real
// /api/admin/request-link + /api/admin/verify-link flow, and point step 5+
// at a real order id. Excluded from `npm run test:e2e` until then.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const results = [];

  // --- Logged-out: both pages should show the sign-in prompt ---
  {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: 'networkidle' });
    const gateVisible = await page.getByText('You need to be signed in as admin', { exact: false }).isVisible().catch(() => false);
    results.push({ test: '1-list-page-gated-when-logged-out', pass: gateVisible });
    await page.close();
  }

  // --- Logged-in: get a real session cookie via the temp mint route ---
  const page = await browser.newPage();
  const mintRes = await page.goto(`${BASE_URL}/api/debug-mint-cookie`);
  const { token } = await mintRes.json();
  await page.context().addCookies([{
    name: 'ep_admin', value: token, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
  }]);

  // --- List page ---
  await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const heading = await page.getByRole('heading', { name: 'Orders' }).isVisible().catch(() => false);
  results.push({ test: '2-list-page-loads-when-authed', pass: heading });
  const rowCount = await page.locator('tbody tr').count();
  results.push({ test: '3-list-has-order-rows', pass: rowCount > 0, rowCount });
  const uploadFlagVisible = await page.getByText('📄', { exact: false }).first().isVisible().catch(() => false);
  results.push({ test: '4-upload-flag-visible-in-list', pass: uploadFlagVisible });

  // --- Click into an order that has an upload design (known from prior testing) ---
  const link = page.getByRole('link', { name: /EP-DEBUGADM/ }).first();
  const linkText = await link.textContent().catch(() => null);
  await link.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const detailHeading = await page.getByRole('heading', { name: linkText || '' }).isVisible().catch(() => false);
  results.push({ test: '5-detail-page-loads', pass: detailHeading, orderId: linkText });
  const sourceTypeBadge = await page.getByText('Customer-supplied file', { exact: false }).isVisible().catch(() => false);
  results.push({ test: '6-sourceType-badge-visible', pass: sourceTypeBadge });
  const pageInfo = await page.getByText(/page \d+ of \d+/, { exact: false }).isVisible().catch(() => false);
  results.push({ test: '7-selectedPage-pageCount-visible', pass: pageInfo });

  // --- Status update flow ---
  const select = page.locator('select');
  const beforeStatus = await select.inputValue();
  const newStatus = beforeStatus === 'printed' ? 'shipped' : 'printed';
  await select.selectOption(newStatus);
  await page.getByRole('button', { name: 'Update status' }).click();
  // updateOrderStatus now polls Cloudinary up to ~6s worst-case to confirm
  // its own write is visible before resolving - give it comfortable room.
  await page.waitForSelector('text=/Saved|Error/', { timeout: 12000 }).catch(() => {});
  const savedMsg = await page.getByText('Saved', { exact: false }).isVisible().catch(() => false);
  results.push({ test: '8-status-update-succeeds', pass: savedMsg, from: beforeStatus, to: newStatus });

  // Reload and confirm the new status persisted server-side
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const persistedValue = await page.locator('select').inputValue();
  results.push({ test: '9-status-update-persists-after-reload', pass: persistedValue === newStatus, persistedValue, expected: newStatus });

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  if (failures.length) process.exit(1);
  process.exit(0);
})();
