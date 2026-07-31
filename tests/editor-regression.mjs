// Regression check: the existing editor flow must be completely unaffected
// by the new "I already have my design" entry point.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-editor-regress-'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  const results = [];

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const primaryCta = page.getByRole('button', { name: 'Upload Your Photo →' });
  results.push({ test: '1-primary-cta-still-visible', pass: await primaryCta.isVisible().catch(() => false) });
  await primaryCta.click();
  await page.waitForTimeout(300);
  const uploadImageHeader = await page.getByRole('heading', { name: 'Upload Your Image' }).isVisible().catch(() => false);
  results.push({ test: '2-editor-upload-screen-unchanged', pass: uploadImageHeader });

  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3366CC';
    ctx.fillRect(0, 0, 400, 400);
    return c.toDataURL('image/png');
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const imgPath = path.join(TMP_DIR, 'photo.png');
  fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));

  const fileInput = page.locator('input[type="file"][accept="image/*,.pdf"]');
  await fileInput.setInputFiles(imgPath);
  await page.waitForTimeout(800);
  const customizeHeader = await page.getByRole('heading', { name: 'Customize Your Print' }).isVisible().catch(() => false);
  results.push({ test: '3-editor-reaches-customize-screen', pass: customizeHeader });
  const canvasVisible = await page.locator('canvas').first().isVisible().catch(() => false);
  results.push({ test: '4-editor-canvas-renders', pass: canvasVisible });
  const shapeSelectorVisible = await page.getByRole('button', { name: /Round/ }).isVisible().catch(() => false);
  results.push({ test: '5-shape-selector-present', pass: shapeSelectorVisible });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => !r.pass);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  if (failures.length) process.exit(1);
  process.exit(0);
})();
