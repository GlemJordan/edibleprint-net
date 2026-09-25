// Sending the shipping email, and every guard around it. Server-side only.
//
//   EMAIL_MODE=send      really sends
//   EMAIL_MODE=dry-run   sends nothing; records what WOULD have gone out and to whom
//   (unset)              sends only on the live Vercel production deployment
//                        (VERCEL_ENV=production); dry-run everywhere else — local
//                        dev and preview deployments — so nothing leaves by accident.
//
// A TEST order (Stripe test mode) is redirected to the owner with a [TEST] prefix
// in either mode, so even EMAIL_MODE=send on a laptop can't reach a customer.
// The functions take env and fetch as arguments so they can be exercised without
// sending anything.
import {
  DISPATCH_FROM, DISPATCH_REPLY_TO, buildDispatchEmail, dispatchEmailStatus, resolveDispatchRecipient,
} from './dispatch-email.js';

export class DispatchEmailError extends Error {
  /** @param {number} status  HTTP status for the API  @param {string} code  machine-readable reason */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ mode: 'send' | 'dry-run', source: 'EMAIL_MODE' | 'production-default' | 'safe-default' | 'invalid-EMAIL_MODE' }}
 */
export function resolveEmailMode(env = process.env) {
  const raw = (env.EMAIL_MODE || '').trim().toLowerCase();
  if (raw === 'send' || raw === 'dry-run') return { mode: raw, source: 'EMAIL_MODE' };
  // A value we don't recognise must never turn into sending.
  if (raw) return { mode: 'dry-run', source: 'invalid-EMAIL_MODE' };
  return env.VERCEL_ENV === 'production'
    ? { mode: 'send', source: 'production-default' }
    : { mode: 'dry-run', source: 'safe-default' };
}

/**
 * Everything needed to show the email and decide whether it can go out, with no
 * side effects: what the panel's preview renders.
 *
 * @param {object} record
 * @param {{ env?: Record<string, string | undefined>, siteUrl?: string, today: string }} opts
 */
export function prepareDispatchEmail(record, { env = process.env, siteUrl, today }) {
  const recipient = resolveDispatchRecipient(record, env);
  const email = buildDispatchEmail(record, { recipient, siteUrl, preview: true, today });
  const n = record.notifications || {};
  return {
    ...resolveEmailMode(env),
    status: dispatchEmailStatus(record),
    recipient,
    email,
    dryRun: n.dispatchEmailDryRunAt
      ? { at: n.dispatchEmailDryRunAt, to: n.dispatchEmailDryRunTo || '', subject: n.dispatchEmailDryRunSubject || '' }
      : null,
  };
}

/**
 * Sends (or, in dry-run, only records) the shipping email for an order. Throws a
 * DispatchEmailError, with the HTTP status to answer with, when it must not go out:
 *   400 not_ready       no ship date / tracking number / customer email, or a pickup order
 *   409 already_sent    it already went out and `resend` wasn't asked for explicitly
 * Returns what to save on the order's notifications (flat, primitive values).
 *
 * @param {object} record  the saved OrderRecord, read fresh
 * @param {{ resend?: boolean, env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, now?: Date, siteUrl?: string }} [opts]
 * @returns {Promise<{ mode: 'send' | 'dry-run', sent: boolean, to: string, subject: string, redirected: boolean, at: string, notifications: Record<string, string | number | boolean> }>}
 */
export async function deliverDispatchEmail(record, { resend = false, env = process.env, fetchImpl = fetch, now = new Date(), siteUrl } = {}) {
  const status = dispatchEmailStatus(record);
  if (!status.canSend) throw new DispatchEmailError(400, 'not_ready', status.reason);
  if (status.sent && !resend) {
    throw new DispatchEmailError(409, 'already_sent', `The shipping email was already sent on ${status.sent.at}. Sending it again needs an explicit resend.`);
  }

  const recipient = resolveDispatchRecipient(record, env);
  if (!recipient.to) throw new DispatchEmailError(400, 'not_ready', 'This order has no customer email, so there is nobody to notify.');
  const email = buildDispatchEmail(record, { recipient, siteUrl });
  const { mode } = resolveEmailMode(env);
  const at = now.toISOString();
  const base = { mode, to: recipient.to, subject: email.subject, redirected: recipient.redirected, at };

  if (mode === 'dry-run') {
    console.log('[dispatch-email] DRY RUN — nothing sent. Would have sent to',
      recipient.to + (recipient.redirected ? ` (TEST order, instead of ${recipient.originalTo || 'the customer'})` : ''),
      '| subject:', JSON.stringify(email.subject), '| order:', record.orderId);
    return {
      ...base, sent: false,
      notifications: {
        dispatchEmailDryRunAt: at, dispatchEmailDryRunTo: recipient.to,
        dispatchEmailDryRunSubject: email.subject, dispatchEmailDryRunRedirected: recipient.redirected,
      },
    };
  }

  if (!env.RESEND_API_KEY) throw new DispatchEmailError(500, 'not_configured', 'Email is not configured: RESEND_API_KEY is missing.');
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: DISPATCH_FROM, to: [recipient.to], reply_to: DISPATCH_REPLY_TO,
      subject: email.subject, html: email.html, text: email.text,
    }),
  });
  if (!res.ok) {
    const detail = String(await res.text().catch(() => '')).slice(0, 300);
    console.error('[dispatch-email] Resend rejected the email for', record.orderId, res.status, detail);
    throw new DispatchEmailError(502, 'provider_error', `The email service rejected the message (HTTP ${res.status}). Nothing was recorded as sent.`);
  }
  return {
    ...base, sent: true,
    notifications: {
      dispatchEmailSentAt: at, dispatchEmailTo: recipient.to, dispatchEmailSubject: email.subject,
      dispatchEmailRedirected: recipient.redirected, dispatchEmailSendCount: (status.sent?.count || 0) + 1,
    },
  };
}
