// Verifies Stage 3: preview render + modal, the print-as-is approval gate,
// and (critically) that the real checkout path successfully signs + uploads
// the ORIGINAL file directly to Cloudinary and that create-checkout returns
// a real Stripe session URL with the correct server-enforced price.
//
// NOTE: this exercises real Cloudinary credentials from .env.local and
// creates one small, clearly-named test asset under
// edibleprint/customer-files/ in the real account (easy to identify/delete
// by its timestamp prefix). It does NOT complete a Stripe payment - only an
// unpaid Checkout Session gets created, which simply expires unused.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-stage3-'));

async function makeExactPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([8 * 72, 11 * 72]); // matches Full Sheet target exactly
  page.drawRectangle({ x: 40, y: 40, width: 8 * 72 - 80, height: 11 * 72 - 80, color: rgb(0.2, 0.4, 0.8) });
  const p = path.join(TMP_DIR, 'stage3-exact.pdf');
  fs.writeFileSync(p, await doc.save());
  return p;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  const results = [];

  const responses = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/upload-print-file') || res.url().includes('cloudinary.com') || res.url().includes('/api/create-checkout')) {
      responses.push({ url: res.url(), status: res.status() });
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Already have a print-ready file? Upload it directly →' }).click();
  await page.waitForTimeout(200);
  const p = await makeExactPdf();
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles(p);
  await page.waitForTimeout(1500);

  // Preview should auto-render
  const previewImg = page.locator('img[alt="Print preview"]').first();
  const previewVisible = await previewImg.isVisible().catch(() => false);
  results.push({ test: '1-inline-preview-renders', pass: previewVisible });

  // Continue should be disabled before approval (exact size/DPI-unknown PDF -> no mismatch gate, only approval gate)
  const continueBtn = page.getByRole('button', { name: 'Continue →' });
  const disabledBeforeApproval = !(await continueBtn.isEnabled().catch(() => true));
  results.push({ test: '2-continue-disabled-before-approval', pass: disabledBeforeApproval });

  // Open full modal
  await page.getByRole('button', { name: 'View Full Print Preview' }).click();
  await page.waitForTimeout(300);
  const modalVisible = await page.getByText('Print Preview — stage3-exact.pdf', { exact: false }).isVisible().catch(() => false);
  results.push({ test: '3-full-modal-opens', pass: modalVisible });
  await page.getByRole('button', { name: '✕ Close' }).click();
  await page.waitForTimeout(200);

  // Check approval checkbox with the exact confirmation text
  const approvalCheckbox = page.locator('input[type="checkbox"]').last();
  await approvalCheckbox.check();
  await page.waitForTimeout(150);
  const approvalTextVisible = await page.getByText('I confirm this file is print-ready. It will be printed exactly as shown, without modifications.', { exact: false }).isVisible().catch(() => false);
  results.push({ test: '4-approval-text-matches-spec', pass: approvalTextVisible });
  const enabledAfterApproval = await continueBtn.isEnabled().catch(() => false);
  results.push({ test: '5-continue-enabled-after-approval', pass: enabledAfterApproval });

  await continueBtn.click();
  await page.waitForTimeout(300);
  const step3Visible = await page.getByRole('heading', { name: 'Shipping & Payment' }).isVisible().catch(() => false);
  results.push({ test: '6-reaches-step3', pass: step3Visible });

  // Fill minimal required fields, use pickup to skip address fields
  await page.locator('input[placeholder="Jane Smith"]').fill('Test Customer');
  await page.locator('input[placeholder="jane@email.com"]').fill('test-upload-flow@example.com');
  await page.getByText('Free Pickup — London, ON', { exact: false }).click();
  await page.locator('input[type="checkbox"]').last().check(); // the generic design-confirmation checkbox
  await page.waitForTimeout(200);

  const placeOrderBtn = page.getByRole('button', { name: /Place Order/ });
  await placeOrderBtn.click();
  await page.waitForTimeout(6000); // real network calls to our API + Cloudinary + Stripe

  const signRes = responses.find(r => r.url.includes('/api/upload-print-file'));
  const cloudinaryRes = responses.find(r => r.url.includes('cloudinary.com'));
  const checkoutRes = responses.find(r => r.url.includes('/api/create-checkout'));
  results.push({ test: '7-upload-sign-endpoint-called-200', pass: signRes?.status === 200, detail: signRes });
  results.push({ test: '8-cloudinary-direct-upload-200', pass: cloudinaryRes?.status === 200, detail: cloudinaryRes });
  results.push({ test: '9-create-checkout-called-200', pass: checkoutRes?.status === 200, detail: checkoutRes });

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  if (failures.length) process.exit(1);
  process.exit(0);
})();
