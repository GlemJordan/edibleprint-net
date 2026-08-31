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

A git hook at `.githooks/pre-commit` runs the default suite automatically before a commit that touches `app/`, `lib/`, or `tests/` — but only if a dev server is already reachable (it doesn't start one, to keep commits fast). It's **advisory, not blocking**: it prints the results and always lets the commit through, since it has no way to start a server on its own and shouldn't turn "no server running" into a blocked commit. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

(`npm install` also does this automatically via `postinstall`.)

### Known pre-existing test failures

None at the moment — the default suite is expected to pass in full (`DEFAULT_TESTS` in `tests/run-all.mjs`). If a suite run reports a failure, treat it as a real regression and update this section only once you've confirmed a failure is both pre-existing and out of scope for the change at hand (as opposed to just adding it here to make the noise go away).

Three did go stale before this note was written — all traced to the same cause (wafer paper moving from its own shape/footer link to a cross-shape material choice — see `lib/material-config.js` — without every test that referenced the old shape being updated to match): `image-centering.mjs`'s "Wafer Paper" case, `editor-regression.mjs`'s `/Round/` locator picking up wafer's now-gone footer entry as a false ambiguity source, and `upload-flow-stage1.mjs` asserting a per-material price that no longer exists. Fixed by dropping the retired shape/case where a direct precedent already existed in this repo (`tests/print-preview-mobile.mjs`, commit `4753c99`), tightening the `/Round/` locator with `.first()`, and rewriting the price assertion to check what's actually still true (material switch leaves price unchanged) instead of a value that was never coming back.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
