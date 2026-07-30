'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', text: '#1a1a1a',
  muted: '#6B7280', border: '#E5E7EB', white: '#FFFFFF', bg: '#FAFBF9',
};

const VALID_STATUSES = ['paid', 'file_received', 'ready_to_print', 'printed', 'packed', 'shipped', 'pickup_ready'];

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

  if (!authChecked) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: "'Outfit', sans-serif" }}>Checking session…</div>;
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: 60, textAlign: 'center', fontFamily: "'Outfit', sans-serif" }}>
        <p style={{ marginBottom: 16 }}>You need to be signed in as admin to view this page.</p>
        <Link href="/admin-login" style={{ color: C.brand, fontWeight: 600 }}>Go to admin login →</Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link href="/admin/orders" style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>← All orders</Link>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '10px 0 24px', color: C.text }}>{id}</h1>

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
              {(order.designs || []).map((d, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < order.designs.length - 1 ? '1px solid ' + C.border : 'none' }}>
                  <div style={{ fontWeight: 600 }}>{d.shapeLabel} — {d.size} × {d.quantity}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>
                    ${d.unitPrice?.toFixed(2)} each{d.notes ? ' · Note: ' + d.notes : ''}
                  </div>
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
              ))}
            </Section>

            <Section title="Payment">
              <Row
                label="Total"
                value={order.payment?.amountCents != null ? '$' + (order.payment.amountCents / 100).toFixed(2) + ' ' + order.payment.currency : undefined}
              />
              <Row label="Status" value={order.payment?.status} />
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

            {order.assets?.cloudinaryFolder && (
              <Section title="Assets">
                <a href={order.assets.cloudinaryFolder} target="_blank" rel="noopener noreferrer" style={{ color: C.brand, fontSize: 13.5 }}>
                  Cloudinary folder →
                </a>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
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
