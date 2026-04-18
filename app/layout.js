import GoogleAnalytics from './_components/analytics/GoogleAnalytics';
import MetaPixel from './_components/analytics/MetaPixel';

export const metadata = {
  title: 'EdiblePrint.net — Custom Edible Image Printing | London ON & Canada-Wide',
  description: 'Upload your photo, logo or design. We print it on premium edible icing sheets with food-safe inks. Same-day local delivery in London, Ontario. Shipped across Canada. Perfect for cakes, cookies, cupcakes and custom cake toppers.',
  keywords: 'edible print, edible image, cake topper, custom edible printing, edible paper, Canada, icing sheet, London Ontario, edible cake topper, custom cookie printing, edible photo',
  openGraph: {
    title: 'EdiblePrint.net — Your Image, Printed on Edible Sheets',
    description: 'Custom edible image printing. Same-day delivery in London ON. Canada-wide shipping.',
    url: 'https://edibleprint.net',
    siteName: 'EdiblePrint.net',
    locale: 'en_CA',
    type: 'website',
  },
  alternates: {
    canonical: 'https://edibleprint.net',
  },
};

export default function RootLayout({ children }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'EdiblePrint.net',
    description: 'Custom edible image printing on premium icing sheets. Upload any photo, logo or design.',
    url: 'https://edibleprint.net',
    telephone: '+15196949266',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'London',
      addressRegion: 'ON',
      postalCode: 'N5Z 3Y1',
      addressCountry: 'CA',
    },
    areaServed: [
      { '@type': 'City', name: 'London', containedInPlace: { '@type': 'AdministrativeArea', name: 'Ontario' } },
      { '@type': 'Country', name: 'Canada' },
    ],
    priceRange: '$8.99 - $14.99',
    openingHours: 'Mo-Fr 09:00-17:00',
    paymentAccepted: 'Credit Card, Debit Card',
  };

  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@300;400;500;600;700&family=Lobster&family=Pacifico&family=Dancing+Script:wght@700&family=Great+Vibes&family=Bangers&family=Permanent+Marker&family=Fredoka+One&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY}&libraries=places`}
          async
          defer
        />
      </head>
      <body>
        <GoogleAnalytics />
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
