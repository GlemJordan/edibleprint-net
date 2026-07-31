// Runs the Playwright verification scripts in this folder against a dev
// server at BASE_URL (default http://localhost:3000 — start one with
// `npm run dev` first). Each script is standalone (see its own header
// comment for what it covers) and exits 0/1 on its own; this just sequences
// them and rolls up one pass/fail summary.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Run by default, in order (fast/isolated checks first).
const DEFAULT_TESTS = [
  'image-centering.mjs',
  'whitebg-default.mjs',
  'editor-regression.mjs',
  'upload-flow-stage1.mjs',
  'upload-flow-stage2.mjs',
  'print-preview-mobile.mjs',
];

// Hits real Cloudinary + creates a real (unpaid, self-expiring) Stripe
// Checkout Session — see its own header comment. Opt in with RUN_LIVE=1.
const LIVE_TESTS = [
  'upload-flow-stage3.mjs',
];

// Depends on a since-deleted temp debug route — see its own header comment.
// Not runnable until revived; skipped even with RUN_LIVE=1.
const BROKEN_TESTS = [
  'admin-ui.mjs',
];

const toRun = [...DEFAULT_TESTS, ...(process.env.RUN_LIVE ? LIVE_TESTS : [])];

if (!process.env.RUN_LIVE) {
  console.log(`(skipping ${LIVE_TESTS.join(', ')} — hits real Cloudinary/Stripe; set RUN_LIVE=1 to include)`);
}
console.log(`(skipping ${BROKEN_TESTS.join(', ')} — known broken, see its header comment)\n`);

const results = [];
for (const file of toRun) {
  console.log(`\n=== ${file} ===`);
  const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
    env: process.env,
  });
  results.push({ file, pass: res.status === 0 });
}

console.log('\n=== SUMMARY ===');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.file}`);
}
const failures = results.filter(r => !r.pass);
console.log(`\n${results.length - failures.length}/${results.length} suites passed.`);
process.exit(failures.length ? 1 : 0);
