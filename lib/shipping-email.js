// Customer-email wording about a shipping method. Pure (no I/O) so it can be
// checked without sending anything; every price/window/tracking statement
// comes from lib/shipping-config.js via the helpers there.
import { formatBusinessDayRange } from './shipping-config.js';

/**
 * "Delivery: 3–10 business days once your order ships · No tracking number"
 *
 * @param {import('./shipping-config.js').ShippingMethod} method
 */
export function shippingTermsLine(method) {
  return 'Delivery: ' + formatBusinessDayRange(method) + ' once your order ships · '
    + (method.tracking ? 'Tracking number included' : 'No tracking number');
}

/**
 * The "Shipping" block of the order-confirmation email: which method the
 * customer bought, how long it takes, and a link to the policy.
 *
 * @param {import('./shipping-config.js').ShippingMethod} method
 * @param {string} policyUrl  absolute URL of /shipping
 * @returns {{ html: string, text: string }}
 */
export function confirmationShippingBlock(method, policyUrl) {
  const label = method.label + ' — ' + method.carrier;
  const terms = shippingTermsLine(method);
  const html = '<div style="background:#f9fafb;border-left:4px solid #1B6B4A;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
    + '<p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#374151;">Shipping</p>'
    + '<p style="margin:0;font-size:15px;font-weight:700;line-height:1.6;color:#374151;">' + label + '</p>'
    + '<p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">' + terms
    + ' · <a href="' + policyUrl + '" style="color:#1B6B4A;">Shipping policy</a></p>'
    + '</div>';
  const text = 'Shipping\n' + label + '\n' + terms + '\nShipping policy: ' + policyUrl + '\n\n';
  return { html, text };
}
