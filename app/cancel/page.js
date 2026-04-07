export default function CancelPage() {
  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px',
      maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ fontSize: 56, marginBottom: 20 }}>&#x21A9;&#xFE0F;</div>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 12, fontWeight: 700 }}>
        Order Cancelled
      </h1>
      <p style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }}>
        No worries. Your payment was not processed. You can start a new order anytime.
      </p>
      <a href="/" style={{ display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12,
        padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
        Try Again
      </a>
    </div>
  );
}
