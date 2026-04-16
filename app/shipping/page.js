import LegalLayout from '../_components/LegalLayout';

export const metadata = {
  title: 'Shipping Policy — EdiblePrint.net',
  description: 'Shipping methods, transit times, and rates for EdiblePrint.net orders across Canada.',
};

const EMAIL = 'glenj.belmar@gmail.com';
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
        Once your order leaves our facility in London, Ontario, estimated transit times are:
      </p>
      <ul style={ul}>
        <li><strong>London ON (local):</strong> Same-day or next-day delivery, or free pickup.</li>
        <li><strong>Ontario (GTA, Ottawa, etc.):</strong> 1–2 business days</li>
        <li><strong>Quebec, Manitoba:</strong> 2–3 business days</li>
        <li><strong>Alberta, Saskatchewan, BC:</strong> 3–5 business days</li>
        <li><strong>Atlantic Provinces (NB, NS, PE, NL):</strong> 3–6 business days</li>
        <li><strong>Northern territories (YT, NT, NU):</strong> 5–10 business days</li>
      </ul>
      <p style={p}>
        These are estimates only. Actual times depend on the carrier, destination, and external factors
        (weather, holidays, etc.).
      </p>

      <h2 style={h2}>Shipping Rates</h2>
      <p style={p}>
        Shipping rates start at <strong>$6.99 CAD</strong> and are calculated at checkout based on your
        destination. Exact rates are shown before you complete your order.
      </p>

      <h2 style={h2}>Local London, Ontario Orders</h2>
      <p style={p}>Customers in London, Ontario qualify for:</p>
      <ul style={ul}>
        <li><strong>Free local pickup</strong> at our location</li>
        <li><strong>Same-day local delivery</strong> in selected postal code zones (calculated automatically at checkout)</li>
      </ul>

      <h2 style={h2}>Order Tracking</h2>
      <p style={p}>
        Once your order ships, you'll receive an email with a tracking number. You can use it to follow your
        package until delivery.
      </p>

      <h2 style={h2}>Lost or Damaged Packages</h2>
      <p style={p}>
        If your package is marked as delivered but you did not receive it, please:
      </p>
      <ol style={ol}>
        <li>Check with neighbors or household members.</li>
        <li>Contact the shipping carrier with your tracking number.</li>
        <li>
          If still not found after 48 hours, contact us at{' '}
          <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a> and
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
