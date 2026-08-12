'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', text: '#1a1a1a',
  muted: '#6B7280', border: '#E5E7EB', white: '#FFFFFF', bg: '#FAFBF9',
};

const STATUS_COLORS = {
  paid: '#6B7280', file_received: '#2563EB', ready_to_print: '#7C3AED',
  printed: '#059669', packed: '#059669', shipped: '#1B6B4A', pickup_ready: '#1B6B4A',
  unknown: '#9CA3AF',
};

const CHANNEL_LABELS = {
  website: 'Website', marketplace: 'Marketplace', instagram: 'Instagram',
  referral: 'Referral', walk_in: 'Walk-in', other: 'Other',
};
const PAYMENT_METHOD_LABELS = {
  stripe_card: 'Card (Stripe)', cash: 'Cash', e_transfer: 'E-transfer', other: 'Other',
};

export default function AdminOrdersPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scannedAllResults, setScannedAllResults] = useState(true);
  const [channelFilter, setChannelFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  /* Same admin-session check every other admin surface in this app uses —
     the actual data fetch below is protected server-side regardless (the
     API routes 401 without a valid ep_admin cookie), this is purely UX so
     a logged-out visitor sees a login prompt instead of an empty table. */
  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => { setIsAdmin(!!d.isAdmin); setAuthChecked(true); })
      .catch(() => { setIsAdmin(false); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    // `loading` already starts true (useState(true) above) — this effect
    // only fires once per mount for this dependency pair, so there's no
    // subsequent run that needs to flip it back on.
    fetch('/api/admin/orders')
      .then((r) => { if (!r.ok) throw new Error('Failed to load orders'); return r.json(); })
      .then((d) => {
        setOrders(d.orders || []);
        setScannedAllResults(d.scannedAllResults !== false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authChecked, isAdmin]);

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
          <p style={{ marginBottom: 16, color: C.text }}>You need to be signed in as admin to view this page.</p>
          <Link href="/admin-login" style={{ color: C.brand, fontWeight: 600 }}>Go to admin login →</Link>
        </div>
      </>
    );
  }

  const filteredOrders = orders.filter((o) =>
    (!channelFilter || (o.channel || 'website') === channelFilter)
    && (!paymentFilter || (o.paymentMethod || 'stripe_card') === paymentFilter)
  );

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: 0, color: C.text }}>Orders</h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/admin/orders/manual" style={{
              fontSize: 13, fontWeight: 600, color: '#fff', background: C.brand,
              borderRadius: 8, padding: '7px 14px', textDecoration: 'none',
            }}>
              + Add manual order
            </Link>
            <Link href="/api/admin/orders/export?format=csv" style={{
              fontSize: 13, fontWeight: 600, color: C.brand, border: '1.5px solid ' + C.brand,
              borderRadius: 8, padding: '7px 14px', textDecoration: 'none',
            }}>
              Export CSV
            </Link>
            <Link href="/api/admin/orders/export?format=json" style={{
              fontSize: 13, fontWeight: 600, color: C.brand, border: '1.5px solid ' + C.brand,
              borderRadius: 8, padding: '7px 14px', textDecoration: 'none',
            }}>
              Export JSON
            </Link>
          </div>
        </div>

        {!loading && !error && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 13 }}>
              <option value="">All channels</option>
              {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 13 }}>
              <option value="">All payment methods</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}

        {loading && <p style={{ color: C.muted }}>Loading…</p>}
        {error && <p style={{ color: '#DC2626' }}>{error}</p>}

        {!loading && !error && !scannedAllResults && (
          <div style={{
            background: '#FFF8E6', border: '1px solid #F4D06F', borderLeft: '4px solid #E8873C',
            borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: '#5C4A1A',
          }}>
            ⚠️ There are more orders than this page can show right now — the list stopped after a safety
            limit on how many results it scans. Some orders may be missing below. (Pagination for this
            isn&apos;t wired up yet — noted as pending.)
          </div>
        )}

        {!loading && !error && (
          <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 }}>
              <thead>
                <tr style={{ background: C.brand, color: '#fff', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>Order</th>
                  <th style={{ padding: '10px 14px' }}>Customer</th>
                  <th style={{ padding: '10px 14px' }}>Source</th>
                  <th style={{ padding: '10px 14px' }}>Designs</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>PDFs</th>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o, i) => (
                  <tr key={o.orderId} style={{ background: i % 2 === 0 ? C.white : C.bg, borderTop: '1px solid ' + C.border }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/admin/orders/${o.orderId}`} style={{ color: C.brand, fontWeight: 600, textDecoration: 'none' }}>
                        {o.orderId}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{o.customerName || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {o.source === 'manual' && (
                          <span style={{
                            display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#7C3AED',
                            background: '#F3E8FF', padding: '2px 6px', borderRadius: 4, width: 'fit-content',
                          }}>
                            MANUAL
                          </span>
                        )}
                        <span style={{ fontSize: 12.5, color: C.muted }}>{CHANNEL_LABELS[o.channel] || o.channel || 'Website'}</span>
                        <span style={{ fontSize: 12.5, color: C.muted }}>{PAYMENT_METHOD_LABELS[o.paymentMethod] || o.paymentMethod || 'Card (Stripe)'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {o.designCount ?? '—'}{o.hasUploadDesign ? ' 📄' : ''}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{o.total != null ? '$' + o.total.toFixed(2) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: STATUS_COLORS[o.status] || STATUS_COLORS.unknown, fontWeight: 600, fontSize: 13 }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {o.missingAssets ? (
                        <Link href={`/admin/orders/${o.orderId}`} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700,
                          color: '#B45309', background: '#FEF3C7', padding: '3px 8px', borderRadius: 4, textDecoration: 'none',
                        }} title="Production slip or a print-ready PDF is missing — open the order to regenerate.">
                          ⚠️ Missing
                        </Link>
                      ) : (
                        <span style={{ color: C.muted, fontSize: 12 }}>✓</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-CA') : '—'}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '24px 14px', textAlign: 'center', color: C.muted }}>No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
