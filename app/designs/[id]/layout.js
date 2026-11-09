import { notFound } from 'next/navigation';
import { getDesignById, getCategories } from '../../../lib/design-catalog.js';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const design = getDesignById(id);
  if (!design) return { robots: { index: false, follow: false } };
  const category = getCategories().find((c) => c.id === design.category)?.label || '';
  const title = `${design.name} — ${category} Edible Cake Topper | EdiblePrint.ca`;
  const description = `Personalize the ${design.name} edible design with your own text. Printed on icing sheets or wafer paper, with free pickup in London, ON or shipping across Canada.`;
  return {
    title,
    description,
    alternates: { canonical: `/designs/${design.id}` },
    openGraph: {
      title,
      description,
      url: `/designs/${design.id}`,
      siteName: 'EdiblePrint.ca',
      locale: 'en_CA',
      type: 'website',
      images: [{ url: design.sourceFile, alt: design.name }],
    },
  };
}

// A retired or mistyped design id is a real 404, not a 200 empty page.
export default async function DesignLayout({ children, params }) {
  const { id } = await params;
  if (!getDesignById(id)) notFound();
  return children;
}
