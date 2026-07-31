// Verifies:
//  A) removeWhiteBg defaults to off, and the bg-remove Worker is NEVER
//     instantiated on upload/preview/PDF unless the user explicitly enables it.
//  B) The white-background suggestion banner appears for a white-margin image
//     and NOT for a normal (content-filling) image.
//  C) Clicking "Remove it ->" opens Advanced options, flips the toggle on,
//     and the edge-tolerance warning becomes visible.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-imgs2-'));

async function makeTestImage(page, { name, w, h, subjectSize, bg }) {
  const dataUrl = await page.evaluate(({ w, h, subjectSize, bg }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(255,0,255)';
    const sx = (w - subjectSize) / 2, sy = (h - subjectSize) / 2;
    ctx.fillRect(sx, sy, subjectSize, subjectSize);
    return c.toDataURL('image/png');
  }, { w, h, subjectSize, bg });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const filePath = path.join(TMP_DIR, name + '.png');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

async function uploadViaFullSheet(page, imagePath) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('footer').getByText('Full Sheet Prints', { exact: true }).click();
  const fileInput = page.locator('input[type="file"][accept="image/*,.pdf"]');
  await fileInput.setInputFiles(imagePath);
  await page.waitForSelector('canvas', { state: 'attached' });
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  // --- Test A + B: white-margin image, default settings, no worker created ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
    const workersCreated = [];
    page.on('worker', (w) => workersCreated.push(w.url()));
    const imgPath = await makeTestImage(page, { name: 'whitebg', w: 1400, h: 1400, subjectSize: 120, bg: '#FFFFFF' });
    await uploadViaFullSheet(page, imgPath);

    const bannerVisible = await page.getByText('This image has a white background', { exact: false }).isVisible().catch(() => false);
    results.push({ test: 'A1-suggestion-banner-shows-for-white-bg', pass: bannerVisible === true, detail: { bannerVisible } });

    const bgWorkerRequests = workersCreated.filter(u => u.includes('bg-remove-worker'));
    results.push({ test: 'A2-no-worker-created-by-default', pass: bgWorkerRequests.length === 0, detail: { workersCreated } });

    // --- Test C: click "Remove it" -> opens Advanced options + flips toggle + shows warning ---
    await page.getByRole('button', { name: 'Remove it →' }).click();
    await page.waitForTimeout(1500); // allow worker roundtrip now that it's enabled

    const toggle = page.getByRole('button', { name: /Remove white background/ }).locator('xpath=following-sibling::button | .').first();
    // Simpler: check aria-pressed via the toggle button itself.
    const pressed = await page.locator('button[aria-pressed]').getAttribute('aria-pressed');
    results.push({ test: 'C1-toggle-flipped-on', pass: pressed === 'true', detail: { pressed } });

    const detailsOpen = await page.evaluate(() => {
      const d = Array.from(document.querySelectorAll('details')).find(el => el.querySelector('summary')?.textContent?.includes('Advanced options'));
      return d ? d.open : null;
    });
    results.push({ test: 'C2-advanced-accordion-opened', pass: detailsOpen === true, detail: { detailsOpen } });

    const warningVisible = await page.getByText('Light areas touching the edge of your image may also be removed.').isVisible().catch(() => false);
    results.push({ test: 'C3-edge-warning-visible-when-on', pass: warningVisible === true, detail: { warningVisible } });

    const workersAfterEnable = workersCreated.filter(u => u.includes('bg-remove-worker'));
    results.push({ test: 'C4-worker-created-once-enabled', pass: workersAfterEnable.length > 0, detail: { workersAfterEnable } });

    await page.close();
  }

  // --- Test B2: normal (content-filling) image => no suggestion banner ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
    const workersCreated = [];
    page.on('worker', (w) => workersCreated.push(w.url()));
    const imgPath = await makeTestImage(page, { name: 'normal', w: 900, h: 900, subjectSize: 850, bg: '#3366CC' });
    await uploadViaFullSheet(page, imgPath);
    const bannerVisible = await page.getByText('This image has a white background', { exact: false }).isVisible().catch(() => false);
    results.push({ test: 'B1-no-suggestion-for-normal-image', pass: bannerVisible === false, detail: { bannerVisible } });
    const bgWorkerRequests = workersCreated.filter(u => u.includes('bg-remove-worker'));
    results.push({ test: 'B2-no-worker-for-normal-image', pass: bgWorkerRequests.length === 0, detail: { workersCreated } });
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
