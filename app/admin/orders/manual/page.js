'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', text: '#1a1a1a',
  muted: '#6B7280', border: '#E5E7EB', white: '#FFFFFF', bg: '#FAFBF9',
};

const CHANNELS = [
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'e_transfer', label: 'E-transfer' },
  { value: 'other', label: 'Other' },
];

const SHAPE_PRESETS = ['Round', 'Heart', 'Square', 'Cookie Sheet', 'Full Sheet', 'B&W Sheet', 'Wafer Paper', 'Custom', 'Other'];

// Must match ALLOWED_MIME_TYPES / MAX_FILE_MB in app/api/upload-print-file —
// same signed direct-to-Cloudinary upload the "I already have my design"
// customer flow uses (app/page.js's uploadCustomerFileDirect), reused as-is
// rather than building a second upload path for this admin-only form.
const MAX_FILE_MB = 25;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid ' + C.border,
  fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
};
const labelStyle = { fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: C.text };

function todayLocalDate() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function AddManualOrderPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => { setIsAdmin(!!d.isAdmin); setAuthChecked(true); })
      .catch(() => { setIsAdmin(false); setAuthChecked(true); });
  }, []);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [channel, setChannel] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [shapePreset, setShapePreset] = useState('');
  const [shapeOther, setShapeOther] = useState('');
  const [material, setMaterial] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amountDollars, setAmountDollars] = useState('');
  const [isPickup, setIsPickup] = useState(true);
  const [shipLine1, setShipLine1] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipProvince, setShipProvince] = useState('Ontario');
  const [shipPostal, setShipPostal] = useState('');
  const [saleDate, setSaleDate] = useState(todayLocalDate());
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setFileError('');
    if (!f) { setFile(null); return; }
    if (!ALLOWED_MIME_TYPES.includes(f.type)) {
      setFileError('Unsupported file type — use PDF, PNG, or JPEG.');
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File exceeds the ${MAX_FILE_MB}MB limit.`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  // Signed direct browser→Cloudinary upload — identical mechanism to
  // app/page.js's uploadCustomerFileDirect (see app/api/upload-print-file
  // for why this doesn't route the file through our own server first).
  async function uploadFileDirect(f) {
    const sigRes = await fetch('/api/upload-print-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: f.name, fileSizeBytes: f.size, mimeType: f.type }),
    });
    if (!sigRes.ok) throw new Error('Could not prepare file upload');
    const { cloudName, apiKey, timestamp, signature, publicId } = await sigRes.json();

    const form = new FormData();
    form.append('file', f);
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('api_key', apiKey);
    form.append('signature', signature);
    form.append('invalidate', '1');
    form.append('overwrite', '1');

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
      method: 'POST', body: form,
    });
    if (!uploadRes.ok) throw new Error('File upload failed');
    const uploadResult = await uploadRes.json();
    if (!uploadResult.secure_url) throw new Error('File upload failed');
    return uploadResult.secure_url;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const shape = shapePreset === 'Other' ? shapeOther.trim() : shapePreset;
    if (!customerName.trim()) return setError('Customer name is required.');
    if (!channel) return setError('Please select a sale channel.');
    if (!paymentMethod) return setError('Please select a payment method.');
    if (!shape) return setError('Please select or enter a format.');
    if (!size.trim()) return setError('Size is required.');
    const amountCents = Math.round(parseFloat(amountDollars || '0') * 100);
    if (!amountCents || amountCents <= 0) return setError('Enter the amount charged.');
    if (!isPickup && !shipLine1.trim()) return setError('Shipping address is required when not picking up.');

    setSubmitting(true);
    try {
      let imageUrl;
      if (file) {
        imageUrl = await uploadFileDirect(file);
      }

      const res = await fetch('/api/admin/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          channel, paymentMethod,
          shape, material: material.trim() || undefined,
          size: size.trim(), quantity: parseInt(quantity, 10) || 1,
          amountCents,
          isPickup,
          shippingAddress: isPickup ? undefined : {
            line1: shipLine1.trim(), city: shipCity.trim(),
            province: shipProvince.trim(), postalCode: shipPostal.trim(), country: 'CA',
          },
          saleDate: saleDate ? new Date(saleDate).toISOString() : undefined,
          notes: notes.trim() || undefined,
          imageUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save order');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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
          <p style={{ marginBottom: 16, color: C.text }}>You need to be signed in as admin to view this page.</p>
          <Link href="/admin-login" style={{ color: C.brand, fontWeight: 600 }}>Go to admin login →</Link>
        </div>
      </>
    );
  }

  if (result) {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: C.text, margin: '0 0 8px' }}>Manual order saved</h1>
          <p style={{ color: C.muted, marginBottom: 4 }}>Order <strong>{result.orderId}</strong></p>
          {result.missingAssets && (
            <p style={{ color: '#B45309', fontSize: 13.5 }}>⚠️ Production slip or print-ready PDF may be incomplete — check the order page.</p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <Link href={`/admin/orders/${result.orderId}`} style={{
              padding: '10px 18px', borderRadius: 8, background: C.brand, color: '#fff',
              fontWeight: 600, textDecoration: 'none', fontSize: 14,
            }}>
              View order →
            </Link>
            <Link href="/admin/orders" style={{
              padding: '10px 18px', borderRadius: 8, border: '1.5px solid ' + C.border, color: C.text,
              fontWeight: 600, textDecoration: 'none', fontSize: 14,
            }}>
              Back to Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Link href="/admin/orders" style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>← All orders</Link>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, margin: '10px 0 24px', color: C.text }}>
            Add manual order
          </h1>
          <p style={{ color: C.muted, fontSize: 13.5, marginTop: -14, marginBottom: 24 }}>
            For sales that happened outside the website — marketplace, cash, or e-transfer. This is the only record of those sales, so double-check the amount before saving.
          </p>

          <form onSubmit={handleSubmit}>
            <Section title="Customer">
              <Field label="Name *"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
              <Row2>
                <Field label="Email (optional)"><input type="email" style={inputStyle} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></Field>
                <Field label="Phone (optional)"><input style={inputStyle} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></Field>
              </Row2>
            </Section>

            <Section title="Sale details">
              <Row2>
                <Field label="Channel *">
                  <select style={inputStyle} value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="">Select…</option>
                    {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Payment method *">
                  <select style={inputStyle} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="">Select…</option>
                    {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
              </Row2>
              <Field label="Sale date"><input type="date" style={inputStyle} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></Field>
            </Section>

            <Section title="Product">
              <Row2>
                <Field label="Format *">
                  <select style={inputStyle} value={shapePreset} onChange={(e) => setShapePreset(e.target.value)}>
                    <option value="">Select…</option>
                    {SHAPE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                {shapePreset === 'Other' && (
                  <Field label="Format (specify)"><input style={inputStyle} value={shapeOther} onChange={(e) => setShapeOther(e.target.value)} /></Field>
                )}
                <Field label="Material (optional)"><input style={inputStyle} placeholder="e.g. Icing sheet" value={material} onChange={(e) => setMaterial(e.target.value)} /></Field>
              </Row2>
              <Row2>
                <Field label="Size *"><input style={inputStyle} placeholder={'e.g. 6" round'} value={size} onChange={(e) => setSize(e.target.value)} /></Field>
                <Field label="Quantity"><input type="number" min="1" style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
              </Row2>
            </Section>

            <Section title="Amount charged">
              <Field label="Total (CAD) *">
                <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0.00" value={amountDollars} onChange={(e) => setAmountDollars(e.target.value)} />
              </Field>
            </Section>

            <Section title="Fulfillment">
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" checked={isPickup} onChange={() => setIsPickup(true)} /> Pickup
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" checked={!isPickup} onChange={() => setIsPickup(false)} /> Shipping
                </label>
              </div>
              {!isPickup && (
                <>
                  <Field label="Address *"><input style={inputStyle} value={shipLine1} onChange={(e) => setShipLine1(e.target.value)} /></Field>
                  <Row2>
                    <Field label="City"><input style={inputStyle} value={shipCity} onChange={(e) => setShipCity(e.target.value)} /></Field>
                    <Field label="Province"><input style={inputStyle} value={shipProvince} onChange={(e) => setShipProvince(e.target.value)} /></Field>
                  </Row2>
                  <Field label="Postal code"><input style={inputStyle} value={shipPostal} onChange={(e) => setShipPostal(e.target.value)} /></Field>
                </>
              )}
            </Section>

            <Section title="Notes">
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Section>

            <Section title="Design file (optional)">
              <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={handleFileChange} />
              {file && <p style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{file.name}</p>}
              {fileError && <p style={{ fontSize: 12.5, color: '#DC2626', marginTop: 6 }}>{fileError}</p>}
              <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>If provided, this generates the production PDF just like a website order, printed exactly as uploaded.</p>
            </Section>

            {error && <p style={{ color: '#DC2626', fontSize: 14 }}>{error}</p>}

            <button type="submit" disabled={submitting} style={{
              width: '100%', padding: '12px 18px', borderRadius: 8, border: 'none',
              background: C.brand, color: '#fff', fontWeight: 700, fontFamily: 'inherit', fontSize: 15,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, marginTop: 8,
            }}>
              {submitting ? 'Saving…' : 'Save manual order'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: C.white, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12, flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Row2({ children }) {
  return <div style={{ display: 'flex', gap: 12 }}>{children}</div>;
}
