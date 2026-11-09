// The page itself is a client component, so its metadata has to live here.
export const metadata = {
  title: 'Download Your PDF | EdiblePrint.ca',
  robots: { index: false, follow: false },
};

export default function DownloadPdfLayout({ children }) {
  return children;
}
