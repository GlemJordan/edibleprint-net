import GoogleAnalytics from './_components/analytics/GoogleAnalytics';
import MetaPixel from './_components/analytics/MetaPixel';

export const metadata = {
  title: 'Custom Edible Image Printing Canada | EdiblePrint.net',
  description: 'Order custom edible image prints for cakes, cookies and cupcakes. Upload your photo online with fast shipping across Canada and same-day delivery in London, Ontario.',
  keywords: 'edible print, edible image, cake topper, custom edible printing, edible paper, Canada, icing sheet, London Ontario, edible cake topper, custom cookie printing, edible photo',
  openGraph: {
    title: 'EdiblePrint.net — Custom Edible Image Prints',
    description: 'Custom edible image printing on premium icing sheets. From $9.99. Free local pickup in London, Ontario.',
    url: 'https://edibleprint.net',
    siteName: 'EdiblePrint.net',
    locale: 'en_CA',
    type: 'website',
    images: ['https://res.cloudinary.com/dslkizfuj/image/upload/f_auto,q_auto/v1777183040/ChatGPT_Image_26_abr_2026_01_45_51_a.m._ya1io4.png'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://res.cloudinary.com/dslkizfuj/image/upload/f_auto,q_auto/v1777183040/ChatGPT_Image_26_abr_2026_01_45_51_a.m._ya1io4.png'],
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
      postalCode: 'N5W 2V7',
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
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@300;400;500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Inter:wght@400;500;600;700&family=Lobster&family=Pacifico&family=Dancing+Script:wght@700&family=Great+Vibes&family=Bangers&family=Permanent+Marker&family=Fredoka+One&display=swap"
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
        <meta name="google-site-verification" content="AmSzZHbyuZyRnNgw40UuHd2n93tzrQoCU-3MV2yuWls" />
      </head>
      <body>
        <GoogleAnalytics />
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
