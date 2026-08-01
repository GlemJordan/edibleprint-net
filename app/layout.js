import GoogleAnalytics from './_components/analytics/GoogleAnalytics';
import MetaPixel from './_components/analytics/MetaPixel';
import { BUSINESS_ADDRESS, BUSINESS_PHONE_E164 } from '../lib/business-info.js';

const OG_IMAGE_URL = 'https://edibleprint.net/logo-assets/og-image.png';

export const metadata = {
  title: 'Custom Edible Image Printing Canada | EdiblePrint.net',
  description: 'Order custom edible image prints for cakes, cookies and cupcakes. Upload your photo online — 1–2 day production, flat-rate shipping across Canada, and free local pickup in London, Ontario.',
  keywords: 'edible print, edible image, cake topper, custom edible printing, edible paper, Canada, icing sheet, wafer paper, London Ontario, edible cake topper, custom cookie printing, edible photo',
  icons: {
    icon: [
      { url: '/logo-assets/favicon.ico', sizes: 'any' },
      { url: '/logo-assets/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo-assets/icon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/logo-assets/icon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/logo-assets/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-assets/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/logo-assets/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'EdiblePrint.net — Custom Edible Image Prints',
    description: 'Custom edible image printing on premium icing sheets or wafer paper. From $9.99. Free local pickup in London, Ontario.',
    url: 'https://edibleprint.net',
    siteName: 'EdiblePrint.net',
    locale: 'en_CA',
    type: 'website',
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: 'EdiblePrint.net' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: 'EdiblePrint.net' }],
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
    description: 'Custom edible image printing on premium icing sheets or wafer paper. Upload any photo, logo or design.',
    url: 'https://edibleprint.net',
    telephone: BUSINESS_PHONE_E164,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS_ADDRESS.line1,
      addressLocality: BUSINESS_ADDRESS.city,
      addressRegion: BUSINESS_ADDRESS.province,
      postalCode: BUSINESS_ADDRESS.postalCode,
      addressCountry: BUSINESS_ADDRESS.country,
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
