import Link from 'next/link';
import Image from 'next/image';

const C = {
  text: '#1a2420', muted: '#5c6b62', border: '#d9e2d6', white: '#fff', brand: '#1f5236',
};

export default function DesignCard({ design, categoryLabel }) {
  return (
    <Link
      href={`/designs/${design.id}`}
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        border: '1px solid ' + C.border, borderRadius: 14, overflow: 'hidden',
        background: C.white, transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      className="ep-design-card"
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#f4f6f1' }}>
        <Image
          src={design.sourceFile}
          alt={design.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          style={{ objectFit: 'cover' }}
        />
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
          {categoryLabel}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{design.name}</div>
      </div>
    </Link>
  );
}
