import LegalLayout from '../_components/LegalLayout';

export const metadata = {
  title: 'Refund Policy — EdiblePrint.net',
  description: 'EdiblePrint.net refund and reprint policy for custom edible prints.',
};

const EMAIL = 'glenj.belmar@gmail.com';
const C = { brand: '#1B6B4A', brandLight: '#E8F5EE', border: '#E5E7EB' };

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, margin: '40px 0 12px', color: '#1a1a1a' };
const p  = { margin: '0 0 16px', lineHeight: 1.8 };
const ul = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };
const ol = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="Last updated: April 16, 2026">

      <p style={p}>
        Because every EdiblePrint order is custom-made to your design, our refund policy is tailored to protect
        you against defects and errors while reflecting the personalized nature of the product.
      </p>

      <h2 style={h2}>Our 100% Print Quality Guarantee</h2>
      <p style={p}>We stand behind every order we ship. If your order arrives:</p>
      <ul style={ul}>
        <li><strong>Damaged in transit</strong> (torn, crushed, or physically compromised)</li>
        <li><strong>Printed incorrectly</strong> (wrong image, wrong size, wrong shape)</li>
        <li><strong>Defective</strong> (smudged ink, missing colors, or a visible print error from our end)</li>
      </ul>
      <p style={p}>
        …we will <strong>reprint and reship it at no additional cost</strong>, or issue a full refund at
        your choice.
      </p>

      <h2 style={h2}>How to File a Claim</h2>
      <p style={p}>
        To claim under the guarantee, within <strong>48 hours of delivery</strong>:
      </p>
      <ol style={ol}>
        <li>Email us at <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a>.</li>
        <li>Include your order number.</li>
        <li>Attach clear photos of the issue (the print itself and, if applicable, the packaging damage).</li>
        <li>Briefly describe the problem.</li>
      </ol>
      <p style={p}>
        We will respond within 1 business day and confirm whether we reprint or refund. Approved reprints are
        shipped at our expense using expedited shipping when possible.
      </p>

      <h2 style={h2}>Order Cancellations</h2>
      <p style={p}>
        You may cancel an order for a <strong>full refund within 2 hours of purchase</strong>, provided
        production has not yet started. After the 2-hour window, orders that have entered production cannot
        be cancelled because materials and time have already been committed.
      </p>
      <p style={p}>
        To cancel, email <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a> with your order
        number as soon as possible.
      </p>

      <h2 style={h2}>What Is Not Covered</h2>
      <p style={p}>We cannot offer refunds or reprints for:</p>
      <ul style={ul}>
        <li>
          <strong>Poor image quality</strong> caused by the customer uploading a low-resolution photo. Our
          editor warns you when image quality is below recommended. Please check the preview carefully before
          placing your order.
        </li>
        <li>
          <strong>Color differences</strong> between your screen and the printed result. Screens display
          colors differently from edible inks on frosting sheets. We print accurately to standard
          edible-ink color profiles.
        </li>
        <li><strong>Change of mind</strong> after production has started.</li>
        <li><strong>Shipping delays</strong> caused by the carrier or weather.</li>
        <li><strong>Incorrect shipping address</strong> provided by the customer.</li>
        <li><strong>Damage caused after delivery</strong> (improper storage, exposure to moisture, etc.).</li>
      </ul>

      <h2 style={h2}>Storage and Handling</h2>
      <p style={p}>
        Edible prints are perishable when exposed to heat, moisture, or sunlight. Once delivered, please store
        them sealed in a cool, dry place and apply them within 12 months. Problems caused by improper storage
        are not covered.
      </p>

      <h2 style={h2}>Refunds Processing</h2>
      <p style={p}>
        Approved refunds are processed to the original payment method within 5–10 business days. Depending on
        your bank, it may take additional days to appear on your statement.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={{ ...p, margin: 0 }}>
        Questions about your order or this policy?<br />
        Email: <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a>
      </p>

    </LegalLayout>
  );
}
