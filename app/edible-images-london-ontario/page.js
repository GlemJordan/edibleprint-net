import LandingPage from '../_components/LandingPage';
import { formatProductionWindow } from '../../lib/shipping-config.js';

const PATH = '/edible-images-london-ontario';
const DESCRIPTION = 'Edible image printing in London, Ontario. Upload your photo online, then pick up your custom cake topper or cookie sheet for free in East London. From $9.99.';

export const metadata = {
  title: 'Edible Image Printing in London, Ontario | EdiblePrint.net',
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function EdibleImagesLondonOntarioPage() {
  return (
    <LandingPage
      path={PATH}
      productName="Edible Image Printing in London, Ontario"
      description={DESCRIPTION}
      heading="Edible Image Printing in London, Ontario"
      intro="Need a photo cake topper or logo cookies in London? Order online in a couple of minutes and pick up your prints for free in East London, with no shipping cost."
      ctaHref="/?start=round"
      ctaLabel="Upload Your Photo →"
      prices={[
        ['bwsheet', 'bw1', 'Economy grayscale — text, logos & portraits'],
        ['circular', 'c5', 'Fits 6″ round cakes'],
        ['circular', 'c8', 'Fits 9″–10″ round cakes'],
        ['multicircle', 'mc3', '6 cookie toppers per sheet'],
        ['fullsheet', 'a4', 'For sheet cakes and large projects'],
      ]}
      priceNote="Heart, square and custom sizes are also available. Free pickup in London, ON."
      sections={[
        {
          title: 'How Local Pickup Works',
          list: [
            'Upload your image and choose "Free Pickup — London, ON" at checkout',
            'We review your image before printing',
            `Your order is ready within ${formatProductionWindow()} — order before 2 PM EST for same-day production`,
            'We confirm the exact address and pickup time by email',
          ],
        },
        {
          title: 'For Your Next Celebration',
          paragraphs: [
            'Birthday cakes, baby showers, graduations, weddings and corporate events: if you can take a photo of it, we can print it on an icing sheet or wafer paper, ready for you to place on your cake, cookies or cupcakes.',
          ],
        },
      ]}
      faqs={[
        ['Do I have to order online?', 'Yes. Ordering online lets you upload your image, see a preview and pay securely. If you need help, email, text or WhatsApp us.'],
        ['Do you bake the cake?', 'No. We print the edible image and you, or your baker, place it on your cake or treats.'],
        ['How do I apply the print?', 'Peel the backing gently and lay the print on a freshly frosted or fondant-covered surface, then press lightly from the centre outward to remove air bubbles.'],
        ['Not in London?', 'We also ship anywhere in Canada via Canada Post.'],
      ]}
    />
  );
}
