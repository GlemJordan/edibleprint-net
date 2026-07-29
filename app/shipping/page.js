import LegalLayout from '../_components/LegalLayout';

export const metadata = {
  title: 'Shipping Policy — EdiblePrint.net',
  description: 'Shipping methods, transit times, and rates for EdiblePrint.net orders across Canada.',
};

const EMAIL = 'edibleprintorders@gmail.com';
const C = { brand: '#1B6B4A', border: '#E5E7EB', brandLight: '#E8F5EE' };

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, margin: '40px 0 12px', color: '#1a1a1a' };
const p  = { margin: '0 0 16px', lineHeight: 1.8 };
const ul = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };
const ol = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };

export default function ShippingPage() {
  return (
    <LegalLayout title="Shipping Policy" lastUpdated="Last updated: April 16, 2026">

      <p style={p}>
        We ship EdiblePrint orders across Canada using reliable carriers to ensure your custom edible prints
        arrive safely and on time.
      </p>

      <h2 style={h2}>Production Time</h2>
      <p style={p}>
        All orders are custom-made. Production typically takes <strong>1–2 business days</strong> from the time
        payment is confirmed. Orders placed before 2:00 PM EST on a business day usually enter production
        the same day.
      </p>

      <h2 style={h2}>Shipping Methods and Transit Times</h2>
      <p style={p}>
        Once your order leaves our facility in London, Ontario, via Canada Post, estimated delivery time is
        <strong> approx. 3–5 business days</strong>, anywhere in Canada.
      </p>
      <p style={p}>
        This is an estimate only. Actual times depend on the carrier, destination, and external factors
        (weather, holidays, etc.). No tracking number is included with this shipping method.
      </p>

      <h2 style={h2}>Shipping Rates</h2>
      <p style={p}>
        Shipping is a <strong>flat rate of $9.99 CAD</strong>, anywhere in Canada, via Canada Post.
      </p>

      <h2 style={h2}>Local London, Ontario Orders</h2>
      <p style={p}>Customers in London, Ontario qualify for:</p>
      <ul style={ul}>
        <li><strong>Free local pickup</strong> at our location</li>
      </ul>

      <h2 style={h2}>Order Updates</h2>
      <p style={p}>
        You'll receive a confirmation email as soon as your order ships. Canada Post Lettermail does not
        include a tracking number, so we're unable to provide delivery status updates after that point.
      </p>

      <h2 style={h2}>Lost or Damaged Packages</h2>
      <p style={p}>
        If your package hasn't arrived within <strong>10 business days</strong> of shipping, please:
      </p>
      <ol style={ol}>
        <li>Check with neighbors or household members.</li>
        <li>
          Still missing? Email us at{' '}
          <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a> with your order number, and
          we'll work with you to resolve it.
        </li>
      </ol>
      <p style={p}>
        If your package arrives damaged, photograph it immediately and contact us within 48 hours. Our
        Print Quality Guarantee (see{' '}
        <a href="/refund" style={{ color: C.brand }}>Refund Policy</a>)
        covers reprints for damaged orders.
      </p>

      <h2 style={h2}>International Shipping</h2>
      <p style={p}>
        At this time, we ship <strong>only within Canada</strong>. International orders may become available
        in the future — follow us on Instagram for updates.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={{ ...p, margin: 0 }}>
        Shipping questions?<br />
        Email: <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a>
      </p>

    </LegalLayout>
  );
}
