import Link from 'next/link';
import LandingPage from '../_components/LandingPage';
import { formatProductionWindow, shippingTimesSentence } from '../../lib/shipping-config.js';

const PATH = '/edible-logo-prints';
const DESCRIPTION = 'Print your business logo on cookies, cupcakes and cakes. Custom edible logo prints for corporate events, product launches and client gifts, shipped across Canada.';

export const metadata = {
  title: 'Edible Logo Prints for Corporate Events | EdiblePrint.net',
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function EdibleLogoPrintsPage() {
  return (
    <LandingPage
      path={PATH}
      productName="Custom Edible Logo Prints"
      description={DESCRIPTION}
      heading="Edible Logo Prints for Your Business"
      intro="Put your logo on cookies, cupcakes and cakes for events, launches and client gifts. Upload your logo and we print it on food-safe icing sheets or wafer paper."
      ctaHref="/?start=cookies"
      ctaLabel="Upload Your Logo →"
      prices={[
        ['multicircle', 'mc2', '15 logos per sheet'],
        ['multicircle', 'mc3', '6 logos per sheet'],
        ['circular', 'c8', 'A single logo for a cake'],
        ['fullsheet', 'a4', 'For sheet cakes and large projects'],
      ]}
      priceNote={(
        <>
          Ordering 20 or more? <a href="mailto:edibleprintorders@gmail.com?subject=Bulk%20edible%20logo%20prints" style={{ color: '#14503A', fontWeight: 600 }}>Email us</a> for a volume quote.
        </>
      )}
      sections={[
        {
          title: 'Good For',
          list: [
            'Corporate events and conferences',
            'Product launches and open houses',
            'Client and staff appreciation gifts',
            'Bakeries adding logos to customer orders',
          ],
        },
        {
          title: 'Getting a Sharp Logo',
          paragraphs: [
            'Send the highest-quality version of your logo you have, ideally at least 1000×1000 pixels. We review every order before printing, and if we spot a quality issue with your file we reach out before going ahead.',
          ],
        },
        {
          title: 'Want It Stamped Too?',
          paragraphs: [
            <>Pair your print with a <Link href="/cookie-tools" style={{ color: '#1B6B4A', fontWeight: 600 }}>custom logo cookie stamp or cutter</Link> for a matching set.</>,
          ],
        },
      ]}
      faqs={[
        ['How long does an order take?', `Orders are printed within ${formatProductionWindow()}. ${shippingTimesSentence()}`],
        ['Can I pick up instead of shipping?', 'Yes. Pickup is free in London, Ontario. We confirm the exact address and time by email.'],
        ['Can you cut the prints for us?', 'Yes. Choose "Cut to shape" when you customize a round, heart, square, custom or cookie sheet print, and we cut each sheet for you for a small per-sheet fee.'],
      ]}
    />
  );
}
