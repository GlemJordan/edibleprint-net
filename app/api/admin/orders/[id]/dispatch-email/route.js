import { NextResponse } from 'next/server';
import { fetchRawText, orderFolderPath } from '../../../../../../lib/cloudinary-ops.js';
import { recordNotification } from '../../../../../../lib/order-record.js';
import { getAdminSession } from '../../../../../../lib/admin-auth.js';
import { todayInBusinessTimezone } from '../../../../../../lib/delivery-urgency.js';
import { resolveOrderShippingMethod } from '../../../../../../lib/shipping-config.js';
import { DispatchEmailError, deliverDispatchEmail, prepareDispatchEmail } from '../../../../../../lib/dispatch-email-send.js';

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net';

async function readRecord(orderId) {
  return JSON.parse(await fetchRawText(`${orderFolderPath(orderId)}/order`));
}

async function guard(params) {
  const session = await getAdminSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { id: orderId } = await params;
  if (!orderId) return { error: NextResponse.json({ error: 'Missing order ID' }, { status: 400 }) };
  return { orderId };
}

// PREVIEW — no side effects. The email exactly as it would be built from this
// order's real data (a not-yet-saved ship date shows as today, flagged), who it
// would go to, whether it can be sent and why not, and the current email mode.
// Nothing is sent and nothing is written.
export async function GET(request, { params }) {
  const g = await guard(params);
  if (g.error) return g.error;

  try {
    const record = await readRecord(g.orderId);
    if (resolveOrderShippingMethod(record) === 'pickup') {
      return NextResponse.json({ error: 'Pickup orders are not shipped, so there is no shipping email.' }, { status: 400 });
    }
    return NextResponse.json(prepareDispatchEmail(record, { siteUrl: siteUrl(), today: todayInBusinessTimezone() }));
  } catch (err) {
    if (String(err.message).includes('404')) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    console.error('[dispatch-email] preview failed for', g.orderId, err);
    return NextResponse.json({ error: 'Failed to build the email preview' }, { status: 500 });
  }
}

// SEND — only ever on an explicit request from the admin. The order is read fresh
// and every rule is re-checked here (ship date, tracking number, customer email,
// not already sent); the client's view of the order is never trusted. Body:
// { resend?: true } — required to send a second time.
export async function POST(request, { params }) {
  const g = await guard(params);
  if (g.error) return g.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const record = await readRecord(g.orderId);
    const result = await deliverDispatchEmail(record, { resend: body?.resend === true, siteUrl: siteUrl() });
    // Best-effort bookkeeping: what was (or, in dry-run, would have been) sent,
    // and to whom. If it can't be saved after a real send, say so loudly — the
    // email went out, and a second send must not be triggered by mistake.
    const saved = await recordNotification(g.orderId, result.notifications);
    return NextResponse.json({
      ok: true,
      mode: result.mode,
      sent: result.sent,
      to: result.to,
      subject: result.subject,
      redirected: result.redirected,
      at: result.at,
      notifications: result.notifications,
      recorded: !!saved,
      ...(saved ? {} : { warning: result.sent ? 'The email was sent, but it could not be recorded on the order. Do not send it again.' : 'The dry run could not be recorded on the order.' }),
    });
  } catch (err) {
    if (err instanceof DispatchEmailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    if (String(err.message).includes('404')) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    console.error('[dispatch-email] send failed for', g.orderId, err);
    return NextResponse.json({ error: 'Failed to send the shipping email' }, { status: 500 });
  }
}
