// Verifies Stage 2 of the "I already have my design" flow: size/proportion
// check, DPI check (PNG exact / PDF disclaimer), margin check, multi-page
// PDF picker, and the confirm-anyway gate.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-stage2-'));

function writeFile(name, bytes) {
  const p = path.join(TMP_DIR, name);
  fs.writeFileSync(p, bytes);
  return p;
}

async function makePng(page, { name, w, h, edgeContent = false }) {
  const dataUrl = await page.evaluate(({ w, h, edgeContent }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3366CC';
    if (edgeContent) {
      ctx.fillRect(0, 0, w, h); // fills edge-to-edge, content touches every border
    } else {
      const margin = Math.round(Math.min(w, h) * 0.15);
      ctx.fillRect(margin, margin, w - margin * 2, h - margin * 2);
    }
    return c.toDataURL('image/png');
  }, { w, h, edgeContent });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return writeFile(name, Buffer.from(base64, 'base64'));
}

async function makeSinglePagePdf(name, widthIn, heightIn) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([widthIn * 72, heightIn * 72]);
  page.drawRectangle({ x: 20, y: 20, width: widthIn * 72 - 40, height: heightIn * 72 - 40, color: rgb(0.2, 0.4, 0.8) });
  return writeFile(name, await doc.save());
}

async function makeMultiPagePdf(name, numPages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < numPages; i++) {
    const page = doc.addPage([8.5 * 72, 11 * 72]);
    page.drawRectangle({ x: 40, y: 40, width: 100, height: 100, color: rgb(i * 0.3, 0.2, 0.5) });
  }
  return writeFile(name, await doc.save());
}

async function uploadViaFullSheet(page, imagePath) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Already have a print-ready file? Upload it directly →' }).click();
  await page.waitForTimeout(200);
  const fileInput = page.locator('input[type="file"][accept*="application/pdf"]');
  await fileInput.setInputFiles(imagePath);
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  // 1) PNG exact Full Sheet proportions (default sheet type = fullsheet, 8"x11"), high DPI
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const p = await makePng(page, { name: 'exact-hidpi.png', w: 2400, h: 3300 });
    await uploadViaFullSheet(page, p);
    await page.waitForTimeout(1500);
    const goodSize = await page.getByText("proportions match this sheet", { exact: false }).isVisible().catch(() => false);
    const goodDpi = await page.getByText('Resolution looks good', { exact: false }).isVisible().catch(() => false);
    const continueBtn = page.getByRole('button', { name: 'Continue →' });
    // No mismatch/DPI issue here, so the only gate left is Stage 3's
    // print-as-is approval checkbox (requires the preview to have rendered).
    await page.waitForTimeout(1000);
    await page.getByLabel(/I confirm this file is print-ready/).check();
    await page.waitForTimeout(150);
    const continueEnabled = await continueBtn.isEnabled().catch(() => false);
    results.push({ test: '1a-exact-size-detected', pass: goodSize });
    results.push({ test: '1b-good-dpi-detected', pass: goodDpi });
    results.push({ test: '1c-continue-enabled-no-issues', pass: continueEnabled });
    await page.close();
  }

  // 2) PNG correct proportions but low DPI (255x330 -> ~30 DPI at fit size)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const p = await makePng(page, { name: 'lowdpi.png', w: 255, h: 330 });
    await uploadViaFullSheet(page, p);
    await page.waitForTimeout(1500);
    const lowDpiWarning = await page.getByText('below our recommended', { exact: false }).isVisible().catch(() => false);
    const continueBtn = page.getByRole('button', { name: 'Continue →' });
    const disabledBeforeConfirm = !(await continueBtn.isEnabled().catch(() => true));
    await page.getByLabel(/I understand the warning/).check();
    await page.getByLabel(/I confirm this file is print-ready/).check();
    await page.waitForTimeout(150);
    const enabledAfterConfirm = await continueBtn.isEnabled().catch(() => false);
    results.push({ test: '2a-low-dpi-warning-shown', pass: lowDpiWarning });
    results.push({ test: '2b-continue-blocked-until-confirmed', pass: disabledBeforeConfirm });
    results.push({ test: '2c-continue-enabled-after-confirm-checkbox', pass: enabledAfterConfirm });
    await page.close();
  }

  // 3) PNG wrong proportions (square, for Full Sheet target 8x11)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const p = await makePng(page, { name: 'wrongshape.png', w: 2000, h: 2000 });
    await uploadViaFullSheet(page, p);
    await page.waitForTimeout(1500);
    const mismatchMsg = await page.getByText("don't exactly match this sheet", { exact: false }).isVisible().catch(() => false);
    const noCropClaim = await page.getByText('Nothing will be cropped', { exact: false }).isVisible().catch(() => false);
    results.push({ test: '3a-aspect-mismatch-detected', pass: mismatchMsg });
    results.push({ test: '3b-no-crop-policy-stated', pass: noCropClaim });
    await page.close();
  }

  // 4) PNG with content touching the edge -> margin warning
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const p = await makePng(page, { name: 'edgecontent.png', w: 2550, h: 3300, edgeContent: true });
    await uploadViaFullSheet(page, p);
    await page.waitForTimeout(1500);
    const marginWarning = await page.getByText('may be lost when trimmed', { exact: false }).isVisible().catch(() => false);
    results.push({ test: '4-margin-warning-shown-for-edge-content', pass: marginWarning });
    await page.close();
  }

  // 5) Single-page PDF, exact size -> DPI disclaimer + CMYK note, no PNG transparency note
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const p = await makeSinglePagePdf('exact.pdf', 8.5, 11);
    await uploadViaFullSheet(page, p);
    await page.waitForTimeout(1500);
    const dpiDisclaimer = await page.getByText("can't automatically check the resolution", { exact: false }).isVisible().catch(() => false);
    const cmykNote = await page.getByText('CMYK files may shift', { exact: false }).isVisible().catch(() => false);
    results.push({ test: '5a-pdf-dpi-disclaimer-shown', pass: dpiDisclaimer });
    results.push({ test: '5b-pdf-cmyk-note-shown', pass: cmykNote });
    await page.close();
  }

  // 6) Multi-page PDF -> page picker with thumbnails, switching pages works
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const p = await makeMultiPagePdf('multi.pdf', 3);
    await uploadViaFullSheet(page, p);
    await page.waitForTimeout(2500); // thumbnail rendering takes a bit longer
    const pickerVisible = await page.getByText('This PDF has 3 pages', { exact: false }).isVisible().catch(() => false);
    results.push({ test: '6a-multipage-picker-shown', pass: pickerVisible });
    const page2Btn = page.getByRole('button', { name: /Page 2/ });
    const page2Visible = await page2Btn.isVisible().catch(() => false);
    results.push({ test: '6b-page-thumbnails-rendered', pass: page2Visible });
    if (page2Visible) {
      await page2Btn.click();
      await page.waitForTimeout(1200);
      // After picking page 2, validation should re-run without erroring / picker should still show selection
      const stillOnReview = await page.getByRole('heading', { name: 'Review Your File' }).isVisible().catch(() => false);
      results.push({ test: '6c-page-switch-revalidates-without-crash', pass: stillOnReview });
    } else {
      results.push({ test: '6c-page-switch-revalidates-without-crash', pass: false, detail: 'page 2 thumb not found' });
    }
    await page.close();
  }

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(f => console.log(' -', JSON.stringify(f)));
    process.exit(1);
  }
  process.exit(0);
})();
