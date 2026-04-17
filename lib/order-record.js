import { uploadRaw, fetchRawText, orderFolderPath } from './cloudinary-ops.js';

const SHAPE_LABELS = {
  circular:    'Round',
  square:      'Square',
  rectangular: 'Rectangle',
  fullsheet:   'Full Sheet',
  multicircle: 'Cookie Sheet',
  heart:       'Heart',
  custom:      'Custom',
};

const SHIPPING_METHOD_MAP = {
  local:    'local_delivery',
  pickup:   'pickup',
  express:  'canada_post_express',
  standard: 'canada_post_standard',
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
    })),
    shipping: {
      method: SHIPPING_METHOD_MAP[meta.shippingMethod] || 'canada_post_standard',
      label:  meta.shippingMethod === 'express' ? 'Express (1–2 business days)'
            : meta.shippingMethod === 'local'   ? 'Same Day Delivery — London, ON'
            : meta.shippingMethod === 'pickup'  ? 'Pickup — South London, ON'
            : 'Standard (3–5 business days)',
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
    },
    assets: {
      cloudinaryFolder: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/${orderFolderPath(orderId)}/`,
    },
    production: {
      status:    'file_received',
      updatedAt: new Date().toISOString(),
    },
    notes: designs.map(d => d.notes).filter(n => n && n !== 'None').join(' | ') || undefined,
    urgentFlags: buildUrgentFlags(session, designs),
  };

  return record;
}

function buildUrgentFlags(session, designs) {
  const flags = [];
  const meta = session.metadata || {};
  if (meta.shippingMethod === 'local')  flags.push('same_day_delivery');
  if (meta.shippingMethod === 'pickup') flags.push('local_pickup');
  if (meta.shippingMethod === 'express') flags.push('express_shipping');
  const hasNotes = designs.some(d => d.notes && d.notes !== 'None');
  if (hasNotes) flags.push('has_special_instructions');
  return flags.length ? flags : undefined;
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

  // Upload order.json
  const jsonPublicId = `${folder}/order`;
  const jsonUrl = await uploadRaw(JSON.stringify(record, null, 2), jsonPublicId);

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

  // Re-upload (overwrite)
  await uploadRaw(JSON.stringify(record, null, 2), jsonPublicId);
  return record;
}
