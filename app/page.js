'use client';

import { useState, useRef, useEffect } from 'react';
import './globals.css';

/* ═══ PRICING CONFIG ═══ */
const SIZES = {
  circular: [
    { id: 'c6', label: '6" Round', w: 6, h: 6, price: 8.99 },
    { id: 'c8', label: '8" Round', w: 8, h: 8, price: 11.99 },
    { id: 'c10', label: '10" Round', w: 10, h: 10, price: 14.99 },
  ],
  square: [
    { id: 's6', label: '6"×6"', w: 6, h: 6, price: 8.99 },
    { id: 's8', label: '8"×8"', w: 8, h: 8, price: 11.99 },
  ],
  rectangular: [
    { id: 'r6x9', label: '6"×9"', w: 6, h: 9, price: 10.99 },
    { id: 'r8x11', label: '8"×11" (Full Sheet)', w: 8, h: 11, price: 14.99 },
  ],
  custom: [{ id: 'custom', label: 'Custom Size', w: 0, h: 0, price: 0 }],
};

const SHIPPING = { local: 0, standard: 6.99, express: 14.99 };
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

/* ═══ IMAGE EDITOR ═══ */
function ImageEditor({ image, shape, sizeObj, onCrop }) {
  const canvasRef = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const canvasW = 300;
  const ratio = sizeObj.h && sizeObj.w ? sizeObj.h / sizeObj.w : 1;
  const canvasH = shape === 'rectangular' ? Math.round(canvasW * ratio) : canvasW;

  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const sc = Math.max(canvasW / img.width, canvasH / img.height);
      setScale(sc);
      setPos({ x: (canvasW - img.width * sc) / 2, y: (canvasH - img.height * sc) / 2 });
    };
    img.src = image;
  }, [image, canvasW, canvasH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    if (shape === 'circular') {
      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(imgRef.current, pos.x, pos.y, imgRef.current.width * scale, imgRef.current.height * scale);
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
    if (onCrop) onCrop(canvas.toDataURL());
  }, [pos, scale, shape]);

  const handlePointerDown = (e) => { setDragging(true); setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y }); };
  const handlePointerMove = (e) => { if (!dragging) return; setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <canvas ref={canvasRef} width={canvasW} height={canvasH}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)}
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none',
          borderRadius: shape === 'circular' ? '50%' : 12,
          boxShadow: '0 8px 32px rgba(27,107,74,0.10)', maxWidth: '100%' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 300 }}>
        <span style={{ fontSize: 18, color: C.muted, fontWeight: 700 }}>-</span>
        <input type="range" min={0.15} max={3} step={0.01} value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: C.brand }} />
        <span style={{ fontSize: 18, color: C.muted, fontWeight: 700 }}>+</span>
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Drag to reposition · Slider to zoom</p>
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
  const [cropPreview, setCropPreview] = useState(null);
  const [shipping, setShipping] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '', province: 'Ontario', postal: ''
  });
  const fileRef = useRef(null);

  const sizes = SIZES[shape] || [];
  const selectedSize = sizes.find((sz) => sz.id === sizeId) || sizes[0];
  const unitPrice = shape === 'custom'
    ? (parseFloat(customW || 0) * parseFloat(customH || 0) * 0.25 + 5)
    : selectedSize?.price || 0;
  const subtotal = unitPrice * qty;
  const shippingCost = SHIPPING[shipping];
  const tax = (subtotal + shippingCost) * TAX_RATE;
  const total = subtotal + shippingCost + tax;

  useEffect(() => {
    if (shape === 'custom') { setSizeId('custom'); }
    else if (!SIZES[shape]?.find((sz) => sz.id === sizeId)) { setSizeId(SIZES[shape]?.[0]?.id || ''); }
  }, [shape]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { setImage(ev.target.result); setStep(2); };
    reader.readAsDataURL(file);
  };

  const updateForm = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

 /* ═══ STRIPE CHECKOUT ═══ */
  const handlePlaceOrder = async () => {
    if (!form.name || !form.email || !form.address || !form.city || !form.postal) {
      alert('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      // Step 1: Upload image to Cloudinary
      let imageUrl = '';
      if (image) {
        const uploadRes = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: image, fileName: imageName }),
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
          shippingAddress: form.address,
          shippingCity: form.city,
          shippingProvince: form.province,
          shippingPostal: form.postal,
          shape,
          size: shape === 'custom' ? customW + '"x' + customH + '"' : selectedSize?.label,
          quantity: qty,
          unitPrice,
          shippingMethod: shipping,
          shippingCost: SHIPPING[shipping],
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
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px',
          borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
          <Logo />
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14, borderRadius: 10 }}>
            Order Now
          </button>
        </nav>

        <section style={{ padding: '56px 24px 44px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: C.brandLight, color: C.brand,
            borderRadius: 24, padding: '7px 18px', fontSize: 13, fontWeight: 600, marginBottom: 22 }}>
            🇨🇦 Free Standard Shipping on Orders Over $50
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(34px, 7vw, 56px)',
            lineHeight: 1.1, margin: '0 0 20px', fontWeight: 700, letterSpacing: -1 }}>
            Your Image, Printed<br />
            <span style={{ color: C.brand }}>On Edible Sheets</span>
          </h1>
          <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, margin: '0 auto 36px', maxWidth: 520 }}>
            Upload any photo, logo or design. We print it on premium edible paper with food-safe inks
            and ship it straight to your door — anywhere in Canada.
          </p>
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, fontSize: 18, padding: '17px 44px', borderRadius: 14 }}>
            Start Your Order →
          </button>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 14 }}>No account needed · Takes under 2 minutes</p>
        </section>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', padding: '0 24px 40px' }}>
          {['🍃 FDA-Approved Inks', '📦 Canada-Wide Shipping', '⚡ 24h Image Review', '🔒 Secure Payment'].map((t, i) => (
            <span key={i} style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{t}</span>
          ))}
        </div>

        <section style={{ padding: '48px 24px', maxWidth: 840, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, textAlign: 'center', marginBottom: 36, fontWeight: 700 }}>
            How It Works
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 20 }}>
            {[
              { num: '01', icon: '📤', title: 'Upload', desc: 'Upload your photo, logo, or any custom design' },
              { num: '02', icon: '✂️', title: 'Customize', desc: 'Choose shape, size, and adjust the print area' },
              { num: '03', icon: '💳', title: 'Pay', desc: 'Secure checkout — Visa, Mastercard, Apple Pay' },
              { num: '04', icon: '📬', title: 'Receive', desc: 'We review, print & ship to your door in days' },
            ].map((item, i) => (
              <div key={i} style={{ ...card, textAlign: 'center', padding: '28px 20px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 11, fontWeight: 700, color: C.brand, opacity: 0.4 }}>{item.num}</div>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{item.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>{item.title}</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: '44px 24px', maxWidth: 840, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, textAlign: 'center', marginBottom: 32, fontWeight: 700 }}>
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

        <section style={{ padding: '48px 24px', maxWidth: 740, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 8, fontWeight: 700 }}>Simple, Transparent Pricing</h2>
          <p style={{ color: C.muted, marginBottom: 28, fontSize: 15 }}>Premium edible paper + food-safe inks included in every order.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[...SIZES.circular, ...SIZES.square, ...SIZES.rectangular].map((sz) => (
              <div key={sz.id} style={{ ...card, padding: '22px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.brand }}>{'$' + sz.price.toFixed(2)}</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 4, fontWeight: 500 }}>{sz.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 16 }}>Custom sizes available · Shipping from $6.99 · HST calculated at checkout</p>
        </section>

        <section style={{ padding: '48px 24px', maxWidth: 660, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, textAlign: 'center', marginBottom: 28, fontWeight: 700 }}>
            Frequently Asked Questions
          </h2>
          {[
            ['What are edible prints made of?', 'We use FDA-approved edible icing sheets with food-safe inks. They are 100% safe to eat and designed to be placed directly on cakes, cookies, cupcakes, and other baked goods.'],
            ['How long does shipping take?', 'Standard shipping takes 3-5 business days anywhere in Canada via Canada Post. Express shipping (1-2 business days) is available at checkout.'],
            ['What image quality do I need?', 'For best results, upload a high-resolution image (at least 1000x1000 pixels). We review every order before printing and will contact you if we notice any quality issues.'],
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

        <section style={{ padding: '52px 24px 64px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 8, fontWeight: 700 }}>Ready to Print?</h2>
          <p style={{ color: C.muted, marginBottom: 24, fontSize: 16 }}>Upload your image and get your edible prints shipped across Canada.</p>
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, fontSize: 18, padding: '17px 44px', borderRadius: 14 }}>
            Start Your Order →
          </button>
        </section>

        <footer style={{ borderTop: '1px solid ' + C.border, padding: '28px 24px', textAlign: 'center', fontSize: 13, color: '#aaa', background: C.white }}>
          <Logo size={22} />
          <p style={{ margin: '10px 0 0' }}>London, Ontario · Shipping Canada-wide</p>
          <p style={{ margin: '4px 0 0' }}>hello@edibleprint.net · © 2026 EdiblePrint.net. All rights reserved.</p>
        </footer>
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

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={stepBadge}>1</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Upload Your Image</h2>
            <p style={{ color: C.muted, marginBottom: 28 }}>JPG, PNG or PDF · High resolution for best results</p>
            <div onClick={() => fileRef.current?.click()}
              style={{ border: '2.5px dashed ' + C.border, borderRadius: 20, padding: '56px 24px',
                cursor: 'pointer', transition: 'all 0.25s', background: C.white }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.brand; e.currentTarget.style.background = C.brandLight; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.white; }}>
              <div style={{ fontSize: 52, marginBottom: 14, opacity: 0.8 }}>🖼️</div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>Tap to upload your image</p>
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
                  <input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} placeholder="e.g. 5" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Height (inches)</label>
                  <input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} placeholder="e.g. 7" style={inputStyle} />
                </div>
              </div>
            )}
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Quantity</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>-</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>+</button>
            </div>
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Adjust Your Image</label>
            <ImageEditor image={image} shape={shape} sizeObj={selectedSize || { w: parseFloat(customW) || 6, h: parseFloat(customH) || 6 }} onCrop={setCropPreview} />
            <div style={{ marginTop: 22 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Special Instructions (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Please make the background white..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
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
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Street Address *</label>
                <input value={form.address} onChange={(e) => updateForm('address', e.target.value)} style={inputStyle} placeholder="123 Main Street, Apt 4" />
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
            </div>
            <div style={{ marginTop: 26 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Shipping Method</label>
              {[{ key: 'local', label: 'Same Day Delivery — London, ON — London, ON (1-2 days)', price: SHIPPING.local },
                { key: 'standard', label: 'Standard — 3-5 business days', price: SHIPPING.standard },
                { key: 'express', label: 'Express — 1-2 business days', price: SHIPPING.express }].map((opt) => (
                <label key={opt.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
                  border: shipping === opt.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shipping === opt.key ? C.brandLight : C.white, marginBottom: 8, cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input type="radio" name="shipping" checked={shipping === opt.key} onChange={() => setShipping(opt.key)} style={{ accentColor: C.brand, width: 18, height: 18 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.brand }}>{'$' + opt.price.toFixed(2)}</span>
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
