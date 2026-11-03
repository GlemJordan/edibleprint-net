import LandingPage from '../_components/LandingPage';
import { cutSurchargeFor } from '../../lib/cutting-config.js';
import { formatProductionWindow, shippingTimesSentence } from '../../lib/shipping-config.js';

const PATH = '/edible-cookie-toppers';
const DESCRIPTION = 'Custom edible cookie toppers printed from your photo or logo. 6 or 15 per sheet, with cut-to-shape, free pickup in London, ON and Canada-wide shipping.';

export const metadata = {
  title: 'Custom Edible Cookie Toppers in Canada | EdiblePrint.net',
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function EdibleCookieToppersPage() {
  const cut = cutSurchargeFor('multicircle', 'mc3').toFixed(2);
  return (
    <LandingPage
      path={PATH}
      productName="Custom Edible Cookie Toppers"
      description={DESCRIPTION}
      heading="Custom Edible Cookie Toppers"
      intro="Put a photo, logo or name on every cookie. Upload your image, pick a circle size, and we print a full sheet of matching toppers."
      ctaHref="/?start=cookies"
      ctaLabel="Create Your Cookie Toppers →"
      prices={[
        ['multicircle', 'mc2', '15 toppers per sheet — cupcakes & cookies'],
        ['multicircle', 'mc3', '6 toppers per sheet — cookies & mini treats'],
      ]}
      priceNote={`Prefer them ready to place? Choose "Cut to shape" and we cut every sheet on our plotter for $${cut} per sheet. Icing sheets and wafer paper cost the same.`}
      sections={[
        {
          title: 'Good For',
          list: [
            'Birthday and party cookie favours',
            'Baby shower and graduation treats',
            'Business logos on corporate gifts',
            'Cupcakes and mini treats',
          ],
        },
        {
          title: 'How Ordering Works',
          list: [
            'Upload your photo, logo or design — no account needed',
            'Choose 2″ or 3″ circles and your material',
            'We review your image before printing and flag any quality issue',
            `We print within ${formatProductionWindow()}, then you pick up for free in London, ON or we ship it`,
          ],
        },
      ]}
      faqs={[
        ['How many toppers do I get per sheet?', 'A sheet holds 15 toppers at 2″ or 6 toppers at 3″.'],
        ['What size should I choose?', 'Choose the circle that is a little smaller than your cookie, so some icing shows around the edge. 2″ also suits cupcakes.'],
        ['Can I put different designs in one order?', 'Yes. You can add up to 5 different designs in a single order, each with its own shape, size, image and quantity.'],
        ['How long does shipping take?', shippingTimesSentence()],
      ]}
    />
  );
}
