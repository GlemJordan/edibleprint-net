// Verifies that a newly-uploaded image is centered in the editor canvas
// regardless of content (white margins, transparency, extreme aspect
// ratios), across all 7 catalog shapes. Confirms/refutes the fix in
// app/page.js (drawLayers now sizes off native image dimensions instead of
// whatever bitmap getImg() happens to return).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-imgs-'));

// A distinct subject color. Detection is luma-based so it survives the
// B&W Sheet's grayscale canvas filter too.
const SUBJECT = { r: 255, g: 0, b: 255 }; // magenta, luma ~= 72.6
const SUBJECT_LUMA = 0.2126 * SUBJECT.r + 0.7152 * SUBJECT.g + 0.0722 * SUBJECT.b;
const LUMA_TOL = 30;

async function makeTestImage(page, { name, w, h, subjectSize, bg }) {
  const dataUrl = await page.evaluate(({ w, h, subjectSize, bg, subject }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (bg === 'transparent') {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = `rgb(${subject.r},${subject.g},${subject.b})`;
    const sx = (w - subjectSize) / 2, sy = (h - subjectSize) / 2;
    ctx.fillRect(sx, sy, subjectSize, subjectSize);
    return c.toDataURL('image/png');
  }, { w, h, subjectSize, bg, subject: SUBJECT });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const filePath = path.join(TMP_DIR, name + '.png');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

// Reads the visible editor canvas's backing store and returns the bounding
// box (backing-store pixel space) of pixels matching SUBJECT color by luma
// (works whether or not a grayscale canvas filter was applied, e.g. B&W Sheet).
async function measureSubjectCenter(page) {
  return page.evaluate(({ targetLuma, tol }) => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const canvas = canvases.find(c => c.style.display !== 'none');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = data[i + 3];
        if (alpha <= 200) continue;
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (Math.abs(luma - targetLuma) <= tol) {
          found++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (found === 0) return { found: 0, canvasW: width, canvasH: height };
    return {
      found,
      canvasW: width, canvasH: height,
      subjectCenterX: (minX + maxX) / 2,
      subjectCenterY: (minY + maxY) / 2,
      bbox: { minX, minY, maxX, maxY },
    };
  }, { targetLuma: SUBJECT_LUMA, tol: LUMA_TOL });
}

// Each shape resolved via an unambiguous, scoped click path.
const SHAPES = [
  { label: 'Round', via: 'footer', text: 'Round Cake Toppers' },
  { label: 'Heart', via: 'footer', text: 'Heart Cake Toppers' },
  { label: 'Square', via: 'footer', text: 'Square Prints' },
  { label: 'Cookie Sheets', via: 'footer', text: 'Cookie Sheets' },
  { label: 'Full Sheet', via: 'footer', text: 'Full Sheet Prints' },
  // No 'Wafer Paper' entry: it's no longer a selectable shape/footer link —
  // see lib/material-config.js. Wafer is now a material choice cross-cutting
  // shapes (MaterialPicker), which doesn't affect centering, so there's no
  // equivalent case to test here. Same treatment tests/print-preview-mobile.mjs
  // got when the same refactor landed (commit 4753c99).
  { label: 'B&W Sheet', via: 'pricing-tab', tabText: 'B&W Sheet', cardText: '6.5"×6.5" B&W Square' },
];

const CASES = [
  { name: 'normal', w: 900, h: 900, subjectSize: 700, bg: '#FFFFFF' },
  { name: 'lots-of-white', w: 1400, h: 1400, subjectSize: 120, bg: '#FFFFFF' },
  { name: 'transparent-margin', w: 1400, h: 1400, subjectSize: 120, bg: 'transparent' },
  { name: 'very-wide', w: 1800, h: 400, subjectSize: 120, bg: '#FFFFFF' },
  { name: 'very-tall', w: 400, h: 1800, subjectSize: 120, bg: '#FFFFFF' },
];

async function selectShapeAndUpload(page, shape, imagePath) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  if (shape.via === 'footer') {
    await page.locator('footer').getByText(shape.text, { exact: true }).click();
  } else {
    await page.locator('#pricing').getByRole('button', { name: shape.tabText, exact: true }).click();
    await page.waitForTimeout(150);
    await page.locator('#pricing').getByText(shape.cardText, { exact: true }).click();
  }
  const fileInput = page.locator('input[type="file"][accept="image/*,.pdf"]');
  await fileInput.setInputFiles(imagePath);
  await page.waitForSelector('canvas', { state: 'attached' });
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  const results = [];
  for (const shape of SHAPES) {
    for (const c of CASES) {
      const imgPath = await makeTestImage(page, c);
      try {
        await selectShapeAndUpload(page, shape, imgPath);
        const m = await measureSubjectCenter(page);
        if (!m || !m.found) {
          results.push({ shape: shape.label, case: c.name, status: 'NO_SUBJECT_FOUND', m });
          continue;
        }
        const expectedX = m.canvasW / 2;
        const expectedY = m.canvasH / 2;
        const dx = m.subjectCenterX - expectedX;
        const dy = m.subjectCenterY - expectedY;
        const tolPx = Math.max(6, 0.02 * Math.max(m.canvasW, m.canvasH));
        const pass = Math.abs(dx) <= tolPx && Math.abs(dy) <= tolPx;
        results.push({
          shape: shape.label, case: c.name, status: pass ? 'PASS' : 'FAIL',
          dx: dx.toFixed(1), dy: dy.toFixed(1), tolPx: tolPx.toFixed(1),
          canvasW: m.canvasW, canvasH: m.canvasH,
        });
      } catch (err) {
        results.push({ shape: shape.label, case: c.name, status: 'ERROR', error: String(err.message || err).slice(0, 200) });
      }
    }
  }

  await browser.close();

  const failures = results.filter(r => r.status !== 'PASS');
  console.log(JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  if (failures.length) {
    console.log(`${failures.length} FAILURES/ERRORS:`);
    failures.forEach(f => console.log(' -', JSON.stringify(f)));
    process.exit(1);
  }
  process.exit(0);
})();
