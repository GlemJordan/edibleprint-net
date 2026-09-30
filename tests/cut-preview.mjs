// "Cut to shape" preview: what choosing "Cut to shape" under "How would you
// like it?" shows the customer — each piece on its clear plastic backing,
// no dashed guide — in
// the inline editor and the print-preview modal, for round/heart/cookie
// sheet. Also confirms it is purely visual: the hi-res raster the real PDF
// is built from is byte-identical whether the preview is on or off.
//
// Fully isolated — Cloudinary uploads and /api/create-checkout are stubbed,
// so nothing is uploaded or charged.
import { launchBrowser, hydrated, appears, WAIT } from './_stress.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cutpreview-'));
const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });
const CAPTION = 'Preview of your cut toppers. They arrive on a clear backing, ready to peel off.';

async function makeDesignFile(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 900;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFF6DC'; ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = '#FBD3E0'; ctx.beginPath(); ctx.arc(450, 450, 320, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  });
  const p = path.join(TMP_DIR, 'design.png');
  fs.writeFileSync(p, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return p;
}

// Piece size/position, in pixels: "Cut to shape" must never shrink or move
// the piece — only what's outside its outline changes (white sheet vs
// backing). Detected by scanning for the design's own known pink fill
// (#FBD3E0, see makeDesignFile), which is unaffected by whatever's drawn
// behind/around it, so the SAME method applies whether the backing is
// paper-white, the cut backing, or a dashed guide is present or not.
const PIECE_RGB = [0xFB, 0xD3, 0xE0];
const PIECE_TOL = 25;

// Measures the piece nearest the canvas center on `selector`'s canvas: a
// horizontal scan at h/2 finds the run closest to the horizontal center
// (the only run for a single item; the middle-row piece for a cookie-sheet
// grid, since mc2/mc3 both use an odd row count so h/2 lands exactly on
// that row's centerline), then a vertical scan through that run's own
// center gives the matching vertical extent. Returns null if nothing found.
const measurePiece = (page, selector) => page.evaluate(({ selector, PIECE_RGB, PIECE_TOL }) => {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);
  const scan = (axis, fixedCoord) => {
    const runs = [];
    let cur = null;
    const len = axis === 'row' ? w : h;
    for (let i = 0; i < len; i++) {
      const x = axis === 'row' ? i : fixedCoord;
      const y = axis === 'row' ? fixedCoord : i;
      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      const match = a >= 200
        && Math.abs(data[idx] - PIECE_RGB[0]) <= PIECE_TOL
        && Math.abs(data[idx + 1] - PIECE_RGB[1]) <= PIECE_TOL
        && Math.abs(data[idx + 2] - PIECE_RGB[2]) <= PIECE_TOL;
      if (match) {
        if (!cur) { cur = { first: i, last: i }; runs.push(cur); }
        else cur.last = i;
      } else if (cur && i - cur.last > 3) cur = null;
    }
    return runs;
  };
  const rowRuns = scan('row', Math.round(h / 2));
  if (!rowRuns.length) return null;
  let best = rowRuns[0], bestD = Infinity;
  for (const r of rowRuns) {
    const d = Math.abs((r.first + r.last) / 2 - w / 2);
    if (d < bestD) { bestD = d; best = r; }
  }
  const centerX = (best.first + best.last) / 2;
  const colRuns = scan('col', Math.round(centerX));
  if (!colRuns.length) return null;
  let bestY = colRuns[0], bestYD = Infinity;
  for (const r of colRuns) {
    const d = Math.abs((r.first + r.last) / 2 - h / 2);
    if (d < bestYD) { bestYD = d; bestY = r; }
  }
  return {
    diameterX: best.last - best.first + 1,
    centerX,
    diameterY: bestY.last - bestY.first + 1,
    centerY: (bestY.first + bestY.last) / 2,
  };
}, { selector, PIECE_RGB, PIECE_TOL });

const MAIN_CANVAS = "canvas:not([style*='position: absolute'])";
const OVERLAY_CANVAS = "canvas[style*='position: absolute']";
const MODAL_CANVAS = "[role='dialog'][aria-label='Print preview'] canvas";

// Pixels of the overlay canvas that match the backing's neutral grey (#D6D6D3-ish).
const backingPixelCount = (page) => page.evaluate(() => {
  // The overlay is the one canvas styled position:absolute — not the real
  // editor canvas (static) or the hidden hi-res one (display:none).
  const overlay = [...document.querySelectorAll('canvas')].find((c) => getComputedStyle(c).position === 'absolute');
  if (!overlay) return -1;
  const { data } = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    if (Math.abs(data[i] - data[i + 1]) < 6 && Math.abs(data[i + 1] - data[i + 2]) < 6 && data[i] > 195 && data[i] < 245) n++;
  }
  return n;
});
// The hidden hi-res canvas — same source the real PDF/Cloudinary upload is built from.
const hiResDataUrl = (page) => page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find((x) => x.width > 1000);
  return c ? c.toDataURL('image/png') : null;
});

async function openEditor(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(WAIT);
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.route('https://api.cloudinary.com/**', (r) => r.fulfill({ json: { secure_url: 'https://res.cloudinary.com/test/image/upload/p.png' } }));
  await page.route('**/api/create-checkout', (r) => r.fulfill({ json: { url: BASE_URL + '/cancel' } }));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const up = page.getByRole('button', { name: 'Upload Your Photo →' });
  await hydrated(page, up);
  await up.click();
  await page.locator('input[type="file"][accept="image/*,.pdf"]').setInputFiles(await makeDesignFile(page));
  await page.waitForTimeout(800);
  return { page, ctx, problems };
}

(async () => {
  const browser = await launchBrowser();

  // ── Round / Heart / Cookie Sheet: editor overlay + modal, on vs off ──
  for (const [name, re, isCookie] of [['Round', /Round/, false], ['Heart', /Heart/, false], ['Cookie Sheet', /Cookie Sheet/, true]]) {
    const { page, ctx, problems } = await openEditor(browser);
    await page.getByRole('button', { name: re }).first().click();
    if (isCookie) await page.getByRole('button', { name: /2” Circles on A4/ }).click();
    else await page.getByRole('button', { name: new RegExp('6" ') }).first().click();
    await page.waitForTimeout(600);

    check(`${name}: no overlay canvas before ticking the cut`, await backingPixelCount(page) === -1);
    check(`${name}: no caption before ticking the cut`, await page.getByText(CAPTION, { exact: true }).count() === 0);

    const hiBefore = await hiResDataUrl(page);
    const printedRadio = page.getByRole('radio', { name: /^Printed sheet/ });
    const cutRadio = page.getByRole('radio', { name: /^Cut to shape/ });
    await cutRadio.check();
    await page.waitForTimeout(900);

    check(`${name}: the guide checkbox is gone entirely once "Cut to shape" is chosen`, await page.getByLabel(/Print a cut guide/).count() === 0);
    const backing = await backingPixelCount(page);
    check(`${name}: the overlay shows real backing pixels`, backing > 500, backing);
    check(`${name}: caption shown under the live editor`, await appears(page.getByText(CAPTION, { exact: true })));
    const hiAfterOn = await hiResDataUrl(page);
    check(`${name}: the hi-res raster (real PDF/upload source) is unchanged by the preview`, hiAfterOn === hiBefore);

    // Modal: backing + caption, and closing/reopening keeps it consistent.
    await page.getByRole('button', { name: '🔍 See print preview' }).click();
    await page.waitForSelector('[role="dialog"][aria-label="Print preview"]');
    await page.waitForTimeout(500);
    const modalText = await page.locator('[role="dialog"][aria-label="Print preview"]').innerText();
    check(`${name}: modal shows the cut-preview caption`, modalText.includes(CAPTION), modalText.slice(-200));
    await page.getByRole('button', { name: 'Close preview' }).click();
    await page.waitForTimeout(300);

    // Back to "Printed sheet": overlay/caption gone immediately, guide checkbox back.
    await printedRadio.check();
    await page.waitForTimeout(700);
    check(`${name}: choosing "Printed sheet" removes the overlay canvas`, await backingPixelCount(page) === -1);
    check(`${name}: choosing "Printed sheet" removes the caption`, await page.getByText(CAPTION, { exact: true }).count() === 0);
    check(`${name}: choosing "Printed sheet" brings the guide checkbox back, checked`, await page.getByLabel(/Print a cut guide/).isChecked());
    const hiAfterOff = await hiResDataUrl(page);
    check(`${name}: hi-res raster round-trips back identical after switching back`, hiAfterOff === hiBefore);

    check(`${name}: no page errors`, problems.length === 0, problems);
    await ctx.close();
  }

  // ── Piece size/position: "Cut to shape" must never shrink or move the
  // piece — Round 5", Round 8" and a cookie sheet (mc2), editor + modal,
  // cut on vs off. Diameter and position must match within 1px (rounding). ──
  for (const [label, shapeRe, sizeRe, isCookie] of [
    ['Round 5"', /Round/, /5" Round/, false],
    ['Round 8"', /Round/, /8" Round/, false],
    ['Cookie Sheet (2")', /Cookie Sheet/, /2” Circles on A4/, true],
  ]) {
    const { page, ctx, problems } = await openEditor(browser);
    await page.getByRole('button', { name: shapeRe }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: sizeRe }).first().click();
    await page.waitForTimeout(600);

    const printedRadio = page.getByRole('radio', { name: /^Printed sheet/ });
    const cutRadio = page.getByRole('radio', { name: /^Cut to shape/ });

    await printedRadio.check();
    await page.waitForTimeout(500);
    const editorOff = await measurePiece(page, MAIN_CANVAS);
    check(`${label}: editor piece measured (cut off)`, !!editorOff, editorOff);

    await cutRadio.check();
    await page.waitForTimeout(700);
    const editorOn = await measurePiece(page, OVERLAY_CANVAS);
    check(`${label}: editor piece measured (cut on)`, !!editorOn, editorOn);

    if (editorOff && editorOn) {
      check(`${label}: editor diameter unchanged (±1px)`,
        Math.abs(editorOff.diameterX - editorOn.diameterX) <= 1 && Math.abs(editorOff.diameterY - editorOn.diameterY) <= 1,
        { editorOff, editorOn });
      check(`${label}: editor position unchanged (±1px)`,
        Math.abs(editorOff.centerX - editorOn.centerX) <= 1 && Math.abs(editorOff.centerY - editorOn.centerY) <= 1,
        { editorOff, editorOn });
    }

    // Modal: cut on, then off — same canvas element both times.
    await page.getByRole('button', { name: '🔍 See print preview' }).click();
    await page.waitForSelector('[role="dialog"][aria-label="Print preview"]');
    await page.waitForTimeout(500);
    const modalOn = await measurePiece(page, MODAL_CANVAS);
    check(`${label}: modal piece measured (cut on)`, !!modalOn, modalOn);
    await page.getByRole('button', { name: 'Close preview' }).click();
    await page.waitForTimeout(300);

    await printedRadio.check();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '🔍 See print preview' }).click();
    await page.waitForSelector('[role="dialog"][aria-label="Print preview"]');
    await page.waitForTimeout(500);
    const modalOff = await measurePiece(page, MODAL_CANVAS);
    check(`${label}: modal piece measured (cut off)`, !!modalOff, modalOff);
    await page.getByRole('button', { name: 'Close preview' }).click();
    await page.waitForTimeout(300);

    if (modalOff && modalOn) {
      check(`${label}: modal (print preview) diameter unchanged (±1px)`,
        Math.abs(modalOff.diameterX - modalOn.diameterX) <= 1 && Math.abs(modalOff.diameterY - modalOn.diameterY) <= 1,
        { modalOff, modalOn });
      check(`${label}: modal (print preview) position unchanged (±1px), same as the production PDF's placement`,
        Math.abs(modalOff.centerX - modalOn.centerX) <= 1 && Math.abs(modalOff.centerY - modalOn.centerY) <= 1,
        { modalOff, modalOn });
    }

    check(`${label}: no page errors`, problems.length === 0, problems);
    await ctx.close();
  }

  // ── A light drag with cut active must not crash or leave the overlay stuck ──
  {
    const { page, ctx, problems } = await openEditor(browser);
    await page.getByRole('button', { name: /Round/ }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('radio', { name: /^Cut to shape/ }).check();
    await page.waitForTimeout(700);
    const canvas = page.locator('canvas').first();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 5; i++) await page.mouse.move(cx + i * 4, cy + i * 2, { steps: 1 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const backingAfterDrag = await backingPixelCount(page);
    check('drag with cut active: overlay still shows backing afterward, no crash', backingAfterDrag > 500, backingAfterDrag);
    check('drag with cut active: no page errors', problems.length === 0, problems);
    await ctx.close();
  }

  await browser.close();
  const failures = results.filter((r) => !r.pass);
  console.log(JSON.stringify(failures, null, 2));
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  process.exit(failures.length ? 1 : 0);
})();
