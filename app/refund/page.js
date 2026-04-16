import Link from 'next/link';
export const metadata = { title: 'Refund Policy — EdiblePrint.net' };
export default function RefundPage() {
  return <ComingSoon title="Refund Policy" />;
}
function ComingSoon({ title }) {
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", minHeight: '100vh', background: '#FAFBF9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 700, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 16, color: '#6B7280', marginBottom: 24 }}>This page is coming soon. For any questions, contact us at <a href="mailto:hello@edibleprint.net" style={{ color: '#1B6B4A' }}>hello@edibleprint.net</a>.</p>
      <Link href="/" style={{ background: '#1B6B4A', color: '#fff', borderRadius: 12, padding: '12px 28px', textDecoration: 'none', fontWeight: 600 }}>← Back to Home</Link>
    </div>
  );
}
