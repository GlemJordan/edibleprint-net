'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getDesignById, getCategories, designForShape, supportsPhoto } from '../../../lib/design-catalog.js';
import { sizesForShape, findSize } from '../../../lib/catalog-design-sizes.js';
import { CATALOG_PRICES } from '../../../lib/catalog-prices.js';
import { MAX_SHEETS_PER_ORDER, orderLimitMessage } from '../../../lib/shipping-config.js';
import { shapeDisplayLabel, designAreaInForShape } from '../../../lib/paper-config.js';
import { CATALOG_FONTS, CATALOG_TEXT_COLORS } from '../../../lib/catalog-text-render.js';
import { drawCatalogDesign, loadCustomerPhoto, PHOTO_ZOOM_MAX } from '../../../lib/catalog-compose.js';
import SheetPreview, { DesignThumb } from '../_components/SheetPreview.js';
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

// Same cap the upload signer enforces (app/api/upload-print-file).
const UPLOAD_MAX_BYTES = 24 * 1024 * 1024;
const PHOTO_MAX_FILE_MB = 25;
const NO_ADJUST = { zoom: 1, x: 0, y: 0 };

// 300 DPI hi-res composite — same DPI app/page.js's own hi-res export uses
// (see app/page.js's `const DPI = 300`), built fresh at full resolution
// rather than scaled up from the on-screen preview canvas, so print quality
// never depends on how big the preview happened to be rendered.
//
// A 'box'-fitMode shape (fullsheet) prints into the margin box carved out of
// the sheet, not the whole sheet, so the composite is built at that box's
// exact proportions — the same box SheetPreview cover-fits into. Composed at
// the full A4 size instead, the PDF would contain-fit it into the narrower
// box (see fitRasterInPlacement()) and print blank strips down both sides.
async function composeHiResPng({ design, shape, sizeObj, text, fontFamily, color, photo, photoAdjust }) {
  const DPI = 300;
  const area = designAreaInForShape(shape);
  const hiResW = Math.round((area ? area.w : sizeObj.w || 6) * DPI);
  const hiResH = Math.round((area ? area.h : sizeObj.h || 6) * DPI);
  const withPhoto = Boolean(photo && design.photoZone);
  const [art, mask] = await Promise.all([
    loadImage(design.sourceFile),
    withPhoto ? loadImage(design.photoZone.mask) : null,
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = hiResW;
  canvas.height = hiResH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Round/heart come out clipped to their outline with white outside, the
  // same as the editor's own round/heart export (white, not transparent, so
  // the JPEG fallback below can't turn the corners black).
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, hiResW, hiResH);
  drawCatalogDesign(ctx, hiResW, hiResH, {
    shape, design, art, mask, photo: withPhoto ? photo : null, photoAdjust,
    text: { text, fontFamily, color },
  });
  const toBlob = (type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export image'))), type, quality);
  });
  const png = await toBlob('image/png');
  // A photo makes the lossless PNG much heavier; past the upload cap, a
  // near-lossless JPEG (the print pipeline embeds both) keeps it printable.
  return png.size <= UPLOAD_MAX_BYTES ? png : toBlob('image/jpeg', 0.95);
}

// Same signed direct-to-Cloudinary upload the "I already have my design"
// flow and the admin manual-order form already use (app/api/upload-print-file)
// — no new upload endpoint needed.
async function uploadComposedPng(blob, filePrefix) {
  const isJpeg = blob.type === 'image/jpeg';
  const fileName = `${filePrefix}-${Date.now()}.${isJpeg ? 'jpg' : 'png'}`;
  const sigRes = await fetch('/api/upload-print-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileSizeBytes: blob.size, mimeType: isJpeg ? 'image/jpeg' : 'image/png' }),
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
  // The customer's own photo, shown through the design's clear centre.
  const [photo, setPhoto] = useState(null);
  const [photoName, setPhotoName] = useState('');
  const [photoAdjust, setPhotoAdjust] = useState(NO_ADJUST);
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoInputRef = useRef(null);

  const sizes = sizesForShape(shape);
  const sizeObj = findSize(shape, sizeId) || sizes[0];
  const unitPrice = shape === 'custom' ? 0 : CATALOG_PRICES[shape]?.[sizeId] ?? 0;
  const font = CATALOG_FONTS.find((f) => f.id === fontId) || CATALOG_FONTS[0];
  // With a photo the name is optional, so an age on its own prints without
  // the ", " separator.
  const combinedText = [name.trim(), age.trim()].filter(Boolean).join(', ');
  const photoAllowed = design ? supportsPhoto(design, shape) : false;
  const usePhoto = Boolean(photo && photoAllowed);

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

  const handlePhotoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!/^image\//.test(file.type)) { setPhotoError('Please choose a photo (JPG or PNG).'); return; }
    if (file.size > PHOTO_MAX_FILE_MB * 1024 * 1024) { setPhotoError(`That photo is over ${PHOTO_MAX_FILE_MB}MB. Please choose a smaller one.`); return; }
    setPhotoLoading(true);
    try {
      const img = await loadCustomerPhoto(file);
      setPhoto(img);
      setPhotoName(file.name);
      setPhotoAdjust(NO_ADJUST);
      // Dark text (the default) gets lost on a photo; white with its dark
      // outline reads on almost any picture.
      if (color === CATALOG_TEXT_COLORS[0]) setColor('#FFFFFF');
    } catch {
      setPhotoError("We couldn't open that photo. Please try a JPG or PNG.");
    } finally {
      setPhotoLoading(false);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoName('');
    setPhotoAdjust(NO_ADJUST);
    setPhotoError('');
    if (color === '#FFFFFF') setColor(CATALOG_TEXT_COLORS[0]);
  };

  const handleContinue = async () => {
    setComposeError('');
    if (!name.trim() && !usePhoto) { setComposeError('Please enter a name or add a photo.'); return; }
    if (!sizeObj) { setComposeError('Please choose a size.'); return; }
    setComposing(true);
    try {
      const blob = await composeHiResPng({
        design: designForShape(design, shape), shape, sizeObj, text: combinedText, fontFamily: font.family, color,
        photo: usePhoto ? photo : null, photoAdjust,
      });
      const imageUrl = await uploadComposedPng(blob, design.id);
      setDesignPayload({
        shape,
        material,
        size: sizeObj.label,
        sizeId,
        customW: '',
        customH: '',
        customShapeKind: '',
        quantity: Math.min(MAX_SHEETS_PER_ORDER, Math.max(1, parseInt(quantity, 10) || 1)),
        unitPrice,
        imageUrl,
        catalogDesignId: design.id,
        customText: combinedText,
        catalogPhoto: usePhoto,
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
          <SheetPreview
            design={design} shape={shape} sizeObj={sizeObj} text={combinedText} fontFamily={font.family} color={color}
            photo={usePhoto ? photo : null} photoAdjust={photoAdjust}
          />
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
                <input
                  type="number" min="1" max={MAX_SHEETS_PER_ORDER} style={{ ...inputStyle, maxWidth: 100 }} value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) > MAX_SHEETS_PER_ORDER ? String(MAX_SHEETS_PER_ORDER) : e.target.value)}
                />
                {(parseInt(quantity, 10) || 0) >= MAX_SHEETS_PER_ORDER && (
                  <p role="status" style={{ margin: '8px 0 0', fontSize: 13, color: C.muted }}>{orderLimitMessage()}</p>
                )}
              </FieldGroup>

              {photoAllowed && (
                <FieldGroup label="Your photo (optional)">
                  <PhotoField
                    photo={photo} photoName={photoName} adjust={photoAdjust} onAdjust={setPhotoAdjust}
                    loading={photoLoading} error={photoError}
                    onPick={() => photoInputRef.current?.click()} onRemove={removePhoto}
                    preview={(
                      <DesignThumb
                        design={design} shape={shape} sizeObj={sizeObj} text={combinedText} fontFamily={font.family} color={color}
                        photo={usePhoto ? photo : null} photoAdjust={photoAdjust}
                      />
                    )}
                  />
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoFile} style={{ display: 'none' }} />
                </FieldGroup>
              )}

              <FieldGroup label={usePhoto ? 'Name (optional)' : 'Name *'}>
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

const smallBtn = {
  cursor: 'pointer', border: '1px solid ' + C.border, background: C.white, color: C.text,
  borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};

function PhotoField({ photo, photoName, adjust, onAdjust, loading, error, onPick, onRemove, preview }) {
  const set = (k) => (e) => onAdjust({ ...adjust, [k]: parseFloat(e.target.value) });
  if (!photo) {
    return (
      <>
        <button
          type="button" onClick={onPick} disabled={loading}
          style={{ ...smallBtn, width: '100%', padding: '12px 14px', borderStyle: 'dashed', borderWidth: 1.5, color: C.brand, cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Opening your photo…' : '+ Add a photo to the centre of the design'}
        </button>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>
          Your photo shows through the clear centre; the design&apos;s artwork stays around it. JPG or PNG.
        </p>
        {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 13, color: '#DC2626' }}>{error}</p>}
      </>
    );
  }
  return (
    <div style={{ border: '1px solid ' + C.border, borderRadius: 10, padding: 12, background: C.white }}>
      {preview}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ flex: 1, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photoName || 'Your photo'}</span>
        <button type="button" onClick={onPick} style={smallBtn}>Change</button>
        <button type="button" onClick={onRemove} style={{ ...smallBtn, color: '#B42318' }}>Remove</button>
      </div>
      <Slider label="Zoom" min={1} max={PHOTO_ZOOM_MAX} step={0.01} value={adjust.zoom} onChange={set('zoom')} />
      <Slider label="Left / right" min={-1} max={1} step={0.01} value={adjust.x} onChange={set('x')} />
      <Slider label="Up / down" min={-1} max={1} step={0.01} value={adjust.y} onChange={set('y')} />
      <button type="button" onClick={() => onAdjust(NO_ADJUST)} style={{ ...smallBtn, marginTop: 4 }}>Reset photo</button>
      {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 13, color: '#DC2626' }}>{error}</p>}
    </div>
  );
}

function Slider({ label, ...props }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: C.muted, marginBottom: 8 }}>
      <span style={{ width: 82, flexShrink: 0 }}>{label}</span>
      <input type="range" {...props} style={{ flex: 1, accentColor: C.brand }} />
    </label>
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
