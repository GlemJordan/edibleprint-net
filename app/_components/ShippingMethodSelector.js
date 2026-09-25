'use client';

import { useId } from 'react';
import Link from 'next/link';
import {
  getShippingMethods, describeShippingMethod, assessNeededByDate, formatProductionWindow,
} from '../../lib/shipping-config.js';
import { todayInBusinessTimezone } from '../../lib/delivery-urgency.js';

/**
 * Standard vs Tracked shipping selector, with the optional needed-by date
 * and its advisory warning. Rendered only when the customer chose to ship —
 * pickup never shows it. Every price, window and tracking statement comes
 * from lib/shipping-config.js; nothing about a method is written out here.
 *
 * Same component in both checkouts (app/page.js and
 * app/designs/_components/CustomerCheckoutForm.js). As with MaterialPicker,
 * each passes its own `colors` so it reads as native to that page.
 *
 * The date warnings are hints, never a gate: it doesn't disable anything, and
 * the date input deliberately has no `min` (which would make the designs
 * form's native validation refuse to submit).
 *
 * @param {{
 *   method: string,
 *   onMethodChange: (id: string) => void,
 *   neededBy: string,
 *   onNeededByChange: (date: string) => void,
 *   colors: { brand: string, brandLight: string, border: string, text: string, muted: string, white: string },
 * }} props
 */
export default function ShippingMethodSelector({ method, onMethodChange, neededBy, onNeededByChange, colors: C }) {
  const dateId = useId();
  // 'method-too-slow': another method would make the date. 'unreachable': none
  // would, so the message is about the date and shows whichever is selected.
  const assessment = assessNeededByDate(method, neededBy, todayInBusinessTimezone());
  const warning = assessment === 'unreachable'
    ? 'We may not be able to deliver by that date. Please contact us before placing your order.'
    : assessment === 'method-too-slow'
      ? 'Standard shipping may not arrive in time for that date. We recommend tracked shipping.'
      : null;

  return (
    <div style={{ marginTop: 4 }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: C.muted }}>
        Orders are printed within {formatProductionWindow()} before shipping.
      </p>
      <div role="radiogroup" aria-label="Shipping method">
        {getShippingMethods().map((m) => {
          const selected = method === m.id;
          return (
            <label key={m.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12,
              border: selected ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
              background: selected ? C.brandLight : C.white, marginBottom: 8, cursor: 'pointer',
            }}>
              <input
                type="radio" name="shipping-method" value={m.id}
                checked={selected} onChange={() => onMethodChange(m.id)}
                style={{ accentColor: C.brand, width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text }}>
                  {m.label} — {m.carrier}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                  {describeShippingMethod(m)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <label htmlFor={dateId} style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block', color: C.text }}>
          Do you need your order by a specific date? (optional)
        </label>
        <input
          id={dateId} type="date" value={neededBy}
          onChange={(e) => onNeededByChange(e.target.value)}
          style={{
            width: '100%', maxWidth: 220, padding: '10px 12px', borderRadius: 8,
            border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
          }}
        />
        <div role="status" aria-live="polite">
          {warning && (
            <p style={{
              margin: '10px 0 0', padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
              background: '#FFF8E6', border: '1px solid #F4D06F', borderLeft: '4px solid #E8873C', color: '#5C4A1A',
            }}>
              {warning}
            </p>
          )}
        </div>
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 12.5 }}>
        <Link href="/shipping" target="_blank" rel="noopener noreferrer" style={{ color: C.brand, fontWeight: 600 }}>
          Shipping policy
        </Link>
      </p>
    </div>
  );
}
