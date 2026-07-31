// Shared by the webhook's order pipeline and anything that replays part of
// it (the admin "regenerate PDF" action) — a single retry policy instead of
// two copies that could drift.
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function withRetry(fn, label) {
  const delays = [2000, 8000, 20000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === delays.length) throw err;
      console.warn(`[${label}] attempt ${attempt + 1} failed, retrying in ${delays[attempt]}ms:`, err.message);
      await sleep(delays[attempt]);
    }
  }
}
