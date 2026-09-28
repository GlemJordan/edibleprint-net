// Shared by the browser tests: launches Chromium, and — only when
// EP_CPU_THROTTLE is set above 1 — slows the CPU of every page it creates by that
// factor (Chrome DevTools "CPU throttling"). That stretches hydration, rendering
// and validation the way a cold dev server or a slow machine does, which is how
// tests that assume a page is ready after a fixed delay get caught:
//
//   EP_CPU_THROTTLE=6  node tests/<test>.mjs     # a slow machine
//   EP_CPU_THROTTLE=20 node tests/<test>.mjs     # extreme; a test must still pass, just slower
//
// With the variable unset it is chromium.launch() plus the WAIT ceiling below.
import { chromium } from 'playwright';

export const CPU_THROTTLE = Number(process.env.EP_CPU_THROTTLE || 1);

// Ceiling for every wait a test does: only ever reached when something is
// actually broken, so a healthy run isn't slowed. (Playwright's default is 30 s,
// which a heavily loaded page can legitimately exceed.)
export const WAIT = 90000;

/**
 * Waits until React has hydrated `locator`'s element. The server-rendered HTML
 * shows a button long before its click handler exists, so a click (or typing into
 * a controlled input) right after "network idle" can silently do nothing — the
 * cause of slow-page failures in this suite. React marks a hydrated node with a
 * __reactProps$… key.
 */
export async function hydrated(page, locator) {
  const handle = await locator.elementHandle({ timeout: WAIT });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith('__reactProps$')), handle, { timeout: WAIT });
}

/**
 * True once `locator` becomes visible, false if it never does within WAIT. For
 * checks that record "was X shown?": waits for the condition instead of sampling
 * it after a fixed delay, so a slow page isn't reported as a missing feature.
 */
export async function appears(locator) {
  return locator.waitFor({ state: 'visible', timeout: WAIT }).then(() => true, () => false);
}

async function throttle(page) {
  await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
}

export async function launchBrowser(options) {
  const browser = await chromium.launch(options);
  const slow = CPU_THROTTLE > 1;

  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (opts) => {
    const page = await newPage(opts);
    page.setDefaultTimeout(WAIT);
    if (slow) await throttle(page);
    return page;
  };

  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts) => {
    const context = await newContext(opts);
    context.setDefaultTimeout(WAIT);
    if (slow) {
      const contextNewPage = context.newPage.bind(context);
      context.newPage = async () => { const page = await contextNewPage(); await throttle(page); return page; };
    }
    return context;
  };
  return browser;
}
