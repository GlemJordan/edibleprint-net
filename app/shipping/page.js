import LegalLayout from '../_components/LegalLayout';
import {
  getShippingMethods,
  getShippingMethod,
  describeShippingMethod,
  formatProductionWindow,
  shippingTimesSentence,
} from '../../lib/shipping-config.js';

export const metadata = {
  title: 'Shipping Policy — EdiblePrint.net',
  description: 'Shipping methods, transit times, and rates for EdiblePrint.net orders across Canada.',
};

const EMAIL = 'edibleprintorders@gmail.com';
const C = { brand: '#1B6B4A', border: '#E5E7EB', brandLight: '#E8F5EE' };

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, margin: '40px 0 12px', color: '#1a1a1a' };
const p  = { margin: '0 0 16px', lineHeight: 1.8 };
const ul = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };

export default function ShippingPage() {
  const standard = getShippingMethod('standard');

  return (
    <LegalLayout title="Shipping Policy" lastUpdated="Last updated: September 25, 2026">

      <h2 style={h2}>Shipping options</h2>
      <p style={p}>{shippingTimesSentence()}</p>
      <ul style={ul}>
        {getShippingMethods().map((m) => (
          <li key={m.id}>
            <strong>{m.label} — {m.carrier}</strong><br />
            {describeShippingMethod(m)}
          </li>
        ))}
      </ul>
      <p style={p}>Free local pickup is available in London, Ontario.</p>

      <h2 style={h2}>Production time</h2>
      <p style={p}>
        Orders are printed within {formatProductionWindow()} before they are shipped. The delivery times above
        start once your order ships.
      </p>

      <h2 style={h2}>If your order hasn&apos;t arrived</h2>
      <p style={p}>
        If a standard shipping order has not arrived {standard.maxBusinessDays} business days after it was
        mailed,{' '}
        <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>contact us</a>{' '}
        and we will reprint and resend it once, at no cost.
      </p>
      <p style={p}>
        Standard shipping has no tracking number, so we cannot confirm where a package is once it has been
        mailed. If you need your order by a specific date, we recommend tracked shipping.
      </p>

      <h2 style={h2}>Your address</h2>
      <p style={p}>
        Customers are responsible for providing a complete and correct mailing address. We are not able to
        reship orders returned or lost because of an incorrect address.
      </p>

      <h2 style={h2}>Orders with a deadline</h2>
      <p style={p}>
        If you need your order by a specific date, choose tracked shipping and enter the date at checkout.
        Contact us before ordering if the date is tight.
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
