'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { planLabelSheets, FEEDABLE_FREE_SPACES, LABELS_PER_SHEET, MAX_ORDERS_PER_PDF } from '../../../../lib/shipping-labels.js';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', text: '#1a1a1a',
  muted: '#6B7280', border: '#E5E7EB', white: '#FFFFFF', bg: '#FAFBF9',
  warnBg: '#FFF8E6', warnBorder: '#F4D06F', warnText: '#5C4A1A',
};

const FREE_LABELS = {
  4: 'New sheet (4 spaces)',
  3: '3 spaces left (8.25")',
  2: '2 spaces left (5.5")',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The orders that still have to be mailed, one label per package, reviewed
// here before printing: what each label will say, anything wrong with an
// address, which orders to include and how much of the sheet already in the
// printer is free. Data and PDF come from /api/admin/shipping-labels.
export default function ShippingLabelsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [freeSpaces, setFreeSpaces] = useState(LABELS_PER_SHEET);

  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => { setIsAdmin(!!d.isAdmin); setAuthChecked(true); })
      .catch(() => { setIsAdmin(false); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    fetch('/api/admin/shipping-labels')
      .then((r) => { if (!r.ok) throw new Error('Failed to load orders to ship'); return r.json(); })
      .then((d) => {
        setData(d);
        // Ready-looking orders start ticked — the soonest ones, up to what one
        // PDF takes; ones with an address problem or marked as test wait for
        // the owner to decide.
        const ready = (d.orders || []).filter((o) => o.problems.length === 0 && !o.isTest);
        setSelected(new Set(ready.slice(0, MAX_ORDERS_PER_PDF).map((o) => o.orderId)));
      })
      .catch((e) => setError(e.message));
  }, [authChecked, isAdmin]);

  const orders = useMemo(() => data?.orders || [], [data]);
  const chosen = orders.filter((o) => selected.has(o.orderId));
  const labelCount = chosen.reduce((sum, o) => sum + o.packages, 0);
  const tooMany = chosen.length > MAX_ORDERS_PER_PDF;
  const canDownload = labelCount > 0 && !tooMany;
  const plan = planLabelSheets(labelCount, freeSpaces);
  const downloadHref = '/api/admin/shipping-labels/pdf?ids=' + encodeURIComponent(chosen.map((o) => o.orderId).join(',')) + '&free=' + freeSpaces;

  const toggle = (orderId) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
    return next;
  });
  const allChosen = orders.length > 0 && chosen.length === orders.length;
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(orders.map((o) => o.orderId)));

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

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Link href="/admin/orders" style={{ color: C.brand, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Orders</Link>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '8px 0 6px', color: C.text }}>Shipping labels</h1>
          <p style={{ margin: '0 0 20px', color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
            Orders that ship by Canada Post and aren&apos;t marked shipped yet — one label per package.
            Labels print from the top of a Letter sheet, 4 per sheet, so a partly used sheet can go back in the printer.
          </p>

          {error && <p style={{ color: '#DC2626' }}>{error}</p>}
          {!data && !error && <p style={{ color: C.muted }}>Loading orders to ship…</p>}

          {data && (
            <>
              {!data.scannedAll && (
                <div style={{ background: C.warnBg, border: '1px solid ' + C.warnBorder, borderLeft: '4px solid #E8873C', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: C.warnText }}>
                  ⚠️ There are more orders than this page scans — very old orders may be missing below.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>FROM (EVERY LABEL)</div>
                  {data.returnAddress.map((l) => <div key={l} style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre' }}>{l}</div>)}
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>Note printed on each label: <strong style={{ color: C.text }}>{data.note}</strong></div>
                </div>

                <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px' }}>
                  <label htmlFor="free-spaces" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>SHEET IN THE PRINTER</label>
                  <select id="free-spaces" value={freeSpaces} onChange={(e) => setFreeSpaces(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14 }}>
                    {FEEDABLE_FREE_SPACES.map((n) => <option key={n} value={n}>{FREE_LABELS[n]}</option>)}
                  </select>
                  <div data-testid="labels-summary" style={{ fontSize: 13, color: C.text, marginTop: 10, lineHeight: 1.5 }}>
                    {labelCount === 0 ? 'No orders selected.' : (
                      <>
                        <strong>{plural(labelCount, 'label')}</strong> on {plural(plan.pages.length, 'page')}
                        {plan.newSheets > 0 && <> · {plural(plan.newSheets, 'new sheet')}</>}
                        <div style={{ color: plan.leftoverSpaces === 1 ? '#B45309' : C.muted, fontSize: 12.5 }}>
                          {plan.leftoverSpaces === 0
                            ? 'Uses the last sheet completely.'
                            : plan.leftoverFeedable
                              ? `Keep the last sheet: ${plural(plan.leftoverSpaces, 'space')} left for next time.`
                              : 'The last sheet keeps 1 space — too short to feed again.'}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.text, cursor: orders.length ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={allChosen} disabled={orders.length === 0} onChange={toggleAll} />
                  {plural(orders.length, 'order')} to ship · {chosen.length} selected
                </label>
                <a
                  href={canDownload ? downloadHref : undefined}
                  aria-disabled={!canDownload}
                  data-testid="download-labels"
                  style={{
                    fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 18px',
                    background: canDownload ? C.brand : '#9CA3AF', pointerEvents: canDownload ? 'auto' : 'none',
                  }}
                >
                  Download labels PDF{labelCount > 0 ? ` (${labelCount})` : ''}
                </a>
              </div>
              {tooMany && (
                <p data-testid="too-many" style={{ margin: '0 0 12px', fontSize: 13, color: '#B45309', textAlign: 'right' }}>
                  One PDF takes up to {MAX_ORDERS_PER_PDF} orders — untick {chosen.length - MAX_ORDERS_PER_PDF} and download the rest in a second batch.
                </p>
              )}

              {orders.length === 0 && (
                <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, padding: '28px 18px', textAlign: 'center', color: C.muted }}>
                  Nothing to ship right now — every shipping order is marked shipped.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orders.map((o) => {
                  const on = selected.has(o.orderId);
                  return (
                    <div key={o.orderId} data-testid="label-order" style={{
                      display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-start', background: C.white, borderRadius: 12, padding: '14px 16px',
                      border: '1.5px solid ' + (on ? C.brand : C.border), opacity: on ? 1 : 0.75,
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(o.orderId)} aria-label={'Include ' + o.orderId} style={{ marginTop: 4 }} />
                      <div style={{ flex: '1 1 160px', maxWidth: 220, minWidth: 0 }}>
                        <Link href={`/admin/orders/${o.orderId}`} style={{ color: C.brand, fontWeight: 700, textDecoration: 'none' }}>{o.orderId}</Link>
                        {o.isTest && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#fff', background: '#F59E0B', padding: '1px 6px', borderRadius: 4 }}>TEST</span>}
                        <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>{o.customerName || '—'}</div>
                        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
                          {o.method === 'tracked' ? 'Tracked' : 'Standard'} · {plural(o.packages, 'label')}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          {o.committedDate ? 'Ship by ' + o.committedDate : (o.createdAt ? 'Ordered ' + new Date(o.createdAt).toLocaleDateString('en-CA') : '')} · {o.status}
                        </div>
                      </div>
                      <div style={{ flex: '2 1 260px', minWidth: 0 }}>
                        <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700, fontSize: 13.5, lineHeight: 1.45, color: C.text, whiteSpace: 'pre-wrap' }}>
                          {o.lines.join('\n')}
                        </div>
                        {o.problems.length > 0 && (
                          <ul style={{ margin: '8px 0 0', padding: '8px 12px 8px 26px', background: C.warnBg, border: '1px solid ' + C.warnBorder, borderRadius: 8, color: C.warnText, fontSize: 12.5 }}>
                            {o.problems.map((p) => <li key={p}>{p}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p style={{ marginTop: 20, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                Print at <strong>Actual size / 100%</strong>{' '}(not &quot;Fit to page&quot;) and cut along the dashed lines.
                Put a partly used sheet back with the cut edge going in first, same side up.
                Once a package is mailed, mark the order shipped on its page so it leaves this list.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
