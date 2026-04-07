export const metadata = {
  title: 'EdiblePrint.net — Custom Edible Image Printing | Shipped Across Canada',
  description: 'Upload your photo, logo or design. We print it on premium edible paper with food-safe inks and ship it to your door anywhere in Canada. Perfect for cakes, cookies, and cupcakes.',
  keywords: 'edible print, edible image, cake topper, custom edible printing, edible paper, Canada, icing sheet',
  openGraph: {
    title: 'EdiblePrint.net — Your Image, Printed on Edible Sheets',
    description: 'Upload any image. We print it on edible paper and ship across Canada.',
    url: 'https://edibleprint.net',
    siteName: 'EdiblePrint.net',
    locale: 'en_CA',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
