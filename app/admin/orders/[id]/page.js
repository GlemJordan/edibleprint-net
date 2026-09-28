'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { resolveMaterial, materialDisplayLabel } from '../../../../lib/material-config.js';
import { resolveCut } from '../../../../lib/cutting-config.js';
import { shapeSupportsCutGuide, hasLegacyBakedGuide } from '../../../../lib/cut-guide-config.js';
import { VALID_STATUSES } from '../../../../lib/production-status.js';
import { computeUrgency, URGENCY_LABELS, URGENCY_COLORS } from '../../../../lib/delivery-urgency.js';
import { resolveOrderDispatch, formatPackageCount } from '../../../../lib/shipping-config.js';
import { dispatchEmailStatus } from '../../../../lib/dispatch-email.js';

// 'YYYY-MM-DD' as a plain calendar date (no timezone shift), e.g. "Thu, Oct 1, 2026".
function formatCalendarDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return ymd || '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

// What was charged for shipping, for an order of any age: new records store it;
// a manual order has one typed total; an older website order simply didn't record it.
function shippingChargedText(order, dispatch) {
  if (dispatch.method === 'pickup') return 'Free (pickup)';
  if (typeof order.shippingCostCharged === 'number') return '$' + order.shippingCostCharged.toFixed(2);
  return order.source === 'manual' ? 'Included in the total entered' : 'Not recorded (older order)';
}

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', text: '#1a1a1a',
  muted: '#6B7280', border: '#E5E7EB', white: '#FFFFFF', bg: '#FAFBF9',
};

const CHANNEL_LABELS = {
  website: 'Website', marketplace: 'Marketplace', instagram: 'Instagram',
  referral: 'Referral', walk_in: 'Walk-in', other: 'Other',
};
const PAYMENT_METHOD_LABELS = {
  stripe_card: 'Card (Stripe)', cash: 'Cash', e_transfer: 'E-transfer', other: 'Other',
};

export default function AdminOrderDetailPage({ params }) {
  const { id } = use(params);

  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [committedDateDraft, setCommittedDateDraft] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [saveDateMsg, setSaveDateMsg] = useState('');
  const [shippedAtDraft, setShippedAtDraft] = useState('');
  const [trackingDraft, setTrackingDraft] = useState('');
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState('');
  // Saving a ship date only OFFERS to mark the order shipped; changing the status
  // is a separate action of the admin's own (see markAsShipped) — nothing here
  // does it as a side effect of saving.
  const [offerShipped, setOfferShipped] = useState(false);
  const [markingShipped, setMarkingShipped] = useState(false);
  const [markShippedMsg, setMarkShippedMsg] = useState('');
  // The customer shipping email — a decision of its own, separate from the status
  // and from saving a date. emailInfo is the server's preview (no side effects).
  const [emailInfo, setEmailInfo] = useState(null);
  const [emailInfoError, setEmailInfoError] = useState('');
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [confirmResend, setConfirmResend] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateMsg, setRegenerateMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => { setIsAdmin(!!d.isAdmin); setAuthChecked(true); })
      .catch(() => { setIsAdmin(false); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    fetch(`/api/admin/orders/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Order not found' : 'Failed to load order');
        return r.json();
      })
      .then((d) => {
        setOrder(d);
        setStatusDraft(d.production?.status || '');
        setCommittedDateDraft(d.committedDate || '');
        setShippedAtDraft(d.shippedAt || '');
        setTrackingDraft(d.trackingNumber || '');
        if (resolveOrderDispatch(d).method !== 'pickup') refreshEmailInfo();
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authChecked, isAdmin, id]);

  const refreshEmailInfo = async () => {
    try {
      const res = await fetch(`/api/admin/orders/${id}/dispatch-email`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load the email preview');
      setEmailInfo(data);
      setEmailInfoError('');
    } catch (e) {
      setEmailInfoError(e.message);
    }
  };

  const sendShippingEmail = async (resend) => {
    setSendingEmail(true);
    setEmailMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/dispatch-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resend ? { resend: true } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send the email');
      setOrder((o) => ({ ...o, notifications: { ...o.notifications, ...data.notifications } }));
      setConfirmResend(false);
      setEmailMsg(data.sent
        ? 'Sent ✓ to ' + data.to + (data.redirected ? ' (test order: it went to you, not the customer)' : '') + (data.warning ? ' — ' + data.warning : '')
        : 'Dry run: nothing was sent. It would have gone to ' + data.to + '. Recorded below.');
      refreshEmailInfo();
    } catch (e) {
      setEmailMsg('Error: ' + e.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const saveStatus = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      setOrder((o) => ({ ...o, production: { ...o.production, status: data.status, updatedAt: data.updatedAt } }));
      setSaveMsg('Saved ✓');
    } catch (e) {
      setSaveMsg('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveCommittedDate = async () => {
    setSavingDate(true);
    setSaveDateMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/committed-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ committedDate: committedDateDraft || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update date');
      setOrder((o) => ({ ...o, committedDate: data.committedDate }));
      setSaveDateMsg('Saved ✓');
    } catch (e) {
      setSaveDateMsg('Error: ' + e.message);
    } finally {
      setSavingDate(false);
    }
  };

  const saveDispatch = async () => {
    setSavingDispatch(true);
    setDispatchMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippedAt: shippedAtDraft || null, trackingNumber: trackingDraft.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save dispatch details');
      setOrder((o) => ({ ...o, shippedAt: data.shippedAt || undefined, trackingNumber: data.trackingNumber || undefined }));
      setShippedAtDraft(data.shippedAt || '');
      setTrackingDraft(data.trackingNumber || '');
      setDispatchMsg('Saved ✓');
      setMarkShippedMsg('');
      setOfferShipped(!!data.shippedAt && order?.production?.status !== 'shipped');
      refreshEmailInfo();
    } catch (e) {
      setDispatchMsg('Error: ' + e.message);
    } finally {
      setSavingDispatch(false);
    }
  };

  // The admin's explicit choice, from the prompt shown after saving a ship date.
  const markAsShipped = async () => {
    setMarkingShipped(true);
    setMarkShippedMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'shipped' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      setOrder((o) => ({ ...o, production: { ...o.production, status: data.status, updatedAt: data.updatedAt } }));
      setStatusDraft(data.status);
      setOfferShipped(false);
      setMarkShippedMsg('Marked as shipped ✓');
    } catch (e) {
      setMarkShippedMsg('Error: ' + e.message);
    } finally {
      setMarkingShipped(false);
    }
  };

  const regeneratePdfs = async () => {
    setRegenerating(true);
    setRegenerateMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/regenerate-pdf`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate PDFs');
      // Re-fetch the order so the Assets section reflects the fresh URLs
      // (regenerate-pdf patches order.json server-side but this page's
      // local `order` state is a snapshot from load time).
      const fresh = await fetch(`/api/admin/orders/${id}`).then((r) => r.json());
      setOrder(fresh);
      setRegenerateMsg(data.missingAssets ? '⚠️ Regenerated, but still incomplete — check Vercel logs.' : 'Regenerated ✓');
    } catch (e) {
      setRegenerateMsg('Error: ' + e.message);
    } finally {
      setRegenerating(false);
    }
  };

  if (!authChecked) {
    return (
      <>
        <meta name="robots" content="noindex, nofollow" />
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: "'Outfit', sans-serif" }}>Checking session…</div>
      </>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <meta name="robots" content="noindex, nofollow" />
        <div style={{ padding: 60, textAlign: 'center', fontFamily: "'Outfit', sans-serif" }}>
          <p style={{ marginBottom: 16 }}>You need to be signed in as admin to view this page.</p>
          <Link href="/admin-login" style={{ color: C.brand, fontWeight: 600 }}>Go to admin login →</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link href="/admin/orders" style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>← All orders</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 24px', flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: 0, color: C.text }}>{id}</h1>
          {order?.source === 'manual' && (
            <span style={{
              fontSize: 12, fontWeight: 700, color: '#7C3AED', background: '#F3E8FF',
              padding: '3px 9px', borderRadius: 5,
            }}>
              MANUAL — {CHANNEL_LABELS[order.channel] || order.channel}
            </span>
          )}
        </div>

        {loading && <p style={{ color: C.muted }}>Loading…</p>}
        {error && <p style={{ color: '#DC2626' }}>{error}</p>}

        {order && (
          <>
            <Section title="Customer">
              <Row label="Name" value={order.customer?.name} />
              <Row label="Email" value={order.customer?.email} />
              <Row label="Phone" value={order.customer?.phone} />
            </Section>

            {(() => {
              // Older orders carry none of the new fields: they read as standard
              // (or pickup) with the packages their sheets need — never blank.
              const dispatch = resolveOrderDispatch(order);
              return (
            <Section title="Shipping">
              <Row label="Method" value={dispatch.method === 'pickup' ? dispatch.line + ' (nothing to ship)' : dispatch.name} />
              <Row label="Carrier" value={dispatch.carrier} />
              {dispatch.method !== 'pickup' && (
                <Row label="Packages" value={dispatch.packages !== null ? formatPackageCount(dispatch.packages) : '—'} />
              )}
              <Row label="Charged" value={shippingChargedText(order, dispatch)} />
              <Row label="Needed by" value={order.neededByDate ? formatCalendarDate(order.neededByDate) : undefined} />
              {order.shipping?.address && (
                <Row
                  label="Address"
                  value={`${order.shipping.address.line1}, ${order.shipping.address.city}, ${order.shipping.address.province} ${order.shipping.address.postalCode}`}
                />
              )}
            </Section>
              );
            })()}

            {resolveOrderDispatch(order).method !== 'pickup' && (
              <Section title="Dispatch">
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13, color: C.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Shipped on
                    <input
                      type="date"
                      aria-label="Shipped on"
                      value={shippedAtDraft}
                      onChange={(e) => setShippedAtDraft(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14 }}
                    />
                  </label>
                  <label style={{ fontSize: 13, color: C.muted, display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
                    Tracking number
                    <input
                      type="text"
                      aria-label="Tracking number"
                      value={trackingDraft}
                      maxLength={40}
                      onChange={(e) => setTrackingDraft(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14 }}
                    />
                  </label>
                  <button
                    onClick={saveDispatch}
                    disabled={savingDispatch || (shippedAtDraft === (order.shippedAt || '') && trackingDraft.trim() === (order.trackingNumber || ''))}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none', background: C.brand, color: '#fff',
                      fontWeight: 600, fontFamily: 'inherit', fontSize: 14,
                      cursor: (savingDispatch || (shippedAtDraft === (order.shippedAt || '') && trackingDraft.trim() === (order.trackingNumber || ''))) ? 'not-allowed' : 'pointer',
                      opacity: (savingDispatch || (shippedAtDraft === (order.shippedAt || '') && trackingDraft.trim() === (order.trackingNumber || ''))) ? 0.5 : 1,
                    }}
                  >
                    {savingDispatch ? 'Saving…' : 'Save dispatch details'}
                  </button>
                  {dispatchMsg && <span style={{ fontSize: 13, color: dispatchMsg.startsWith('Error') ? '#DC2626' : '#059669' }}>{dispatchMsg}</span>}
                </div>
                {offerShipped && order.production?.status !== 'shipped' && (
                  <div role="alert" style={{
                    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12,
                    padding: '10px 14px', borderRadius: 8, background: '#FFF8E6', border: '1px solid #F4D06F', fontSize: 13.5, color: '#5C4A1A',
                  }}>
                    <span>This order is not marked as shipped. Mark as shipped?</span>
                    <button
                      onClick={markAsShipped}
                      disabled={markingShipped}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none', background: C.brand, color: '#fff',
                        fontWeight: 600, fontFamily: 'inherit', fontSize: 13.5,
                        cursor: markingShipped ? 'not-allowed' : 'pointer', opacity: markingShipped ? 0.6 : 1,
                      }}
                    >
                      {markingShipped ? 'Updating…' : 'Mark as shipped'}
                    </button>
                    <button
                      onClick={() => setOfferShipped(false)}
                      disabled={markingShipped}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: '1.5px solid ' + C.border, background: C.white, color: C.text,
                        fontWeight: 600, fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer',
                      }}
                    >
                      Not now
                    </button>
                    {markShippedMsg.startsWith('Error') && <span style={{ color: '#DC2626' }}>{markShippedMsg}</span>}
                  </div>
                )}
                {markShippedMsg && !markShippedMsg.startsWith('Error') && (
                  <div style={{ fontSize: 13, color: '#059669', marginTop: 8 }}>{markShippedMsg}</div>
                )}
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>
                  {resolveOrderDispatch(order).method === 'tracked'
                    ? 'This customer paid for tracking — record the number from the Canada Post receipt.'
                    : 'Standard shipping has no tracking number; leave it blank.'}
                </div>

                {(() => {
                  const st = dispatchEmailStatus(order);
                  const smallMuted = { fontSize: 12.5, color: C.muted, marginTop: 6 };
                  const btn = (enabled) => ({
                    padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontFamily: 'inherit', fontSize: 14,
                    cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
                  });
                  const n = order.notifications || {};
                  return (
                    <div data-testid="customer-email" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid ' + C.border }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Customer email</div>

                      {emailInfo?.mode === 'dry-run' && (
                        <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: '#FFF8E6', border: '1px solid #F4D06F', color: '#5C4A1A', marginBottom: 8 }}>
                          Email mode: <strong>DRY RUN</strong> — nothing is actually sent. Sending only records what would have gone out, and to whom.
                          {emailInfo.source === 'invalid-EMAIL_MODE' && ' (EMAIL_MODE has a value that is not recognised, so it is treated as dry-run.)'}
                        </div>
                      )}
                      {emailInfo?.mode === 'send' && emailInfo.recipient?.redirected && (
                        <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', marginBottom: 8 }}>
                          Test order: the email goes to you ({emailInfo.recipient.to}), never to the customer.
                        </div>
                      )}
                      {emailInfoError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 8 }}>Could not load the email preview: {emailInfoError}</div>}

                      <div style={{ fontSize: 14, marginBottom: 10 }}>
                        {st.sent
                          ? <>Shipping email sent on <strong>{new Date(st.sent.at).toLocaleString('en-CA')}</strong> to {st.sent.to}
                              {st.sent.redirected ? ' (test order: delivered to you, not the customer)' : ''}
                              {st.sent.count > 1 ? ` · sent ${st.sent.count} times` : ''}</>
                          : <span style={{ color: C.muted }}>Shipping email not sent yet.</span>}
                      </div>
                      {n.dispatchEmailDryRunAt && (
                        <div style={{ ...smallMuted, marginTop: 0, marginBottom: 10 }}>
                          Last dry run: {new Date(n.dispatchEmailDryRunAt).toLocaleString('en-CA')} — would have sent to {n.dispatchEmailDryRunTo}.
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setShowEmailPreview((v) => !v)}
                          disabled={!emailInfo}
                          style={{ ...btn(!!emailInfo), border: '1.5px solid ' + C.border, background: C.white, color: C.text }}
                        >
                          {showEmailPreview ? 'Hide preview' : 'Preview customer email'}
                        </button>
                        <button
                          onClick={() => sendShippingEmail(false)}
                          disabled={!st.canSend || !!st.sent || sendingEmail}
                          style={{ ...btn(st.canSend && !st.sent && !sendingEmail), border: 'none', background: C.brand, color: '#fff' }}
                        >
                          {st.sent ? 'Shipping email sent' : sendingEmail ? 'Sending…' : 'Send shipping email'}
                        </button>
                        {st.sent && st.canSend && !confirmResend && (
                          <button
                            onClick={() => setConfirmResend(true)}
                            disabled={sendingEmail}
                            style={{ ...btn(!sendingEmail), border: '1.5px solid ' + C.border, background: C.white, color: C.text }}
                          >
                            Send again…
                          </button>
                        )}
                      </div>

                      {!st.canSend && st.reason && <div role="status" style={smallMuted}>{st.reason}</div>}

                      {confirmResend && st.sent && (
                        <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13.5, color: '#7F1D1D' }}>
                          <span>This email was already sent to {st.sent.to}. Send it again?</span>
                          <button onClick={() => sendShippingEmail(true)} disabled={sendingEmail} style={{ ...btn(!sendingEmail), padding: '6px 14px', border: 'none', background: '#B91C1C', color: '#fff' }}>
                            {sendingEmail ? 'Sending…' : 'Yes, send it again'}
                          </button>
                          <button onClick={() => setConfirmResend(false)} disabled={sendingEmail} style={{ ...btn(!sendingEmail), padding: '6px 14px', border: '1.5px solid ' + C.border, background: C.white, color: C.text }}>
                            Cancel
                          </button>
                        </div>
                      )}

                      {emailMsg && (
                        <div style={{ fontSize: 13, marginTop: 8, color: emailMsg.startsWith('Error') ? '#DC2626' : '#059669' }}>{emailMsg}</div>
                      )}

                      {showEmailPreview && emailInfo && (
                        <div data-testid="email-preview" style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 13, marginBottom: 2 }}><span style={{ color: C.muted }}>Subject:</span> {emailInfo.email.subject}</div>
                          <div style={{ fontSize: 13, marginBottom: 2 }}>
                            <span style={{ color: C.muted }}>To:</span> {emailInfo.recipient.to || '(no customer email)'}
                            {emailInfo.recipient.redirected && ` — test order, instead of ${emailInfo.recipient.originalTo || 'the customer'}`}
                          </div>
                          <div style={{ ...smallMuted, marginTop: 0, marginBottom: 8 }}>
                            Built from the details saved on this order.
                            {emailInfo.email.usedPlaceholderDate && ` No ship date is saved yet, so this assumes today (${emailInfo.email.shippedAt}).`}
                          </div>
                          <iframe
                            title="Customer email preview"
                            sandbox=""
                            srcDoc={emailInfo.email.html}
                            style={{ width: '100%', height: 560, border: '1px solid ' + C.border, borderRadius: 8, background: '#fff' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Section>
            )}

            <Section title="Designs">
              {(order.designs || []).map((d, i) => {
                const material = resolveMaterial(d);
                const cutToShape = resolveCut(d);
                const cutGuide = d.cutGuide === true;
                return (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < order.designs.length - 1 ? '1px solid ' + C.border : 'none' }}>
                  <div style={{ fontWeight: 600 }}>
                    {d.shapeLabel} — {d.size} × {d.quantity}
                    {' '}
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      color: material === 'wafer' ? '#B45309' : C.brand,
                      background: material === 'wafer' ? '#FEF3C7' : C.brandLight,
                    }}>{materialDisplayLabel(material).toUpperCase()}</span>
                    {cutToShape && (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        marginLeft: 6, color: '#B45309', background: '#FEF3C7',
                      }}>CUT TO SHAPE</span>
                    )}
                    {cutGuide && (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        marginLeft: 6, color: C.brand, background: C.brandLight,
                      }}>CUT GUIDE</span>
                    )}
                  </div>
                  {(d.unitPrice > 0 || d.notes) && (
                    <div style={{ fontSize: 13, color: C.muted }}>
                      {d.unitPrice > 0 ? '$' + d.unitPrice.toFixed(2) + ' each' : ''}{d.unitPrice > 0 && d.notes ? ' · ' : ''}{d.notes ? 'Note: ' + d.notes : ''}
                    </div>
                  )}
                  {d.sourceType === 'upload' && (
                    <div style={{
                      fontSize: 12.5, color: '#B45309', background: '#FEF3C7',
                      display: 'inline-block', padding: '3px 8px', borderRadius: 4, marginTop: 4,
                    }}>
                      📄 Customer-supplied file — page {d.selectedPage} of {d.pageCount}
                      {d.approvedAt ? ` · approved ${new Date(d.approvedAt).toLocaleString('en-CA')}` : ''}
                    </div>
                  )}
                  {d.imageUrl && (
                    <div style={{ marginTop: 4 }}>
                      <a href={d.imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: C.brand }}>View file →</a>
                    </div>
                  )}
                </div>
                );
              })}
            </Section>

            <Section title="Payment">
              <Row
                label="Total"
                value={order.payment?.amountCents != null ? '$' + (order.payment.amountCents / 100).toFixed(2) + ' ' + order.payment.currency : undefined}
              />
              <Row label="Method" value={PAYMENT_METHOD_LABELS[order.payment?.method] || order.payment?.method} />
              <Row label="Status" value={order.payment?.status} />
              <Row label="Sale date" value={order.saleDate ? new Date(order.saleDate).toLocaleDateString('en-CA') : undefined} />
              <Row label="External ref" value={order.externalRef} />
              {order.payment?.stripePaymentIntentId && (
                <Row
                  label="Stripe"
                  value={
                    <a href={`https://dashboard.stripe.com/payments/${order.payment.stripePaymentIntentId}`} target="_blank" rel="noopener noreferrer" style={{ color: C.brand }}>
                      View in Stripe →
                    </a>
                  }
                />
              )}
            </Section>

            <Section title="Production status">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14 }}
                >
                  {VALID_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  onClick={saveStatus}
                  disabled={saving || statusDraft === order.production?.status}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none', background: C.brand, color: '#fff',
                    fontWeight: 600, fontFamily: 'inherit', fontSize: 14,
                    cursor: (saving || statusDraft === order.production?.status) ? 'not-allowed' : 'pointer',
                    opacity: (saving || statusDraft === order.production?.status) ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Update status'}
                </button>
                {saveMsg && <span style={{ fontSize: 13, color: saveMsg.startsWith('Error') ? '#DC2626' : '#059669' }}>{saveMsg}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>
                Last updated: {order.production?.updatedAt ? new Date(order.production.updatedAt).toLocaleString('en-CA') : '—'}
              </div>
            </Section>

            {/* Single date field whose meaning depends on shipping.method —
                see types/order.js's committedDate doc comment — so the label
                itself tells the admin which thing they're entering instead
                of them having to remember. */}
            <Section title={order.shipping?.method === 'pickup' ? 'Pickup date' : 'Ship-by date'}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={committedDateDraft}
                  onChange={(e) => setCommittedDateDraft(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14 }}
                />
                <button
                  onClick={saveCommittedDate}
                  disabled={savingDate || committedDateDraft === (order.committedDate || '')}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none', background: C.brand, color: '#fff',
                    fontWeight: 600, fontFamily: 'inherit', fontSize: 14,
                    cursor: (savingDate || committedDateDraft === (order.committedDate || '')) ? 'not-allowed' : 'pointer',
                    opacity: (savingDate || committedDateDraft === (order.committedDate || '')) ? 0.5 : 1,
                  }}
                >
                  {savingDate ? 'Saving…' : 'Save date'}
                </button>
                {order.committedDate && (() => {
                  const urgency = computeUrgency(order);
                  return urgency !== 'none' ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                      color: '#fff', background: URGENCY_COLORS[urgency],
                    }}>{URGENCY_LABELS[urgency].toUpperCase()}</span>
                  ) : null;
                })()}
                {saveDateMsg && <span style={{ fontSize: 13, color: saveDateMsg.startsWith('Error') ? '#DC2626' : '#059669' }}>{saveDateMsg}</span>}
              </div>
            </Section>

            {order.notes && (
              <Section title="Notes">
                <p style={{ margin: 0 }}>{order.notes}</p>
              </Section>
            )}

            <Section title="Notifications">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
                <div>
                  Owner email: {order.notifications?.ownerEmailSent === true
                    ? <span style={{ color: '#059669' }}>✓ Sent</span>
                    : order.notifications?.ownerEmailSent === false
                      ? <span style={{ color: '#DC2626' }}>✗ Failed</span>
                      : <span style={{ color: C.muted }}>— Unknown (order predates tracking)</span>}
                </div>
                <div>
                  Customer confirmation email: {order.notifications?.customerEmailSent === true
                    ? <span style={{ color: '#059669' }}>✓ Sent</span>
                    : order.notifications?.customerEmailSent === false
                      ? <span style={{ color: '#DC2626' }}>✗ Failed{order.notifications?.customerEmailError ? ' — ' + order.notifications.customerEmailError : ''}</span>
                      : <span style={{ color: C.muted }}>— Unknown (order predates tracking)</span>}
                </div>
              </div>
            </Section>

            {order.assets?.cloudinaryFolder && (() => {
              const printReadyUrls = order.assets?.printReadyUrls || [];
              const neededPrintReady = (order.designs || []).filter((d) => d.imageUrl).length;
              const missing = !order.assets?.productionSlipUrl || printReadyUrls.length < neededPrintReady;
              return (
                <Section title="Assets">
                  {missing && (
                    <div style={{
                      background: '#FEF3C7', border: '1px solid #F4D06F', borderLeft: '4px solid #B45309',
                      borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#5C4A1A',
                    }}>
                      ⚠️ {!order.assets?.productionSlipUrl ? 'Production slip is missing.' : ''}{' '}
                      {printReadyUrls.length < neededPrintReady ? `${neededPrintReady - printReadyUrls.length} of ${neededPrintReady} print-ready PDF(s) missing.` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    <div style={{ fontSize: 13.5 }}>
                      {order.assets?.productionSlipUrl ? (
                        <a href={`/api/admin/orders/${id}/download?type=slip`} style={{ color: C.brand }}>📄 Production slip →</a>
                      ) : (
                        <span style={{ color: '#B45309' }}>📄 Production slip — missing</span>
                      )}
                    </div>
                    {printReadyUrls.map((p, i) => {
                      // The customer's own cutGuide choice already baked into
                      // this stored PDF — these two extra links regenerate it
                      // fresh with the opposite/either choice, for resolving a
                      // "can you add/remove the guide" message without
                      // needing the customer to reorder. Only offered where
                      // it'd actually do something: not a customer-supplied
                      // upload (print-as-is, no guide concept) or a shape/
                      // sub-shape with no outline to trace.
                      const d = (order.designs || [])[i];
                      const guideEligible = d && d.sourceType !== 'upload' && shapeSupportsCutGuide(d.shape, d.customShapeKind);
                      // Verified against real production orders: anything
                      // placed before this feature shipped has no `cutGuide`
                      // field at all, and for these shapes the OLD hi-res
                      // export baked the line into the image unconditionally
                      // — there's no clean version to regenerate "without
                      // guide" from, and "with guide" would just draw a
                      // second line on top of the one already in the pixels.
                      // Say so plainly instead of offering a toggle that
                      // can't deliver what it promises.
                      const legacyBaked = guideEligible && hasLegacyBakedGuide(d);
                      return (
                        <div key={i} style={{ fontSize: 13.5 }}>
                          <a href={`/api/admin/orders/${id}/download?type=print&index=${i}`} style={{ color: C.brand }}>🖨️ {p.label} →</a>
                          {legacyBaked ? (
                            <span style={{ color: '#B45309' }}> (pre-dates cut guide feature — line is baked into the image, cannot toggle)</span>
                          ) : guideEligible && (
                            <span style={{ color: C.muted }}>
                              {' '}(
                              <a href={`/api/admin/orders/${id}/download?type=print&index=${i}&guide=1`} style={{ color: C.brand }}>with guide</a>
                              {' · '}
                              <a href={`/api/admin/orders/${id}/download?type=print&index=${i}&guide=0`} style={{ color: C.brand }}>without guide</a>
                              )
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {printReadyUrls.length < neededPrintReady && (
                      <div style={{ fontSize: 13.5, color: '#B45309' }}>
                        🖨️ {neededPrintReady - printReadyUrls.length} print-ready PDF(s) missing
                      </div>
                    )}
                    <a href={order.assets.cloudinaryFolder} target="_blank" rel="noopener noreferrer" style={{ color: C.brand, fontSize: 13.5 }}>
                      Cloudinary folder →
                    </a>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={regeneratePdfs}
                      disabled={regenerating}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: missing ? '#B45309' : C.brand, color: '#fff',
                        fontWeight: 600, fontFamily: 'inherit', fontSize: 13.5,
                        cursor: regenerating ? 'not-allowed' : 'pointer', opacity: regenerating ? 0.6 : 1,
                      }}
                    >
                      {regenerating ? 'Regenerating…' : (missing ? '⚠️ Regenerate missing PDFs' : 'Regenerate PDFs')}
                    </button>
                    {regenerateMsg && (
                      <span style={{ fontSize: 13, color: regenerateMsg.startsWith('Error') ? '#DC2626' : '#059669' }}>{regenerateMsg}</span>
                    )}
                  </div>
                </Section>
              );
            })()}
          </>
        )}
      </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 4 }}>
      <span style={{ color: C.muted, minWidth: 90, flexShrink: 0 }}>{label}:</span>
      <span style={{ wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
