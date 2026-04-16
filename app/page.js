'use client';

import { useState, useRef, useEffect } from 'react';
import './globals.css';

/* ═══ PRICING CONFIG ═══ */
const SIZES = {
  circular: [
    { id: 'c5', label: '5" Round (13cm)', w: 5, h: 5, price: 14.99 },
    { id: 'c6', label: '6" Round (15cm)', w: 6, h: 6, price: 14.99 },
    { id: 'c7', label: '7" Round (18cm)', w: 7, h: 7, price: 19.99 },
    { id: 'c8', label: '8" Round (20cm)', w: 8, h: 8, price: 19.99 },
  ],
  square: [
    { id: 's6', label: '6"×6" (15cm)', w: 6, h: 6, price: 14.99 },
    { id: 's7', label: '7"×7" (18cm)', w: 7, h: 7, price: 19.99 },
  ],
  rectangular: [
    { id: 'r7x10', label: '7"×10" (18×25cm)', w: 7, h: 10, price: 19.99 },
    { id: 'r8x11', label: '8"×11" Full A4 (20×28cm)', w: 8, h: 11, price: 19.99 },
  ],
  custom: [{ id: 'custom', label: 'Custom Size', w: 0, h: 0, price: 0 }],
};

/* ═══ SHIPPING & DELIVERY ZONES ═══ */
const SHIPPING = { standard: 9.99, express: 19.99 };
const LOCAL_ZONES = {
  south:   { name: 'South London',   price: 6.99, fsas: ['N5Z','N6E','N6J','N6L','N6M','N6N','N6P'] },
  central: { name: 'Central London', price: 7,    fsas: ['N6A','N6B','N6C'] },
  east:    { name: 'East London',    price: 8,    fsas: ['N5V','N5W'] },
  west:    { name: 'West London',    price: 8,    fsas: ['N5P','N6G','N6H','N6K'] },
  north:   { name: 'North London',   price: 10,   fsas: ['N5X','N5Y'] },
};

function getLocalZone(postalCode) {
  if (!postalCode) return null;
  const fsa = postalCode.replace(/\s/g, '').toUpperCase().slice(0, 3);
  for (const [key, zone] of Object.entries(LOCAL_ZONES)) {
    if (zone.fsas.includes(fsa)) return { key, ...zone };
  }
  return null;
}

const TAX_RATE = 0.13;

const PROVINCES = [
  'Alberta','British Columbia','Manitoba','New Brunswick',
  'Newfoundland and Labrador','Northwest Territories','Nova Scotia',
  'Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon'
];

/* ═══ BRAND COLORS ═══ */
const C = {
  brand: '#1B6B4A', brandLight: '#E8F5EE', brandDark: '#14503A',
  accent: '#E8873C', accentLight: '#FFF4EB',
  bg: '#FAFBF9', text: '#1a1a1a', muted: '#6B7280',
  border: '#E5E7EB', white: '#FFFFFF',
};

/* ═══ STYLES ═══ */
const inputStyle = {
  width: '100%', padding: '12px 14px', border: '1.5px solid ' + C.border, borderRadius: 10,
  fontSize: 15, fontFamily: "'Outfit', sans-serif", outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s', background: C.white,
};
const btnPrimary = {
  background: C.brand, color: '#fff', border: 'none', borderRadius: 12,
  padding: '14px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s',
  boxShadow: '0 4px 16px rgba(27,107,74,0.25)',
};
const btnSecondary = { ...btnPrimary, background: '#F3F4F6', color: '#555', boxShadow: 'none' };
const stepBadge = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, borderRadius: '50%', background: C.brand,
  color: '#fff', fontWeight: 700, fontSize: 15,
};
const card = {
  background: C.white, borderRadius: 14, padding: 20,
  boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid ' + C.border,
};

/* ═══ LOGO ═══ */
function Logo({ size = 28 }) {
  return (
    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: size, fontWeight: 700, letterSpacing: -0.5 }}>
      <span style={{ color: C.brand }}>edible</span>
      <span style={{ color: C.text }}>print</span>
      <span style={{ fontSize: size * 0.42, color: C.muted, fontWeight: 400, marginLeft: 5, fontFamily: "'Outfit', sans-serif" }}>.net</span>
    </span>
  );
}

/* ═══ IMAGE EDITOR (with hi-res export) ═══ */
const FONT_STYLE_MAP = {
  normal:       { style: 'normal',  weight: 'normal' },
  bold:         { style: 'normal',  weight: 'bold'   },
  italic:       { style: 'italic',  weight: 'normal' },
  'bold italic':{ style: 'italic',  weight: 'bold'   },
};
const FONT_SIZE_PX = { small: 18, medium: 26, large: 38 };

function drawText(ctx, textOverlay, w, h, sf = 1) {
  if (!textOverlay?.text) return;
  const px   = (FONT_SIZE_PX[textOverlay.fontSize] || 26) * sf;
  const { style, weight } = FONT_STYLE_MAP[textOverlay.fontStyle] || FONT_STYLE_MAP.normal;
  ctx.font        = `${style} ${weight} ${px}px ${textOverlay.fontFamily || 'Arial'}, sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline= 'middle';
  const tx = (textOverlay.position?.x ?? 50) / 100 * w;
  const ty = (textOverlay.position?.y ?? 85) / 100 * h;
  ctx.lineWidth   = Math.max(2, px / 9);
  ctx.strokeStyle = 'rgba(0,0,0,0.70)';
  ctx.strokeText(textOverlay.text, tx, ty);
  ctx.fillStyle   = textOverlay.color || '#FFFFFF';
  ctx.fillText(textOverlay.text, tx, ty);
}

function ImageEditor({ image, shape, sizeObj, onCrop, onHiResCrop, bgColor = '#FFFFFF', textOverlay = null, onTextPositionChange }) {
  const canvasRef = useRef(null);
  const hiResCanvasRef = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.3);
  const [maxScale, setMaxScale] = useState(3);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [textDragging, setTextDragging] = useState(false);
  const textDragOffset = useRef({ dx: 0, dy: 0 });
  const imgRef = useRef(null);

  /* Preview canvas size */
  const canvasW = 300;
  const ratio = sizeObj.h && sizeObj.w ? sizeObj.h / sizeObj.w : 1;
  const canvasH = shape === 'rectangular' ? Math.round(canvasW * ratio) : canvasW;

  /* Hi-res output: 300 DPI based on the print size in inches */
  const DPI = 300;
  const printW = sizeObj.w || 6;
  const printH = sizeObj.h || 6;
  const hiResW = printW * DPI; /* e.g. 8" = 2400px */
  const hiResH = printH * DPI; /* e.g. 8" = 2400px */
  const scaleFactor = hiResW / canvasW; /* ratio between hi-res and preview */

  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      /* cover = fills canvas exactly; slider is centered at this value */
      const coverSc = Math.max(canvasW / img.width, canvasH / img.height);
      const minSc = coverSc * 0.6; /* slightly smaller than canvas */
      const maxSc = coverSc * 1.4; /* zoomed in; coverSc = (minSc+maxSc)/2 exactly */
      setMinScale(minSc);
      setMaxScale(maxSc);
      setScale(coverSc);
      setPos({ x: (canvasW - img.width * coverSc) / 2, y: (canvasH - img.height * coverSc) / 2 });
    };
    img.src = image;
  }, [image, canvasW, canvasH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hiResCanvas = hiResCanvasRef.current;
    if (!canvas || !hiResCanvas || !imgRef.current) return;
    const img = imgRef.current;

    /* ── Draw preview canvas (what the user sees) ── */
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.save();
    if (shape === 'circular') {
      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(img, pos.x, pos.y, img.width * scale, img.height * scale);
    ctx.restore();
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (shape === 'circular') {
      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(1, 1, canvasW - 2, canvasH - 2);
    }
    ctx.setLineDash([]);

    /* ── Text overlay (preview) ── */
    drawText(ctx, textOverlay, canvasW, canvasH);

    if (onCrop) onCrop(canvas.toDataURL());

    /* ── Draw hi-res canvas (what gets uploaded for printing) ── */
    hiResCanvas.width = hiResW;
    hiResCanvas.height = hiResH + 60; /* +60px margin below for cut-guide label */
    const hctx = hiResCanvas.getContext('2d');
    hctx.clearRect(0, 0, hiResW, hiResH + 60);
    hctx.fillStyle = bgColor;
    hctx.fillRect(0, 0, hiResW, hiResH + 60);

    hctx.save();
    if (shape === 'circular') {
      hctx.beginPath();
      hctx.arc(hiResW / 2, hiResH / 2, hiResW / 2, 0, Math.PI * 2);
      hctx.clip();
    }
    /* Scale position & size proportionally */
    const hrX = pos.x * scaleFactor;
    const hrY = pos.y * scaleFactor;
    const hrImgW = img.width * scale * scaleFactor;
    const hrImgH = img.height * scale * scaleFactor;
    hctx.drawImage(img, hrX, hrY, hrImgW, hrImgH);
    hctx.restore();

    /* ── Text overlay (hi-res) ── */
    drawText(hctx, textOverlay, hiResW, hiResH, scaleFactor);

    /* ── Cut guide: dotted line + label (hi-res only, not shown to user) ── */
    hctx.strokeStyle = '#CCCCCC';
    hctx.lineWidth = 3;
    hctx.setLineDash([20, 10]);
    if (shape === 'circular') {
      hctx.beginPath();
      hctx.arc(hiResW / 2, hiResH / 2, hiResW / 2 - 2, 0, Math.PI * 2);
      hctx.stroke();
    } else {
      hctx.strokeRect(2, 2, hiResW - 4, hiResH - 4);
    }
    hctx.setLineDash([]);
    hctx.fillStyle = '#CCCCCC';
    hctx.font = '24px Arial';
    hctx.textAlign = 'center';
    hctx.fillText('\u2702 Cut along dotted line', hiResW / 2, hiResH + 36);

    if (onHiResCrop) onHiResCrop(hiResCanvas.toDataURL('image/jpeg', 0.95));
  }, [pos, scale, shape, hiResW, hiResH, scaleFactor, bgColor, textOverlay]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    /* Check if near text label */
    if (textOverlay?.text && onTextPositionChange) {
      const tx = (textOverlay.position?.x ?? 50) / 100 * canvasW;
      const ty = (textOverlay.position?.y ?? 85) / 100 * canvasH;
      const hitR = (FONT_SIZE_PX[textOverlay.fontSize] || 26) * 1.5;
      if (Math.hypot(cx - tx, cy - ty) < hitR) {
        setTextDragging(true);
        textDragOffset.current = { dx: cx - tx, dy: cy - ty };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    setDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (textDragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvasW / rect.width;
      const scaleY = canvasH / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top)  * scaleY;
      const nx = Math.min(100, Math.max(0, ((cx - textDragOffset.current.dx) / canvasW) * 100));
      const ny = Math.min(100, Math.max(0, ((cy - textDragOffset.current.dy) / canvasH) * 100));
      onTextPositionChange({ x: nx, y: ny });
      return;
    }
    if (!dragging) return;
    setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handlePointerUp = () => { setDragging(false); setTextDragging(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <canvas ref={canvasRef} width={canvasW} height={canvasH}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
        style={{ cursor: textDragging ? 'move' : dragging ? 'grabbing' : 'grab', touchAction: 'none',
          borderRadius: shape === 'circular' ? '50%' : 12,
          boxShadow: '0 8px 32px rgba(27,107,74,0.10)', maxWidth: '100%' }}
      />
      {/* Hidden hi-res canvas for print-quality export */}
      <canvas ref={hiResCanvasRef} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 300 }}>
        <span style={{ fontSize: 18, color: C.muted, fontWeight: 700 }}>-</span>
        <input type="range" min={minScale} max={maxScale} step={0.001} value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: C.brand }} />
        <span style={{ fontSize: 18, color: C.muted, fontWeight: 700 }}>+</span>
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Drag to reposition · Slider to zoom</p>
      <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>Print output: {hiResW}×{hiResH}px ({DPI} DPI)</p>
    </div>
  );
}

/* ═══ BACKGROUND COLOR PICKER ═══ */
const BG_QUICK = [
  { color: '#FFFFFF', label: 'White' },
  { color: '#FFD700', label: 'Yellow' },
  { color: '#FF4444', label: 'Red' },
  { color: '#4488FF', label: 'Blue' },
  { color: '#FF88CC', label: 'Pink' },
  { color: '#44BB44', label: 'Green' },
  { color: '#222222', label: 'Black' },
  { color: '#FF8C00', label: 'Orange' },
  { color: '#8B4513', label: 'Brown' },
];
const BG_EXTENDED = [
  { color: '#FFFFFF', label: 'White' },       { color: '#F5F5F5', label: 'Light Grey' },
  { color: '#9E9E9E', label: 'Grey' },         { color: '#222222', label: 'Black' },
  { color: '#FF4444', label: 'Red' },          { color: '#8B0000', label: 'Dark Red' },
  { color: '#FF8C00', label: 'Orange' },       { color: '#CC5500', label: 'Dark Orange' },
  { color: '#FFD700', label: 'Yellow' },       { color: '#FFC200', label: 'Gold' },
  { color: '#66CC44', label: 'Light Green' },  { color: '#1B6B4A', label: 'Dark Green' },
  { color: '#66AAFF', label: 'Light Blue' },   { color: '#0033AA', label: 'Dark Blue' },
  { color: '#00BFFF', label: 'Sky Blue' },     { color: '#008080', label: 'Teal' },
  { color: '#FF88CC', label: 'Pink' },         { color: '#FF1493', label: 'Hot Pink' },
  { color: '#8844CC', label: 'Purple' },       { color: '#C8A0E8', label: 'Lavender' },
  { color: '#F5DEB3', label: 'Beige' },        { color: '#8B4513', label: 'Brown' },
  { color: '#D2691E', label: 'Light Brown' },  { color: '#FFFDD0', label: 'Cream' },
  { color: '#FF6B6B', label: 'Coral' },        { color: '#FA8072', label: 'Salmon' },
  { color: '#001F3F', label: 'Navy' },         { color: '#808000', label: 'Olive' },
  { color: '#800020', label: 'Burgundy' },     { color: '#40E0D0', label: 'Turquoise' },
];
function BgColorPicker({ value, onChange }) {
  const [expanded, setExpanded] = useState(false);

  const dot = (color, label, size = 30) => (
    <button key={color} title={label} onClick={() => { onChange(color); setExpanded(false); }} style={{
      width: size, height: size, borderRadius: '50%', background: color, cursor: 'pointer', flexShrink: 0,
      border: value === color ? '3px solid ' + C.brand : '2px solid #D1D5DB',
      boxSizing: 'border-box', padding: 0,
      boxShadow: color === '#FFFFFF' || color === '#F5F5F5' || color === '#FFFDD0' ? 'inset 0 0 0 1px #d1d5db' : 'none',
    }} />
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {BG_QUICK.map(({ color, label }) => dot(color, label))}
        <button title="More colors" onClick={() => setExpanded((v) => !v)} style={{
          width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
          border: '2px solid ' + C.border, background: C.white, boxSizing: 'border-box',
          fontSize: 18, lineHeight: '26px', color: C.muted, fontWeight: 700, padding: 0,
        }}>+</button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, padding: '12px', background: C.white, borderRadius: 12,
          border: '1px solid ' + C.border, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 28px)', gap: 8, justifyContent: 'start' }}>
            {BG_EXTENDED.map(({ color, label }) => dot(color, label, 28))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════ */
/* ═══ MAIN APP ═══ */
/* ═══════════════════════════════════ */
export default function EdiblePrintApp() {
  const [step, setStep] = useState(0);
  const [image, setImage] = useState(null);
  const [imageName, setImageName] = useState('');
  const [shape, setShape] = useState('circular');
  const [sizeId, setSizeId] = useState('c8');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [textOverlay, setTextOverlay] = useState({ text: '', fontSize: 'medium', color: '#FFFFFF', position: { x: 50, y: 85 }, fontFamily: 'Arial', fontStyle: 'normal' });
  const [cropPreview, setCropPreview] = useState(null);
  const [hiResCrop, setHiResCrop] = useState(null);
  const [shipping, setShipping] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', unit: '', city: '', province: 'Ontario', postal: ''
  });
  const fileRef = useRef(null);
  const addressRef = useRef(null);
  const autocompleteRef = useRef(null);

  const sizes = SIZES[shape] || [];
  const selectedSize = sizes.find((sz) => sz.id === sizeId) || sizes[0];
  const unitPrice = shape === 'custom'
    ? (parseFloat(customW || 0) * parseFloat(customH || 0) <= 36 ? 14.99 : 19.99)
    : selectedSize?.price || 0;
  const subtotal = unitPrice * qty;
  const localZone = getLocalZone(form.postal);
  const shippingCost = shipping === 'local' ? (localZone?.price || 0) : shipping === 'pickup' ? 0 : (SHIPPING[shipping] || 0);
  const tax = (subtotal + shippingCost) * TAX_RATE;
  const total = subtotal + shippingCost + tax;

  useEffect(() => {
    if (shipping === 'local' && form.postal && !getLocalZone(form.postal)) {
      setShipping('standard');
    }
  }, [form.postal]);

  useEffect(() => {
    if (shape === 'custom') { setSizeId('custom'); }
    else if (!SIZES[shape]?.find((sz) => sz.id === sizeId)) { setSizeId(SIZES[shape]?.[0]?.id || ''); }
  }, [shape]);

  /* ═══ PREVENT BROWSER DEFAULT DRAG/DROP (opens file in new tab) ═══ */
  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', prevent);
    return () => {
      document.removeEventListener('dragover', prevent);
      document.removeEventListener('drop', prevent);
    };
  }, []);

  /* ═══ GOOGLE PLACES AUTOCOMPLETE ═══ */
  useEffect(() => {
    if (step !== 3 || !addressRef.current || autocompleteRef.current) return;
    const checkGoogle = setInterval(() => {
      if (window.google?.maps?.places) {
        clearInterval(checkGoogle);
        const ac = new window.google.maps.places.Autocomplete(addressRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'ca' },
          fields: ['address_components', 'formatted_address'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place.address_components) return;
          let street = '', city = '', province = '', postal = '';
          for (const comp of place.address_components) {
            const t = comp.types;
            if (t.includes('street_number')) street = comp.long_name + ' ';
            if (t.includes('route')) street += comp.long_name;
            if (t.includes('locality')) city = comp.long_name;
            if (t.includes('administrative_area_level_1')) province = comp.long_name;
            if (t.includes('postal_code')) postal = comp.short_name;
          }
          setForm((prev) => ({
            ...prev,
            address: street.trim(),
            city: city || prev.city,
            province: province || prev.province,
            postal: postal || prev.postal,
          }));
        });
        autocompleteRef.current = ac;
      }
    }, 200);
    return () => { clearInterval(checkGoogle); autocompleteRef.current = null; };
  }, [step]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { setImage(ev.target.result); setStep(2); };
    reader.readAsDataURL(file);
  };

  /* ═══ DRAG & DROP ═══ */
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { setImage(ev.target.result); setStep(2); };
    reader.readAsDataURL(file);
  };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => { setIsDragOver(false); };

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 320);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const updateForm = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  /* Auto-split unit/suite from address string (e.g. "123 Main St #503" or "123 Main apt 2B") */
  const handleAddressChange = (raw) => {
    const unitPattern = /\s+(#\s*\w+|(?:unit|apt|suite|ste)\s*\.?\s*\w+)\s*$/i;
    const match = raw.match(unitPattern);
    if (match) {
      setForm((prev) => ({ ...prev, address: raw.replace(unitPattern, '').trim(), unit: match[1].trim() }));
    } else {
      updateForm('address', raw);
    }
  };

 /* ═══ STRIPE CHECKOUT ═══ */
  const handlePlaceOrder = async () => {
    if (!form.name || !form.email || (shipping !== 'pickup' && (!form.address || !form.city || !form.postal))) {
      alert('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      /* Upload the HI-RES CROPPED image (not the original) */
      let imageUrl = '';
      const imageToUpload = hiResCrop || cropPreview || image;
      if (imageToUpload) {
        const uploadRes = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: imageToUpload, fileName: imageName }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.url) {
          imageUrl = uploadData.url;
        }
      }

      // Step 2: Create Stripe checkout
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone,
          shippingAddress: form.address + (form.unit ? ', ' + form.unit : ''),
          shippingCity: form.city,
          shippingProvince: form.province,
          shippingPostal: form.postal,
          shape,
          size: shape === 'custom' ? customW + '"x' + customH + '"' : selectedSize?.label,
          quantity: qty,
          unitPrice,
          shippingMethod: shipping,
          shippingCost: shippingCost,
          notes,
          imageUrl,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch (error) {
      alert('Connection error. Please try again.');
   } finally {
      setLoading(false);
    }
  };
  /* ════════════════════════════ */
  /* ═══ HOME PAGE ═══ */
  /* ════════════════════════════ */
  if (step === 0) {
    const deliveryDay = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-US', { weekday: 'long' });
    const stepColors = ['#E8F5EE', '#FFF4EB', '#EEF2FF', '#FFF9E6'];

    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>

        {/* ── Sticky nav ── */}
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px',
          borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
          <Logo />
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14, borderRadius: 10 }}>
            Order Now
          </button>
        </nav>

        {/* ── Hero ── */}
        <section style={{ padding: '60px 24px 52px', textAlign: 'center', maxWidth: 740, margin: '0 auto',
          background: 'linear-gradient(180deg, #E8F5EE 0%, #FAFBF9 100%)', borderRadius: '0 0 40px 40px' }}>
          <div style={{ display: 'inline-block', background: 'rgba(27,107,74,0.12)', color: C.brand,
            borderRadius: 24, padding: '7px 18px', fontSize: 13, fontWeight: 600, marginBottom: 22 }}>
            🇨🇦 Free Standard Shipping on Orders Over $50
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px, 7vw, 62px)',
            lineHeight: 1.08, margin: '0 0 20px', fontWeight: 700, letterSpacing: -1 }}>
            Turn Any Photo Into an<br />
            <span style={{ color: C.brand }}>Edible Masterpiece</span>
          </h1>
          <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, margin: '0 auto 28px', maxWidth: 500 }}>
            Custom printed on premium edible sheets. Perfect for cakes, cookies &amp; celebrations.
          </p>

          {/* Social proof above CTA */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.white,
            border: '1px solid ' + C.border, borderRadius: 40, padding: '8px 18px',
            fontSize: 13.5, fontWeight: 600, marginBottom: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <span style={{ color: '#FBBF24', letterSpacing: 1 }}>★★★★★</span>
            <span style={{ color: C.text }}>Trusted by 200+ happy customers across Canada</span>
          </div>

          <div>
            <button onClick={() => setStep(1)} style={{ ...btnPrimary, fontSize: 20, padding: '20px 52px',
              borderRadius: 16, boxShadow: '0 8px 28px rgba(27,107,74,0.35)', letterSpacing: 0.3 }}>
              Upload Your Photo Now →
            </button>
          </div>

          {/* Urgency banner */}
          <div style={{ display: 'inline-block', background: '#FFF4EB', border: '1px solid #FDDBB6',
            borderRadius: 10, padding: '8px 20px', marginTop: 14, fontSize: 13.5, fontWeight: 600, color: '#B45309' }}>
            🔥 Order today, delivered by <strong>{deliveryDay}</strong>
          </div>

          <p style={{ fontSize: 13, color: '#bbb', marginTop: 12 }}>No account needed · Takes under 2 minutes</p>
        </section>

        {/* ── Trust bar ── */}
        <div style={{ background: C.white, borderTop: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border,
          padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap', maxWidth: 760, margin: '0 auto' }}>
            {[
              { icon: '🍃', title: 'FDA-Approved', sub: 'Edible inks & sheets' },
              { icon: '🇨🇦', title: 'Made in Canada', sub: 'London, Ontario' },
              { icon: '⭐', title: '5-Star Rated', sub: '200+ orders' },
              { icon: '🔒', title: 'Secure Checkout', sub: 'Powered by Stripe' },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px',
                borderRight: i < 3 ? '1px solid ' + C.border : 'none', flexShrink: 0 }}>
                <span style={{ fontSize: 22 }}>{b.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{b.title}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── How It Works ── */}
        <section style={{ padding: '56px 24px', maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 10, fontWeight: 700 }}>
            How It Works
          </h2>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: 36, fontSize: 15 }}>Four simple steps to your edible print</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 16 }}>
            {[
              { num: '01', icon: '📤', title: 'Upload', desc: 'Upload your photo, logo, or any custom design', bg: stepColors[0] },
              { num: '02', icon: '✂️', title: 'Customize', desc: 'Choose shape, size, and adjust the print area', bg: stepColors[1] },
              { num: '03', icon: '💳', title: 'Pay Securely', desc: 'Visa, Mastercard, Apple Pay & more', bg: stepColors[2] },
              { num: '04', icon: '📬', title: 'Receive', desc: 'We review, print & ship to your door in days', bg: stepColors[3] },
            ].map((item, i) => (
              <div key={i} style={{ background: item.bg, borderRadius: 16, textAlign: 'center', padding: '30px 20px', position: 'relative',
                border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 11, fontWeight: 700, color: '#00000030' }}>{item.num}</div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{item.icon}</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>{item.title}</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Occasions ── */}
        <section style={{ padding: '44px 24px', maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 32, fontWeight: 700 }}>
            Perfect For Every Occasion
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12 }}>
            {['🎂 Birthday Cakes','🎓 Graduation Parties','👶 Baby Showers','💼 Corporate Events',
              '🏷️ Brand Logos on Treats','🍪 Cookie Toppers','💒 Weddings & Anniversaries','📸 Photo Cupcakes'].map((item, i) => (
              <div key={i} style={{ background: C.white, borderRadius: 10, padding: '13px 18px', fontSize: 14.5,
                border: '1px solid ' + C.border, fontWeight: 500 }}>{item}</div>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section style={{ padding: '52px 24px', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, marginBottom: 8, fontWeight: 700 }}>Simple, Transparent Pricing</h2>
          <p style={{ color: C.muted, marginBottom: 8, fontSize: 15 }}>Premium edible paper + food-safe inks included in every order.</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.brand, marginBottom: 28 }}>Starting at <strong>$14.99</strong></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[...SIZES.circular, ...SIZES.square, ...SIZES.rectangular].map((sz) => {
              const popular = sz.id === 'c8';
              return (
                <div key={sz.id} style={{ ...card, padding: '22px 16px', position: 'relative',
                  border: popular ? '2.5px solid ' + C.brand : '1px solid ' + C.border,
                  boxShadow: popular ? '0 4px 20px rgba(27,107,74,0.15)' : card.boxShadow }}>
                  {popular && (
                    <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                      background: C.brand, color: '#fff', fontSize: 11, fontWeight: 700,
                      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                      Most Popular
                    </div>
                  )}
                  <div style={{ fontSize: 26, fontWeight: 700, color: C.brand }}>{'$' + sz.price.toFixed(2)}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4, fontWeight: 500 }}>{sz.label}</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 16 }}>Custom sizes available · Shipping from $6.99 · HST calculated at checkout</p>
        </section>

        {/* ── Reviews ── */}
        <section style={{ padding: '48px 24px', maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 32, fontWeight: 700 }}>
            What Our Customers Say
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { quote: "Perfect photo on my daughter's birthday cake! Amazing quality.", name: 'Sarah M.', location: 'London, ON' },
              { quote: 'Used it for my bakery business. Clients love the custom prints!', name: 'Maria L.', location: 'Toronto' },
              { quote: 'Super easy to order and fast shipping. Will order again!', name: 'James K.', location: 'Ottawa' },
            ].map((r, i) => (
              <div key={i} style={{ ...card, padding: '24px 20px' }}>
                <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 12, letterSpacing: 2 }}>★★★★★</div>
                <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.65, color: C.text }}>"{r.quote}"</p>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.brand }}>{r.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{r.location}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: '48px 24px', maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, textAlign: 'center', marginBottom: 28, fontWeight: 700 }}>
            Frequently Asked Questions
          </h2>
          {[
            ['What are edible prints made of?', 'We use FDA-approved edible icing sheets with food-safe inks. They are 100% safe to eat and designed to be placed directly on cakes, cookies, cupcakes, and other baked goods.'],
            ['How do I use the edible print?', 'Simply peel the backing and place it on your frosted cake, cookies, or cupcakes. The print blends seamlessly with the icing.'],
            ['How long does shipping take?', 'Same-day delivery is available in London, Ontario (from $6.99). Standard shipping takes 3–5 business days anywhere in Canada via Canada Post. Express shipping (1–2 business days) is also available.'],
            ['What image quality do I need?', 'For best results, upload a high-resolution image (at least 1000×1000 pixels). We review every order before printing and will contact you if we notice any quality issues.'],
            ['Do you ship to all provinces?', 'Yes — we ship to every province and territory in Canada.'],
            ['Can I order multiple copies?', 'Absolutely. Adjust the quantity at checkout. Volume discounts are available for orders over 20 units — contact us for a quote.'],
            ['What if I need help with my image?', 'We review every order within 24 hours. If adjustments are needed, we will reach out before printing. You can also include special instructions with your order.'],
          ].map((faq, i) => (
            <details key={i} style={{ ...card, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', borderRadius: 12 }}>
              <summary style={{ fontWeight: 600, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {faq[0]} <span style={{ color: '#ccc', fontSize: 20, marginLeft: 8 }}>+</span>
              </summary>
              <p style={{ margin: '12px 0 0', fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{faq[1]}</p>
            </details>
          ))}
        </section>

        {/* ── Bottom CTA ── */}
        <section style={{ padding: '56px 24px 72px', textAlign: 'center',
          background: 'linear-gradient(180deg, #FAFBF9 0%, #E8F5EE 100%)' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, marginBottom: 8, fontWeight: 700 }}>Ready to Print?</h2>
          <p style={{ color: C.muted, marginBottom: 24, fontSize: 16 }}>Upload your image and get your edible prints shipped across Canada.</p>
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, fontSize: 18, padding: '17px 44px', borderRadius: 14, boxShadow: '0 6px 20px rgba(27,107,74,0.30)' }}>
            Start Your Order →
          </button>
        </section>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid ' + C.border, padding: '36px 24px 28px', background: C.white }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24, marginBottom: 28 }}>
              <div>
                <Logo size={22} />
                <p style={{ fontSize: 13, color: C.muted, marginTop: 10, lineHeight: 1.65 }}>
                  Serving London, Ontario &amp; shipping Canada-wide.<br />
                  Handcrafted with care in the Glen Cairn area.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Contact</div>
                <a href="mailto:hello@edibleprint.net" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>✉️ hello@edibleprint.net</a>
                <a href="tel:+15196012345" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>📞 (519) 601-2345</a>
                <a href="https://instagram.com/edibleprint.net" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>📸 @edibleprint.net</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Order</div>
                <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.muted, textAlign: 'left', padding: 0 }}>🎂 Start an Order</button>
                <a href="mailto:hello@edibleprint.net?subject=Custom%20Quote" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>💼 Bulk / Business Quote</a>
              </div>
            </div>
            <div style={{ borderTop: '1px solid ' + C.border, paddingTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#aaa' }}>
              <span>© 2026 EdiblePrint.net. All rights reserved.</span>
              <span>HST Registration: [pending] · London, Ontario, Canada</span>
            </div>
          </div>
        </footer>

        {/* ── Sticky mobile CTA ── */}
        {scrolled && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
            padding: '12px 20px', background: 'rgba(255,255,255,0.96)',
            borderTop: '1px solid ' + C.border, backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>🍃 FDA-Approved · Ships Canada-wide</span>
            <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '11px 28px', fontSize: 15, borderRadius: 10, flexShrink: 0 }}>
              Order Now →
            </button>
          </div>
        )}

      </div>
    );
  }

  /* ════════════════════════════ */
  /* ═══ ORDER FLOW ═══ */
  /* ════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px',
        borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div onClick={() => setStep(0)} style={{ cursor: 'pointer' }}><Logo /></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['Upload', 'Customize', 'Details', 'Done'].map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step >= i + 1 ? C.brand : '#E5E7EB', color: step >= i + 1 ? '#fff' : '#9CA3AF',
                transition: 'all 0.3s' }}>{i + 1}</div>
              <span className="hide-mobile" style={{ fontSize: 12, color: step >= i + 1 ? C.text : '#bbb',
                fontWeight: step === i + 1 ? 600 : 400 }}>{label}</span>
              {i < 3 && <span style={{ color: '#ddd', margin: '0 2px', fontSize: 11 }}>›</span>}
            </div>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px' }}>

        {/* STEP 1: UPLOAD (with real drag & drop) */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={stepBadge}>1</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Upload Your Image</h2>
            <p style={{ color: C.muted, marginBottom: 28 }}>JPG, PNG or PDF · High resolution for best results</p>
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              style={{
                border: '2.5px dashed ' + (isDragOver ? C.brand : C.border),
                borderRadius: 20, padding: '56px 24px',
                cursor: 'pointer', transition: 'all 0.25s',
                background: isDragOver ? C.brandLight : C.white,
              }}>
              <div style={{ fontSize: 52, marginBottom: 14, opacity: 0.8 }}>🖼️</div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>
                {isDragOver ? 'Drop your image here!' : 'Tap to upload your image'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#bbb' }}>or drag and drop here</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} style={{ display: 'none' }} />
            {image && (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: C.brand, fontWeight: 600 }}>{'✓ ' + imageName}</p>
                <button onClick={() => setStep(2)} style={btnPrimary}>Continue →</button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CUSTOMIZE */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>2</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Customize Your Print</h2>
              <p style={{ color: C.muted, marginBottom: 24 }}>Choose shape, size, and adjust the crop area</p>
            </div>
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Shape</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
              {[{ key: 'circular', icon: '⭕', label: 'Round' }, { key: 'square', icon: '⬜', label: 'Square' },
                { key: 'rectangular', icon: '▬', label: 'Rectangle' }, { key: 'custom', icon: '✏️', label: 'Custom' }].map((sh) => (
                <button key={sh.key} onClick={() => setShape(sh.key)} style={{
                  flex: 1, minWidth: 72, padding: '12px 8px', borderRadius: 12,
                  border: shape === sh.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shape === sh.key ? C.brandLight : C.white,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                  <div style={{ fontSize: 20, marginBottom: 2 }}>{sh.icon}</div>{sh.label}
                </button>
              ))}
            </div>
            {shape !== 'custom' ? (
              <>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Size</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
                  {sizes.map((sz) => (
                    <button key={sz.id} onClick={() => setSizeId(sz.id)} style={{
                      flex: 1, minWidth: 90, padding: '14px 10px', borderRadius: 12,
                      border: sizeId === sz.id ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                      background: sizeId === sz.id ? C.brandLight : C.white,
                      cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                      <div style={{ fontWeight: 700, fontSize: 17, color: C.brand }}>{'$' + sz.price.toFixed(2)}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sz.label}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Width (inches)</label>
                  <input type="number" value={customW} onChange={(e) => { const v = parseFloat(e.target.value); setCustomW(isNaN(v) ? '' : String(Math.min(8, v))); }} placeholder="e.g. 5" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Height (inches)</label>
                  <input type="number" value={customH} onChange={(e) => { const v = parseFloat(e.target.value); setCustomH(isNaN(v) ? '' : String(Math.min(11, v))); }} placeholder="e.g. 7" style={inputStyle} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0', textAlign: 'center' }}>Max size: 8″ × 11″ (A4 sheet)</p>
            )}
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Quantity</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>-</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>+</button>
            </div>
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Adjust Your Image</label>
            <ImageEditor
              image={image}
              shape={shape}
              sizeObj={selectedSize || { w: parseFloat(customW) || 6, h: parseFloat(customH) || 6 }}
              onCrop={setCropPreview}
              onHiResCrop={setHiResCrop}
              bgColor={bgColor}
              textOverlay={textOverlay}
              onTextPositionChange={(pos) => setTextOverlay((p) => ({ ...p, position: pos }))}
            />
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <label style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>Background Fill Color <span style={{ fontWeight: 400, color: C.muted }}>(outside your image)</span></label>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: bgColor, flexShrink: 0,
                  border: '2px solid ' + C.border, boxShadow: bgColor === '#FFFFFF' ? 'inset 0 0 0 1px #d1d5db' : 'none' }} />
              </div>
              <BgColorPicker value={bgColor} onChange={setBgColor} />
            </div>

            {/* ── Add Text to Image ── */}
            <div style={{ ...card, marginTop: 18, padding: '18px 16px' }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 12 }}>Add Text to Image <span style={{ fontWeight: 400, color: C.muted, fontSize: 13 }}>(optional)</span></label>
              <input
                value={textOverlay.text}
                onChange={(e) => setTextOverlay((p) => ({ ...p, text: e.target.value }))}
                placeholder="Type your message..."
                style={{ ...inputStyle, marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/* Font size */}
                <div style={{ flex: 1, minWidth: 130 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Size</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[{ key: 'small', label: 'S' }, { key: 'medium', label: 'M' }, { key: 'large', label: 'L' }].map(({ key, label }) => (
                      <button key={key} onClick={() => setTextOverlay((p) => ({ ...p, fontSize: key }))} style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        fontFamily: "'Outfit', sans-serif",
                        border: textOverlay.fontSize === key ? '2.5px solid ' + C.brand : '1.5px solid ' + C.border,
                        background: textOverlay.fontSize === key ? C.brandLight : C.white,
                        color: textOverlay.fontSize === key ? C.brand : C.text,
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
                {/* Font style */}
                <div style={{ flex: 1, minWidth: 130 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Style</div>
                  <select value={textOverlay.fontStyle} onChange={(e) => setTextOverlay((p) => ({ ...p, fontStyle: e.target.value }))} style={{
                    width: '100%', padding: '8px 6px', borderRadius: 8, border: '1.5px solid ' + C.border,
                    fontSize: 13, cursor: 'pointer', background: C.white, color: C.text,
                  }}>
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="italic">Italic</option>
                    <option value="bold italic">Bold Italic</option>
                  </select>
                </div>
              </div>
              {/* Font family */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Font</div>
                <select value={textOverlay.fontFamily} onChange={(e) => setTextOverlay((p) => ({ ...p, fontFamily: e.target.value }))} style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + C.border,
                  fontSize: 15, cursor: 'pointer', background: C.white, color: C.text,
                  fontFamily: textOverlay.fontFamily,
                }}>
                  {['Arial', 'Georgia', 'Impact', 'Comic Sans MS', 'Courier New', 'Brush Script MT'].map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0', textAlign: 'center' }}>Drag text in preview to reposition</p>
              {/* Text color */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Text Color</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[
                    { color: '#FFFFFF', label: 'White' },
                    { color: '#111111', label: 'Black' },
                    { color: '#FF3333', label: 'Red' },
                    { color: '#FFD700', label: 'Gold' },
                    { color: '#4488FF', label: 'Blue' },
                    { color: '#FF88CC', label: 'Pink' },
                  ].map(({ color, label }) => (
                    <button key={color} title={label} onClick={() => setTextOverlay((p) => ({ ...p, color }))} style={{
                      width: 28, height: 28, borderRadius: 6, background: color, cursor: 'pointer',
                      border: textOverlay.color === color ? '3px solid ' + C.brand : '2px solid ' + C.border,
                      boxSizing: 'border-box',
                      boxShadow: color === '#FFFFFF' ? 'inset 0 0 0 1px #d1d5db' : 'none',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Special Instructions (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Adjust colors, add border, special requests..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ ...card, marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 600 }}>
                <span>{qty + 'x ' + (shape === 'custom' ? customW + '"x' + customH + '"' : selectedSize?.label) + ' (' + shape + ')'}</span>
                <span style={{ color: C.brand, fontSize: 18 }}>{'$' + subtotal.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              <button onClick={() => setStep(1)} style={{ ...btnSecondary, flex: 1 }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ ...btnPrimary, flex: 2 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 3: SHIPPING & PAYMENT */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>3</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Shipping & Payment</h2>
              <p style={{ color: C.muted, marginBottom: 24 }}>Where should we ship your edible prints?</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Full Name *</label>
                <input value={form.name} onChange={(e) => updateForm('name', e.target.value)} style={inputStyle} placeholder="Jane Smith" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} style={inputStyle} placeholder="jane@email.com" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} style={inputStyle} placeholder="(519) 555-1234" />
                </div>
              </div>
              {shipping !== 'pickup' && (<>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Street Address *</label>
                <input ref={addressRef} value={form.address} onChange={(e) => handleAddressChange(e.target.value)} style={inputStyle} placeholder="e.g. 123 Main Street" autoComplete="off" />
              </div>
              <div style={{ maxWidth: 220 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Unit / Suite (optional)</label>
                <input value={form.unit} onChange={(e) => updateForm('unit', e.target.value)} style={inputStyle} placeholder="e.g. 503, Apt 2B" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>City *</label>
                  <input value={form.city} onChange={(e) => updateForm('city', e.target.value)} style={inputStyle} placeholder="Toronto" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Province *</label>
                  <select value={form.province} onChange={(e) => updateForm('province', e.target.value)} style={inputStyle}>
                    {PROVINCES.map((prov) => <option key={prov} value={prov}>{prov}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ maxWidth: 200 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Postal Code *</label>
                <input value={form.postal} onChange={(e) => updateForm('postal', e.target.value.toUpperCase())} style={inputStyle} placeholder="N6A 1B2" maxLength={7} />
              </div>
              </>)}
            </div>
            <div style={{ marginTop: 26 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Shipping Method</label>
              {[
                { key: 'local', label: localZone ? 'Same Day Delivery — ' + localZone.name : 'Same Day Delivery — London, ON', price: localZone?.price || 0, disabled: !localZone },
                { key: 'standard', label: 'Standard Shipping — 3-5 business days', price: SHIPPING.standard, disabled: false },
                { key: 'express', label: 'Express Shipping — 1-2 business days', price: SHIPPING.express, disabled: false },
                { key: 'pickup', label: 'Pickup — South London, ON', price: 0, disabled: false, note: 'Glen Cairn area. We\'ll confirm the exact time by email.' },
              ].map((opt) => (
                <label key={opt.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
                  border: shipping === opt.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shipping === opt.key ? C.brandLight : opt.disabled ? '#f9fafb' : C.white, marginBottom: 8,
                  cursor: opt.disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: opt.disabled ? 0.5 : 1 }}>
                  <input type="radio" name="shipping" checked={shipping === opt.key} onChange={() => { if (!opt.disabled) setShipping(opt.key); }} disabled={opt.disabled} style={{ accentColor: C.brand, width: 18, height: 18 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                    {opt.key === 'local' && !localZone && form.postal && (
                      <div style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>Not available for your postal code</div>
                    )}
                    {opt.key === 'local' && !form.postal && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Enter your postal code above</div>
                    )}
                    {opt.note && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{opt.note}</div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: opt.disabled ? C.muted : C.brand }}>{opt.key === 'local' && localZone ? '$' + localZone.price.toFixed(2) : opt.key === 'local' ? '—' : '$' + opt.price.toFixed(2)}</span>
                </label>
              ))}
            </div>
            <div style={{ ...card, marginTop: 26 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Order Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{qty + 'x ' + (shape === 'custom' ? customW + '"x' + customH + '"' : selectedSize?.label) + ' (' + shape + ')'}</span>
                  <span style={{ fontWeight: 600 }}>{'$' + subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Shipping</span><span style={{ fontWeight: 600 }}>{'$' + shippingCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted }}>
                  <span>HST (13%)</span><span>{'$' + tax.toFixed(2)}</span>
                </div>
                <div style={{ borderTop: '1.5px solid ' + C.border, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20 }}>
                  <span>Total</span>
                  <span style={{ color: C.brand }}>{'$' + total.toFixed(2)} <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>CAD</span></span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              <button onClick={() => setStep(2)} style={{ ...btnSecondary, flex: 1 }}>← Back</button>
              <button onClick={handlePlaceOrder} disabled={loading}
                style={{ ...btnPrimary, flex: 2, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Redirecting to payment...' : 'Place Order →'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 14 }}>
              🔒 Payment processed securely via Stripe
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
