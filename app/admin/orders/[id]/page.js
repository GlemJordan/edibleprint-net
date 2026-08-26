'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { resolveMaterial, materialDisplayLabel } from '../../../../lib/material-config.js';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', text: '#1a1a1a',
  muted: '#6B7280', border: '#E5E7EB', white: '#FFFFFF', bg: '#FAFBF9',
};

const VALID_STATUSES = ['paid', 'file_received', 'ready_to_print', 'printed', 'packed', 'shipped', 'pickup_ready'];

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
      .then((d) => { setOrder(d); setStatusDraft(d.production?.status || ''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authChecked, isAdmin, id]);

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

            <Section title="Shipping">
              <Row label="Method" value={order.shipping?.label} />
              {order.shipping?.address && (
                <Row
                  label="Address"
                  value={`${order.shipping.address.line1}, ${order.shipping.address.city}, ${order.shipping.address.province} ${order.shipping.address.postalCode}`}
                />
              )}
            </Section>

            <Section title="Designs">
              {(order.designs || []).map((d, i) => {
                const material = resolveMaterial(d);
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
                    {printReadyUrls.map((p, i) => (
                      <div key={i} style={{ fontSize: 13.5 }}>
                        <a href={`/api/admin/orders/${id}/download?type=print&index=${i}`} style={{ color: C.brand }}>🖨️ {p.label} →</a>
                      </div>
                    ))}
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
