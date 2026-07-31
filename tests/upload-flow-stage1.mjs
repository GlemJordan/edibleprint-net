// Smoke-tests Stage 1 of the "I already have my design" flow:
//  - hero secondary CTA is visible and reachable
//  - DOCX gets the specific helpful rejection message
//  - oversized file gets rejected
//  - a valid PDF gets accepted, added to the cart, and priced correctly
//  - the cart flows through to Details (step 3) with the right summary line
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-upload-flow-'));

function writeFile(name, bytes) {
  const p = path.join(TMP_DIR, name);
  fs.writeFileSync(p, bytes);
  return p;
}

// Minimal but valid single-page PDF (hand-built, no dependency needed).
const MINI_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
xref
0 4
0000000000 65535 f
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  const results = [];

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // 1) Hero secondary CTA visible + reachable
  const heroLink = page.getByRole('button', { name: 'Already have a print-ready file? Upload it directly →' });
  results.push({ test: '1-hero-cta-visible', pass: await heroLink.isVisible().catch(() => false) });
  await heroLink.click();
  await page.waitForTimeout(300);
  const uploadHeaderVisible = await page.getByRole('heading', { name: 'Upload Your Print-Ready File' }).isVisible().catch(() => false);
  results.push({ test: '2-lands-on-upload-screen', pass: uploadHeaderVisible });

  // 2) DOCX rejection message
  const docxPath = writeFile('bad.docx', Buffer.from('not a real docx, just bytes'));
  const fileInput = page.locator('input[type="file"][accept*="application/pdf"]');
  await fileInput.setInputFiles(docxPath);
  await page.waitForTimeout(300);
  const docxMsg = await page.getByText("Word documents can't be printed directly", { exact: false }).isVisible().catch(() => false);
  results.push({ test: '3-docx-rejected-with-helpful-message', pass: docxMsg });

  // 3) Oversized file rejection (30MB of zeros, well past the 25MB limit)
  const bigPath = writeFile('big.png', Buffer.alloc(30 * 1024 * 1024, 0));
  await fileInput.setInputFiles(bigPath);
  await page.waitForTimeout(300);
  const sizeMsg = await page.getByText('File is too large', { exact: false }).isVisible().catch(() => false);
  results.push({ test: '4-oversized-file-rejected', pass: sizeMsg });

  // 4) Valid PDF accepted -> lands on step 2 review with correct price for default sheet type (Full Sheet $19.99)
  const pdfPath = writeFile('design.pdf', Buffer.from(MINI_PDF));
  await fileInput.setInputFiles(pdfPath);
  await page.waitForTimeout(500);
  const reviewHeaderVisible = await page.getByRole('heading', { name: 'Review Your File' }).isVisible().catch(() => false);
  results.push({ test: '5-valid-pdf-accepted-reaches-review', pass: reviewHeaderVisible });
  const fileNameShown = await page.getByText('design.pdf', { exact: false }).isVisible().catch(() => false);
  results.push({ test: '6-filename-shown-in-review', pass: fileNameShown });
  const priceShown = await page.getByText('$19.99', { exact: false }).first().isVisible().catch(() => false);
  results.push({ test: '7-default-fullsheet-price-shown', pass: priceShown });

  // 5) Switch sheet type to Wafer Paper, confirm price updates
  await page.getByRole('button', { name: /Wafer Paper/ }).click();
  await page.waitForTimeout(200);
  const waferPriceShown = await page.locator('button:has-text("Wafer Paper")').getByText('$12.99').isVisible().catch(() => false);
  results.push({ test: '8-switching-sheet-type-updates-price', pass: waferPriceShown });

  // 6) Continue to Details (step 3) and check order summary line
  // (Stage 3 added the mandatory "print as-is" approval checkbox gate)
  await page.waitForTimeout(1500);
  await page.locator('input[type="checkbox"]').last().check();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.waitForTimeout(300);
  const detailsHeaderVisible = await page.getByRole('heading', { name: 'Shipping & Payment' }).isVisible().catch(() => false);
  results.push({ test: '9-reaches-step3-details', pass: detailsHeaderVisible });
  const summaryLine = await page.getByText(/Design 1: 1x/, { exact: false }).isVisible().catch(() => false);
  results.push({ test: '10-order-summary-line-present', pass: summaryLine });

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  if (failures.length) process.exit(1);
  process.exit(0);
})();
