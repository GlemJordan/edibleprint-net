'use client';

import { useState } from 'react';
import { getShippingCost } from '../../../lib/shipping-config.js';

const C = {
  brand: '#1f5236', accent: '#e8704a', text: '#1a2420', muted: '#5c6b62',
  border: '#d9e2d6', white: '#fff', bg: '#FAFBF9',
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid ' + C.border,
  fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
};
const labelStyle = { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: C.text };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends the SAME payload shape /api/create-checkout already accepts from
// app/page.js — this form just supplies its own customer/shipping fields
// and one `designs[]` entry carrying catalogDesignId/customText, which
// create-checkout, the webhook, and order-record.js pass through additively
// (see the plan) without needing anything else from this page.
export default function CustomerCheckoutForm({ design, unitPrice, designPayload, onBack }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fulfillment, setFulfillment] = useState('pickup');
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('Ontario');
  const [postal, setPostal] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const shippingCost = getShippingCost(fulfillment === 'pickup' ? 'pickup' : 'shipping');
  const total = unitPrice * designPayload.quantity + shippingCost;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Please enter your name.');
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.');
    if (fulfillment === 'shipping' && (!address.trim() || !city.trim() || !postal.trim())) {
      return setError('Please complete your shipping address.');
    }
    if (!confirmed) return setError('Please confirm the name/text above is correct before continuing.');

    setSubmitting(true);
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          shippingAddress: address.trim() + (unit.trim() ? ', ' + unit.trim() : ''),
          shippingCity: city.trim(),
          shippingProvince: province.trim(),
          shippingPostal: postal.trim(),
          shippingMethod: fulfillment === 'pickup' ? 'pickup' : 'shipping',
          shippingCost,
          designConfirmed: confirmed,
          designConfirmedAt: new Date().toISOString(),
          designs: [{ ...designPayload, notes: notes.trim() }],
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <button type="button" onClick={onBack} style={{
        background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer',
        padding: 0, marginBottom: 16, fontFamily: 'inherit',
      }}>
        ← Back to customize
      </button>

      <Section title="Your details">
        <Field label="Name *"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Row2>
          <Field label="Email *"><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Phone (optional)"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </Row2>
      </Section>

      <Section title="Fulfillment">
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="radio" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} /> Pickup — East London, ON (free)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="radio" checked={fulfillment === 'shipping'} onChange={() => setFulfillment('shipping')} /> Ship (${getShippingCost('shipping').toFixed(2)})
          </label>
        </div>
        {fulfillment === 'shipping' && (
          <>
            <Field label="Address *"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            <Field label="Unit / Apt (optional)"><input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
            <Row2>
              <Field label="City *"><input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
              <Field label="Province"><input style={inputStyle} value={province} onChange={(e) => setProvince(e.target.value)} /></Field>
            </Row2>
            <Field label="Postal code *"><input style={inputStyle} value={postal} onChange={(e) => setPostal(e.target.value)} /></Field>
          </>
        )}
      </Section>

      <Section title="Special instructions (optional)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Section>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: C.text, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
        I confirm the name/text I entered is spelled correctly — it will be printed exactly as shown in the preview.
      </label>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.muted, marginBottom: 4 }}>
        <span>{designPayload.quantity} × {design.name}</span>
        <span>${(unitPrice * designPayload.quantity).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.muted, marginBottom: 12 }}>
        <span>Shipping</span>
        <span>{shippingCost === 0 ? 'Free' : '$' + shippingCost.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 16 }}>
        <span>Total</span>
        <span>${total.toFixed(2)} CAD</span>
      </div>

      {error && <p style={{ color: '#DC2626', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      <button type="submit" disabled={submitting} style={{
        width: '100%', padding: '13px 18px', borderRadius: 10, border: 'none',
        background: C.accent, color: '#fff', fontWeight: 700, fontFamily: 'inherit', fontSize: 15,
        cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
      }}>
        {submitting ? 'Redirecting to payment…' : 'Continue to payment →'}
      </button>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 12, flex: 1 }}><label style={labelStyle}>{label}</label>{children}</div>;
}
function Row2({ children }) {
  return <div style={{ display: 'flex', gap: 12 }}>{children}</div>;
}
