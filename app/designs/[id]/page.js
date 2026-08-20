'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getDesignById, getCategories } from '../../../lib/design-catalog.js';
import { sizesForShape, findSize } from '../../../lib/catalog-design-sizes.js';
import { CATALOG_PRICES } from '../../../lib/catalog-prices.js';
import { shapeDisplayLabel } from '../../../lib/paper-config.js';
import { CATALOG_FONTS, CATALOG_TEXT_COLORS, drawCoverFit, drawZoneText } from '../../../lib/catalog-text-render.js';
import SheetPreview from '../_components/SheetPreview.js';
import CustomerCheckoutForm from '../_components/CustomerCheckoutForm.js';
import MaterialPicker from '../../_components/MaterialPicker.js';

const C = {
  brand: '#1f5236', accent: '#e8704a', text: '#1a2420', muted: '#5c6b62',
  border: '#d9e2d6', white: '#fff', bg: '#FAFBF9',
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid ' + C.border,
  fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load design image'));
    img.src = src;
  });
}

// 300 DPI hi-res composite — same DPI app/page.js's own hi-res export uses
// (see app/page.js's `const DPI = 300`), built fresh at full resolution
// rather than scaled up from the on-screen preview canvas, so print quality
// never depends on how big the preview happened to be rendered.
async function composeHiResPng({ design, sizeObj, text, fontFamily, color }) {
  const DPI = 300;
  const hiResW = Math.round((sizeObj.w || 6) * DPI);
  const hiResH = Math.round((sizeObj.h || 6) * DPI);
  const img = await loadImage(design.sourceFile);
  const canvas = document.createElement('canvas');
  canvas.width = hiResW;
  canvas.height = hiResH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, hiResW, hiResH);
  drawCoverFit(ctx, img, hiResW, hiResH);
  drawZoneText(ctx, { text, fontFamily, color, baseFontSizePx: Math.round(hiResW * 0.09) }, design.textZone, hiResW, hiResH);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export image'))), 'image/png');
  });
}

// Same signed direct-to-Cloudinary upload the "I already have my design"
// flow and the admin manual-order form already use (app/api/upload-print-file)
// — no new upload endpoint needed.
async function uploadComposedPng(blob, filePrefix) {
  const fileName = `${filePrefix}-${Date.now()}.png`;
  const sigRes = await fetch('/api/upload-print-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileSizeBytes: blob.size, mimeType: 'image/png' }),
  });
  if (!sigRes.ok) throw new Error('Could not prepare upload');
  const { cloudName, apiKey, timestamp, signature, publicId } = await sigRes.json();
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', apiKey);
  form.append('signature', signature);
  form.append('invalidate', '1');
  form.append('overwrite', '1');
  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, { method: 'POST', body: form });
  if (!uploadRes.ok) throw new Error('Upload failed');
  const result = await uploadRes.json();
  if (!result.secure_url) throw new Error('Upload failed');
  return result.secure_url;
}

export default function CustomizeDesignPage() {
  const { id } = useParams();
  const design = useMemo(() => getDesignById(id), [id]);
  const categories = useMemo(() => getCategories(), []);

  const [step, setStep] = useState('customize'); // 'customize' | 'checkout'
  const [shape, setShape] = useState(design?.supportedShapes?.[0] || '');
  const [material, setMaterial] = useState('icing');
  const [sizeId, setSizeId] = useState(sizesForShape(design?.supportedShapes?.[0] || '')[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [fontId, setFontId] = useState(CATALOG_FONTS[0].id);
  const [color, setColor] = useState(CATALOG_TEXT_COLORS[0]);
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [designPayload, setDesignPayload] = useState(null);

  const sizes = sizesForShape(shape);
  const sizeObj = findSize(shape, sizeId) || sizes[0];
  const unitPrice = shape === 'custom' ? 0 : CATALOG_PRICES[shape]?.[sizeId] ?? 0;
  const font = CATALOG_FONTS.find((f) => f.id === fontId) || CATALOG_FONTS[0];
  const combinedText = age.trim() ? `${name.trim()}, ${age.trim()}` : name.trim();

  if (!design) {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', padding: 60, textAlign: 'center' }}>
        <p style={{ color: C.text, marginBottom: 16 }}>We couldn&apos;t find that design.</p>
        <Link href="/designs" style={{ color: C.brand, fontWeight: 600 }}>← Back to the catalog</Link>
      </div>
    );
  }

  const categoryLabel = categories.find((c) => c.id === design.category)?.label || design.category;

  const handleShapeChange = (s) => {
    setShape(s);
    const first = sizesForShape(s)[0];
    setSizeId(first?.id || '');
  };

  const handleContinue = async () => {
    setComposeError('');
    if (!name.trim()) { setComposeError('Please enter a name.'); return; }
    if (!sizeObj) { setComposeError('Please choose a size.'); return; }
    setComposing(true);
    try {
      const blob = await composeHiResPng({ design, sizeObj, text: combinedText, fontFamily: font.family, color });
      const imageUrl = await uploadComposedPng(blob, design.id);
      setDesignPayload({
        shape,
        material,
        size: sizeObj.label,
        sizeId,
        customW: '',
        customH: '',
        customShapeKind: '',
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        unitPrice,
        imageUrl,
        catalogDesignId: design.id,
        customText: combinedText,
      });
      setStep('checkout');
    } catch (err) {
      setComposeError('Something went wrong preparing your design. Please try again.');
    } finally {
      setComposing(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid ' + C.border, background: C.white }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/designs" style={{ color: C.muted, fontSize: 13.5, textDecoration: 'none' }}>← All designs</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 64px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            {categoryLabel}
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>
            {design.name}
          </h1>
          <SheetPreview design={design} shape={shape} sizeObj={sizeObj} text={combinedText} fontFamily={font.family} color={color} />
        </div>

        <div style={{ flex: '1 1 340px', maxWidth: 480 }}>
          {step === 'customize' ? (
            <>
              <FieldGroup label="Format">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {design.supportedShapes.map((s) => (
                    <ChipButton key={s} active={s === shape} onClick={() => handleShapeChange(s)}>
                      {shapeDisplayLabel(s)}
                    </ChipButton>
                  ))}
                </div>
              </FieldGroup>

              <MaterialPicker shape={shape} material={material} onChange={setMaterial} colors={C} />

              <FieldGroup label="Size">
                <select style={inputStyle} value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} — ${CATALOG_PRICES[shape]?.[s.id]?.toFixed(2)}</option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup label="Quantity">
                <input type="number" min="1" style={{ ...inputStyle, maxWidth: 100 }} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </FieldGroup>

              <FieldGroup label="Name *">
                <input style={inputStyle} placeholder="e.g. Emma" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </FieldGroup>

              <FieldGroup label="Age (optional)">
                <input style={{ ...inputStyle, maxWidth: 120 }} placeholder="e.g. 5" value={age} onChange={(e) => setAge(e.target.value)} maxLength={10} />
              </FieldGroup>

              <FieldGroup label="Font">
                <select style={inputStyle} value={fontId} onChange={(e) => setFontId(e.target.value)}>
                  {CATALOG_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </FieldGroup>

              <FieldGroup label="Text color">
                <div style={{ display: 'flex', gap: 8 }}>
                  {CATALOG_TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={c}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                        border: c === color ? '2.5px solid ' + C.brand : '1.5px solid ' + C.border,
                      }}
                    />
                  ))}
                </div>
              </FieldGroup>

              {composeError && <p style={{ color: '#DC2626', fontSize: 14, marginBottom: 12 }}>{composeError}</p>}

              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                ${unitPrice.toFixed(2)} <span style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>each</span>
              </div>

              <button
                onClick={handleContinue}
                disabled={composing}
                style={{
                  width: '100%', padding: '13px 18px', borderRadius: 10, border: 'none',
                  background: C.accent, color: '#fff', fontWeight: 700, fontFamily: 'inherit', fontSize: 15,
                  cursor: composing ? 'not-allowed' : 'pointer', opacity: composing ? 0.6 : 1,
                }}
              >
                {composing ? 'Preparing your design…' : 'Continue →'}
              </button>
            </>
          ) : (
            <CustomerCheckoutForm
              design={design}
              unitPrice={unitPrice}
              designPayload={designPayload}
              onBack={() => setStep('customize')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: C.text }}>{label}</label>
      {children}
    </div>
  );
}

function ChipButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        cursor: 'pointer', border: '1px solid ' + (active ? C.brand : C.border),
        background: active ? C.brand : C.white, color: active ? '#fff' : C.text,
        borderRadius: 40, padding: '7px 14px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
