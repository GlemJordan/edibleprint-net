import { createHash } from 'crypto';

/**
 * Compute SHA-1 signature for Cloudinary signed uploads.
 * Excludes: file, api_key, resource_type, cloud_name per Cloudinary spec.
 */
function makeSignature(params, apiSecret) {
  const str = Object.entries(params)
    .filter(([k]) => !['file', 'api_key', 'resource_type', 'cloud_name'].includes(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return createHash('sha1').update(str + apiSecret).digest('hex');
}

/**
 * Cloudinary "context" is a pipe-separated key=value string; literal `|` and
 * `=` inside a value must be backslash-escaped or they'd be parsed as
 * delimiters.
 */
function escapeContextValue(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/=/g, '\\=');
}
function encodeContext(contextObj) {
  return Object.entries(contextObj)
    .map(([k, v]) => `${k}=${escapeContextValue(v)}`)
    .join('|');
}

function adminBasicAuthHeader() {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars missing: CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }
  return 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
}

/**
 * Upload a Buffer or string to Cloudinary as a raw resource (signed upload).
 * Works for JSON, PDF, TXT, and any binary data.
 *
 * @param {Buffer|Uint8Array|string} data
 * @param {string} publicId  e.g. "edibleprint/orders/EP-XXXX/order"
 * @param {Object} [context]  Optional light key-value metadata (e.g. for
 *   order.json: customerName/total/status/hasUploadDesign) attached to the
 *   Cloudinary resource itself, so the admin order list can read it via the
 *   Search API without fetching every order.json body — see
 *   searchOrders()/updateResourceContext() below. Omit for uploads that
 *   don't need it (production-slip.pdf, notes.txt, print-ready PDFs);
 *   existing callers are unaffected.
 * @returns {Promise<string>} secure_url
 */
export async function uploadRaw(data, publicId, context) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const contextStr = context && Object.keys(context).length ? encodeContext(context) : undefined;
  const sigParams = {
    invalidate: 1, overwrite: 1, public_id: publicId, timestamp,
    ...(contextStr ? { context: contextStr } : {}),
  };
  const signature = makeSignature(sigParams, apiSecret);

  const blob = data instanceof Uint8Array || Buffer.isBuffer(data)
    ? new Blob([data])
    : new Blob([String(data)]);

  const form = new FormData();
  form.append('file', blob, publicId.split('/').pop());
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', apiKey);
  form.append('signature', signature);
  form.append('invalidate', '1');
  form.append('overwrite', '1');
  if (contextStr) form.append('context', contextStr);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
    method: 'POST',
    body: form,
  });

  const result = await res.json();
  if (!result.secure_url) {
    throw new Error('Cloudinary upload failed for ' + publicId + ': ' + JSON.stringify(result));
  }
  return result.secure_url;
}

/**
 * Sign the parameters for a DIRECT browser-to-Cloudinary raw upload —
 * used when the file (e.g. a customer-supplied print-ready PDF, up to 25MB)
 * is too large to safely route through our own serverless function first
 * (Vercel serverless functions cap request bodies at ~4.5MB; routing a large
 * file through uploadRaw() above would fail well under our stated limit).
 * The browser POSTs the file straight to Cloudinary using these signed
 * params — our server never receives the file bytes at all, only issues the
 * signature, so there's no re-encoding/compression step anywhere in between.
 *
 * @param {string} publicId
 * @returns {{ cloudName: string, apiKey: string, timestamp: number, signature: string, publicId: string }}
 */
export function signRawUploadParams(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const sigParams = { invalidate: 1, overwrite: 1, public_id: publicId, timestamp };
  const signature = makeSignature(sigParams, apiSecret);

  return { cloudName, apiKey, timestamp, signature, publicId };
}

/**
 * Fetch the text content of a raw Cloudinary file by its public_id.
 * URL format: https://res.cloudinary.com/{cloud}/raw/upload/{public_id}
 *
 * @param {string} publicId
 * @returns {Promise<string>}
 */
export async function fetchRawText(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME not set');
  // Cache-busting query param, not just `cache: 'no-store'` (which only
  // controls OUR fetch cache) — Cloudinary's CDN can briefly still serve a
  // stale cached copy right after an overwrite+invalidate upload, observed
  // empirically while testing the admin order-status update. A unique query
  // string forces a distinct edge-cache key, so this always reaches origin.
  const url = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}?_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Cloudinary fetch "${publicId}" → ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Derive the public Cloudinary raw URL from a public_id.
 */
export function rawUrl(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}`;
}

/**
 * Build the Cloudinary folder public_id prefix for an order.
 * @param {string} orderId
 */
export function orderFolderPath(orderId) {
  return `edibleprint/orders/${orderId}`;
}

/**
 * Merge-add context key/values onto an EXISTING resource without touching
 * its file body or any other context keys. Used by updateOrderStatus() to
 * keep the searchable context.status in sync whenever the real status
 * (inside order.json) changes — the admin order list reads context only,
 * never the full order.json, so this sync is required, not optional.
 *
 * @param {string} publicId
 * @param {Object} context
 */
export async function updateResourceContext(publicId, context) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME not set');

  const form = new FormData();
  form.append('public_ids[]', publicId);
  form.append('context', encodeContext(context));
  form.append('command', 'add');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/context`, {
    method: 'POST',
    headers: { Authorization: adminBasicAuthHeader() },
    body: form,
  });
  const bodyText = await res.text();
  let result;
  try { result = JSON.parse(bodyText); } catch { result = { raw: bodyText.slice(0, 300) }; }
  if (!res.ok) {
    throw new Error('Cloudinary context update failed for ' + publicId + ' (HTTP ' + res.status + '): ' + JSON.stringify(result));
  }
  return result;
}

/**
 * Lists order.json resources via Cloudinary's Search API (Admin API, signed
 * with api_key:api_secret Basic auth — not the upload-signature mechanism),
 * with their attached context so the admin order list needs exactly one
 * Cloudinary call, never N+1 fetches of every order.json body.
 *
 * @param {{ maxResults?: number, nextCursor?: string }} [opts]
 * @returns {Promise<{ resources: Array, next_cursor?: string, total_count: number }>}
 */
export async function searchOrders({ maxResults = 100, nextCursor } = {}) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME not set');

  // NOTE: Cloudinary's Search expression matching on public_id/folder turned
  // out to be tokenized/fuzzy rather than a strict path match in testing —
  // e.g. "edibleprint/orders/*" also matched the unrelated
  // "edibleprint-orders/" folder (customer photo uploads from the editor
  // flow), and a "*/order" suffix clause matched public_ids that merely
  // contained the word "order" as a substring. This expression is a coarse
  // pre-filter only, to keep result volume down — the caller (searchOrders'
  // consumer, see app/api/admin/orders/route.js) MUST still strictly
  // regex-validate each public_id before treating it as a real order record.
  const body = {
    expression: 'resource_type:raw AND public_id:edibleprint/orders/*',
    sort_by: [{ created_at: 'desc' }],
    with_field: ['context'],
    max_results: maxResults,
    ...(nextCursor ? { next_cursor: nextCursor } : {}),
  };

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
    method: 'POST',
    headers: { Authorization: adminBasicAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error('Cloudinary order search failed: ' + JSON.stringify(result));
  }
  return result;
}

/**
 * Lists raw resources directly inside an order's Cloudinary folder whose
 * filename starts with the given prefix (e.g. "print-design") — a fallback
 * for when order.json's own assets.printReadyUrls is missing or stale.
 * Verified against real production data (lib/order-backup.js's backup run):
 * several existing orders have a real print-design.pdf sitting in Cloudinary
 * with no corresponding entry ever written back to order.json, so anything
 * that needs to know "does this order actually have a print file" has to be
 * able to check storage directly rather than trust the JSON field alone.
 *
 * @param {string} orderId
 * @param {string} prefix
 * @returns {Promise<Array<{ publicId: string, url: string, bytes: number }>>}
 */
export async function listOrderFiles(orderId, prefix) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME not set');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
    method: 'POST',
    headers: { Authorization: adminBasicAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expression: `resource_type:raw AND public_id:${orderFolderPath(orderId)}/${prefix}*`,
      max_results: 20,
    }),
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error('Cloudinary file listing failed for ' + orderId + ': ' + JSON.stringify(result));
  }
  return (result.resources || []).map((r) => ({
    publicId: r.public_id,
    url: rawUrl(r.public_id),
    bytes: r.bytes,
  }));
}
