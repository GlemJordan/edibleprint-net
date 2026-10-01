// Verifies that an image the customer has positioned/zoomed in the editor
// stays exactly where they put it when the browser viewport changes size.
//
// Reported bug (Oct 2026, Android Chrome, Custom 5.7"×8.6"): scrolling down
// made the image slide out of the dashed frame, leaving a white strip along
// the bottom/right; scrolling back up put it back. Cause: Chrome's address
// bar collapses on scroll, which fires a height-only `resize`. The editor fed
// window.innerHeight into computeCanvasSize(), so the canvas changed size on
// every scroll, but a layer the customer had adjusted (_userAdjusted) kept
// its old pixel x/y/scale — and the hi-res print raster is derived from those
// same numbers (scaleFactor = hiResW / canvasW), so the printed file could
// come out misaligned too.
//
// Scenarios:
//   A. Touch device: a height-only viewport change (address bar collapse)
//      must not resize the canvas at all, and the image must not move.
//   B. Desktop: a real window resize DOES resize the canvas — an adjusted
//      image must scale with it and keep the same relative position.
//   C. Changing the size after adjusting re-fits the image (by design), and
//      that re-fit must be against the NEW canvas, i.e. centered.
import { launchBrowser, hydrated } from './_stress.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-vp-'));

const SUBJECT = { r: 255, g: 0, b: 255 };
const SUBJECT_LUMA = 0.2126 * SUBJECT.r + 0.7152 * SUBJECT.g + 0.0722 * SUBJECT.b;
const LUMA_TOL = 30;

async function makeTestImage(page) {
  // Full-bleed magenta with a thin white frame: once the layer is zoomed
  // and dragged off-center, its bounding box pins down position AND scale.
  const dataUrl = await page.evaluate(({ subject }) => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1600;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = `rgb(${subject.r},${subject.g},${subject.b})`;
    ctx.fillRect(200, 200, 800, 1200);
    return c.toDataURL('image/png');
  }, { subject: SUBJECT });
  const filePath = path.join(TMP_DIR, 'subject.png');
  fs.writeFileSync(filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return filePath;
}

// Subject bounding box as fractions of the visible editor canvas (0..1), so
// two measurements taken at different canvas sizes are directly comparable.
async function measure(page) {
  return page.evaluate(({ targetLuma, tol }) => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find(c => c.style.display !== 'none');
    if (!canvas) return null;
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] <= 200) continue;
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (Math.abs(luma - targetLuma) > tol) continue;
        found++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return {
      found,
      cssW: parseFloat(canvas.style.width), cssH: parseFloat(canvas.style.height),
      box: found ? { l: minX / width, t: minY / height, r: (maxX + 1) / width, b: (maxY + 1) / height } : null,
    };
  }, { targetLuma: SUBJECT_LUMA, tol: LUMA_TOL });
}

function boxDelta(a, b) {
  return Math.max(Math.abs(a.l - b.l), Math.abs(a.t - b.t), Math.abs(a.r - b.r), Math.abs(a.b - b.b));
}

async function openCustomEditor(page, imgPath, w, h) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const link = page.locator('footer').getByText('Full Sheet Prints', { exact: true });
  await hydrated(page, link);
  await link.click();
  await page.locator('input[type="file"][accept="image/*,.pdf"]').setInputFiles(imgPath);
  await page.waitForSelector('canvas', { state: 'attached' });
  const customBtn = page.locator('button').filter({ hasText: /^✏️\s*Custom$/ });
  await hydrated(page, customBtn);
  await customBtn.click();
  await setCustomSize(page, w, h);
}

async function setCustomSize(page, w, h) {
  await page.getByPlaceholder('e.g. 5').fill(String(w));
  await page.getByPlaceholder('e.g. 7').fill(String(h));
  await page.waitForTimeout(900);
}

// Zoom out one step and drag the image toward the top-left, the way a
// customer would frame a design — this is what marks the layer
// _userAdjusted. (Zooming OUT keeps the subject's edges inside the canvas,
// so the measured box actually reflects position and scale; one "+" step is
// a tenth of the whole log range and would just flood the canvas.)
async function adjustImage(page) {
  const panel = page.getByText('Watermark shown only in preview').locator('xpath=following-sibling::div[1]');
  const minus = panel.locator('button').filter({ hasText: '−' }).first();
  await minus.click();
  await page.waitForTimeout(150);
  const canvas = page.locator('canvas').first();
  // Center it in the viewport first: on a phone it can sit under the sticky
  // header, and a press there lands on the logo link instead of the canvas.
  await canvas.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const bb = await canvas.boundingBox();
  const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - bb.width * 0.08, cy - bb.height * 0.06, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

const TOL = 0.006; // ~0.6% of the canvas (≈2px) — rounding headroom only

(async () => {
  // CHROMIUM_PATH: point at a preinstalled Chromium when Playwright's own
  // download isn't available (e.g. sandboxed CI images).
  const browser = await launchBrowser(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined);
  const results = [];
  const record = (name, pass, detail) => results.push({ name, status: pass ? 'PASS' : 'FAIL', ...detail });

  // ── A. Touch device, address bar collapse (height-only resize) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const img = await makeTestImage(page);
    try {
      await openCustomEditor(page, img, 5.7, 8.6);
      await adjustImage(page);
      const before = await measure(page);
      await page.setViewportSize({ width: 412, height: 840 }); // bar hidden
      await page.waitForTimeout(900);
      const hidden = await measure(page);
      await page.setViewportSize({ width: 412, height: 760 }); // bar back
      await page.waitForTimeout(900);
      const shown = await measure(page);
      const sameSize = before.cssW === hidden.cssW && before.cssH === hidden.cssH;
      const d1 = boxDelta(before.box, hidden.box), d2 = boxDelta(before.box, shown.box);
      record('A-touch-addressbar-canvas-stable', sameSize, { before: [before.cssW, before.cssH], hidden: [hidden.cssW, hidden.cssH] });
      record('A-touch-addressbar-image-stays', d1 <= TOL && d2 <= TOL, { d1: d1.toFixed(4), d2: d2.toFixed(4), before: before.box, hidden: hidden.box });
    } catch (err) {
      record('A-touch-addressbar', false, { error: String(err.message || err).slice(0, 300) });
    }
    await ctx.close();
  }

  // ── B. Desktop window resize: canvas changes, adjusted image follows ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const img = await makeTestImage(page);
    try {
      await openCustomEditor(page, img, 5.7, 8.6);
      await adjustImage(page);
      const before = await measure(page);
      await page.setViewportSize({ width: 1280, height: 780 });
      await page.waitForTimeout(900);
      const after = await measure(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(900);
      const back = await measure(page);
      const resized = before.cssH !== after.cssH;
      const d1 = boxDelta(before.box, after.box), d2 = boxDelta(before.box, back.box);
      record('B-desktop-resize-canvas-did-resize', resized, { before: [before.cssW, before.cssH], after: [after.cssW, after.cssH] });
      record('B-desktop-resize-image-keeps-relative-position', d1 <= TOL && d2 <= TOL, { d1: d1.toFixed(4), d2: d2.toFixed(4), before: before.box, after: after.box });
    } catch (err) {
      record('B-desktop-resize', false, { error: String(err.message || err).slice(0, 300) });
    }
    await ctx.close();
  }

  // ── C. Size change after adjusting → re-fit centered on the NEW canvas ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const img = await makeTestImage(page);
    try {
      await openCustomEditor(page, img, 5.7, 8.6);
      await adjustImage(page);
      await setCustomSize(page, 5, 9.5);
      const m = await measure(page);
      const cx = (m.box.l + m.box.r) / 2, cy = (m.box.t + m.box.b) / 2;
      const off = Math.max(Math.abs(cx - 0.5), Math.abs(cy - 0.5));
      record('C-size-change-refits-centered', off <= TOL, { center: [cx.toFixed(4), cy.toFixed(4)], canvas: [m.cssW, m.cssH] });
    } catch (err) {
      record('C-size-change', false, { error: String(err.message || err).slice(0, 300) });
    }
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(r => r.status !== 'PASS');
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})();
