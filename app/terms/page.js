import LegalLayout from '../_components/LegalLayout';

export const metadata = {
  title: 'Terms of Service — EdiblePrint.net',
  description: 'Terms governing your use of EdiblePrint.net and purchase of custom edible prints.',
};

const EMAIL = 'hello@edibleprint.net';
const ADDRESS = 'London, Ontario, N5Z 3Y1, Canada';
const C = { brand: '#1B6B4A' };

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, margin: '40px 0 12px', color: '#1a1a1a' };
const p  = { margin: '0 0 16px', lineHeight: 1.8 };
const ul = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="Last updated: April 16, 2026">

      <p style={p}>
        Welcome to EdiblePrint. By accessing or using edibleprint.net, you agree to these Terms of Service.
        If you do not agree, please do not use our services.
      </p>

      <h2 style={h2}>1. Our Services</h2>
      <p style={p}>
        EdiblePrint provides custom edible image printing services, producing personalized edible toppers for
        cakes, cookies, and desserts. We ship across Canada.
      </p>

      <h2 style={h2}>2. Orders and Acceptance</h2>
      <p style={p}>
        By placing an order, you confirm that the information you provide is accurate and that you are authorized
        to use the payment method. All orders are subject to acceptance and availability. We reserve the right
        to refuse or cancel any order at our discretion, including but not limited to orders containing
        prohibited content (see Section 5).
      </p>

      <h2 style={h2}>3. Pricing and Payment</h2>
      <p style={p}>
        All prices are listed in Canadian Dollars (CAD) and do not include applicable taxes (HST will be
        calculated at checkout). Payment is processed securely through Stripe at the time of order. We accept
        major credit cards, Apple Pay, and Google Pay.
      </p>

      <h2 style={h2}>4. Production and Shipping</h2>
      <p style={p}>
        Orders are produced within 1–2 business days of payment confirmation. Shipping times vary by destination
        (see our Shipping Policy). We are not responsible for delays caused by shipping carriers, weather,
        or other circumstances beyond our control.
      </p>

      <h2 style={h2}>5. Uploaded Content and Intellectual Property</h2>
      <p style={p}>By uploading an image, design, or text for printing, you confirm that:</p>
      <ul style={ul}>
        <li>You own the rights to the content, or have explicit permission to use it.</li>
        <li>The content does not infringe on any third-party copyright, trademark, or other intellectual property.</li>
        <li>The content is not defamatory, obscene, offensive, hateful, or illegal.</li>
      </ul>
      <p style={p}>
        We reserve the right to refuse any order that violates these conditions. You grant EdiblePrint a limited
        license to reproduce your content solely for the purpose of fulfilling your order.
      </p>
      <p style={p}>
        <strong>You are solely responsible</strong> for ensuring your uploads do not violate copyright or other laws.
      </p>

      <h2 style={h2}>6. Product Nature</h2>
      <p style={p}>
        Our edible prints are custom-made to order. Colors may vary slightly from what you see on your screen
        due to differences between digital displays and printed edible inks. Final appearance may also vary
        based on the cake surface, frosting type, and application conditions.
      </p>

      <h2 style={h2}>7. Food Safety</h2>
      <p style={p}>
        Our products are produced in a clean, food-grade environment using FDA-approved edible inks and materials.
        Please review our{' '}
        <a href="/allergens" style={{ color: C.brand }}>Allergen Information page</a>{' '}
        before ordering if you have dietary concerns.
      </p>

      <h2 style={h2}>8. Cancellations and Refunds</h2>
      <p style={p}>
        Because each order is custom-made, cancellations and refunds are governed by our{' '}
        <a href="/refund" style={{ color: C.brand }}>Refund Policy</a>.
        Please read it carefully before placing an order.
      </p>

      <h2 style={h2}>9. Limitation of Liability</h2>
      <p style={p}>
        To the maximum extent permitted by law, EdiblePrint and its owners, employees, and affiliates shall not
        be liable for any indirect, incidental, consequential, or punitive damages arising from your use of our
        services. Our total liability for any claim shall not exceed the amount you paid for the specific order
        in question.
      </p>

      <h2 style={h2}>10. Governing Law</h2>
      <p style={p}>
        These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable
        therein. Any disputes shall be resolved in the courts of Ontario.
      </p>

      <h2 style={h2}>11. Changes to Terms</h2>
      <p style={p}>
        We may update these Terms at any time. Continued use of our services after changes means you accept
        the updated Terms.
      </p>

      <h2 style={h2}>12. Contact</h2>
      <p style={{ ...p, margin: 0 }}>
        Questions about these Terms?<br />
        Email: <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a><br />
        Address: {ADDRESS}
      </p>

    </LegalLayout>
  );
}
