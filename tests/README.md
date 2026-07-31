# Playwright verification scripts

Standalone scripts written while building/fixing specific features. Each one
drives a real browser against a running dev server and checks real DOM/network
state — not a mocked test suite. Every script has a header comment describing
exactly what it covers.

## Prerequisites

- A dev server running at `http://localhost:3000` (`npm run dev` in another
  terminal), or pass `BASE_URL=https://...` to point at somewhere else.
- `npm install` (installs `playwright`; run `npx playwright install chromium`
  once if this machine has never run Playwright's browsers before).

## Running

```
npm run test:e2e
```

Runs everything in `DEFAULT_TESTS` in `run-all.mjs` and prints a pass/fail
summary. Exits non-zero if any of them fail.

Run a single script directly instead: `node tests/upload-flow-stage2.mjs`.

## Known false positive

- **`editor-regression.mjs`** reliably scores 4/5, not 5/5 — test
  `5-shape-selector-present` has a pre-existing selector-ambiguity issue in
  the script itself (unrelated to the app), seen consistently across every
  run in the sessions that used this suite. The script still exits non-zero
  because of it, so `npm run test:e2e` will show this suite as FAIL even when
  everything it actually covers is fine — check the 4/5 breakdown, not just
  the exit code.

## Exceptions

- **`upload-flow-stage3.mjs`** — hits real Cloudinary (uploads one small,
  clearly-named test asset) and creates a real, unpaid Stripe Checkout
  Session (self-expires, never charged). Skipped by default; set `RUN_LIVE=1`
  to include it in `npm run test:e2e`, or run it directly.
- **`admin-ui.mjs`** — currently broken: depends on a temporary
  `/api/debug-mint-cookie` route and a hardcoded test order id, both created
  ad hoc during the original admin-UI work and deleted afterward. Kept for
  reference; see the note at the top of the file for what it'd take to revive.
