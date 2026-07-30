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

export default function AdminOrdersPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      .then((d) => setOrders(d.orders || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authChecked, isAdmin]);

  if (!authChecked) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: "'Outfit', sans-serif" }}>Checking session…</div>;
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: 60, textAlign: 'center', fontFamily: "'Outfit', sans-serif" }}>
        <p style={{ marginBottom: 16, color: C.text }}>You need to be signed in as admin to view this page.</p>
        <Link href="/admin-login" style={{ color: C.brand, fontWeight: 600 }}>Go to admin login →</Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, marginBottom: 24, color: C.text }}>Orders</h1>

        {loading && <p style={{ color: C.muted }}>Loading…</p>}
        {error && <p style={{ color: '#DC2626' }}>{error}</p>}

        {!loading && !error && (
          <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 }}>
              <thead>
                <tr style={{ background: C.brand, color: '#fff', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>Order</th>
                  <th style={{ padding: '10px 14px' }}>Customer</th>
                  <th style={{ padding: '10px 14px' }}>Designs</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={o.orderId} style={{ background: i % 2 === 0 ? C.white : C.bg, borderTop: '1px solid ' + C.border }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/admin/orders/${o.orderId}`} style={{ color: C.brand, fontWeight: 600, textDecoration: 'none' }}>
                        {o.orderId}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{o.customerName || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {o.designCount ?? '—'}{o.hasUploadDesign ? ' 📄' : ''}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{o.total != null ? '$' + o.total.toFixed(2) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: STATUS_COLORS[o.status] || STATUS_COLORS.unknown, fontWeight: 600, fontSize: 13 }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-CA') : '—'}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '24px 14px', textAlign: 'center', color: C.muted }}>No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
