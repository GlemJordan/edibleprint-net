import LegalLayout from '../_components/LegalLayout';

export const metadata = {
  title: 'Privacy Policy — EdiblePrint.net',
  description: 'How EdiblePrint.net collects, uses, and protects your personal information.',
};

const EMAIL = 'hello@edibleprint.net';
const ADDRESS = 'London, Ontario, N5Z 3Y1, Canada';
const C = { brand: '#1B6B4A', muted: '#6B7280', border: '#E5E7EB', brandLight: '#E8F5EE' };

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, margin: '40px 0 12px', color: '#1a1a1a' };
const p  = { margin: '0 0 16px', lineHeight: 1.8 };
const ul = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="Last updated: April 16, 2026">

      <p style={p}>
        EdiblePrint ("we," "our," or "us") respects your privacy. This Privacy Policy explains how we collect,
        use, and protect your personal information when you visit edibleprint.net or place an order with us.
      </p>

      <h2 style={h2}>Information We Collect</h2>
      <p style={p}>When you place an order or interact with our website, we may collect:</p>
      <ul style={ul}>
        <li><strong>Contact information:</strong> name, email address, phone number, shipping address.</li>
        <li><strong>Payment information:</strong> processed securely by Stripe. We do not store your credit card details on our servers.</li>
        <li><strong>Order content:</strong> images and text you upload to create your custom edible prints.</li>
        <li><strong>Technical data:</strong> IP address, browser type, device information, and cookies for analytics and site functionality.</li>
      </ul>

      <h2 style={h2}>How We Use Your Information</h2>
      <p style={p}>We use your information to:</p>
      <ul style={ul}>
        <li>Process and fulfill your orders.</li>
        <li>Communicate about your order status and shipping updates.</li>
        <li>Respond to customer inquiries.</li>
        <li>Improve our website and service quality.</li>
        <li>Send occasional marketing emails (only if you opt in — you can unsubscribe at any time).</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2 style={h2}>Third-Party Services</h2>
      <p style={p}>We share limited information with trusted service providers who help us operate our business:</p>
      <ul style={ul}>
        <li><strong>Stripe</strong> (payment processing)</li>
        <li><strong>Cloudinary</strong> (image storage and processing)</li>
        <li><strong>Resend</strong> (transactional email delivery)</li>
        <li><strong>Vercel</strong> (website hosting)</li>
        <li><strong>Google Analytics</strong> (website traffic analysis)</li>
        <li><strong>Canada Post / shipping carriers</strong> (order delivery)</li>
      </ul>
      <p style={p}>
        These providers are contractually bound to protect your data and use it only for the services they provide to us.
      </p>

      <h2 style={h2}>Your Uploaded Images</h2>
      <p style={p}>
        Images you upload for printing are stored temporarily on Cloudinary for the purpose of producing your order.
        We do not use, share, distribute, or sell your uploaded images for any purpose other than fulfilling your order.
        Images are automatically deleted from our systems within 90 days after your order is shipped.
      </p>

      <h2 style={h2}>Cookies</h2>
      <p style={p}>
        We use cookies to keep your cart and design preferences active during your visit, remember your session,
        and understand how visitors use our site. You can disable cookies in your browser settings, though some
        features may not work correctly without them.
      </p>

      <h2 style={h2}>Your Rights (Canada — PIPEDA)</h2>
      <p style={p}>
        Under Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), you have the right to:
      </p>
      <ul style={ul}>
        <li>Access the personal information we hold about you.</li>
        <li>Request correction of inaccurate information.</li>
        <li>Request deletion of your personal information (subject to legal retention requirements).</li>
        <li>Withdraw consent for marketing communications.</li>
      </ul>
      <p style={p}>
        To exercise these rights, email us at{' '}
        <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a>.
      </p>

      <h2 style={h2}>Data Security</h2>
      <p style={p}>
        We implement industry-standard security measures to protect your information. All payment transactions are
        encrypted via SSL and processed by PCI-compliant providers. However, no method of transmission over the
        internet is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h2 style={h2}>Children's Privacy</h2>
      <p style={p}>
        Our services are not directed to individuals under 18. We do not knowingly collect information from minors.
        If you believe a minor has provided us with personal information, please contact us for immediate deletion.
      </p>

      <h2 style={h2}>Changes to This Policy</h2>
      <p style={p}>
        We may update this Privacy Policy from time to time. Changes will be posted on this page with a new
        "Last updated" date. Continued use of our services after changes constitutes acceptance.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={{ ...p, margin: 0 }}>
        Questions about this Privacy Policy?<br />
        Email: <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a><br />
        Address: {ADDRESS}
      </p>

    </LegalLayout>
  );
}
