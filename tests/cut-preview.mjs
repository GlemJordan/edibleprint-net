// "Cut to shape" preview: what ticking "Cut to shape (plotter)" shows the
// customer — each piece on its clear plastic backing, no dashed guide — in
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
const CUT_BOX_RE = /^Cut to shape \(plotter\)/;
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
    const cutBox = page.getByLabel(CUT_BOX_RE);
    await cutBox.check();
    await page.waitForTimeout(900);

    check(`${name}: the guide checkbox is disabled once cut is ticked`, !(await page.getByLabel(/Add a cut guide/).isEnabled()));
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

    // Untick: overlay/caption gone immediately, guide checkbox re-enabled.
    await cutBox.uncheck();
    await page.waitForTimeout(700);
    check(`${name}: unticking removes the overlay canvas`, await backingPixelCount(page) === -1);
    check(`${name}: unticking removes the caption`, await page.getByText(CAPTION, { exact: true }).count() === 0);
    check(`${name}: unticking re-enables the guide checkbox`, await page.getByLabel(/Add a cut guide/).isEnabled());
    const hiAfterOff = await hiResDataUrl(page);
    check(`${name}: hi-res raster round-trips back identical after unticking`, hiAfterOff === hiBefore);

    check(`${name}: no page errors`, problems.length === 0, problems);
    await ctx.close();
  }

  // ── A light drag with cut active must not crash or leave the overlay stuck ──
  {
    const { page, ctx, problems } = await openEditor(browser);
    await page.getByRole('button', { name: /Round/ }).first().click();
    await page.waitForTimeout(600);
    await page.getByLabel(CUT_BOX_RE).check();
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
