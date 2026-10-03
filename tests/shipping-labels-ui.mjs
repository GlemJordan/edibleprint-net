// /admin/orders/labels as the owner uses it before a trip to the post office:
// the orders still to mail, each address as it will print, problems flagged
// and left unticked, the sheet arithmetic, and the download link carrying the
// chosen orders (in order) and the free spaces of the sheet in the printer.
// Also checks the link to it from the order list.
//
// Fully isolated: the admin session check and the /api/admin/* calls are
// answered here with fabricated data built by the real lib functions, so no
// production data is read and no admin login is needed.
import { chromium } from 'playwright';
import { describeLabelOrders, returnAddressLines, LABEL_NOTE, MAX_ORDERS_PER_PDF } from '../lib/shipping-labels.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WAIT = 90000;

const results = [];
const check = (test, pass, detail) => { results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) }); };

const design = (quantity) => ({ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity, unitPrice: 14.99 });
const order = (orderId, over = {}) => ({
  orderId, orderNumber: orderId, createdAt: '2026-10-01T15:00:00.000Z', isTest: false,
  customer: { name: 'Fake Customer' }, designs: [design(1)], shippingMethod: 'standard', shippingPackages: 1,
  shipping: { method: 'canada_post_shipping', address: { line1: '1 Test St, 4', city: 'London', province: 'Ontario', postalCode: 'n6a1b2', country: 'CA' } },
  payment: { amountCents: 2000, currency: 'CAD', status: 'paid' }, production: { status: 'printed', updatedAt: '' },
  ...over,
});
const ORDERS = describeLabelOrders([
  order('EP-AAAA', { shippingPackages: 3, designs: [design(5)], committedDate: '2026-10-05' }),
  order('EP-BBBB', { shippingMethod: 'tracked', committedDate: '2026-10-06' }),
  order('EP-BAD1', { shipping: { method: 'canada_post_shipping', address: { line1: '9 Nowhere Rd', city: 'Halifax', province: 'Nova Scotia', postalCode: '' } } }),
  order('EP-TEST', { isTest: true, createdAt: '2026-10-02T00:00:00Z' }),
]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('**/api/admin/check', (r) => r.fulfill({ json: { isAdmin: true } }));
  await page.route('**/api/admin/shipping-labels', (r) => r.fulfill({ json: { orders: ORDERS, scannedAll: true, returnAddress: returnAddressLines(), note: LABEL_NOTE } }));
  await page.route(/\/api\/admin\/orders(\?.*)?$/, (r) => r.fulfill({ json: { orders: [], nextCursor: null, scannedAllResults: true } }));

  await page.goto(BASE_URL + '/admin/orders', { timeout: WAIT });
  const link = page.getByRole('link', { name: 'Shipping labels' });
  await link.waitFor({ timeout: WAIT });
  check('order list links to the labels page', (await link.getAttribute('href')) === '/admin/orders/labels');

  await page.goto(BASE_URL + '/admin/orders/labels', { timeout: WAIT });
  await page.getByTestId('label-order').first().waitFor({ timeout: WAIT });
  const cards = page.getByTestId('label-order');
  check('every order still to mail is listed, soonest first', (await cards.count()) === 4
    && (await cards.nth(0).textContent()).includes('EP-AAAA') && (await cards.nth(1).textContent()).includes('EP-BBBB'));
  const first = await cards.nth(0).textContent();
  check('the address shows exactly as it will print (unit in front, province code, postal code formatted)',
    first.includes('FAKE CUSTOMER') && first.includes('4-1 TEST ST') && first.includes('LONDON ON  N6A 1B2'), first);
  check('the return address and note are shown once at the top', (await page.textContent('body')).includes('LONDON ON  N5W 2V7') && (await page.textContent('body')).includes(LABEL_NOTE));

  const ticked = async (id) => page.getByRole('checkbox', { name: 'Include ' + id }).isChecked();
  check('ready orders start ticked; an address problem or a test order starts unticked',
    (await ticked('EP-AAAA')) && (await ticked('EP-BBBB')) && !(await ticked('EP-BAD1')) && !(await ticked('EP-TEST')));
  check('the problem is spelled out', (await cards.nth(2).textContent()).includes('Missing postal code'));

  const summary = page.getByTestId('labels-summary');
  const download = page.getByTestId('download-labels');
  check('summary: 3 + 1 packages = 4 labels on 1 page, the new sheet used completely',
    /4 labels on 1 page · 1 new sheet/.test(await summary.textContent()) && /Uses the last sheet completely/.test(await summary.textContent()), await summary.textContent());
  check('download link: chosen orders in order, new sheet', (await download.getAttribute('href')) === '/api/admin/shipping-labels/pdf?ids=EP-AAAA%2CEP-BBBB&free=4', await download.getAttribute('href'));

  await page.selectOption('#free-spaces', '2');
  check('a sheet with 2 spaces left: 2 on it, 2 on a new sheet, 2 spaces kept for next time',
    /4 labels on 2 pages · 1 new sheet/.test(await summary.textContent()) && /2 spaces left for next time/.test(await summary.textContent()), await summary.textContent());
  check('download link follows the sheet choice', (await download.getAttribute('href')).endsWith('&free=2'));

  await page.getByRole('checkbox', { name: 'Include EP-AAAA' }).uncheck();
  check('unticking an order drops its labels', /1 label on 1 page/.test(await summary.textContent()) && (await download.getAttribute('href')).includes('ids=EP-BBBB&'), await summary.textContent());

  await page.getByRole('checkbox', { name: 'Include EP-BBBB' }).uncheck();
  check('nothing ticked: no download', (await download.getAttribute('href')) === null && (await download.getAttribute('aria-disabled')) === 'true');

  // A backlog bigger than one PDF takes: the soonest MAX_ORDERS_PER_PDF start
  // ticked and download; ticking past the cap disables the download and says
  // to do it in batches, instead of a link that only returns an error.
  {
    const many = describeLabelOrders(Array.from({ length: MAX_ORDERS_PER_PDF + 1 }, (_, i) =>
      order('EP-M' + String(i).padStart(3, '0'), { createdAt: `2026-09-01T00:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}Z` })));
    const big = await browser.newPage();
    await big.route('**/api/admin/check', (r) => r.fulfill({ json: { isAdmin: true } }));
    await big.route('**/api/admin/shipping-labels', (r) => r.fulfill({ json: { orders: many, scannedAll: true, returnAddress: returnAddressLines(), note: LABEL_NOTE } }));
    await big.goto(BASE_URL + '/admin/orders/labels', { timeout: WAIT });
    await big.getByTestId('label-order').first().waitFor({ timeout: WAIT });
    const dl = big.getByTestId('download-labels');
    const lastId = many[many.length - 1].orderId;
    const href = await dl.getAttribute('href');
    check(`over ${MAX_ORDERS_PER_PDF} ready orders: the soonest ${MAX_ORDERS_PER_PDF} start ticked and the link carries exactly those`,
      !(await big.getByRole('checkbox', { name: 'Include ' + lastId }).isChecked())
      && href !== null && decodeURIComponent(href).split('ids=')[1].split('&')[0].split(',').length === MAX_ORDERS_PER_PDF, href);
    await big.getByRole('checkbox', { name: 'Include ' + lastId }).check();
    check('ticking past the cap disables the download and asks for a second batch',
      (await dl.getAttribute('href')) === null && (await dl.getAttribute('aria-disabled')) === 'true'
      && /untick 1 and download the rest in a second batch/.test(await big.getByTestId('too-many').textContent()));
    await big.close();
  }

  if (process.env.EP_SCREENSHOT_DIR) {
    await page.getByRole('checkbox', { name: 'Include EP-AAAA' }).check();
    await page.getByRole('checkbox', { name: 'Include EP-BBBB' }).check();
    await page.setViewportSize({ width: 1200, height: 1100 });
    await page.screenshot({ path: process.env.EP_SCREENSHOT_DIR + '/labels-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: process.env.EP_SCREENSHOT_DIR + '/labels-mobile.png', fullPage: true });
  }
} finally {
  await browser.close();
}

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
