'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCategories, getActiveDesigns } from '../../lib/design-catalog.js';
import DesignCard from './_components/DesignCard.js';

const C = {
  brand: '#1f5236', accent: '#e8704a', text: '#1a2420', muted: '#5c6b62',
  border: '#d9e2d6', white: '#fff', bg: '#FAFBF9',
};

const CATEGORIES = getCategories();
const ALL_DESIGNS = getActiveDesigns();
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export default function DesignsCatalogPage() {
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_DESIGNS.filter((d) => {
      if (categoryId && d.category !== categoryId) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [categoryId, query]);

  // Default browsing view (no filter/search active): grouped by category.
  // Once the customer filters or searches, show one flat, immediately
  // scannable grid instead of mostly-empty category sections.
  const grouped = categoryId === '' && query.trim() === '';

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.bg, minHeight: '100vh' }}>
      <style>{`
        .ep-design-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .ep-cat-chip { cursor: pointer; border: 1px solid ${C.border}; background: ${C.white}; color: ${C.text};
          border-radius: 40px; padding: 8px 16px; font-size: 13.5px; font-weight: 600; font-family: inherit; }
        .ep-cat-chip.active { background: ${C.brand}; border-color: ${C.brand}; color: #fff; }
      `}</style>

      <header style={{ borderBottom: '1px solid ' + C.border, background: C.white }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <Image src="/logo-assets/logo-header.png" alt="EdiblePrint.net" width={160} height={40} style={{ height: 36, width: 'auto' }} priority />
          </Link>
          <Link href="/" style={{ color: C.muted, fontSize: 13.5, textDecoration: 'none' }}>← Back to home</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
          Choose a ready-made design
        </h1>
        <p style={{ color: C.muted, fontSize: 15, margin: '0 0 28px', maxWidth: 620 }}>
          Pick one of our own designs, add a name (and age, if you like), and we&apos;ll print it for you — no editor needed.
        </p>

        <div style={{ marginBottom: 24 }}>
          <input
            type="text"
            placeholder="Search designs by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%', maxWidth: 360, padding: '10px 14px', borderRadius: 10,
              border: '1.5px solid ' + C.border, fontFamily: 'inherit', fontSize: 14,
              boxSizing: 'border-box', marginBottom: 14,
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={'ep-cat-chip' + (categoryId === '' ? ' active' : '')} onClick={() => setCategoryId('')}>
              All designs
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={'ep-cat-chip' + (categoryId === c.id ? ' active' : '')}
                onClick={() => setCategoryId(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <p style={{ color: C.muted, fontSize: 14 }}>No designs match that search.</p>
        )}

        {grouped ? (
          CATEGORIES.map((cat) => {
            const designs = ALL_DESIGNS.filter((d) => d.category === cat.id);
            if (designs.length === 0) return null;
            return (
              <section key={cat.id} style={{ marginBottom: 36 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 14px' }}>{cat.label}</h2>
                <Grid designs={designs} />
              </section>
            );
          })
        ) : (
          <Grid designs={filtered} />
        )}
      </div>
    </div>
  );
}

function Grid({ designs }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 18 }}>
      {designs.map((d) => (
        <DesignCard key={d.id} design={d} categoryLabel={CATEGORY_LABEL[d.category]} />
      ))}
    </div>
  );
}
