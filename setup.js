// ═══════════════════════════════════════════════════════
// SETUP SCRIPT — EdiblePrint.net
// Run: node setup.js
// This creates ALL project files in the correct locations
// ═══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

function createFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content.trimStart());
  console.log(`✅ Created: ${filePath}`);
}

// ─────────────────────────────────────
// 1. ENVIRONMENT VARIABLES
// ─────────────────────────────────────
createFile('.env.local', `
# Stripe Keys (replace with your real keys from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_51T82h0K9vqGURmUXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51T82h0K9vqGURmUXXXXXXXXXXXXXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXX

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
`);

// ─────────────────────────────────────
// 2. GLOBAL CSS
// ─────────────────────────────────────
createFile('app/globals.css', `
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  font-family: 'Outfit', sans-serif;
  background: #FAFBF9;
  color: #1a1a1a;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }

::selection {
  background: #1B6B4A;
  color: white;
}

input:focus, select:focus, textarea:focus {
  border-color: #1B6B4A !important;
  outline: none;
}

details summary::-webkit-details-marker { display: none; }
details summary { list-style: none; }

@media (max-width: 600px) {
  .hide-mobile { display: none !important; }
}
`);

// ─────────────────────────────────────
// 3. LAYOUT
// ─────────────────────────────────────
createFile('app/layout.js', `
export const metadata = {
  title: 'EdiblePrint.net — Custom Edible Image Printing | Shipped Across Canada',
  description: 'Upload your photo, logo or design. We print it on premium edible paper with food-safe inks and ship it to your door anywhere in Canada. Perfect for cakes, cookies, and cupcakes.',
  keywords: 'edible print, edible image, cake topper, custom edible printing, edible paper, Canada, icing sheet',
  openGraph: {
    title: 'EdiblePrint.net — Your Image, Printed on Edible Sheets',
    description: 'Upload any image. We print it on edible paper and ship across Canada.',
    url: 'https://edibleprint.net',
    siteName: 'EdiblePrint.net',
    locale: 'en_CA',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
`);

// ─────────────────────────────────────
// 4. MAIN PAGE (Landing + Order Flow)
// ─────────────────────────────────────
createFile('app/page.js', `
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

const SHIPPING = { standard: 6.99, express: 14.99 };
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

/* ═══ LOGO COMPONENT ═══ */
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
      const s = Math.max(canvasW / img.width, canvasH / img.height);
      setScale(s);
      setPos({ x: (canvasW - img.width * s) / 2, y: (canvasH - img.height * s) / 2 });
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
/* ═══ MAIN APP COMPONENT ═══ */
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
  const selectedSize = sizes.find((s) => s.id === sizeId) || sizes[0];
  const unitPrice = shape === 'custom'
    ? (parseFloat(customW || 0) * parseFloat(customH || 0) * 0.25 + 5)
    : selectedSize?.price || 0;
  const subtotal = unitPrice * qty;
  const shippingCost = SHIPPING[shipping];
  const tax = (subtotal + shippingCost) * TAX_RATE;
  const total = subtotal + shippingCost + tax;

  useEffect(() => {
    if (shape === 'custom') { setSizeId('custom'); }
    else if (!SIZES[shape]?.find((s) => s.id === sizeId)) { setSizeId(SIZES[shape]?.[0]?.id || ''); }
  }, [shape]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { setImage(ev.target.result); setStep(2); };
    reader.readAsDataURL(file);
  };

  const updateForm = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  /* ═══ STRIPE CHECKOUT ═══ */
  const handlePlaceOrder = async () => {
    if (!form.name || !form.email || !form.address || !form.city || !form.postal) {
      alert('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
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

  /* ════════════════════════════════════════ */
  /* ═══ HOME PAGE ═══ */
  /* ════════════════════════════════════════ */
  if (step === 0) {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
        {/* NAV */}
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px',
          borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
          <Logo />
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14, borderRadius: 10 }}>
            Order Now
          </button>
        </nav>

        {/* HERO */}
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

        {/* TRUST BAR */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', padding: '0 24px 40px' }}>
          {['🍃 FDA-Approved Inks', '📦 Canada-Wide Shipping', '⚡ 24h Image Review', '🔒 Secure Payment'].map((t, i) => (
            <span key={i} style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{t}</span>
          ))}
        </div>

        {/* HOW IT WORKS */}
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
            ].map((s, i) => (
              <div key={i} style={{ ...card, textAlign: 'center', padding: '28px 20px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 11, fontWeight: 700, color: C.brand, opacity: 0.4 }}>{s.num}</div>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{s.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PERFECT FOR */}
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

        {/* PRICING */}
        <section style={{ padding: '48px 24px', maxWidth: 740, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 8, fontWeight: 700 }}>Simple, Transparent Pricing</h2>
          <p style={{ color: C.muted, marginBottom: 28, fontSize: 15 }}>Premium edible paper + food-safe inks included in every order.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[...SIZES.circular, ...SIZES.square, ...SIZES.rectangular].map((s) => (
              <div key={s.id} style={{ ...card, padding: '22px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.brand }}>${s.price.toFixed(2)}</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 16 }}>Custom sizes available · Shipping from $6.99 · HST calculated at checkout</p>
        </section>

        {/* FAQ */}
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
          ].map(([q, a], i) => (
            <details key={i} style={{ ...card, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', borderRadius: 12 }}>
              <summary style={{ fontWeight: 600, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {q} <span style={{ color: '#ccc', fontSize: 20, marginLeft: 8 }}>+</span>
              </summary>
              <p style={{ margin: '12px 0 0', fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{a}</p>
            </details>
          ))}
        </section>

        {/* FINAL CTA */}
        <section style={{ padding: '52px 24px 64px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 8, fontWeight: 700 }}>Ready to Print?</h2>
          <p style={{ color: C.muted, marginBottom: 24, fontSize: 16 }}>Upload your image and get your edible prints shipped across Canada.</p>
          <button onClick={() => setStep(1)} style={{ ...btnPrimary, fontSize: 18, padding: '17px 44px', borderRadius: 14 }}>
            Start Your Order →
          </button>
        </section>

        {/* FOOTER */}
        <footer style={{ borderTop: '1px solid ' + C.border, padding: '28px 24px', textAlign: 'center', fontSize: 13, color: '#aaa', background: C.white }}>
          <Logo size={22} />
          <p style={{ margin: '10px 0 0' }}>London, Ontario · Shipping Canada-wide</p>
          <p style={{ margin: '4px 0 0' }}>edibleprintorders@gmail.com · © 2026 EdiblePrint.net. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  /* ════════════════════════════════════════ */
  /* ═══ ORDER FLOW (Steps 1-4) ═══ */
  /* ════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>
      {/* NAV + STEPPER */}
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

        {/* ── STEP 1: UPLOAD ── */}
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
                <p style={{ color: C.brand, fontWeight: 600 }}>✓ {imageName}</p>
                <button onClick={() => setStep(2)} style={btnPrimary}>Continue →</button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: CUSTOMIZE ── */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: 'center' }}>
              <div style={stepBadge}>2</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: '16px 0 8px', fontWeight: 700 }}>Customize Your Print</h2>
              <p style={{ color: C.muted, marginBottom: 24 }}>Choose shape, size, and adjust the crop area</p>
            </div>
            {/* Shape */}
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Shape</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
              {[{ key: 'circular', icon: '⭕', label: 'Round' }, { key: 'square', icon: '⬜', label: 'Square' },
                { key: 'rectangular', icon: '▬', label: 'Rectangle' }, { key: 'custom', icon: '✏️', label: 'Custom' }].map((s) => (
                <button key={s.key} onClick={() => setShape(s.key)} style={{
                  flex: 1, minWidth: 72, padding: '12px 8px', borderRadius: 12,
                  border: shape === s.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shape === s.key ? C.brandLight : C.white,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                  <div style={{ fontSize: 20, marginBottom: 2 }}>{s.icon}</div>{s.label}
                </button>
              ))}
            </div>
            {/* Size */}
            {shape !== 'custom' ? (
              <>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Size</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
                  {sizes.map((s) => (
                    <button key={s.id} onClick={() => setSizeId(s.id)} style={{
                      flex: 1, minWidth: 90, padding: '14px 10px', borderRadius: 12,
                      border: sizeId === s.id ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                      background: sizeId === s.id ? C.brandLight : C.white,
                      cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s' }}>
                      <div style={{ fontWeight: 700, fontSize: 17, color: C.brand }}>${s.price.toFixed(2)}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{s.label}</div>
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
            {/* Quantity */}
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Quantity</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>-</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid ' + C.border, background: C.white, fontSize: 18, cursor: 'pointer', fontWeight: 600 }}>+</button>
            </div>
            {/* Editor */}
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Adjust Your Image</label>
            <ImageEditor image={image} shape={shape} sizeObj={selectedSize || { w: parseFloat(customW) || 6, h: parseFloat(customH) || 6 }} onCrop={setCropPreview} />
            {/* Notes */}
            <div style={{ marginTop: 22 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>Special Instructions (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Please make the background white..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            {/* Price */}
            <div style={{ ...card, marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 600 }}>
                <span>{qty}x {shape === 'custom' ? customW + '"x' + customH + '"' : selectedSize?.label} ({shape})</span>
                <span style={{ color: C.brand, fontSize: 18 }}>${subtotal.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              <button onClick={() => setStep(1)} style={{ ...btnSecondary, flex: 1 }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ ...btnPrimary, flex: 2 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: SHIPPING & PAYMENT ── */}
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
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ maxWidth: 200 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Postal Code *</label>
                <input value={form.postal} onChange={(e) => updateForm('postal', e.target.value.toUpperCase())} style={inputStyle} placeholder="N6A 1B2" maxLength={7} />
              </div>
            </div>
            {/* Shipping Method */}
            <div style={{ marginTop: 26 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 10 }}>Shipping Method</label>
              {[{ key: 'standard', label: 'Standard — 3-5 business days', price: SHIPPING.standard },
                { key: 'express', label: 'Express — 1-2 business days', price: SHIPPING.express }].map((s) => (
                <label key={s.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
                  border: shipping === s.key ? '2.5px solid ' + C.brand : '2px solid ' + C.border,
                  background: shipping === s.key ? C.brandLight : C.white, marginBottom: 8, cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input type="radio" name="shipping" checked={shipping === s.key} onChange={() => setShipping(s.key)} style={{ accentColor: C.brand, width: 18, height: 18 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.brand }}>${s.price.toFixed(2)}</span>
                </label>
              ))}
            </div>
            {/* Summary */}
            <div style={{ ...card, marginTop: 26 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Order Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{qty}x {shape === 'custom' ? customW + '"x' + customH + '"' : selectedSize?.label} ({shape})</span>
                  <span style={{ fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Shipping</span><span style={{ fontWeight: 600 }}>${shippingCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted }}>
                  <span>HST (13%)</span><span>${tax.toFixed(2)}</span>
                </div>
                <div style={{ borderTop: '1.5px solid ' + C.border, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20 }}>
                  <span>Total</span>
                  <span style={{ color: C.brand }}>${total.toFixed(2)} <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>CAD</span></span>
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
`);

// ─────────────────────────────────────
// 5. API: CREATE STRIPE CHECKOUT
// ─────────────────────────────────────
createFile('app/api/create-checkout/route.js', `
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      customerName, customerEmail, customerPhone,
      shippingAddress, shippingCity, shippingProvince, shippingPostal,
      shape, size, quantity, unitPrice,
      shippingMethod, shippingCost, notes,
    } = body;

    const subtotal = Math.round(unitPrice * quantity * 100);
    const shippingAmount = Math.round(shippingCost * 100);
    const taxRate = 0.13;
    const taxAmount = Math.round((subtotal + shippingAmount) * taxRate);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail,

      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: 'Edible Print — ' + quantity + 'x ' + size + ' (' + shape + ')',
              description: 'Custom edible image print on premium icing sheet',
            },
            unit_amount: subtotal,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: 'Shipping (' + (shippingMethod === 'express' ? 'Express 1-2 days' : 'Standard 3-5 days') + ')',
            },
            unit_amount: shippingAmount,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'cad',
            product_data: { name: 'HST (13%)' },
            unit_amount: taxAmount,
          },
          quantity: 1,
        },
      ],

      metadata: {
        customerName,
        customerPhone: customerPhone || 'N/A',
        shippingAddress,
        shippingCity,
        shippingProvince,
        shippingPostal,
        shape,
        size,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        shippingMethod,
        notes: notes || 'None',
      },

      success_url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + '/cancel',
    });

    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error('Stripe error:', error);
    return NextResponse.json({ error: 'Error creating checkout session' }, { status: 500 });
  }
}
`);

// ─────────────────────────────────────
// 6. API: STRIPE WEBHOOK
// ─────────────────────────────────────
createFile('app/api/webhook/route.js', `
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata;

    const orderDetails = [
      '═══ NEW ORDER — EdiblePrint.net ═══',
      '',
      'Order ID: EP-' + session.id.slice(-8).toUpperCase(),
      'Payment: $' + (session.amount_total / 100).toFixed(2) + ' CAD',
      '',
      '── Customer ──',
      'Name: ' + meta.customerName,
      'Email: ' + session.customer_email,
      'Phone: ' + meta.customerPhone,
      '',
      '── Order ──',
      'Shape: ' + meta.shape,
      'Size: ' + meta.size,
      'Quantity: ' + meta.quantity,
      'Unit Price: $' + meta.unitPrice,
      'Shipping: ' + meta.shippingMethod,
      'Notes: ' + meta.notes,
      '',
      '── Ship To ──',
      meta.shippingAddress,
      meta.shippingCity + ', ' + meta.shippingProvince,
      meta.shippingPostal,
      '',
      'Stripe Dashboard: https://dashboard.stripe.com/payments/' + session.payment_intent,
    ].join('\\n');

    console.log(orderDetails);

    // TODO: Add email notification (Resend) and/or Google Sheet integration
    // See the Stripe guide for instructions
  }

  return NextResponse.json({ received: true });
}
`);

// ─────────────────────────────────────
// 7. SUCCESS PAGE
// ─────────────────────────────────────
createFile('app/success/page.js', `
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px',
      maxWidth: 520, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{
        width: 72, height: 72, borderRadius: '50%', background: '#E8F5EE',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, marginBottom: 20,
      }}>✅</div>

      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, marginBottom: 12, fontWeight: 700 }}>
        Payment Successful!
      </h1>

      <p style={{ fontSize: 17, color: '#6B7280', lineHeight: 1.65, marginBottom: 28 }}>
        Thank you for your order! We have received your payment and will review
        your image within 24 hours. A confirmation email is on its way.
      </p>

      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
        padding: '18px 22px', fontSize: 14, color: '#92700C', marginBottom: 28,
        textAlign: 'left', lineHeight: 1.7,
      }}>
        <strong>What happens next?</strong><br />
        1. We review your image for print quality (within 24h)<br />
        2. If adjustments are needed, we contact you by email<br />
        3. We print your edible sheet and ship via Canada Post<br />
        4. You receive it at your door!
      </div>

      <a href="/" style={{
        display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12,
        padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
        boxShadow: '0 4px 16px rgba(27,107,74,0.25)',
      }}>
        ← Back to Home
      </a>

      <p style={{ marginTop: 20, fontSize: 12, color: '#bbb' }}>
        Questions? Email us at edibleprintorders@gmail.com
      </p>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
`);

// ─────────────────────────────────────
// 8. CANCEL PAGE
// ─────────────────────────────────────
createFile('app/cancel/page.js', `
export default function CancelPage() {
  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px',
      maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ fontSize: 56, marginBottom: 20 }}>↩️</div>

      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 12, fontWeight: 700 }}>
        Order Cancelled
      </h1>

      <p style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }}>
        No worries — your payment was not processed. You can start a new order
        anytime.
      </p>

      <a href="/" style={{
        display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12,
        padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none',
        boxShadow: '0 4px 16px rgba(27,107,74,0.25)',
      }}>
        ← Try Again
      </a>
    </div>
  );
}
`);

// ─────────────────────────────────────
// DONE!
// ─────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════');
console.log('✅ ALL FILES CREATED SUCCESSFULLY!');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('Next steps:');
console.log('1. Open .env.local and paste your real Stripe keys');
console.log('2. Run: npm run dev');
console.log('3. Open http://localhost:3000 in your browser');
console.log('4. Test the full order flow with card: 4242 4242 4242 4242');
console.log('');
