import LegalLayout from '../_components/LegalLayout';

export const metadata = {
  title: 'Allergen Information — EdiblePrint.net',
  description: 'Ingredient and allergen details for EdiblePrint.net edible icing sheets and food-safe inks.',
};

const EMAIL = 'hello@edibleprint.net';
const C = { brand: '#1B6B4A', brandLight: '#E8F5EE', border: '#E5E7EB' };

const h2 = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, margin: '40px 0 12px', color: '#1a1a1a' };
const p  = { margin: '0 0 16px', lineHeight: 1.8 };
const ul = { margin: '0 0 16px', paddingLeft: 22, lineHeight: 1.9 };

export default function AllergensPage() {
  return (
    <LegalLayout title="Allergen Information" lastUpdated="Last updated: April 16, 2026">

      <p style={p}>
        At EdiblePrint, food safety is important to us. This page explains the ingredients in our edible
        prints and what allergens they do — and don't — contain.
      </p>

      <h2 style={h2}>Standard Frosting Sheets</h2>
      <p style={p}>
        Our standard frosting sheets (used for Round, Heart, Square, Cookie Sheets, and Full Sheet products) are:
      </p>

      {/* Allergen status grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 10, margin: '0 0 20px',
      }}>
        {[
          'Gluten-free', 'Nut-free', 'Dairy-free',
          'Egg-free', 'Soy-free', 'Kosher-certified',
        ].map((label) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: C.brandLight, borderRadius: 10,
            padding: '10px 14px', border: '1px solid #C6E6D6',
            fontSize: 14.5, fontWeight: 600, color: '#1a1a1a',
          }}>
            <span style={{ fontSize: 18 }}>✅</span> {label}
          </div>
        ))}
      </div>

      <p style={p}>
        <strong>Typical ingredients:</strong> sugar, water, modified food starch, corn syrup, glycerin,
        vegetable gum, sorbitol, titanium dioxide (color), natural and artificial flavors, potassium sorbate
        (preservative).
      </p>

      <h2 style={h2}>Edible Inks</h2>
      <p style={p}>
        Our edible inks are FDA-approved and food-grade, designed specifically for edible printing.
        They contain:
      </p>
      <ul style={ul}>
        <li>Water</li>
        <li>FDA-approved food color additives</li>
        <li>Humectants (glycerin, propylene glycol)</li>
        <li>Preservatives in trace amounts</li>
      </ul>
      <p style={p}>Edible inks are free from gluten, nuts, dairy, eggs, and soy.</p>

      <h2 style={h2}>Cross-Contamination Notice</h2>
      <p style={p}>
        Our printing facility handles only edible printing materials and does not process peanuts, tree nuts,
        dairy, eggs, wheat, or shellfish. However, we cannot guarantee that our suppliers' facilities are
        free from trace amounts of these allergens. Customers with severe allergies should exercise caution
        and consult with their physician if uncertain.
      </p>

      <h2 style={h2}>Shelf Life and Storage</h2>
      <p style={p}>
        Unopened frosting sheets stay fresh for up to <strong>12 months</strong> when stored sealed in a cool,
        dry place away from direct sunlight. Refrigeration is not recommended — moisture from refrigeration
        can cause sheets to warp or become sticky.
      </p>
      <p style={p}>
        Once applied to your cake, consume within the shelf life of the cake itself.
      </p>

      <h2 style={h2}>Vegan Status</h2>
      <p style={p}>
        Our standard frosting sheets and edible inks are <strong>vegan-friendly</strong> — they contain no
        animal-derived ingredients.
      </p>

      <h2 style={h2}>Questions?</h2>
      <p style={{ ...p, margin: 0 }}>
        If you have specific dietary concerns or need detailed ingredient information for a particular product,
        please email us at{' '}
        <a href={`mailto:${EMAIL}`} style={{ color: C.brand }}>{EMAIL}</a>{' '}
        before ordering. We're happy to help.
      </p>

    </LegalLayout>
  );
}
