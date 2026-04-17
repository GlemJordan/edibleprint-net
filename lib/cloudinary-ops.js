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
 * Upload a Buffer or string to Cloudinary as a raw resource (signed upload).
 * Works for JSON, PDF, TXT, and any binary data.
 *
 * @param {Buffer|Uint8Array|string} data
 * @param {string} publicId  e.g. "edibleprint/orders/EP-XXXX/order"
 * @returns {Promise<string>} secure_url
 */
export async function uploadRaw(data, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const sigParams = { invalidate: 1, overwrite: 1, public_id: publicId, timestamp };
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
 * Fetch the text content of a raw Cloudinary file by its public_id.
 * URL format: https://res.cloudinary.com/{cloud}/raw/upload/{public_id}
 *
 * @param {string} publicId
 * @returns {Promise<string>}
 */
export async function fetchRawText(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME not set');
  const url = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}`;
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
