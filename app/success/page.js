'use client';
import { Suspense } from 'react';

function SuccessContent() {
  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px',
      maxWidth: 520, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E8F5EE',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 20 }}>
        <span role="img" aria-label="check">&#x2705;</span>
      </div>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, marginBottom: 12, fontWeight: 700 }}>
        Payment Successful!
      </h1>
      <p style={{ fontSize: 17, color: '#6B7280', lineHeight: 1.65, marginBottom: 28 }}>
        Thank you for your order! We have received your payment and will review
        your image within 24 hours. A confirmation email is on its way.
      </p>
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
        padding: '18px 22px', fontSize: 14, color: '#92700C', marginBottom: 28, textAlign: 'left', lineHeight: 1.7 }}>
        <strong>What happens next?</strong><br />
        1. We review your image for print quality (within 24h)<br />
        2. If adjustments are needed, we contact you by email<br />
        3. We print your edible sheet and ship via Canada Post<br />
        4. You receive it at your door!
      </div>
      <a href="/" style={{ display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12,
        padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
        Back to Home
      </a>
      <p style={{ marginTop: 20, fontSize: 12, color: '#bbb' }}>Questions? Email hello@edibleprint.net</p>
    </div>
  );
}

export default function SuccessPage() {
  return (<Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}><SuccessContent /></Suspense>);
}
