// Regression: a PDF uploaded through the main editor flow ("Upload Your
// Photo") must actually show up. The editor draws layers through
// new Image(), which can't decode a PDF — before the fix the PDF went in as a
// data:application/pdf URL and both the editor canvas and the print preview
// stayed blank. HomePage.js now rasterizes page 1 to a PNG on upload.
//
// Checks: editor canvas shows the PDF, the print preview shows it, "+ Add
// Image" accepts a PDF as a new layer, and a multi-page PDF loads page 1 and
// tells the customer so.
import { launchBrowser, hydrated, appears } from './_stress.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-editor-pdf-'));

async function makePdf(name, pages, widthIn, heightIn) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([widthIn * 72, heightIn * 72]);
    // Fill most of the page so "is anything drawn?" is unambiguous.
    page.drawRectangle({ x: 18, y: 18, width: widthIn * 72 - 36, height: heightIn * 72 - 36, color: rgb(0.85 - i * 0.3, 0.25, 0.35) });
  }
  const file = path.join(TMP_DIR, name);
  fs.writeFileSync(file, await doc.save());
  return file;
}

/* Share of non-white pixels on each visible canvas (the editor canvas is
   first in DOM order; the print preview adds its own). */
function canvasCoverage(page) {
  return page.evaluate(() => [...document.querySelectorAll('canvas')]
    .filter(c => c.width > 50 && c.offsetParent !== null)
    .map(c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && !(d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235)) n++;
      }
      return n / (c.width * c.height);
    }));
}

async function openEditorWith(page, file) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const cta = page.getByRole('button', { name: 'Upload Your Photo →' });
  await hydrated(page, cta);
  await cta.click();
  await page.getByRole('heading', { name: 'Upload Your Image' }).waitFor();
  await page.locator('input[type="file"][accept="image/*,.pdf"]').first().setInputFiles(file);
  return appears(page.getByRole('heading', { name: 'Customize Your Print' }));
}

/* The editor auto-fits the layer a moment after it loads — wait for the
   canvas to actually have content rather than sleeping a fixed time. */
async function waitForCoverage(page, min) {
  return page.waitForFunction((m) => {
    const c = document.querySelector('canvas');
    if (!c || c.width < 50) return false;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && !(d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235)) n++;
    }
    return n / (c.width * c.height) > m;
  }, min, { timeout: 30000, polling: 250 }).then(() => true, () => false);
}

(async () => {
  const onePage = await makePdf('design.pdf', 1, 5, 5);
  const threePages = await makePdf('three-pages.pdf', 3, 8.27, 11.69);
  const browser = await launchBrowser();
  const results = [];

  // 1–3: single-page PDF → editor, print preview, + Add Image
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });

    results.push({ test: '1a-pdf-reaches-customize-screen', pass: await openEditorWith(page, onePage) });
    results.push({ test: '1b-editor-canvas-shows-pdf', pass: await waitForCoverage(page, 0.2) });
    results.push({ test: '1c-no-error-or-multipage-dialog', pass: dialogs.length === 0, detail: dialogs });

    await page.getByRole('button', { name: /See print preview/ }).click();
    await appears(page.getByText('Print Preview'));
    await page.waitForTimeout(1500);
    const cov = await canvasCoverage(page);
    results.push({ test: '2-print-preview-shows-pdf', pass: cov.length > 1 && cov.slice(1).some(r => r > 0.02), detail: cov.map(r => +r.toFixed(3)) });
    await page.getByRole('button', { name: '✕' }).first().click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(300);

    // On step 2 the only file input left is the editor's "+ Add Image" one.
    const addImageAcceptsPdf = await page.locator('input[type="file"][accept="image/*,.pdf"]').last()
      .setInputFiles(onePage, { timeout: 10000 })
      .then(() => appears(page.getByText('Layers (2)')), () => false);
    results.push({ test: '3-add-image-accepts-pdf', pass: addImageAcceptsPdf });
    await page.close();
  }

  // 4: multi-page PDF → page 1 loaded + customer told
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
    await openEditorWith(page, threePages);
    results.push({ test: '4a-multipage-pdf-shows-in-editor', pass: await waitForCoverage(page, 0.2) });
    results.push({ test: '4b-multipage-notice-shown', pass: dialogs.some(m => /3 pages/.test(m) && /page 1/.test(m)), detail: dialogs });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})();
