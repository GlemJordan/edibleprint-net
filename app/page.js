import HomePage from './HomePage';
import { OG_IMAGE_URL } from '../lib/site-config.js';

const TITLE = 'Custom Edible Images & Cake Toppers | London, ON & Canada';
const DESCRIPTION = 'Turn any photo into an edible image for cakes, cookies and cupcakes. From $9.99, printed in 1–2 business days. Free pickup in London, ON, or Canada-wide shipping.';

// Lives here rather than in the root layout: canonical is inherited by every
// child route that doesn't set its own, which would mark them all as
// duplicates of the home page.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'EdiblePrint.ca',
    locale: 'en_CA',
    type: 'website',
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: 'EdiblePrint.ca' }],
  },
};

export default function Page() {
  return <HomePage />;
}
