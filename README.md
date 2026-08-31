This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

End-to-end checks live in `tests/` and run with [Playwright](https://playwright.dev) against a **running dev server** — they don't start one themselves:

```bash
npm run dev          # in one terminal
npm run test:e2e     # in another — runs the default suite
```

`test:e2e` targets `http://localhost:3000` by default; override with `BASE_URL` (e.g. `BASE_URL=http://localhost:3001 npm run test:e2e`).

### What runs by default vs. opt-in

- **Default suite** (`tests/run-all.mjs`'s `DEFAULT_TESTS`) — fast, isolated checks, no external services touched.
- **`RUN_LIVE=1 npm run test:e2e`** additionally runs `upload-flow-stage3.mjs`, which hits **real Cloudinary and Stripe**: it uploads one small, clearly-named test asset to the real Cloudinary account (identifiable/deletable by its timestamp prefix) and creates a real, unpaid, self-expiring Stripe Checkout Session — it never completes a payment. Run this deliberately; there's no CI wired up to run it automatically, and it shouldn't be added without first deciding who owns cleaning up the Cloudinary assets it leaves behind.
- **`admin-ui.mjs`** is skipped unconditionally — it depends on a since-deleted debug route. See its header comment to revive it.

### Pre-commit check

A git hook at `.githooks/pre-commit` runs the default suite automatically before a commit that touches `app/`, `lib/`, or `tests/` — but only if a dev server is already reachable (it doesn't start one, to keep commits fast). It's **advisory, not blocking**: it prints the results and always lets the commit through, because three known-unrelated failures (below) would otherwise block every commit until they're fixed. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

(`npm install` also does this automatically via `postinstall`.)

### Known pre-existing test failures

These fail today regardless of what you're changing. If a suite run reports anything **beyond** this list, that's a real regression — not one of these.

| File | Failing case(s) | Why |
|---|---|---|
| `image-centering.mjs` | all 5 "Wafer Paper" cases — `ERROR`, `locator.click: Timeout ... waiting for locator('footer').getByText('Wafer Paper Prints')` | The footer text this test waits for no longer matches what's rendered — likely drifted in a later copy change. Needs the selector (or the footer copy) reconciled. |
| `editor-regression.mjs` | `5-shape-selector-present` | `getByRole('button', { name: /Round/ })` now matches more than one button on the page (a strict-mode violation, silently caught by `.catch(() => false)`) — not that the shape selector is actually missing. Needs `.first()` or a tighter name match. |
| `upload-flow-stage1.mjs` | `8-switching-sheet-type-updates-price` | Asserts a literal `$12.99` Wafer Paper price next to the button; likely stale against the current `CATALOG_PRICES` value. Needs the assertion to read the price from the catalog instead of a hardcoded string. |

All three are unrelated to whatever upload-review or editor work is in flight — confirmed by running each against the commit before that work started.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
