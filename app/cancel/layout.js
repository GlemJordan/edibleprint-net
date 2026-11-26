// The page itself is a client component, so its metadata has to live here.
export const metadata = {
  title: 'Checkout Cancelled | EdiblePrint.ca',
  robots: { index: false, follow: false },
};

export default function CancelLayout({ children }) {
  return children;
}
