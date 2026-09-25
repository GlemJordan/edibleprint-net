// The customer shipping email, end to end minus the network: what it says, when it
// says to expect the order, who it goes to, when it must NOT go out, and how the
// three safety layers behave (pure builder, preview, guarded send).
//
// Nothing is sent and nothing external is touched: the send path runs against a
// stub fetch that records the request. No dev server needed.
import {
  buildDispatchEmail, dispatchEmailStatus, resolveDispatchRecipient, estimatedArrivalDate, canadaPostTrackingUrl,
  formatLongDate, DEFAULT_OWNER_EMAIL, DISPATCH_REPLY_TO,
} from '../lib/dispatch-email.js';
import { resolveEmailMode, deliverDispatchEmail, prepareDispatchEmail, DispatchEmailError } from '../lib/dispatch-email-send.js';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

const design = (quantity) => ({ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity, unitPrice: 14.99 });
const address = { line1: '1 Test St', city: 'London', province: 'Ontario', postalCode: 'N6A 1B2', country: 'CA' };
const order = (over = {}) => ({
  orderId: 'EP-TEST', orderNumber: 'EP-TEST', isTest: false,
  customer: { name: 'Ana Pérez', email: 'ana@example.com' },
  designs: [design(2)], shippingMethod: 'standard', shippingPackages: 1,
  shipping: { method: 'canada_post_shipping', address },
  shippedAt: '2026-09-25', // a Friday
  ...over,
});
const tracked = (over = {}) => order({ shippingMethod: 'tracked', shippingPackages: 1, trackingNumber: 'RB123 456-789CA', ...over });
const stripTags = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── Dates: shipped + the method's maximum transport, skipping weekends and Canada Post holidays ──
check('standard: 10 business days from Fri Sep 25 2026 = Tue Oct 13 (skips Sep 30 and Oct 12 holidays)', estimatedArrivalDate(order(), '2026-09-25') === '2026-10-13', estimatedArrivalDate(order(), '2026-09-25'));
check('tracked: 2 business days from Fri Sep 25 2026 = Tue Sep 29', estimatedArrivalDate(tracked(), '2026-09-25') === '2026-09-29');
check('standard: skips Remembrance Day (Mon Nov 2 + 10 business days = Tue Nov 17)', estimatedArrivalDate(order(), '2026-11-02') === '2026-11-17', estimatedArrivalDate(order(), '2026-11-02'));
check('an old order with no shippingMethod is standard (10 business days)', estimatedArrivalDate({ shipping: { method: 'canada_post_shipping' } }, '2026-09-25') === '2026-10-13');
check('formatLongDate', formatLongDate('2026-10-13') === 'Tuesday, October 13, 2026', formatLongDate('2026-10-13'));

// ── Standard, one package ──
{
  const e = buildDispatchEmail(order());
  const t = e.text;
  check('standard: subject names the order', e.subject === 'Your EdiblePrint order EP-TEST has shipped', e.subject);
  check('standard: real ship date, service, and expected-by date',
    t.includes('Shipped on: Friday, September 25, 2026') && t.includes('Service: Standard shipping — Canada Post Lettermail') && t.includes('Expected by: Tuesday, October 13, 2026'), t);
  check("standard: the reprint promise, worded as agreed, with the estimated arrival date",
    t.includes("If you haven't received your order by Tuesday, October 13, 2026, reply to this email and we'll reprint it at no cost."), t);
  check('standard: says there is no tracking number and offers no tracking link',
    t.includes('does not include a tracking number') && !t.includes('Track your package') && !e.html.includes('track-reperage') && !/Tracking number:/.test(t));
  check('standard: no packages row for a single package', !t.includes('Packages:'));
  check('standard: greets by first name', t.startsWith('Hi Ana,'), t.slice(0, 30));
  check('standard: a way to reply, and the shipping policy link', t.includes(DISPATCH_REPLY_TO) && t.includes('/shipping'));
  check('the HTML says the same thing as the text', stripTags(e.html).includes("If you haven't received your order by Tuesday, October 13, 2026") && stripTags(e.html).includes('Expected by Tuesday, October 13, 2026'));
}

// ── Standard, several packages: only the missing part is reprinted ──
{
  const e = buildDispatchEmail(order({ shippingPackages: 3, designs: [design(5)] }));
  check('several packages: says how many, and that they may arrive on different days', e.text.includes('Packages: 3 packages — they may arrive on different days'), e.text);
  check('several packages: the promise covers "that part", matching /refund and /shipping',
    e.text.includes("If part of your order hasn't arrived by Tuesday, October 13, 2026, reply to this email and we'll reprint and resend that part at no cost."));
}

// ── Tracked ──
{
  const e = buildDispatchEmail(tracked());
  check('tracked: service and the shorter expected-by date', e.text.includes('Service: Tracked shipping — Canada Post Xpresspost') && e.text.includes('Expected by: Tuesday, September 29, 2026'), e.text);
  check('tracked: shows the tracking number as recorded', e.text.includes('Tracking number: RB123 456-789CA'));
  const url = 'https://www.canadapost-postescanada.ca/track-reperage/en#/details/RB123456789CA';
  check('tracked: a Canada Post link with spaces and dashes stripped', e.text.includes('Track your package: ' + url) && e.html.includes('href="' + url + '"'), canadaPostTrackingUrl('RB123 456-789CA'));
  check('tracked: no "no tracking number" line and no reprint promise (that is for standard)', !e.text.includes('does not include a tracking number') && !/reprint/.test(e.text));
  check('canadaPostTrackingUrl encodes odd characters', canadaPostTrackingUrl('AB/12#3') === 'https://www.canadapost-postescanada.ca/track-reperage/en#/details/AB%2F12%233');
}

// ── Safety of the content itself ──
{
  const evil = buildDispatchEmail(order({ orderId: 'EP-<img>', customer: { name: '<b>Ann</b> O\'Neil', email: 'a@example.com' } }));
  check('names and codes are HTML-escaped (no injected markup)', !evil.html.includes('<img>') && !evil.html.includes('<b>Ann</b>') && evil.html.includes('&lt;b&gt;Ann&lt;/b&gt;'));
  check('a missing name greets generically', buildDispatchEmail(order({ customer: { email: 'a@example.com' } })).text.startsWith('Hello,'));
}

// ── Building rules ──
check('a shipping email without a ship date cannot be built', (() => { try { buildDispatchEmail(order({ shippedAt: undefined })); return false; } catch { return true; } })());
check('a tracked email without a tracking number cannot be built', (() => { try { buildDispatchEmail(tracked({ trackingNumber: undefined })); return false; } catch { return true; } })());
check('a pickup order has no shipping email', (() => { try { buildDispatchEmail(order({ shippingMethod: 'pickup' })); return false; } catch { return true; } })());
{
  const p = buildDispatchEmail(order({ shippedAt: undefined }), { preview: true, today: '2026-10-01' });
  check('preview without a ship date assumes today, and says so', p.usedPlaceholderDate === true && p.shippedAt === '2026-10-01' && p.text.includes('Shipped on: Thursday, October 1, 2026'));
  const pt = buildDispatchEmail(tracked({ trackingNumber: undefined }), { preview: true, today: '2026-10-01' });
  check('preview of a tracked order without its number shows a visible placeholder, not a blank', pt.text.includes('(tracking number not recorded yet)') && !pt.text.includes('Track your package'));
}

// ── Who can send, and why not ──
{
  const st = (o) => dispatchEmailStatus(o);
  check('ready: ship date + customer email → can send', st(order()).canSend === true && st(order()).reason === null);
  check('no ship date → cannot send, says to save a date', (() => { const s = st(order({ shippedAt: undefined })); return !s.canSend && /ship date/i.test(s.reason); })());
  check('tracked without tracking → cannot send, says to record it', (() => { const s = st(tracked({ trackingNumber: undefined })); return !s.canSend && /tracking number/i.test(s.reason); })());
  check('tracked with tracking → can send', st(tracked()).canSend === true);
  check('no customer email → cannot send, says nobody to notify', (() => { const s = st(order({ customer: { name: 'X' } })); return !s.canSend && /no customer email/i.test(s.reason); })());
  check('a TEST order without a customer email can still send (it goes to the owner)', st(order({ isTest: true, customer: { name: 'X' } })).canSend === true);
  check('pickup → cannot send', (() => { const s = st(order({ shippingMethod: 'pickup', shipping: { method: 'pickup' } })); return !s.canSend && /Pickup/.test(s.reason); })());
  check('an old order (no shippingMethod) with a date and an email can send', st({ shipping: { method: 'canada_post_shipping' }, shippedAt: '2026-09-25', customer: { email: 'a@b.co' }, designs: [design(1)] }).canSend === true);
  const sent = st(order({ notifications: { dispatchEmailSentAt: '2026-09-26T15:00:00.000Z', dispatchEmailTo: 'ana@example.com', dispatchEmailSendCount: 2 } }));
  check('already sent: reports when, to whom and how many times', sent.sent && sent.sent.at === '2026-09-26T15:00:00.000Z' && sent.sent.to === 'ana@example.com' && sent.sent.count === 2, sent);
  check('a dry run does NOT count as sent', st(order({ notifications: { dispatchEmailDryRunAt: '2026-09-26T15:00:00.000Z' } })).sent === null);
}

// ── Recipient: a test order can never reach a customer ──
{
  const real = resolveDispatchRecipient(order(), { ORDER_NOTIFICATION_EMAIL: 'me@example.com' });
  check('real order: goes to the customer, no prefix', real.to === 'ana@example.com' && !real.redirected && real.subjectPrefix === '');
  const test = resolveDispatchRecipient(order({ isTest: true }), { ORDER_NOTIFICATION_EMAIL: 'me@example.com' });
  check('TEST order: goes to the owner address from the environment, [TEST] prefix, original noted', test.to === 'me@example.com' && test.redirected && test.subjectPrefix === '[TEST] ' && test.originalTo === 'ana@example.com', test);
  check('TEST order without the env var: falls back to the default owner address', resolveDispatchRecipient(order({ isTest: true }), {}).to === DEFAULT_OWNER_EMAIL);
  const e = buildDispatchEmail(order({ isTest: true }), { recipient: test });
  check('TEST email: [TEST] subject and a banner saying who it would have gone to', e.subject.startsWith('[TEST] Your EdiblePrint order') && e.text.includes('would have gone to ana@example.com') && e.html.includes('TEST'), e.subject);
}

// ── Email mode ──
{
  const m = (env) => resolveEmailMode(env);
  check("EMAIL_MODE=send sends", m({ EMAIL_MODE: 'send' }).mode === 'send');
  check('EMAIL_MODE=dry-run does not', m({ EMAIL_MODE: 'dry-run' }).mode === 'dry-run');
  check('EMAIL_MODE is trimmed and case-insensitive', m({ EMAIL_MODE: ' SEND ' }).mode === 'send' && m({ EMAIL_MODE: 'Dry-Run' }).mode === 'dry-run');
  check('an unrecognised EMAIL_MODE is dry-run, never sending', (() => { const r = m({ EMAIL_MODE: 'yes' }); return r.mode === 'dry-run' && r.source === 'invalid-EMAIL_MODE'; })());
  check('unset on live Vercel production: send', m({ VERCEL_ENV: 'production' }).mode === 'send');
  check('unset on a Vercel preview: dry-run', m({ VERCEL_ENV: 'preview' }).mode === 'dry-run');
  check('unset locally: dry-run', m({}).mode === 'dry-run' && m({ NODE_ENV: 'development' }).mode === 'dry-run');
  check('an explicit EMAIL_MODE wins over the environment', m({ EMAIL_MODE: 'dry-run', VERCEL_ENV: 'production' }).mode === 'dry-run');
}

// ── Sending (stub fetch: nothing leaves) ──
const stub = (status = 200) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 400, status, text: async () => 'provider said no: secret-detail' }; };
  return { fn, calls };
};
const SEND = { EMAIL_MODE: 'send', RESEND_API_KEY: 'key_test', ORDER_NOTIFICATION_EMAIL: 'me@example.com' };
const NOW = new Date('2026-09-26T15:00:00.000Z');
const failsWith = async (fn, status, code) => { try { await fn(); return false; } catch (e) { return e instanceof DispatchEmailError && e.status === status && e.code === code; } };

{
  const s = stub();
  const r = await deliverDispatchEmail(order(), { env: SEND, fetchImpl: s.fn, now: NOW });
  const c = s.calls[0];
  check('send: one request to Resend, addressed to the customer only', s.calls.length === 1 && c.url === 'https://api.resend.com/emails' && c.body.to.join() === 'ana@example.com', c);
  check('send: replies go to the business inbox, from the orders address, with the subject', c.body.reply_to === DISPATCH_REPLY_TO && /orders@edibleprint\.net/.test(c.body.from) && c.body.subject === 'Your EdiblePrint order EP-TEST has shipped');
  check('send: carries both html and text, authenticated', c.body.html.includes('<table') && c.body.text.length > 50 && c.init.headers.Authorization === 'Bearer key_test');
  check('send: records when and to whom (flat values, count 1)',
    r.sent === true && r.notifications.dispatchEmailSentAt === NOW.toISOString() && r.notifications.dispatchEmailTo === 'ana@example.com'
    && r.notifications.dispatchEmailSendCount === 1 && r.notifications.dispatchEmailRedirected === false && Object.values(r.notifications).every((v) => typeof v !== 'object'), r.notifications);
}
{
  const s = stub();
  const r = await deliverDispatchEmail(order({ isTest: true }), { env: SEND, fetchImpl: s.fn, now: NOW });
  check('TEST order, EMAIL_MODE=send: goes to the owner ONLY, [TEST] subject, never the customer',
    s.calls[0].body.to.join() === 'me@example.com' && s.calls[0].body.subject.startsWith('[TEST] ') && !JSON.stringify(s.calls[0].body.to).includes('ana@example.com') && r.redirected === true, s.calls[0].body.to);
}
{
  const s = stub();
  const r = await deliverDispatchEmail(order(), { env: { EMAIL_MODE: 'dry-run', RESEND_API_KEY: 'key_test' }, fetchImpl: s.fn, now: NOW });
  check('dry-run: nothing is sent', s.calls.length === 0 && r.sent === false && r.mode === 'dry-run');
  check('dry-run: records what would have been sent and to whom (and does not mark it sent)',
    r.notifications.dispatchEmailDryRunTo === 'ana@example.com' && r.notifications.dispatchEmailDryRunSubject === 'Your EdiblePrint order EP-TEST has shipped'
    && r.notifications.dispatchEmailDryRunAt === NOW.toISOString() && !('dispatchEmailSentAt' in r.notifications), r.notifications);
  const s2 = stub();
  const rt = await deliverDispatchEmail(order({ isTest: true }), { env: { EMAIL_MODE: 'dry-run', ORDER_NOTIFICATION_EMAIL: 'me@example.com' }, fetchImpl: s2.fn, now: NOW });
  check('dry-run of a TEST order records the owner as recipient', s2.calls.length === 0 && rt.notifications.dispatchEmailDryRunTo === 'me@example.com' && rt.notifications.dispatchEmailDryRunRedirected === true);
  const s3 = stub();
  await deliverDispatchEmail(order(), { env: { RESEND_API_KEY: 'key_test' }, fetchImpl: s3.fn, now: NOW });
  check('no EMAIL_MODE outside production: nothing is sent', s3.calls.length === 0);
}
{
  const s = stub();
  const guard = async (rec, code, label) => check(`refused (400 not_ready): ${label}; nothing sent`, (await failsWith(() => deliverDispatchEmail(rec, { env: SEND, fetchImpl: s.fn }), 400, code)) && s.calls.length === 0);
  await guard(order({ shippedAt: undefined }), 'not_ready', 'no ship date');
  await guard(tracked({ trackingNumber: undefined }), 'not_ready', 'tracked without tracking number');
  await guard(order({ customer: { name: 'X' } }), 'not_ready', 'no customer email');
  await guard(order({ shippingMethod: 'pickup', shipping: { method: 'pickup' } }), 'not_ready', 'pickup order');
}
{
  const s = stub();
  const already = order({ notifications: { dispatchEmailSentAt: '2026-09-26T15:00:00.000Z', dispatchEmailTo: 'ana@example.com', dispatchEmailSendCount: 1 } });
  check('already sent: a plain send is refused with 409 and nothing goes out', (await failsWith(() => deliverDispatchEmail(already, { env: SEND, fetchImpl: s.fn }), 409, 'already_sent')) && s.calls.length === 0);
  const r = await deliverDispatchEmail(already, { env: SEND, fetchImpl: s.fn, resend: true, now: NOW });
  check('already sent: an explicit resend goes out and counts 2', s.calls.length === 1 && r.notifications.dispatchEmailSendCount === 2, r.notifications);
  const dry = await deliverDispatchEmail(already, { env: { EMAIL_MODE: 'dry-run' }, fetchImpl: s.fn, resend: false }).catch((e) => e);
  check('already sent: even in dry-run a plain send is refused (same rule everywhere)', dry instanceof DispatchEmailError && dry.status === 409);
}
{
  const s = stub(422);
  let err;
  try { await deliverDispatchEmail(order(), { env: SEND, fetchImpl: s.fn }); } catch (e) { err = e; }
  check('provider failure: 502, nothing recorded, and the provider text is not shown to the admin', err instanceof DispatchEmailError && err.status === 502 && err.code === 'provider_error' && !err.message.includes('secret-detail'), err?.message);
  check('missing RESEND_API_KEY in send mode: a clear 500 and no request', await failsWith(() => deliverDispatchEmail(order(), { env: { EMAIL_MODE: 'send' }, fetchImpl: stub().fn }), 500, 'not_configured'));
}

// ── Preview (layer 2): no side effects, same email as the send ──
{
  const s = stub();
  const rec = order({ notifications: { dispatchEmailDryRunAt: '2026-09-26T15:00:00.000Z', dispatchEmailDryRunTo: 'ana@example.com', dispatchEmailDryRunSubject: 'x' } });
  const p = prepareDispatchEmail(rec, { env: { EMAIL_MODE: 'dry-run' }, today: '2026-09-25' });
  check('preview: reports the mode, recipient, status, email and the last dry run', p.mode === 'dry-run' && p.recipient.to === 'ana@example.com' && p.status.canSend === true && p.email.subject.includes('EP-TEST') && p.dryRun?.to === 'ana@example.com', p);
  const sent = await deliverDispatchEmail(rec, { env: SEND, fetchImpl: s.fn, now: NOW });
  check('preview and send build the identical email', s.calls[0].body.html === p.email.html && s.calls[0].body.text === p.email.text && sent.subject === p.email.subject);
  const pn = prepareDispatchEmail(order({ shippedAt: undefined }), { env: {}, today: '2026-09-25' });
  check('preview works before a ship date is saved (assumes today, and cannot be sent yet)', pn.email.usedPlaceholderDate === true && pn.status.canSend === false);
  check('preview of a TEST order shows the owner as recipient', prepareDispatchEmail(order({ isTest: true }), { env: { ORDER_NOTIFICATION_EMAIL: 'me@example.com' }, today: '2026-09-25' }).recipient.to === 'me@example.com');
}

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
