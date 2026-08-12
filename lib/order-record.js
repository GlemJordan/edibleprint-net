import { randomBytes } from 'crypto';
import { uploadRaw, fetchRawText, orderFolderPath, updateResourceContext, listOrderFiles, searchOrders, ORDER_PUBLIC_ID_RE } from './cloudinary-ops.js';

const SHAPE_LABELS = {
  circular:    'Round',
  square:      'Square',
  rectangular: 'Rectangle',
  fullsheet:   'Full Sheet',
  multicircle: 'Cookie Sheet',
  heart:       'Heart',
  custom:      'Custom',
  waferletter: 'Wafer Paper — Letter Sheet',
};

/**
 * Build a structured OrderRecord from Stripe session + parsed designs.
 *
 * @param {Object} session  Stripe checkout.session object
 * @param {Array}  designs  Parsed designs from session metadata
 * @param {string} orderId  e.g. 'EP-A3B4C5D6'
 * @param {boolean} isTest
 * @returns {import('../types/order.js').OrderRecord}
 */
export function buildOrderRecord(session, designs, orderId, isTest) {
  const meta = session.metadata || {};
  const isPickup = meta.shippingMethod === 'pickup';

  /** @type {import('../types/order.js').OrderRecord} */
  const record = {
    orderId,
    orderNumber: orderId,
    createdAt: new Date().toISOString(),
    isTest,
    customer: {
      name:  meta.customerName  || '',
      email: session.customer_email || '',
      phone: meta.customerPhone || undefined,
    },
    designs: designs.map(d => ({
      shape:      d.shape,
      shapeLabel: SHAPE_LABELS[d.shape] || d.shape,
      size:       d.size || '',
      quantity:   parseInt(d.qty, 10) || 1,
      unitPrice:  parseFloat(d.price) || 0,
      notes:      d.notes !== 'None' ? d.notes : undefined,
      imageUrl:   d.imageUrl !== 'No image' ? d.imageUrl : undefined,
      // "I already have my design" upload flow only — additive, absent for
      // every existing editor-created design.
      ...(d.sourceType === 'upload' ? {
        sourceType:   'upload',
        selectedPage: d.selectedPage || 1,
        pageCount:    d.pageCount || 1,
        approvedAt:   d.approvedAt || undefined,
      } : {}),
    })),
    shipping: {
      method: meta.shippingMethod === 'pickup' ? 'pickup' : 'canada_post_shipping',
      label:  meta.shippingMethod === 'pickup' ? 'Pickup — East London, ON' : 'Canada Post Shipping',
      address: isPickup ? undefined : {
        line1:      meta.shippingAddress || '',
        city:       meta.shippingCity    || '',
        province:   meta.shippingProvince || '',
        postalCode: meta.shippingPostal  || '',
        country:    'CA',
      },
    },
    payment: {
      stripeSessionId:      session.id,
      stripePaymentIntentId: session.payment_intent || undefined,
      amountCents:          session.amount_total || 0,
      currency:             'CAD',
      status:               'paid',
      method:               'stripe_card',
    },
    assets: {
      cloudinaryFolder: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/${orderFolderPath(orderId)}/`,
    },
    production: {
      status:    'file_received',
      updatedAt: new Date().toISOString(),
    },
    notes: designs.map(d => d.notes).filter(n => n && n !== 'None').join(' | ') || undefined,
    urgentFlags: buildUrgentFlags(meta.shippingMethod, designs),
    source:  'stripe',
    channel: 'website',
  };

  return record;
}

// Shape-agnostic — takes the already-normalized shipping method + designs
// array rather than a raw Stripe session, so buildManualOrderRecord() below
// can share it instead of re-deriving the same two flags from scratch.
function buildUrgentFlags(shippingMethod, designs) {
  const flags = [];
  if (shippingMethod === 'pickup') flags.push('local_pickup');
  const hasNotes = designs.some(d => d.notes && d.notes !== 'None');
  if (hasNotes) flags.push('has_special_instructions');
  return flags.length ? flags : undefined;
}

// Distinct prefix from the Stripe-derived 'EP-XXXXXXXX' scheme (last 8 chars
// of a Stripe session id) so a manual order's id can never collide with a
// Stripe one — categorically, not just by chance.
export function generateManualOrderId() {
  return 'EP-M' + randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Looks for an existing MANUAL order for the same customer name
 * (case-insensitive) and the same total, created within the last
 * `withinHours` — the signature a re-entered sale (network hiccup, admin
 * double-clicked Save, or genuinely re-typing the same sale by mistake)
 * would produce. Reads the same light `context` metadata the admin order
 * list already uses (via searchOrders()) — never fetches a full order.json
 * — and results are sorted newest-first, so scanning stops as soon as it
 * reaches an order older than the window instead of paging through
 * everything. A hit is a WARNING signal only: the caller decides whether to
 * still save (see app/api/admin/orders/manual/route.js's confirmDuplicate
 * flag) — this function never blocks anything by itself.
 *
 * @param {{ customerName: string, amountCents: number, withinHours?: number }} params
 * @returns {Promise<Array<{ orderId: string, createdAt: string }>>}
 */
export async function findRecentDuplicateManualOrders({ customerName, amountCents, withinHours = 24 }) {
  const targetName = (customerName || '').trim().toLowerCase();
  const targetTotal = ((amountCents || 0) / 100).toFixed(2);
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;

  const matches = [];
  let cursor;
  let pagesFetched = 0;
  const MAX_PAGES = 5; // sorted newest-first — a 24h window never needs more than a page or two of real volume
  outer:
  while (pagesFetched < MAX_PAGES) {
    const result = await searchOrders({ maxResults: 100, nextCursor: cursor });
    pagesFetched++;
    for (const r of result.resources || []) {
      const match = ORDER_PUBLIC_ID_RE.exec(r.public_id || '');
      if (!match) continue;
      if (new Date(r.created_at).getTime() < cutoff) break outer; // everything after this (newest-first) is even older
      const context = r.context?.custom || r.context || {};
      if (context.source !== 'manual') continue;
      if ((context.customerName || '').trim().toLowerCase() !== targetName) continue;
      if (context.total !== targetTotal) continue;
      matches.push({ orderId: match[1], createdAt: r.created_at });
    }
    cursor = result.next_cursor || null;
    if (!cursor) break;
  }

  return matches;
}

/**
 * Build an OrderRecord for a sale that happened outside Stripe (cash,
 * e-transfer, marketplace, etc.) — entered by hand from the admin "Add
 * manual order" form. Produces the SAME OrderRecord shape buildOrderRecord()
 * does above, so every existing consumer (generateOrderPdfs,
 * updateOrderStatus, the admin list/detail pages, the CSV/JSON backup) works
 * against it unmodified; only the handful of fields that come from a Stripe
 * session (stripeSessionId, isTest, amountCents pulled from Stripe) are
 * sourced from the form input instead.
 *
 * Deliberately does NOT recompute/validate pricing (see catalog-prices.js —
 * that enforcement exists specifically because a checkout price travels
 * through the customer's browser and could be tampered with; this form is
 * admin-session-gated, so the amount typed here is trusted as-is) and does
 * NOT send any email — both per explicit product decision, not oversights.
 *
 * @param {{
 *   customerName: string, customerEmail?: string, customerPhone?: string,
 *   channel: 'marketplace'|'instagram'|'referral'|'walk_in'|'other',
 *   paymentMethod: 'cash'|'e_transfer'|'other',
 *   shape: string, material?: string, size: string, quantity: number,
 *   amountCents: number,
 *   isPickup: boolean, shippingAddress?: import('../types/order.js').ShippingAddress,
 *   saleDate: string, notes?: string,
 *   imageUrl?: string,
 *   externalRef?: string,
 * }} input
 * @param {string} orderId
 * @returns {import('../types/order.js').OrderRecord}
 */
export function buildManualOrderRecord(input, orderId) {
  const now = new Date().toISOString();
  const design = {
    shape:      input.shape,
    shapeLabel: input.material ? `${input.shape} (${input.material})` : input.shape,
    size:       input.size || '',
    quantity:   parseInt(input.quantity, 10) || 1,
    unitPrice:  0, // order-level amountCents is the trusted figure — see below.
    notes:      input.notes || undefined,
    imageUrl:   input.imageUrl || undefined,
    // No in-browser editor ran for this design, so there's no shape-based
    // recomposition to do — print exactly what was uploaded, same as the
    // "I already have my design" flow (see order-pdf-pipeline.js).
    ...(input.imageUrl ? { sourceType: 'upload', selectedPage: 1, pageCount: 1, approvedAt: now } : {}),
  };
  const designs = [design];

  return {
    orderId,
    orderNumber: orderId,
    createdAt: now,
    isTest: false,
    customer: {
      name:  input.customerName || '',
      email: input.customerEmail || undefined,
      phone: input.customerPhone || undefined,
    },
    designs,
    shipping: {
      method: input.isPickup ? 'pickup' : 'local_delivery',
      label:  input.isPickup ? 'Pickup — East London, ON' : 'Shipping',
      address: input.isPickup ? undefined : input.shippingAddress,
    },
    payment: {
      amountCents: parseInt(input.amountCents, 10) || 0,
      currency: 'CAD',
      status: 'paid',
      method: input.paymentMethod,
    },
    assets: {
      cloudinaryFolder: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/${orderFolderPath(orderId)}/`,
    },
    production: {
      status: 'paid',
      updatedAt: now,
    },
    notes: input.notes || undefined,
    urgentFlags: buildUrgentFlags(input.isPickup ? 'pickup' : 'other', designs),
    source: 'manual',
    channel: input.channel,
    saleDate: input.saleDate || now,
    externalRef: input.externalRef || undefined,
  };
}

const URGENT_FLAG_LABELS = {
  local_pickup: 'Local pickup order',
  has_special_instructions: 'Special instructions included',
};

/**
 * Human-readable text for an urgentFlags entry (never the raw identifier
 * buildUrgentFlags() pushes). Falls back to a humanized version of the id
 * so a future flag added above without a label here still can't leak a raw
 * snake_case identifier into the owner email.
 *
 * @param {string} flag
 * @returns {string}
 */
export function urgentFlagLabel(flag) {
  return URGENT_FLAG_LABELS[flag] || flag.replace(/_/g, ' ');
}

/**
 * Derives the light, searchable `context` metadata attached to an
 * order.json resource — read by GET /api/admin/orders via Cloudinary's
 * Search API so the list never has to fetch every order's full body (see
 * lib/cloudinary-ops.js). Called by saveOrderRecord() below for new orders,
 * and by the historical-order backfill script for orders saved before
 * context existed — the SAME function both ways, so a migrated order's
 * context can never come out different from a freshly-saved one. Field
 * access is defensive (optional chaining, fallbacks) since old records are
 * the one case where a shape assumption could be wrong.
 *
 * @param {import('../types/order.js').OrderRecord} record
 * @returns {Object}
 */
export function deriveSearchContext(record) {
  return {
    customerName:     record.customer?.name || '',
    total:            ((record.payment?.amountCents || 0) / 100).toFixed(2),
    status:           record.production?.status || 'unknown',
    hasUploadDesign:  (record.designs || []).some(d => d.sourceType === 'upload') ? 'true' : 'false',
    designCount:      String((record.designs || []).length),
    createdAt:        record.createdAt || '',
    // Absent on every order saved before these existed — read as 'stripe' /
    // 'website' / 'stripe_card' respectively, which is what they actually
    // were, so an old record can't come out mislabeled by omission.
    source:           record.source || 'stripe',
    channel:          record.channel || 'website',
    paymentMethod:    record.payment?.method || 'stripe_card',
  };
}

/**
 * Upload order.json + (optional) notes.txt to Cloudinary.
 * Returns an updated record with asset URLs.
 *
 * @param {import('../types/order.js').OrderRecord} record
 * @returns {Promise<import('../types/order.js').OrderRecord>}
 */
export async function saveOrderRecord(record) {
  const folder = orderFolderPath(record.orderId);

  // Upload order.json, with light context metadata attached so the admin
  // order list (GET /api/admin/orders) can read it via Cloudinary's Search
  // API without fetching every order.json body — see lib/cloudinary-ops.js.
  const jsonPublicId = `${folder}/order`;
  const context = deriveSearchContext(record);
  const jsonUrl = await uploadRaw(JSON.stringify(record, null, 2), jsonPublicId, context);

  // Upload notes.txt if there are special instructions
  if (record.notes) {
    const notesPublicId = `${folder}/notes`;
    await uploadRaw(record.notes, notesPublicId);
  }

  // Return record with updated asset URLs
  return {
    ...record,
    assets: {
      ...record.assets,
      orderJsonUrl: jsonUrl,
    },
  };
}

/**
 * Update the production status of an order.
 * Fetches current order.json from Cloudinary, patches status, re-uploads.
 *
 * @param {string} orderId  e.g. 'EP-A3B4C5D6'
 * @param {import('../types/order.js').ProductionStatus} newStatus
 * @param {string} [adminNote]
 * @returns {Promise<import('../types/order.js').OrderRecord>}
 */
export async function updateOrderStatus(orderId, newStatus, adminNote) {
  const folder = orderFolderPath(orderId);
  const jsonPublicId = `${folder}/order`;

  // Fetch current record
  const text = await fetchRawText(jsonPublicId);
  const record = JSON.parse(text);

  // Patch
  record.production.status    = newStatus;
  record.production.updatedAt = new Date().toISOString();
  if (adminNote) {
    record.production.adminNote = adminNote;
  }

  // Re-upload the body (uploadRaw without a context arg never touches
  // existing context, so this can't clobber what saveOrderRecord set).
  await uploadRaw(JSON.stringify(record, null, 2), jsonPublicId);
  // Keep the searchable context.status in sync — the admin order list reads
  // context only, never the full body, so skipping this would leave the
  // list showing a stale status indefinitely.
  await updateResourceContext(jsonPublicId, { status: newStatus });

  // Cloudinary's raw storage can briefly still return the pre-overwrite
  // version even on a fresh, cache-busted GET right after a write — measured
  // empirically while testing the admin status-update UI (stale reads on
  // ~2 of 3 immediate re-fetches). Poll until our own write is actually
  // visible before returning, so callers (the admin UI, and anything that
  // re-fetches right after this resolves) can trust the result reflects
  // reality rather than a moment-old snapshot.
  for (let attempt = 0; attempt < 5; attempt++) {
    const check = JSON.parse(await fetchRawText(jsonPublicId));
    if (check.production.status === newStatus) return check;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  console.warn(`[order-record] status update for ${orderId} not confirmed visible after retries — returning optimistic record`);
  return record;
}

/**
 * Merge-patches record.notifications onto an existing order.json — the only
 * place that tracks whether the owner/customer emails for this order
 * actually sent, so "did this customer get anything?" is answerable from
 * the admin order detail page instead of only Resend's own dashboard.
 * Best-effort: called right after each email attempt (success or final
 * failure) in the webhook; a failure here is logged, never thrown, since
 * losing this bookkeeping write must not be treated as the order itself
 * having failed.
 *
 * The webhook calls this twice in a row for the same order (owner email,
 * then customer email a few seconds later). Cloudinary's raw storage can
 * briefly still return the pre-write version on a read right after a write
 * (same staleness updateOrderStatus already works around below) — without
 * waiting for the first write to actually become visible, the second call's
 * read-modify-write would read a stale copy and silently clobber the first
 * patch. So this polls for its own write to be visible before returning,
 * the same way updateOrderStatus does.
 *
 * @param {string} orderId
 * @param {{ ownerEmailSent?: boolean, customerEmailSent?: boolean, customerEmailError?: string }} patch
 */
export async function recordNotification(orderId, patch) {
  const folder = orderFolderPath(orderId);
  const jsonPublicId = `${folder}/order`;
  try {
    const text = await fetchRawText(jsonPublicId);
    const record = JSON.parse(text);
    record.notifications = { ...record.notifications, ...patch };
    await uploadRaw(JSON.stringify(record, null, 2), jsonPublicId);

    for (let attempt = 0; attempt < 5; attempt++) {
      const check = JSON.parse(await fetchRawText(jsonPublicId));
      const patchApplied = Object.entries(patch).every(([k, v]) => check.notifications?.[k] === v);
      if (patchApplied) return check;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    console.warn(`[order-record] recordNotification for ${orderId} not confirmed visible after retries — returning optimistic record`);
    return record;
  } catch (err) {
    console.error(`[order-record] recordNotification failed for ${orderId}:`, err.message);
    return null;
  }
}

/**
 * Resolves an order's actual print-ready file URLs, falling back to a live
 * Cloudinary folder listing when assets.printReadyUrls is missing or empty.
 * Found while building the orders backup (lib/order-backup.js): several
 * existing orders have a real print-design.pdf sitting in Cloudinary with
 * no corresponding entry ever written back to order.json, so the admin
 * order detail page (which reads assets.printReadyUrls directly) was
 * silently unable to show/download those PDFs even though they exist.
 * Read-only — does not persist anything back onto order.json; see the
 * separate backfill-print-ready-urls migration for that.
 *
 * @param {import('../types/order.js').OrderRecord} record
 * @returns {Promise<Array<{ url: string, label: string }>>}
 */
export async function resolvePrintReadyUrls(record) {
  const existing = record.assets?.printReadyUrls || [];
  if (existing.length > 0) return existing;

  // No design has an image at all → generateOrderPdfs would never have
  // produced a print-ready file for this order in the first place, so
  // there's nothing to look for — skip the extra Cloudinary call.
  const neededCount = (record.designs || []).filter((d) => d.imageUrl).length;
  if (neededCount === 0) return [];

  try {
    const found = await listOrderFiles(record.orderId, 'print-design');
    return found.map((f) => {
      const m = /print-design-(\d+)\.pdf$/.exec(f.publicId);
      return { url: f.url, label: m ? `Design ${m[1]}` : 'Print-Ready' };
    });
  } catch (err) {
    console.error(`[order-record] resolvePrintReadyUrls fallback failed for ${record.orderId}:`, err.message);
    return [];
  }
}
