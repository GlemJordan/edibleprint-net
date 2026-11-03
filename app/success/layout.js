// The page itself is a client component, so its metadata has to live here.
export const metadata = {
  title: 'Order Confirmed | EdiblePrint.net',
  robots: { index: false, follow: false },
};

export default function SuccessLayout({ children }) {
  return children;
}
